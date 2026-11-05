/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@/services/api.service";

export class SuggestionService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async create(workspaceSlug: string, body: string): Promise<void> {
    await this.post(`/api/workspaces/${workspaceSlug}/suggestions/`, { body }).catch((err) => {
      throw err?.response?.data;
    });
  }
}
