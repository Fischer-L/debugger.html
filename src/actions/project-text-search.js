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

// export function ORIG_searchSources(query: string) {
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

//       let TMP_c = 0;

//     for (const source of validSources) {
//       if (TMP_c > 5) break;
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

function batchSearchSources(sources, query, limit) {
  return async ({ dispatch, getState }: ThunkArgs) => {
    console.log("TMP> batchSearchSources");
    let matchCount = 0;
    for (const source of sources) {
      await dispatch(loadSourceText(source));
      const loadedSource = getSource(getState(), source.get("id"));
      const matches = await findSourceMatches(loadedSource.toJS(), query);
      if (matches.length) {
        matchCount += matches.length;
        dispatch({
          type: "ADD_SEARCH_RESULT",
          result: {
            sourceId: loadedSource.get("id"),
            filepath: loadedSource.get("url"),
            matches
          }
        });
      }
      if (matchCount >= limit) {
        break;
      }
    }
  };
}

export function searchSources(query: string, option = {}) {
  return async ({ dispatch, getState }: ThunkArgs) => {
    const reusePreviousResults =
      !!option.reusePreviousResults && getTextSearchQuery(getState()) == query;
    console.log("reusePreviousResults =", reusePreviousResults);
    if (!reusePreviousResults) {
      await dispatch(clearSearchResults());
      await dispatch(addSearchQuery(query));
    }
    dispatch(updateSearchStatus(statusType.fetching));
    const sources = getSources(getState());
    const previousResults = getTextSearchResults(getState());
    console.log("previousResults =", previousResults);
    window.previousResults = previousResults;
    let validSources = sources.valueSeq().filter(source => {
      let valid =
        hasPrettySource(getState(), source.get("id")) && isThirdParty(source);
      if (reusePreviousResults && previousResults.size) {
        console.log("previousResults =", previousResults);
        valid = !previousResults.find(
          result => result.sourceId == source.get("id")
        );
      }
      return valid;
    });
    await dispatch(batchSearchSources(validSources, query, 500));
    dispatch(updateSearchStatus(statusType.done));
    console.log("TMP> After updateSearchStatus");
  };
}

export function searchSource(sourceId: string, query: string) {
  return async ({ dispatch, getState }: ThunkArgs) => {
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
