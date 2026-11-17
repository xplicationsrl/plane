/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import {
  DeleteOutline,
  EditOutline,
  GlobeOutline,
  LinkOutline,
  LockOutline,
  MoreHorizontalOutline,
} from "@makeplane/propel/icons";
// plane imports
import { EIssueCommentAccessSpecifier } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@makeplane/propel/components/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogHeading,
  DialogMain,
  DialogTitle,
} from "@makeplane/propel/components/dialog";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import type { TIssueComment, TCommentsOperations } from "@plane/types";
import type { TContextMenuItem } from "@plane/blocks/context-menu";
import { resolveItemVariant } from "@plane/blocks/context-menu";
// hooks
import { useUser } from "@/hooks/store/user";

type TCommentCard = {
  activityOperations: TCommentsOperations;
  comment: TIssueComment;
  setEditMode: () => void;
  showAccessSpecifier: boolean;
  showCopyLinkOption: boolean;
  /** Replies in this comment's thread; deleting the comment deletes them too, so it asks first. */
  replyCount?: number;
};

export const CommentQuickActions = observer(function CommentQuickActions(props: TCommentCard) {
  const { activityOperations, comment, setEditMode, showAccessSpecifier, showCopyLinkOption, replyCount = 0 } = props;
  // states
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // store hooks
  const { data: currentUser } = useUser();
  // derived values
  const isAuthor = currentUser?.id === comment.actor;
  const canEdit = isAuthor;
  const canDelete = isAuthor;
  // translation
  const { t } = useTranslation();

  const MENU_ITEMS = useMemo(
    function MENU_ITEMS(): TContextMenuItem[] {
      return [
        {
          key: "edit",
          action: setEditMode,
          title: t("common.actions.edit"),
          icon: EditOutline,
          shouldRender: canEdit,
        },
        {
          key: "copy_link",
          action: () => activityOperations.copyCommentLink(comment.id),
          title: t("common.actions.copy_link"),
          icon: LinkOutline,
          shouldRender: showCopyLinkOption,
        },
        {
          key: "access_specifier",
          action: () =>
            activityOperations.updateComment(comment.id, {
              access:
                comment.access === EIssueCommentAccessSpecifier.INTERNAL
                  ? EIssueCommentAccessSpecifier.EXTERNAL
                  : EIssueCommentAccessSpecifier.INTERNAL,
            }),
          title:
            comment.access === EIssueCommentAccessSpecifier.INTERNAL
              ? t("issue.comments.switch.public")
              : t("issue.comments.switch.private"),
          icon: comment.access === EIssueCommentAccessSpecifier.INTERNAL ? GlobeOutline : LockOutline,
          shouldRender: showAccessSpecifier,
        },
        {
          key: "delete",
          action: () => {
            if (replyCount > 0) setIsDeleteConfirmOpen(true);
            else void activityOperations.removeComment(comment.id);
          },
          title: t("common.actions.delete"),
          icon: DeleteOutline,
          shouldRender: canDelete,
        },
      ].filter((item) => item.shouldRender !== false);
    },
    [
      t,
      setEditMode,
      canEdit,
      showCopyLinkOption,
      activityOperations,
      comment,
      showAccessSpecifier,
      canDelete,
      replyCount,
    ]
  );

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      // removeComment shows its own success or error toast.
      await activityOperations.removeComment(comment.id);
      setIsDeleteConfirmOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (MENU_ITEMS.length === 0) return null;

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <IconButton
              icon={<Icon icon={MoreHorizontalOutline} />}
              aria-label={t("common.options")}
              variant="ghost"
              size="xs"
            />
          }
        />
        <MenuContent side="bottom" align="end">
          {MENU_ITEMS.map((item) => (
            <MenuItem
              key={item.key}
              variant={resolveItemVariant(item)}
              label={item.title ?? ""}
              description={item.description}
              icon={item.icon ? <Icon icon={item.icon} /> : undefined}
              disabled={item.disabled}
              onClick={() => item.action()}
            />
          ))}
        </MenuContent>
      </Menu>
      <Dialog
        open={isDeleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setIsDeleteConfirmOpen(false);
        }}
      >
        <DialogContent size="sm">
          <DialogMain>
            <DialogHeader>
              <DialogHeading>
                <DialogTitle>{t("issue.comments.remove.confirm.title")}</DialogTitle>
              </DialogHeading>
            </DialogHeader>
            <DialogBody>
              <p className="text-13 text-secondary">
                {t("issue.comments.remove.confirm.description", { count: replyCount })}
              </p>
            </DialogBody>
          </DialogMain>
          <DialogActions>
            <Button
              variant="secondary"
              size="md"
              stretch="auto"
              label={t("common.cancel")}
              onClick={() => setIsDeleteConfirmOpen(false)}
              disabled={isDeleting}
            />
            <Button
              variant="danger"
              size="md"
              stretch="auto"
              label={t("common.actions.delete")}
              onClick={() => void handleConfirmDelete()}
              loading={isDeleting}
            />
          </DialogActions>
        </DialogContent>
      </Dialog>
    </>
  );
});
