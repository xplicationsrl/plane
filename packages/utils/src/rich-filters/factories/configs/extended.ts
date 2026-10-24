/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TBaseFilterFieldConfig, TSupportedFilterFieldConfigs } from "@plane/types";
import { FILTER_FIELD_TYPE } from "@plane/types";

/** Free-text input (e.g. for "contains"). */
export const getTextInputConfig = (
  config: TBaseFilterFieldConfig & { placeholder?: string }
): TSupportedFilterFieldConfigs<string> => ({ type: FILTER_FIELD_TYPE.TEXT, ...config });

/** Single number input. */
export const getNumberInputConfig = (config: TBaseFilterFieldConfig): TSupportedFilterFieldConfigs<string> => ({
  type: FILTER_FIELD_TYPE.NUMBER,
  ...config,
});

/** Min/max number inputs; either side may be left empty. */
export const getNumberRangeInputConfig = (config: TBaseFilterFieldConfig): TSupportedFilterFieldConfigs<string> => ({
  type: FILTER_FIELD_TYPE.NUMBER_RANGE,
  ...config,
});
