/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
// mobx store
import { StoreContext } from "@/lib/store-context";
// types
import type { ITimeEntryStore } from "@/store/time-entry.store";

export const useTimeEntry = (): ITimeEntryStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useTimeEntry must be used within StoreProvider");
  return context.timeEntry;
};
