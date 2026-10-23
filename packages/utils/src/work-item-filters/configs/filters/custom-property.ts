/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFilterProperty } from "@plane/types";
import { COLLECTION_OPERATOR, EQUALITY_OPERATOR } from "@plane/types";
// local imports
import type {
  TCreateDateFilterParams,
  TCreateFilterConfigParams,
  IFilterIconConfig,
  TCreateFilterConfig,
} from "../../../rich-filters";
import {
  createFilterConfig,
  getMultiSelectConfig,
  createOperatorConfigEntry,
  getSupportedDateOperators,
} from "../../../rich-filters";

/** A choice of a custom property: a select option, a person, or yes/no for checkboxes. */
export type TCustomPropertyFilterOption = {
  id: string;
  name: string;
  /** Option colour, or avatar URL for people; passed to `getOptionIcon`. */
  iconData?: string;
};

export type TCreateCustomPropertyFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<string | undefined> & {
    /** Shown as the filter's name: the property's name. */
    label: string;
    options: TCustomPropertyFilterOption[];
  };

/**
 * Filter config for a custom property, keyed `customproperty_<id>`; matches work items whose
 * value is any of the chosen options (the API resolves the condition per property type).
 */
export const getCustomPropertyFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateCustomPropertyFilterParams> =>
  (params: TCreateCustomPropertyFilterParams) =>
    createFilterConfig<P>({
      id: key,
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getMultiSelectConfig<TCustomPropertyFilterOption, string, string | undefined>(
            {
              items: updatedParams.options,
              getId: (option) => option.id,
              getLabel: (option) => option.name,
              getValue: (option) => option.id,
              getIconData: (option) => option.iconData,
            },
            { singleValueOperator: EQUALITY_OPERATOR.EXACT, ...updatedParams },
            { getOptionIcon: updatedParams.getOptionIcon }
          )
        ),
      ]),
    });

/** Filter config for a date custom property: on a date, or between two dates. */
export const getCustomPropertyDateFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateDateFilterParams & { label: string }> =>
  (params: TCreateDateFilterParams & { label: string }) =>
    createFilterConfig<P>({
      id: key,
      ...params,
      icon: params.filterIcon,
      allowMultipleFilters: true,
      supportedOperatorConfigsMap: getSupportedDateOperators(params),
    });
