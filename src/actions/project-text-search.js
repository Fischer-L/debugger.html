/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// @flow

/**
 * Redux actions for the search state
 * @module actions/search
 */

import { findSourceMatches } from "../workers/search";
import { getSources, getSource, hasPrettySource } from "../selectors";
import { isThirdParty } from "../utils/source";
import { loadSourceText } from "./sources";
import {
  statusType,
  getTextSearchQuery,
  getTextSearchResults
} from "../reducers/project-text-search";

import type { ThunkArgs } from "./types";

export function addSearchQuery(query: string) {
  return { type: "ADD_QUERY", query };
}

export function clearSearchQuery() {
  return { type: "CLEAR_QUERY" };
}

export function clearSearchResults() {
  return { type: "CLEAR_SEARCH_RESULTS" };
}

export function clearSearch() {
  return { type: "CLEAR_SEARCH" };
}

export function updateSearchStatus(status: string) {
  return { type: "UPDATE_STATUS", status };
}

export function closeProjectSearch() {
  return { type: "CLOSE_PROJECT_SEARCH" };
}

// export function searchSources(query: string) {
//   return async ({ dispatch, getState }: ThunkArgs) => {
//     await dispatch(clearSearchResults());
//     await dispatch(addSearchQuery(query));
//     dispatch(updateSearchStatus(statusType.fetching));
//     const sources = getSources(getState());

//     // TMP: sources are js files
//     window._TMP_ss = sources;

//     const validSources = sources
//       .valueSeq()
//       .filter(
//         source =>
//           !hasPrettySource(getState(), source.get("id")) &&
//           !isThirdParty(source)
//       );

//     window._TMP_validSources = validSources;
//     let TMP_c = 0;

//     for (const source of validSources) {
//       if (TMP_c > 1) break;
//       await dispatch(loadSourceText(source));
//       await dispatch(searchSource(source.get("id"), query));
//       console.log("TMP_c =", TMP_c);
//       TMP_c++;
//     }
//     console.log("After TMP_c =", TMP_c);
//     // return;
//     dispatch(updateSearchStatus(statusType.done));
//     console.log("After updateSearchStatus");
//   };
// }

let batchSearchHandle = null;

function requestBatchSearch(sources, query) {
  return async ({ dispatch, getState }: ThunkArgs) => {
    console.log("doing batchSearchHandle", batchSearchHandle);
    let limit = 500;
    let source = sources.shift();
    while (source) {
      await dispatch(loadSourceText(source));
      const sourceRecord = getSource(getState(), source.get("id")).toJS();
      const matches = await findSourceMatches(sourceRecord, query);
      if (matches.length) {
        dispatch({
          type: "ADD_SEARCH_RESULT",
          result: {
            sourceId: source.get("id"),
            filepath: source.get("url"),
            matches
          }
        });
      }
      limit -= matches.length;
      if (limit > 0) {
        source = sources.shift();
      } else {
        break;
      }
    }

    if (sources.length > 0) {
      batchSearchHandle = window.requestIdleCallback(() => {
        batchSearchHandle = window.requestIdleCallback(() => {
          console.log(
            "requestIdleCallback batchSearchHandle",
            batchSearchHandle
          );
          dispatch(requestBatchSearch(sources, query));
        });
      });
      dispatch(updateSearchStatus(statusType.partialUpdating));
      return;
    }
    dispatch(updateSearchStatus(statusType.done));
  };
}

function cancelBatchSearch() {
  if (batchSearchHandle) {
    window.cancelIdleCallback(batchSearchHandle);
    batchSearchHandle = null;
  }
}

// function addSearchResult(dispatch, sourceId, query) {
//   const sourceRecord = getSource(getState(), sourceId);
//   if (!sourceRecord) {
//     return 0;
//   }
//   const matches = await findSourceMatches(sourceRecord.toJS(), query);
//   if (!matches.length) {
//     return 0;
//   }
//   dispatch({
//     type: "ADD_SEARCH_RESULT",
//     result: {
//       sourceId: sourceRecord.get("id"),
//       filepath: sourceRecord.get("url"),
//       matches
//     }
//   });
//   return matches.length;
// }

export function searchSources(query: string) {
  return async ({ dispatch, getState }: ThunkArgs) => {
    cancelBatchSearch();

    await dispatch(clearSearchResults());
    await dispatch(addSearchQuery(query));
    dispatch(updateSearchStatus(statusType.fetching));
    const sources = getSources(getState());

    // TMP: sources are js files
    window._TMP_ss = sources;

    const validSources = sources
      .valueSeq()
      .filter(
        source =>
          !hasPrettySource(getState(), source.get("id")) &&
          !isThirdParty(source)
      );
    await dispatch(requestBatchSearch(Array.from(validSources), query));
  };
}

export function searchSource(sourceId: string, query: string) {
  return async ({ dispatch, getState }: ThunkArgs) => {
    await dispatch(clearSearchResults());
    const sourceRecord = getSource(getState(), sourceId);
    if (!sourceRecord) {
      return;
    }
    const matches = await findSourceMatches(sourceRecord.toJS(), query);
    if (!matches.length) {
      return;
    }
    dispatch({
      type: "ADD_SEARCH_RESULT",
      result: {
        sourceId: sourceRecord.get("id"),
        filepath: sourceRecord.get("url"),
        matches
      }
    });
  };
}
