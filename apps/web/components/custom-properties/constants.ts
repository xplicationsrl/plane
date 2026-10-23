/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC, SVGProps } from "react";
import {
  CalendarOutline,
  CheckSquareOutline,
  DropdownOutline,
  HashOutline,
  LinkOutline,
  MembersOutline,
  MultiTagOutline,
  TextOutline,
} from "@makeplane/propel/icons";
import type { TCustomPropertyType } from "@plane/types";

export const CUSTOM_PROPERTY_TYPES: {
  key: TCustomPropertyType;
  i18n_label: string;
  icon: FC<SVGProps<SVGSVGElement>>;
}[] = [
  { key: "text", i18n_label: "custom_properties.types.text", icon: TextOutline },
  { key: "number", i18n_label: "custom_properties.types.number", icon: HashOutline },
  { key: "date", i18n_label: "custom_properties.types.date", icon: CalendarOutline },
  { key: "select", i18n_label: "custom_properties.types.select", icon: DropdownOutline },
  { key: "multi_select", i18n_label: "custom_properties.types.multi_select", icon: MultiTagOutline },
  { key: "checkbox", i18n_label: "custom_properties.types.checkbox", icon: CheckSquareOutline },
  { key: "url", i18n_label: "custom_properties.types.url", icon: LinkOutline },
  { key: "member", i18n_label: "custom_properties.types.member", icon: MembersOutline },
];

export const getCustomPropertyTypeIcon = (type: TCustomPropertyType) =>
  CUSTOM_PROPERTY_TYPES.find((item) => item.key === type)?.icon ?? TextOutline;
