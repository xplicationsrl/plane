/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

const UNIT_SECONDS: Record<string, number> = {
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  s: 1,
  sec: 1,
  secs: 1,
};

/**
 * Parses what people type for logged time into seconds.
 *
 * Accepts `1h 30m`, `1h30m`, `1.5h`, `90m`, `45 min`, `1:30` (h:mm) and a bare number,
 * which is read as minutes. Returns null for anything unreadable or not positive.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(",", ".");
  if (!text) return null;

  const clock = /^(\d+):([0-5]\d)$/.exec(text);
  if (clock) return positive(Number(clock[1]) * 3600 + Number(clock[2]) * 60);

  if (/^\d+(\.\d+)?$/.test(text)) return positive(Math.round(Number(text) * 60));

  const part = /(\d+(?:\.\d+)?)\s*([a-z]+)/g;
  let total = 0;
  let consumed = "";
  for (let match = part.exec(text); match; match = part.exec(text)) {
    const unit = UNIT_SECONDS[match[2]];
    if (unit === undefined) return null;
    total += Number(match[1]) * unit;
    consumed += match[0];
  }
  // Reject leftovers such as "1h abc"
  if (consumed.replace(/\s/g, "") !== text.replace(/\s/g, "")) return null;
  return positive(Math.round(total));
}

/** `3h 20m`, `45m`, `30s`: compact total for labels. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  if (safe < 60) return `${safe}s`;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** `1:02:03` / `2:03`: a running timer's clock face. */
export function formatTimerClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function positive(seconds: number): number | null {
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
