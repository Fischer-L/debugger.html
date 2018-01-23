/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// @flow

/**
 * Sources reducer
 * @module reducers/sources
 */

import * as I from "immutable";
import { createSelector } from "reselect";
import makeRecord from "../utils/makeRecord";
import { getPrettySourceURL } from "../utils/source";
import { originalToGeneratedId, isOriginalId } from "devtools-source-map";
import { prefs } from "../utils/prefs";

import type { Map, List } from "immutable";
import type { Source, Location } from "../types";
import type { SelectedLocation, PendingSelectedLocation } from "./types";
import type { Action } from "../actions/types";
import type { Record } from "../utils/makeRecord";

type Tab = Object;
export type SourceRecord = Record<Source>;
export type SourcesMap = Map<string, SourceRecord>;
type TabList = List<Tab>;

export type SourcesState = {
  sources: SourcesMap,
  selectedLocation?: SelectedLocation,
  pendingSelectedLocation?: PendingSelectedLocation,
  selectedLocation?: Location,
  tabs: TabList
};

export function initialState(): Record<SourcesState> {
  return makeRecord(
    ({
      sources: I.Map(),
      selectedLocation: undefined,
      pendingSelectedLocation: prefs.pendingSelectedLocation,
      sourcesText: I.Map(),
      tabs: I.List(restoreTabs())
    }: SourcesState)
  )();
}

function update(
  state: Record<SourcesState> = initialState(),
  action: Action
): Record<SourcesState> {
  let location = null;

  switch (action.type) {
    case "UPDATE_SOURCE": {
      const source = action.source;
      return updateSource(state, source);
    }

    case "ADD_SOURCE": {
      return updateSource(state, action.source);
    }

    case "ADD_SOURCES": {
      return action.sources.reduce(
        (newState, source) => updateSource(newState, source),
        state
      );
    }

    case "SELECT_SOURCE":
      location = {
        ...action.location,
        url: action.source.url
      };

      prefs.pendingSelectedLocation = location;
      return state
        .set("selectedLocation", {
          sourceId: action.source.id,
          ...action.location
        })
        .set("pendingSelectedLocation", location);

    case "CLEAR_SELECTED_SOURCE":
      location = { url: "" };
      prefs.pendingSelectedLocation = location;

      return state
        .set("selectedLocation", { sourceId: "" })
        .set("pendingSelectedLocation", location);

    case "SELECT_SOURCE_URL":
      location = {
        url: action.url,
        line: action.line
      };

      prefs.pendingSelectedLocation = location;
      return state.set("pendingSelectedLocation", location);

    case "ADD_TAB":
      console.log("TMP> Calling updateTabList for ADD_TAB");
      return state.merge({
        tabs: updateTabList({ sources: state }, action.source, {
          shouldDisplay: true
        })
      });

    case "MOVE_TAB":
      console.log("TMP> Calling updateTabList for MOVE_TAB");
      return state.merge({
        tabs: updateTabList({ sources: state }, action.source, {
          tabIndex: action.tabIndex
        })
      });

    case "CLOSE_TAB":
      prefs.tabs = action.tabs;
      console.log("TMP> CLOSE_TAB - action.tabs =", action.tabs);
      return state.merge({ tabs: action.tabs });

    case "CLOSE_TABS":
      prefs.tabs = action.tabs;
      return state.merge({ tabs: action.tabs });

    case "LOAD_SOURCE_TEXT":
      return setSourceTextProps(state, action);

    case "BLACKBOX":
      console.log("TMP> Calling updateTabList for BLACKBOX");
      console.log("TMP> BLACKBOX", action);
      if (action.status === "done") {
        console.log("TMP> BLACKBOX - updating", action);
        console.log("TMP> Before BlackBox =", state.toJS());
        let newState = state.merge({
          tabs: updateTabList(
            {
              sources: state
            },
            {
              url: action.source.url,
              isBlackBoxed: action.value.isBlackBoxed
            }
          )
        });
        newState = newState.setIn(
          ["sources", action.source.id, "isBlackBoxed"],
          action.value.isBlackBoxed
        );
        console.log("TMP> After BlackBox =", newState.toJS());
        return newState;
      }
      break;

    case "NAVIGATE":
      const source = getSelectedSource({ sources: state });
      const url = source && source.get("url");

      if (!url) {
        return initialState();
      }

      return initialState().set("pendingSelectedLocation", { url });
  }

  return state;
}

