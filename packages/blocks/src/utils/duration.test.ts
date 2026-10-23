/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { formatDuration, formatTimerClock, parseDuration } from "./duration";

describe("parseDuration", () => {
  it.each([
    ["1h 30m", 5400],
    ["1h30m", 5400],
    ["1.5h", 5400],
    ["1,5h", 5400],
    ["90m", 5400],
    ["45 min", 2700],
    ["2 hours", 7200],
    ["1:30", 5400],
    ["0:05", 300],
    ["30", 1800],
    ["30s", 30],
    ["  2H  ", 7200],
  ])("reads %j as %i seconds", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(["", "abc", "1h abc", "0", "0m", "1:75", "5 days", "-1h"])("rejects %j", (input) => {
    expect(parseDuration(input)).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0s"],
    [45, "45s"],
    [60, "1m"],
    [2700, "45m"],
    [3600, "1h"],
    [5400, "1h 30m"],
    [90061, "25h 1m"],
  ])("formats %i seconds as %j", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe("formatTimerClock", () => {
  it.each([
    [0, "0:00"],
    [65, "1:05"],
    [3723, "1:02:03"],
  ])("formats %i seconds as %j", (seconds, expected) => {
    expect(formatTimerClock(seconds)).toBe(expected);
  });
});
