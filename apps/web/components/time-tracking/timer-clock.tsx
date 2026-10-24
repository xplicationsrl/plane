/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { formatTimerClock } from "@plane/blocks/utils";
// hooks
import { useElapsed } from "@/hooks/use-elapsed";

type Props = {
  startedAt: string | null | undefined;
  className?: string;
};

/** Ticking clock for a running timer; kept as a leaf so only it re-renders every second. */
export function TimerClock(props: Props) {
  const { startedAt, className } = props;
  const elapsed = useElapsed(startedAt);
  return <span className={className}>{formatTimerClock(elapsed)}</span>;
}