function getTextPropsFromAction(action: any) {
  const { value, sourceId } = action;

  if (action.status === "start") {
    return { id: sourceId, loadedState: "loading" };
  } else if (action.status === "error") {
    return { id: sourceId, error: action.error, loadedState: "loaded" };
  }
  return {
    text: value.text,
    id: sourceId,
    contentType: value.contentType,
    loadedState: "loaded"
  };
}

// TODO: Action is coerced to `any` unfortunately because how we type
// asynchronous actions is wrong. The `value` may be null for the
// "start" and "error" states but we don't type it like that. We need
// to rethink how we type async actions.
function setSourceTextProps(state, action: any): Record<SourcesState> {
  const text = getTextPropsFromAction(action);
  return updateSource(state, text);
}

function updateSource(state: Record<SourcesState>, source: Source | Object) {
  if (!source.id) {
    return state;
  }

  return state.mergeIn(["sources", source.id], source);
}

export function removeSourceFromTabList(tabs: TabList, url: string) {
  console.log("TMP> removeSourceFromTabList - tabs, url", tabs, url);
  return tabs.filter(tab => {
    // console.log("TMP> removeSourceFromTabList", tab);
    // if (!window._TMP_removingTabs) window._TMP_removingTabs = [];
    // window._TMP_removingTabs.push(tab);
    return tab.url != url;
  });
  console.log("TMP> removeSourceFromTabList after - tabs, url", tabs, url);
}

export function removeSourcesFromTabList(tabs: TabList, urls: Array<string>) {
  return urls.reduce((t, url) => removeSourceFromTabList(t, url), tabs);
}

function restoreTabs() {
  console.log("TMP> restoreTabs restoreTabs restoreTabs");
  const prefsTabs = prefs.tabs || [];
  if (prefsTabs.length == 0) {
    return;
  }

  console.log("TMP> restoreTabs - Before prefs.tabs =", prefs.tabs);

  // Before the tab prefs were in this data structure:
  //    `[ url_1, url_2, ...]`
  // but now have changed to
  //    `[ { url_1, isBlackBoxed, }, { url_2, isBlackBoxed, }, ...]`
  // So for the backward compatibility, we manage this data structure change
  // while restoring tab prefs on the initializing state
  let dirty = false;
  for (let i = prefsTabs.length - 1; i >= 0; --i) {
    if (typeof prefsTabs[i] === "string") {
      prefsTabs[i] = {
        url: prefsTabs[i],
        isBlackBoxed: false,
        shouldDisplay: true
      };
      dirty = true;
    }
  }
  if (dirty) {
    prefs.tabs = prefsTabs;
  }
  console.log("TMP> restoreTabs - After prefs.tabs =", prefs.tabs);
  return prefsTabs;
}

/**
 * Adds the new source to the tab list if it is not already there
 * @memberof reducers/sources
 * @static
 */
