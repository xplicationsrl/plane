/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { initPromise, i18nInstance } from "./instance";
import { FALLBACK_LANGUAGE, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from "../constants/language";
import type { TLanguage } from "../types";

export async function setLanguage(lng: TLanguage): Promise<void> {
  await initPromise;
  // Profiles can still hold a language that is no longer shipped; use the default instead
  const language = SUPPORTED_LANGUAGES.some((option) => option.value === lng) ? lng : FALLBACK_LANGUAGE;
  await i18nInstance.changeLanguage(language);
  if (typeof window !== "undefined") {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }
}
