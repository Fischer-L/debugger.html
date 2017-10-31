// @flow

import type { Source } from "debugger-html";
import type { AstLocation, AstPosition } from "./types";

import get from "lodash/fp/get";

import { containsLocation, containsPosition } from "./utils/contains";

import getSymbols from "./getSymbols";

function findSymbols(source) {
  const { functions, comments } = getSymbols(source);
  return { functions, comments };
}

/**
 * Returns the location for a given function path. If the path represents a
 * function declaration, the location will begin after the function identifier
 * but before the function parameters.
 */

function getLocation(func) {
  const location = { ...func.location };

  // if the function has an identifier, start the block after it so the
  // identifier is included in the "scope" of its parent
  const identifierEnd = get("identifier.loc.end", func);
  if (identifierEnd) {
    location.start = identifierEnd;
  }

  return location;
}

/**
 * Reduces an array of locations to remove items that are completely enclosed
 * by another location in the array.
 */
function removeOverlaps(
  locations: AstLocation | AstLocation[],
  location: AstLocation
) {
  // support reducing without an initializing array
  if (!Array.isArray(locations)) {
    locations = [locations];
  }

  const contains =
    locations.filter(a => containsLocation(a, location)).length > 0;

  if (!contains) {
    locations.push(location);
  }

  return locations;
}

/**
 * Sorts an array of locations by start position
 */
function sortByStart(a: AstLocation, b: AstLocation) {
  if (a.start.line < b.start.line) {
    return -1;
  } else if (a.start.line === b.start.line) {
    return a.start.column - b.start.column;
  }

  return 1;
}

function startsBefore(a: AstLocation, b: AstPosition) {
  let before = a.start.line < b.line;
  if (a.start.line === b.line) {
    before =
      a.start.column >= 0 && b.column >= 0 ? a.start.column <= b.column : true;
  }
  return before;
}

function testtt(locations: AstLocation[], position: AstPosition) {
  let nearestPos = -1;
  for (let i = 0; i < locations.length; i++) {
    let loc = locations[i];
    if (containsPosition(loc, position)) {
      nearestPos = i;
    }
  }

  let endEnclosingPos = -1;
  if (nearestPos >= 0) {
    let parentLoc = locations[nearestPos];
    for (let i = nearestPos + 1; i < locations.length; i++) {
      let loc = locations[i];
      if (containsLocation(parentLoc, loc)) {
        endEnclosingPos = i;
      }
    }
  }

  console.log("TMP > nearestPos =", nearestPos);
  console.log("TMP > endEnclosingPos =", endEnclosingPos);
  if (nearestPos >= 0 && endEnclosingPos >= 0) {
    let newLocs = locations.slice();
    newLocs.splice(nearestPos + 1, endEnclosingPos - nearestPos);
    return newLocs;
  }
  return locations;
}

/**
 * Returns an array of locations that are considered out of scope for the given
 * location.
 */
function getOutOfScopeLocations(
  source: Source,
  position: AstPosition
): AstLocation[] {
  const { functions, comments } = findSymbols(source);
  const commentLocations = comments.map(c => c.location);

  console.log("");
  console.log("TMP > position line =", position.line);
  let ll = functions.map(getLocation);
  console.log("TMP > ll =", ll);
  ll = testtt(ll, position);
  console.log("TMP > ll testtted =", ll);
  ll = ll.filter(loc => !containsPosition(loc, position)); //ll.concat(commentLocations)
  console.log("TMP > ll filtered =", ll);
  ll = ll.reduce(removeOverlaps, []);
  console.log("TMP > ll removed overlaps =", ll);
  return ll.sort(sortByStart);
}

export default getOutOfScopeLocations;
