/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// @flow

/**
 * Redux actions for the sources state
 * @module actions/sources
 */

import { removeDocument } from "../../utils/editor";
import { selectSource } from "../sources";

import {
  getSourceByURL,
  getSourceTabs,
  getNewSelectedSourceId,
  removeSourcesFromTabList,
  removeSourceFromTabList
} from "../../selectors";

import type { Source } from "../../types";
import type { ThunkArgs } from "../types";

export function addTab(source: Source, tabIndex: number) {
  return {
    type: "ADD_TAB",
    source,
    tabIndex
  };
}

export function moveTab(source: Source, tabIndex: number) {
  return {
    type: "MOVE_TAB",
    source,
    tabIndex
  };
}

/**
 * @memberof actions/sources
 * @static
 */
export function OLD_closeTab(url: string) {
  return ({ dispatch, getState, client }: ThunkArgs) => {
    removeDocument(url);
    const tabs = removeSourceFromTabList(getSourceTabs(getState()), url);
    console.log("TMP> closeTab - tabs, url", tabs, url);
    const sourceId = getNewSelectedSourceId(getState(), tabs);
    dispatch({ type: "CLOSE_TAB", url, tabs: tabs.toJS() });
    dispatch(selectSource(sourceId));
  };
}

function closeTabFromTabList(url, tabs) {
  const index = tabs.findIndex(t => t.url === url);
  if (index >= 0) {
    const tab = tabs.get(index);
    if (tab.isBlackBoxed) {
      tab.shouldDisplay = false;
      tabs = tabs.delete(index).push(tab);
    } else {
      tabs = removeSourceFromTabList(tabs, url);
    }
  }
  return tabs;
}

// TMP
export function closeTab(url: string) {
  return async ({ dispatch, getState, client }: ThunkArgs) => {
    const source = getSourceByURL(getState(), url);
    if (source) {
      removeDocument(source.get("id"));
    }
    console.log(
      "TMP> closeTab - Before closeTabFromTabList",
      getSourceTabs(getState()).toJS()
    );
    const tabs = closeTabFromTabList(url, getSourceTabs(getState()));
    console.log("TMP> closeTab - After closeTabFromTabList", tabs.toJS());
    const sourceId = getNewSelectedSourceId(getState(), tabs);
    dispatch({ type: "CLOSE_TAB", url, tabs: tabs.toJS() });
    await new Promise(res => setTimeout(res, 500));
    dispatch(selectSource(sourceId));
  };
}

/**
 * @memberof actions/sources
 * @static
 */
export function OLD_closeTabs(urls: string[]) {
  return ({ dispatch, getState, client }: ThunkArgs) => {
    urls.forEach(url => {
      const source = getSourceByURL(getState(), url);
      if (source) {
        removeDocument(source.get("id"));
      }
    });

    const tabs = removeSourcesFromTabList(getSourceTabs(getState()), urls);
    dispatch({ type: "CLOSE_TABS", urls, tabs: tabs.toJS() });

    const sourceId = getNewSelectedSourceId(getState(), tabs);
    dispatch(selectSource(sourceId));
  };
}

export function closeTabs(urls: string[]) {
  return ({ dispatch, getState, client }: ThunkArgs) => {
    let tabs = getSourceTabs(getState());
    urls.forEach(url => {
      const source = getSourceByURL(getState(), url);
      if (source) {
        removeDocument(source.get("id"));
      }
      tabs = closeTabFromTabList(url, tabs);
    });
    const sourceId = getNewSelectedSourceId(getState(), tabs);
    dispatch({ type: "CLOSE_TABS", urls, tabs: tabs.toJS() });
    dispatch(selectSource(sourceId));
  };
}
