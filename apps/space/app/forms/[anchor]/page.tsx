/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
// plane imports
import { API_BASE_URL } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TPublicIntakeForm, TPublicIntakeFormField } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
import { PoweredBy } from "@/components/common/powered-by";
import type { Route } from "./+types/page";

type TValue = string | number | boolean | string[];
type TStatus = "loading" | "ready" | "not_found" | "error" | "submitted";

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
// Validate before using the anchor in a request (same rule as published boards)
const ANCHOR_REGEX = /^[a-zA-Z0-9_-]+$/;

export const meta: Route.MetaFunction = () => [{ title: "Xplication" }, { name: "robots", content: "noindex" }];

const inputClass =
  "w-full rounded-md border-[0.5px] border-subtle bg-surface-1 px-3 py-2 text-body-sm-regular text-primary outline-none placeholder:text-placeholder focus:border-accent-strong";

function FieldControl(props: {
  field: TPublicIntakeFormField;
  value: TValue | undefined;
  onChange: (value: TValue) => void;
  id: string;
  invalid: boolean;
}) {
  const { field, value, onChange, id, invalid } = props;
  const { t } = useTranslation();
  const common = { id, "aria-invalid": invalid, className: cn(inputClass, { "border-danger-strong": invalid }) };

  switch (field.type) {
    case "textarea":
      return (
        <textarea {...common} rows={5} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      );
    case "priority":
      return (
        <select {...common} value={(value as string) ?? "none"} onChange={(e) => onChange(e.target.value)}>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {t(priority)}
            </option>
          ))}
        </select>
      );
    case "select":
      return (
        <select {...common} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t("intake_forms.public.select_placeholder")}</option>
          {field.options?.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      );
    case "multi_select": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div id={id} className="flex flex-col gap-1.5">
          {field.options?.map((option) => (
            <label key={option.id} className="flex items-center gap-2 text-body-sm-regular text-primary">
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...selected, option.id] : selected.filter((v) => v !== option.id))
                }
              />
              {option.name}
            </label>
          ))}
        </div>
      );
    }
    case "checkbox":
      return <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
    case "number":
      return (
        <input
          {...common}
          type="number"
          inputMode="decimal"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <input
          {...common}
          type={
            field.type === "email" ? "email" : field.type === "date" ? "date" : field.type === "url" ? "url" : "text"
          }
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function PublicFormPage() {
  const { anchor } = useParams<{ anchor: string }>();
  const { t } = useTranslation();
  // states
  const [status, setStatus] = useState<TStatus>("loading");
  const [form, setForm] = useState<TPublicIntakeForm | null>(null);
  const [values, setValues] = useState<Record<string, TValue>>({});
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const url = `${API_BASE_URL}/api/public/forms/${anchor}/`;

  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!anchor || !ANCHOR_REGEX.test(anchor)) {
      setStatus("not_found");
      return;
    }
    // Ignore a response that lands after unmount or after a newer load started
    let isCurrent = true;
    const load = async () => {
      setStatus("loading");
      try {
        const response = await fetch(url);
        if (!isCurrent) return;
        // Only a 404 means the form is gone; anything else (5xx, network) can be retried
        if (response.status === 404) {
          setStatus("not_found");
          return;
        }
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as TPublicIntakeForm;
        if (!isCurrent) return;
        setForm(data);
        setStatus("ready");
      } catch {
        if (isCurrent) setStatus("error");
      }
    };
    void load();
    return () => {
      isCurrent = false;
    };
  }, [anchor, url, loadAttempt]);

  const labelOf = (field: TPublicIntakeFormField) => field.label || t(`intake_forms.fields.${field.key}`);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values, website: honeypot }),
      });
      if (response.status === 429) {
        setFormError(t("intake_forms.public.rate_limited"));
        return;
      }
      const body = (await response.json().catch(() => ({}))) as {
        errors?: Record<string, string[]>;
        success_message?: string;
      };
      if (!response.ok) {
        setErrors(body.errors ?? {});
        setFormError(t("intake_forms.public.fix_errors"));
        return;
      }
      setSuccessMessage(body.success_message || "");
      setStatus("submitted");
    } catch {
      setFormError(t("intake_forms.public.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setValues({});
    setErrors({});
    setFormError(null);
    setStatus("ready");
  };

  return (
    <div className="flex min-h-screen w-full justify-center bg-surface-2 px-4 py-10 sm:py-16">
      <div className="w-full max-w-xl">
        {status === "loading" && (
          <div className="flex justify-center py-20">
            <LogoSpinner />
          </div>
        )}

        {status === "not_found" && (
          <div className="rounded-xl border border-subtle bg-surface-1 px-6 py-10 text-center shadow-raised-100">
            <h1 className="text-h5-medium text-primary">{t("intake_forms.public.not_found_title")}</h1>
            <p className="mt-2 text-body-sm-regular text-tertiary">{t("intake_forms.public.not_found_description")}</p>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-xl border border-subtle bg-surface-1 px-6 py-10 text-center shadow-raised-100">
            <h1 className="text-h5-medium text-primary">{t("intake_forms.public.load_error_title")}</h1>
            <p className="mt-2 text-body-sm-regular text-tertiary">{t("intake_forms.public.load_error_description")}</p>
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="mt-6 text-body-sm-medium text-accent-primary hover:underline"
            >
              {t("intake_forms.public.retry")}
            </button>
          </div>
        )}

        {status === "submitted" && (
          <div className="rounded-xl border border-subtle bg-surface-1 px-6 py-10 text-center shadow-raised-100">
            <h1 className="text-h5-medium text-primary">{t("intake_forms.public.success_title")}</h1>
            <p className="mt-2 text-body-sm-regular whitespace-pre-line text-secondary">
              {successMessage || t("intake_forms.public.success_default")}
            </p>
            <button
              type="button"
              onClick={resetForm}
              className="mt-6 text-body-sm-medium text-accent-primary hover:underline"
            >
              {t("intake_forms.public.another")}
            </button>
          </div>
        )}

        {status === "ready" && form && (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex flex-col gap-5 rounded-xl border border-subtle bg-surface-1 px-6 py-8 shadow-raised-100"
          >
            <div>
              <p className="text-caption-md-medium text-tertiary">{form.project_name}</p>
              <h1 className="mt-1 text-h4-medium text-primary">{form.name}</h1>
              {form.description && (
                <p className="mt-2 text-body-sm-regular whitespace-pre-line text-secondary">{form.description}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="field-name" className="text-body-sm-medium text-primary">
                {t("intake_forms.fields.name")} <span className="text-danger-primary">*</span>
              </label>
              <input
                id="field-name"
                className={cn(inputClass, { "border-danger-strong": !!errors.name })}
                value={(values.name as string) ?? ""}
                maxLength={255}
                aria-invalid={!!errors.name}
                onChange={(e) => setValues((prev) => ({ ...prev, name: e.target.value }))}
              />
              {errors.name && <p className="text-caption-md-regular text-danger-primary">{errors.name[0]}</p>}
            </div>

            {form.fields.map((field) => {
              const id = `field-${field.key.replace(":", "-")}`;
              return (
                <div key={field.key} className="flex flex-col gap-1.5">
                  <label htmlFor={id} className="text-body-sm-medium text-primary">
                    {labelOf(field)} {field.required && <span className="text-danger-primary">*</span>}
                  </label>
                  {field.help_text && <p className="text-caption-md-regular text-tertiary">{field.help_text}</p>}
                  <FieldControl
                    id={id}
                    field={field}
                    value={values[field.key]}
                    invalid={!!errors[field.key]}
                    onChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))}
                  />
                  {errors[field.key] && (
                    <p className="text-caption-md-regular text-danger-primary">{errors[field.key][0]}</p>
                  )}
                </div>
              );
            })}

            {/* Honeypot: hidden from people, filled in by bots */}
            <input
              type="text"
              name="website"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />

            {formError && <p className="text-body-sm-regular text-danger-primary">{formError}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="self-start rounded-md bg-accent-primary px-4 py-2 text-body-sm-medium text-on-color hover:bg-accent-primary/90 disabled:opacity-60"
            >
              {isSubmitting ? t("intake_forms.public.submitting") : t("intake_forms.public.submit")}
            </button>
          </form>
        )}
      </div>
      <PoweredBy />
    </div>
  );
}

export default PublicFormPage;
