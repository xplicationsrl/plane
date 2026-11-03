/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
// plane imports
import { ISSUE_COLORS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TIssueColor } from "@plane/types";
import { cn } from "@plane/utils";

type TSwatchProps = {
  hex: string | undefined;
};

function ColorSwatch({ hex }: TSwatchProps) {
  if (!hex) return <span className="block size-2.5 shrink-0 rounded-full border border-dashed border-strong" />;
  return <span className="block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />;
}

type TWorkItemColorSelectProps = {
  value: TIssueColor | null | undefined;
  onChange: (color: TIssueColor | null) => void | Promise<void>;
  disabled?: boolean;
  /** Sidebar form: the color's name next to the swatch. Rows show the swatch alone. */
  showLabel?: boolean;
  /** Rows reveal the empty swatch on hover, keyed to their own hover group. */
  emptyClassName?: string;
};

export function WorkItemColorSelect(props: TWorkItemColorSelectProps) {
  const { value, onChange, disabled = false, showLabel = false, emptyClassName } = props;
  const { t } = useTranslation();

  const selected = ISSUE_COLORS.find((option) => option.key === value);
  const name = selected ? t(selected.titleTranslationKey) : t("work_item_color.none");

  // Nothing to show or change on a read-only row
  if (disabled && !selected && !showLabel) return null;

  const content = (
    <>
      <ColorSwatch hex={selected?.hex} />
      {showLabel && <span className={cn("truncate", { "text-placeholder": !selected })}>{name}</span>}
    </>
  );
  const labelClassName = "flex h-7.5 items-center gap-1.5 rounded-sm px-2 text-body-xs-regular text-primary";

  if (disabled) {
    return showLabel ? (
      <div className={labelClassName}>{content}</div>
    ) : (
      <span role="img" aria-label={name} className="grid size-4 shrink-0 place-items-center">
        {content}
      </span>
    );
  }

  return (
    // Rows are links activated by click and Enter/Space, so the menu's own activation must not reach them.
    // React events bubble out of the menu's portal too, which covers its rows.
    <div
      role="presentation"
      className="shrink-0"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
    >
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label={`${t("work_item_color.set")}: ${name}`}
              className={cn(
                showLabel
                  ? cn(labelClassName, "w-full hover:bg-layer-transparent-hover")
                  : "grid size-4 cursor-pointer place-items-center rounded-full hover:bg-layer-transparent-hover",
                !selected && !showLabel && emptyClassName,
                "focus-visible:opacity-100 aria-expanded:opacity-100"
              )}
            />
          }
        >
          {content}
        </MenuTrigger>
        <MenuContent side="bottom" align="start">
          <MenuItem
            icon={<ColorSwatch hex={undefined} />}
            label={t("work_item_color.none")}
            selected={!selected}
            onClick={() => onChange(null)}
          />
          {ISSUE_COLORS.map((option) => (
            <MenuItem
              key={option.key}
              icon={<ColorSwatch hex={option.hex} />}
              label={t(option.titleTranslationKey)}
              selected={option.key === value}
              onClick={() => onChange(option.key)}
            />
          ))}
        </MenuContent>
      </Menu>
    </div>
  );
}
