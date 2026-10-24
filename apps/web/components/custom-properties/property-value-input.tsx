/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { NewTabOutline } from "@makeplane/propel/icons";
import { Checkbox } from "@makeplane/propel/components/checkbox";
import { DateSelect } from "@plane/blocks/property-select";
import { Select } from "@plane/blocks/select";
import { useTranslation } from "@plane/i18n";
import type { TCustomProperty, TCustomPropertyOption, TCustomPropertyValue } from "@plane/types";
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";
// components
import { MemberSelect } from "@/components/dropdowns/member/member-select";
// hooks
import { useUserProfile } from "@/hooks/store/user";

type Props = {
  property: TCustomProperty;
  projectId: string;
  value: TCustomPropertyValue | undefined;
  disabled?: boolean;
  onChange: (value: TCustomPropertyValue) => void;
};

const INPUT_CLASS =
  "h-7.5 w-full min-w-0 rounded-sm border-[0.5px] border-transparent bg-transparent px-2 text-body-xs-regular text-primary outline-none placeholder:text-placeholder hover:bg-layer-transparent-hover focus:border-strong disabled:cursor-not-allowed";

const NONE_OPTION_ID = "";

function OptionDot({ color }: { color: string }) {
  return <span className="block size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

/** Text, number and URL fields: edit in place, commit on Enter or blur, Escape reverts. */
function InlineTextInput(props: {
  type: "text" | "number" | "url";
  value: string;
  placeholder: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const { type, value, placeholder, disabled, onCommit } = props;
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft.trim() !== value) onCommit(draft.trim());
  };

  return (
    <div className="flex w-full items-center gap-1">
      <input
        type={type === "number" ? "number" : "text"}
        inputMode={type === "number" ? "decimal" : undefined}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        className={INPUT_CLASS}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
      />
      {type === "url" && isSafeLink(value) && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 rounded-sm p-1 text-tertiary hover:text-primary"
          aria-label={value}
        >
          <NewTabOutline className="size-3.5" />
        </a>
      )}
    </div>
  );
}

/** Only http(s) values become links; anything else (e.g. `javascript:`) stays plain text. */
const isSafeLink = (value: string | undefined) => {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

/** Editor for one custom field value; the control matches the field type. */
export const CustomPropertyValueInput = observer(function CustomPropertyValueInput(props: Props) {
  const { property, projectId, value, disabled = false, onChange } = props;
  const { t } = useTranslation();
  const { data: userProfile } = useUserProfile();
  const placeholder = t("custom_properties.value.empty");

  switch (property.property_type) {
    case "text":
    case "url":
      return (
        <InlineTextInput
          type={property.property_type}
          value={typeof value === "string" ? value : ""}
          placeholder={placeholder}
          disabled={disabled}
          onCommit={(next) => onChange(next || null)}
        />
      );
    case "number":
      return (
        <InlineTextInput
          type="number"
          value={typeof value === "number" ? String(value) : ""}
          placeholder={placeholder}
          disabled={disabled}
          onCommit={(next) => onChange(next === "" ? null : Number(next))}
        />
      );
    case "date":
      return (
        <DateSelect
          placeholder={placeholder}
          value={typeof value === "string" ? (getDate(value) ?? null) : null}
          onChange={(date) => onChange(date ? (renderFormattedPayloadDate(date) ?? null) : null)}
          disabled={disabled}
          clearable
          weekStartsOn={userProfile?.start_of_the_week}
          variant="select-ghost-md"
        />
      );
    case "checkbox":
      return (
        <div className="flex h-7.5 items-center px-2">
          <Checkbox
            checked={value === true}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(checked === true)}
            aria-label={property.name}
          />
        </div>
      );
    case "select": {
      const noneOption: TCustomPropertyOption = { id: NONE_OPTION_ID, name: t("common.none"), color: "transparent" };
      const selected = property.options.find((option) => option.id === value) ?? null;
      return (
        <Select<TCustomPropertyOption>
          getValues={() => property.options}
          headerItems={selected ? [noneOption] : []}
          value={selected}
          onChange={(optionId) => onChange(optionId === NONE_OPTION_ID ? null : optionId)}
          disabled={disabled}
          placeholder={placeholder}
          showSearch={property.options.length > 7}
          pinSelected={false}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          getOptionIcon={(option) => (option.id === NONE_OPTION_ID ? null : <OptionDot color={option.color} />)}
        >
          <Select.Trigger<TCustomPropertyOption>
            disabled={disabled}
            variant="select-ghost-md"
            label={(options) => options[0]?.name ?? placeholder}
          >
            {(options) => (
              <span
                className={cn("flex min-w-0 grow items-center gap-1.5 truncate", { "text-placeholder": !options[0] })}
              >
                {options[0] && <OptionDot color={options[0].color} />}
                <span className="truncate">{options[0]?.name ?? placeholder}</span>
              </span>
            )}
          </Select.Trigger>
        </Select>
      );
    }
    case "multi_select": {
      const selectedIds = Array.isArray(value) ? value : [];
      return (
        <Select<TCustomPropertyOption>
          multiple
          getValues={() => property.options}
          valueIds={selectedIds}
          getOptionPlaceholder={(id) => ({ id, name: id, color: "transparent" })}
          onChange={(ids) => onChange(ids.length ? ids : null)}
          disabled={disabled}
          placeholder={placeholder}
          showSearch={property.options.length > 7}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          getOptionIcon={(option) => <OptionDot color={option.color} />}
        >
          <Select.Trigger<TCustomPropertyOption>
            disabled={disabled}
            variant="select-ghost-md"
            label={(options) => options.map((option) => option.name).join(", ") || placeholder}
          >
            {(options) =>
              options.length ? (
                <span className="flex min-w-0 grow flex-wrap items-center gap-1">
                  {options.map((option) => (
                    <span
                      key={option.id}
                      className="flex items-center gap-1 rounded-sm border-[0.5px] border-subtle px-1.5 py-0.5"
                    >
                      <OptionDot color={option.color} />
                      <span className="max-w-32 truncate">{option.name}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="truncate text-placeholder">{placeholder}</span>
              )
            }
          </Select.Trigger>
        </Select>
      );
    }
    case "member":
      return (
        <MemberSelect
          value={Array.isArray(value) ? value : []}
          onChange={(ids: string[]) => onChange(ids.length ? ids : null)}
          projectId={projectId}
          disabled={disabled}
          placeholder={placeholder}
          multiple
          variant="select-ghost-md"
          showLabel={(Array.isArray(value) ? value.length : 0) <= 1}
        />
      );
    default:
      return null;
  }
});
