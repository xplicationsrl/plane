/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLanguage, ILanguageOption } from "../types";

export const FALLBACK_LANGUAGE: TLanguage = "en";

export const SUPPORTED_LANGUAGES: ILanguageOption[] = [{ label: "English", value: "en" }];

export const LANGUAGE_STORAGE_KEY = "userLanguage";
