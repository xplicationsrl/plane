/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@makeplane/propel/components/button";
import { TextArea } from "@makeplane/propel/components/text-area";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
// services
import { SuggestionService } from "@/services/suggestion.service";

// Matches Suggestion.MAX_BODY_LENGTH on the API
const MAX_LENGTH = 2000;

const suggestionService = new SuggestionService();

type Props = {
  workspaceSlug: string;
};

export function SuggestionBox({ workspaceSlug }: Props) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedBody = body.trim();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedBody || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await suggestionService.create(workspaceSlug, trimmedBody);
      setBody("");
      setToast({
        type: "success",
        title: t("home.suggestions.toasts.sent.title"),
        message: t("home.suggestions.toasts.sent.message"),
      });
    } catch (error) {
      console.error("Error sending suggestion", error);
      setToast({
        type: "error",
        title: t("home.suggestions.toasts.failed.title"),
        message: t("home.suggestions.toasts.failed.message"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 pb-4">
      <div>
        <div className="text-14 font-semibold text-tertiary">{t("home.suggestions.title")}</div>
        <p className="mt-1 text-13 text-tertiary">{t("home.suggestions.description")}</p>
      </div>
      <TextArea
        size="lg"
        surface="field"
        aria-label={t("home.suggestions.title")}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t("home.suggestions.placeholder")}
        maxLength={MAX_LENGTH}
        rows={3}
      />
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="md"
          stretch="auto"
          type="submit"
          loading={isSubmitting}
          disabled={!trimmedBody}
          label={t("home.suggestions.submit")}
        />
      </div>
    </form>
  );
}
