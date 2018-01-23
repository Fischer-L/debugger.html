/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// @flow

/**
 * Redux actions for the sources state
 * @module actions/sources
 */
import { toggleBlackBox } from "./blackbox";
import { syncBreakpoint } from "../breakpoints";
import { loadSourceText } from "./loadSourceText";
import { togglePrettyPrint } from "./prettyPrint";
import { selectLocation } from "../sources";
import { getRawSourceURL, isPrettyURL } from "../../utils/source";

import { prefs } from "../../utils/prefs";

import {
  getSource,
  getPendingSelectedLocation,
  getPendingBreakpointsForSource
} from "../../selectors";

import type { Source } from "../../types";
import type { ThunkArgs } from "../types";

function createOriginalSource(
  originalUrl,
  generatedSource,
  sourceMaps
): Source {
  return {
    url: originalUrl,
    id: sourceMaps.generatedToOriginalId(generatedSource.id, originalUrl),
    isPrettyPrinted: false,
    isWasm: false,
    isBlackBoxed: false,
    loadedState: "unloaded"
  };
}

// TODO: It would be nice to make getOriginalURLs a safer api
async function loadOriginalSourceUrls(sourceMaps, generatedSource) {
  try {
    return await sourceMaps.getOriginalURLs(generatedSource);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * @memberof actions/sources
 * @static
 */
function loadSourceMap(generatedSource) {
  return async function({ dispatch, getState, sourceMaps }: ThunkArgs) {
    const urls = await loadOriginalSourceUrls(sourceMaps, generatedSource);
    if (!urls) {
      // If this source doesn't have a sourcemap, do nothing.
      return;
    }

    const originalSources = urls.map(url =>
      createOriginalSource(url, generatedSource, sourceMaps)
    );

    // TODO: check if this line is really needed, it introduces
    // a lot of lag to the application.
    const generatedSourceRecord = getSource(getState(), generatedSource.id);
    await dispatch(loadSourceText(generatedSourceRecord));
    dispatch(newSources(originalSources));
  };
}

// If a request has been made to show this source, go ahead and
// select it.
function checkSelectedSource(source: Source) {
  return async ({ dispatch, getState }: ThunkArgs) => {
    const pendingLocation = getPendingSelectedLocation(getState());

    if (!pendingLocation || !pendingLocation.url || !source.url) {
      return;
    }

    const pendingUrl = pendingLocation.url;
    const rawPendingUrl = getRawSourceURL(pendingUrl);

    if (rawPendingUrl === source.url) {
      if (isPrettyURL(pendingUrl)) {
        return await dispatch(togglePrettyPrint(source.id));
      }

      await dispatch(
        selectLocation({ ...pendingLocation, sourceId: source.id })
      );
    }
  };
}

function checkPendingBreakpoints(sourceId) {
  return async ({ dispatch, getState }: ThunkArgs) => {
    // source may have been modified by selectLocation
    const source = getSource(getState(), sourceId);

    const pendingBreakpoints = getPendingBreakpointsForSource(
      getState(),
      source.get("url")
    );

    if (!pendingBreakpoints.size) {
      return;
    }

    // load the source text if there is a pending breakpoint for it
    await dispatch(loadSourceText(source));

    const pendingBreakpointsArray = pendingBreakpoints.valueSeq().toJS();
    for (const pendingBreakpoint of pendingBreakpointsArray) {
      await dispatch(syncBreakpoint(sourceId, pendingBreakpoint));
    }
  };
}

function OLD_restoreSourcesTabState(...sources) {
  const tabPrefs = prefs.tabs || [];
  if (tabPrefs.length == 0) {
    return;
  }

  console.log("TMP> restoreSourcesTabState - Before prefs.tabs =", prefs.tabs);

  // This is for the backward compatibility.
  // Before the tab prefs were in this data structure:
  //    `[ url_1, url_2, ...]`
  // but now have changed to
  //    `[ { url_1, isBlackBoxed, }, { url_2, isBlackBoxed, }, ...]`
  let dirty = false;
  for (let i = tabPrefs.length - 1; i >= 0; --i) {
    if (typeof tabPrefs[i] === "string") {
      tabPrefs[i] = {
        url: tabPrefs[i],
        isBlackBoxed: false
      };
      dirty = true;
    }
  }
  if (dirty) {
    prefs.tabs = tabPrefs;
  }
  console.log("TMP> restoreSourcesTabState - After prefs.tabs =", prefs.tabs);

  for (const source of sources) {
    let tabPref = tabPrefs.find(pref => pref.url === source.url);
    if (tabPref && tabPref.isBlackBoxed !== source.isBlackBoxed) {
      console.log("TMP> restoreSourcesTabState - toggleBlackBox =", source);
      toggleBlackBox(source);
    }
  }
}

function restoreSourcesTabState(...sources) {
  return async ({ dispatch, getState }: ThunkArgs) => {
    const tabPrefs = prefs.tabs || [];
    if (tabPrefs.length == 0) {
      return;
    }

    for (const source of sources) {
      let tabPref = tabPrefs.find(pref => pref.url === source.url);
      if (tabPref && tabPref.isBlackBoxed !== source.isBlackBoxed) {
        console.log("TMP> restoreSourcesTabState - toggleBlackBox =", source);
        await dispatch(toggleBlackBox(source));
      }
    }
  };
}

/**
 * Handler for the debugger client's unsolicited newSource notification.
 * @memberof actions/sources
 * @static
 */
export function newSource(source: Source) {
  return async ({ dispatch, getState }: ThunkArgs) => {
    const _source = getSource(getState(), source.id);
    if (_source) {
      return;
    }

    dispatch({ type: "ADD_SOURCE", source });

    if (prefs.clientSourceMapsEnabled) {
      dispatch(loadSourceMap(source));
    }
    await dispatch(restoreSourcesTabState(source));
    dispatch(checkSelectedSource(source));
    dispatch(checkPendingBreakpoints(source.id));
  };
}

export function newSources(sources: Source[]) {
  return async ({ dispatch, getState }: ThunkArgs) => {
    const filteredSources = sources.filter(
      source => !getSource(getState(), source.id)
    );

    if (filteredSources.length == 0) {
      return;
    }

    dispatch({
      type: "ADD_SOURCES",
      sources: filteredSources
    });

    console.log("TMP> solicited newSources -", filteredSources);
    await dispatch(restoreSourcesTabState(...filteredSources));
    for (const source of filteredSources) {
      dispatch(checkSelectedSource(source));
      dispatch(checkPendingBreakpoints(source.id));
    }

    return Promise.all(
      filteredSources.map(source => dispatch(loadSourceMap(source)))
    );
  };
}
