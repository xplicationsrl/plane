/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { TFilterConditionNodeForDisplay, TFilterProperty } from "@plane/types";
import { cn } from "@plane/utils";
// local imports
import { COMMON_FILTER_ITEM_BORDER_CLASSNAME, EMPTY_FILTER_PLACEHOLDER_TEXT } from "../../shared";

const INPUT_CLASS =
  "h-full min-w-0 bg-transparent px-2 text-body-xs-regular text-primary outline-none placeholder:text-placeholder";

/** An input that commits on Enter or blur, so filters don't refetch on every keystroke. */
function CommitInput(props: {
  value: string;
  type: "text" | "number";
  placeholder: string;
  disabled?: boolean;
  focusOnMount?: boolean;
  className?: string;
  onCommit: (value: string) => void;
}) {
  const { value, type, placeholder, disabled, focusOnMount, className, onCommit } = props;
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      type={type}
      inputMode={type === "number" ? "decimal" : undefined}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- a freshly added filter waits for its value
      autoFocus={focusOnMount}
      aria-label={placeholder}
      className={cn(INPUT_CLASS, className)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

type TSingleProps<P extends TFilterProperty> = {
  type: "text" | "number";
  condition: TFilterConditionNodeForDisplay<P, string>;
  isDisabled?: boolean;
  placeholder?: string;
  onChange: (value: string | null) => void;
};

export const SingleInputFilterValueInput = observer(function SingleInputFilterValueInput<P extends TFilterProperty>(
  props: TSingleProps<P>
) {
  const { type, condition, isDisabled, placeholder, onChange } = props;
  const value = typeof condition.value === "string" ? condition.value : "";
  return (
    <div className={cn("flex h-full items-center", { [COMMON_FILTER_ITEM_BORDER_CLASSNAME]: !isDisabled })}>
      <CommitInput
        type={type}
        value={value}
        placeholder={placeholder ?? EMPTY_FILTER_PLACEHOLDER_TEXT}
        disabled={isDisabled}
        focusOnMount={!value}
        className={type === "number" ? "w-24" : "w-40"}
        onCommit={(next) => onChange(next || null)}
      />
    </div>
  );
});

type TRangeProps<P extends TFilterProperty> = {
  condition: TFilterConditionNodeForDisplay<P, string>;
  isDisabled?: boolean;
  onChange: (value: string[] | null) => void;
};

/** Min and max inputs; an empty side leaves that end open. */
export const NumberRangeFilterValueInput = observer(function NumberRangeFilterValueInput<P extends TFilterProperty>(
  props: TRangeProps<P>
) {
  const { condition, isDisabled, onChange } = props;
  const [min = "", max = ""] = Array.isArray(condition.value) ? condition.value.map(String) : [];
  const commit = (nextMin: string, nextMax: string) => onChange(nextMin || nextMax ? [nextMin, nextMax] : null);
  return (
    <div className={cn("flex h-full items-center", { [COMMON_FILTER_ITEM_BORDER_CLASSNAME]: !isDisabled })}>
      <CommitInput
        type="number"
        value={min}
        placeholder="min"
        disabled={isDisabled}
        focusOnMount={!min && !max}
        className="w-16"
        onCommit={(next) => commit(next, max)}
      />
      <span className="text-placeholder">–</span>
      <CommitInput
        type="number"
        value={max}
        placeholder="max"
        disabled={isDisabled}
        className="w-16"
        onCommit={(next) => commit(min, next)}
      />
    </div>
  );
});
