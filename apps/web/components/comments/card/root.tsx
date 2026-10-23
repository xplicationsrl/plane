/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { ReplyOutline } from "@makeplane/propel/icons";
import type { EditorRefApi } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import type { TIssueComment, TCommentsOperations } from "@plane/types";
// local imports
import { CommentQuickActions } from "../quick-actions";
import { CommentBlock } from "../comment-block";
import { CommentCreate } from "../comment-create";
import { CommentCardDisplay } from "./display";

type TCommentCard = {
  workspaceSlug: string;
  entityId: string;
  comment: TIssueComment | undefined;
  activityOperations: TCommentsOperations;
  ends: "top" | "bottom" | undefined;
  showAccessSpecifier: boolean;
  showCopyLinkOption: boolean;
  enableReplies: boolean;
  /** Replies in this comment's thread, oldest first. */
  replies?: TIssueComment[];
  disabled?: boolean;
  projectId?: string;
};

type TCommentReply = Pick<
  TCommentCard,
  "workspaceSlug" | "entityId" | "activityOperations" | "showAccessSpecifier" | "showCopyLinkOption" | "projectId"
> & {
  comment: TIssueComment;
  workspaceId: string;
  disabled: boolean;
};

const CommentReply = observer(function CommentReply(props: TCommentReply) {
  const { comment, activityOperations, showAccessSpecifier, showCopyLinkOption, disabled, ...rest } = props;
  const [isEditing, setIsEditing] = useState(false);
  const readOnlyEditorRef = useRef<EditorRefApi>(null);

  return (
    <div className="border-l-2 border-subtle pl-3">
      <CommentCardDisplay
        {...rest}
        activityOperations={activityOperations}
        comment={comment}
        disabled={disabled}
        readOnlyEditorRef={readOnlyEditorRef}
        showAccessSpecifier={showAccessSpecifier}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        renderQuickActions={() => (
          <CommentQuickActions
            activityOperations={activityOperations}
            comment={comment}
            setEditMode={() => setIsEditing(true)}
            showAccessSpecifier={showAccessSpecifier}
            showCopyLinkOption={showCopyLinkOption}
          />
        )}
      />
    </div>
  );
});

export const CommentCard = observer(function CommentCard(props: TCommentCard) {
  const {
    workspaceSlug,
    entityId,
    comment,
    activityOperations,
    ends,
    showAccessSpecifier,
    showCopyLinkOption,
    enableReplies,
    replies = [],
    disabled = false,
    projectId,
  } = props;
  const { t } = useTranslation();
  // states
  const [isEditing, setIsEditing] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(true);
  // refs
  const readOnlyEditorRef = useRef<EditorRefApi>(null);
  // derived values
  const workspaceId = comment?.workspace;

  if (!comment || !workspaceId) return null;

  const canReply = enableReplies && !comment.parent;

  return (
    <CommentBlock comment={comment} ends={ends}>
      <CommentCardDisplay
        activityOperations={activityOperations}
        entityId={entityId}
        comment={comment}
        disabled={disabled}
        projectId={projectId}
        readOnlyEditorRef={readOnlyEditorRef}
        showAccessSpecifier={showAccessSpecifier}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        renderQuickActions={() => (
          <CommentQuickActions
            activityOperations={activityOperations}
            comment={comment}
            setEditMode={() => setIsEditing(true)}
            showAccessSpecifier={showAccessSpecifier}
            showCopyLinkOption={showCopyLinkOption}
          />
        )}
      />
      {canReply && (replies.length > 0 || !disabled) && (
        <div className="mt-2 flex flex-col gap-3">
          <div className="flex items-center gap-3 text-caption-sm-medium text-tertiary">
            {!disabled && (
              <button
                type="button"
                className="flex items-center gap-1 hover:text-primary"
                onClick={() => {
                  setShowReplies(true);
                  setIsReplying(true);
                }}
              >
                <ReplyOutline className="size-3" aria-hidden="true" />
                {t("common.actions.reply")}
              </button>
            )}
            {replies.length > 0 && (
              <button type="button" className="hover:text-primary" onClick={() => setShowReplies((prev) => !prev)}>
                {showReplies
                  ? t("issue.comments.replies.hide")
                  : t("issue.comments.replies.count", { count: replies.length })}
              </button>
            )}
          </div>
          {showReplies &&
            replies.map((reply) => (
              <CommentReply
                key={reply.id}
                comment={reply}
                workspaceId={workspaceId}
                workspaceSlug={workspaceSlug}
                entityId={entityId}
                projectId={projectId}
                activityOperations={activityOperations}
                showAccessSpecifier={showAccessSpecifier}
                showCopyLinkOption={showCopyLinkOption}
                disabled={disabled}
              />
            ))}
          {isReplying && !disabled && (
            <div className="border-l-2 border-subtle pl-3">
              <CommentCreate
                workspaceSlug={workspaceSlug}
                entityId={entityId}
                projectId={projectId}
                activityOperations={activityOperations}
                parentId={comment.id}
                focusOnMount
                onCancel={() => setIsReplying(false)}
                onSubmitCallback={() => setIsReplying(false)}
              />
            </div>
          )}
        </div>
      )}
    </CommentBlock>
  );
});