function updateTabList(state: OuterState, source: Object, options?: Object) {
  // TMP OLD:
  // let tabs = state.sources.get("tabs");

  // const urlIndex = tabs.indexOf(url);
  // const includesUrl = !!tabs.find(tab => tab == url);

  // if (includesUrl) {
  //   if (tabIndex != undefined) {
  //     tabs = tabs.delete(urlIndex).insert(tabIndex, url);
  //   }
  // } else {
  //   tabs = tabs.insert(0, url);
  // }

  // prefs.tabs = tabs.toJS();
  // return tabs;
  // TMP OLD END

  let tabIndex = 0;
  let shouldDisplay = true;
  const { url, isBlackBoxed } = source;
  let tabs = state.sources.get("tabs");
  // const index = tabs.findIndex(t => t.get("url") == url);
  const index = tabs.findIndex(t => t.url == url);
  console.log("TMP> updateTabList before saving", tabs.toJS());
  console.log("TMP> updateTabList index =", index);

  if (index >= 0) {
    tabIndex = index;
    shouldDisplay = tabs.get(index).shouldDisplay;
    tabs = tabs.delete(index);
  }

  if (options) {
    if (options.tabIndex >= 0) {
      tabIndex = options.tabIndex;
    }
    if (options.shouldDisplay !== undefined) {
      shouldDisplay = options.shouldDisplay;
    }
  }

  const tab = { url, isBlackBoxed, shouldDisplay };
  tabs = tabs.insert(tabIndex, tab);
  prefs.tabs = tabs.toJS();
  console.log("TMP> updateTabList after saving", tabs.toJS());
  return tabs;

  // TMP:
  // let tabIndex = 0;
  // let shouldDisplay = true;
  // if (options) {
  //   tabIndex = options.tabIndex >= 0 ? options.tabIndex : tabIndex;
  //   shouldDisplay =
  //   if (options.shouldDisplay !== undefined) {

  //   }
  // }
  // let tab = {
  //   shouldDisplay
  //   url: source.url,
  //   isBlackBoxed: source.isBlackBoxed,
  // };
  // let tabs = getSourceTabs(state);
  // window._TMP_updateTabList_sources = state.sources;
  // console.log("TMP> updateTabList before saving", tabs.toJS());
  // const index = tabs.findIndex(t => t.url == tab.url);
  // console.log("TMP> updateTabList index =", index);
  // if (index >= 0) {
  //   if (tabIndex === undefined) {
  //     tabIndex = index;
  //   }
  //   tabs = tabs.delete(index).insert(tabIndex, tab);
  // } else {
  //   tabs = tabs.insert(0, tab);
  // }
  // console.log("TMP> updateTabList after saving", tabs.toJS());
  // prefs.tabs = tabs.toJS();
  // return tabs;
}

/**
 * Gets the next tab to select when a tab closes. Heuristics:
 * 1. if the selected tab is available, it remains selected
 * 2. if it is gone, the next available tab to the left should be active
 * 3. if the first tab is active and closed, select the second tab
 *
 * @memberof reducers/sources
 * @static
 */
export function OLD_getNewSelectedSourceId(
  state: OuterState,
  availableTabs: TabList
): string {
  const selectedLocation = state.sources.selectedLocation;
  if (!selectedLocation) {
    return "";
  }

  const selectedTab = state.sources.sources.get(selectedLocation.sourceId);

  const selectedTabUrl = selectedTab ? selectedTab.get("url") : "";

  if (availableTabs.find(t => t.url == selectedTabUrl)) {
    const sources = state.sources.sources;
    if (!sources) {
      return "";
    }

    const selectedSource = sources.find(
      source => source.get("url") == selectedTabUrl
    );

    if (selectedSource) {
      return selectedSource.get("id");
    }

    return "";
  }

  if (availableTabs.size > 0) {
    const tabs = state.sources.tabs.toJS();
    const leftNeighborIndex = Math.max(
      tabs.findIndex(t => t.url == selectedTabUrl) - 1,
      0
    );
    const lastAvailbleTabIndex = availableTabs.size - 1;
    const newSelectedTabIndex = Math.min(
      leftNeighborIndex,
      lastAvailbleTabIndex
    );
    const availableTab = availableTabs.toJS()[newSelectedTabIndex];
    const tabSource = getSourceByUrlInSources(
      state.sources.sources,
      availableTab.url
    );
    if (tabSource) {
      return tabSource.get("id");
    }
  }

  return "";
}

export function getNewSelectedSourceId(
  state: OuterState,
  tabs: TabList
): string {
  const selectedLocation = state.sources.selectedLocation;
  if (!selectedLocation) {
    return "";
  }

  const selectedTab = state.sources.sources.get(selectedLocation.sourceId);

  const selectedTabUrl = selectedTab ? selectedTab.get("url") : "";

  const availableTabs = tabs.filter(t => t.shouldDisplay);

  if (availableTabs.find(t => t.url == selectedTabUrl)) {
    const sources = state.sources.sources;
    if (!sources) {
      return "";
    }

    const selectedSource = sources.find(
      source => source.get("url") == selectedTabUrl
    );

    if (selectedSource) {
      return selectedSource.get("id");
    }

    return "";
  }

  if (availableTabs.size > 0) {
    const tabs = state.sources.tabs.toJS();
    const leftNeighborIndex = Math.max(
      tabs.findIndex(t => t.url == selectedTabUrl) - 1,
      0
    );
    const lastAvailbleTabIndex = availableTabs.size - 1;
    const newSelectedTabIndex = Math.min(
      leftNeighborIndex,
      lastAvailbleTabIndex
    );
    const availableTab = availableTabs.toJS()[newSelectedTabIndex];
    const tabSource = getSourceByUrlInSources(
      state.sources.sources,
      availableTab.url
    );
    if (tabSource) {
      return tabSource.get("id");
    }
  }

  return "";
}

// Selectors

// Unfortunately, it's really hard to make these functions accept just
// the state that we care about and still type it with Flow. The
// problem is that we want to re-export all selectors from a single
// module for the UI, and all of those selectors should take the
// top-level app state, so we'd have to "wrap" them to automatically
// pick off the piece of state we're interested in. It's impossible
// (right now) to type those wrapped functions.
type OuterState = { sources: Record<SourcesState> };

const getSourcesState = state => state.sources;

export function getSource(state: OuterState, id: string) {
  return getSourceInSources(getSources(state), id);
}

export function getSourceByURL(state: OuterState, url: string): ?SourceRecord {
  return getSourceByUrlInSources(state.sources.sources, url);
}

export function getGeneratedSource(state: OuterState, source: ?Source) {
  if (!source || !isOriginalId(source.id)) {
    return null;
  }
  return getSource(state, originalToGeneratedId(source.id));
}

export function getPendingSelectedLocation(state: OuterState) {
  return state.sources.pendingSelectedLocation;
}

export function getPrettySource(state: OuterState, id: string) {
  const source = getSource(state, id);
  if (!source) {
    return;
  }

  return getSourceByURL(state, getPrettySourceURL(source.get("url")));
}

function getSourceByUrlInSources(sources: SourcesMap, url: string) {
  if (!url) {
    return null;
  }

  return sources.find(source => source.get("url") === url);
}

export function getSourceInSources(
  sources: SourcesMap,
  id: string
): SourceRecord {
  return sources.get(id);
}

export const getSources = createSelector(
  getSourcesState,
  sources => sources.sources
);

const getTabs = createSelector(getSourcesState, sources => sources.tabs);

export const getSourceTabs = createSelector(
  getTabs,
  getSources,
  (tabs, sources) => {
    console.log("TMP> getSourceTabs tabs =", tabs);
    // console.error(new Error("rtyuighjhj"));
    return tabs.filter(tab => getSourceByUrlInSources(sources, tab.url));
  }
);

export const getSearchTabs = createSelector(
  getTabs,
  getSources,
  (tabs, sources) =>
    tabs.filter(tab => !getSourceByUrlInSources(sources, tab.url))
);

export const getSourcesForTabs = createSelector(
  getSourceTabs,
  getSources,
  (tabs: TabList, sources: SourcesMap) => {
    return tabs
      .map(tab => getSourceByUrlInSources(sources, tab.url))
      .filter(source => source);
  }
);

export const getSourcesForTabsShouldDisplay = createSelector(
  getSourceTabs,
  getSources,
  (tabs: TabList, sources: SourcesMap) => {
    return tabs
      .filter(tab => !!tab.shouldDisplay)
      .map(tab => getSourceByUrlInSources(sources, tab.url))
      .filter(source => source);
  }
);

export const getSelectedLocation = createSelector(
  getSourcesState,
  sources => sources.selectedLocation
);

export const getSelectedSource = createSelector(
  getSelectedLocation,
  getSources,
  (selectedLocation, sources) => {
    if (!selectedLocation) {
      return;
    }

    return sources.get(selectedLocation.sourceId);
  }
);

export const getSelectedSourceText = createSelector(
  getSelectedSource,
  getSourcesState,
  (selectedSource, sources) => {
    const id = selectedSource.get("id");
    return id ? sources.sourcesText.get(id) : null;
  }
);

export default update;
