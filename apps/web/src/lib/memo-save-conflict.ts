import { ApiRequestError } from "@/lib/api";
import type { SyncQueueItem } from "@/lib/local-db";

export type MemoSaveConflictCode =
  | "revision_conflict"
  | "content_conflict"
  | "edit_session_conflict";

export type MemoSaveConflictDetails = {
  expectedRevision?: number;
  currentRevision?: number;
  expectedContentHash?: string;
  currentContentHash?: string;
  source?: string;
};

export type MemoSaveConflictInfo = {
  code: MemoSaveConflictCode | string;
  details?: MemoSaveConflictDetails | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readOptionalNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const readOptionalString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : undefined;

export const parseMemoSaveConflictDetails = (value: unknown): MemoSaveConflictDetails | null => {
  if (!isRecord(value)) {
    return null;
  }

  const details: MemoSaveConflictDetails = {
    expectedRevision: readOptionalNumber(value.expectedRevision),
    currentRevision: readOptionalNumber(value.currentRevision),
    expectedContentHash: readOptionalString(value.expectedContentHash),
    currentContentHash: readOptionalString(value.currentContentHash),
    source: readOptionalString(value.source),
  };

  if (
    details.expectedRevision === undefined &&
    details.currentRevision === undefined &&
    details.expectedContentHash === undefined &&
    details.currentContentHash === undefined &&
    details.source === undefined
  ) {
    return null;
  }

  return details;
};

export const isMemoSaveConflictCode = (code: string | null | undefined): code is MemoSaveConflictCode =>
  code === "revision_conflict" || code === "content_conflict" || code === "edit_session_conflict";

export const isMemoSaveConflictError = (error: unknown): error is ApiRequestError =>
  error instanceof ApiRequestError && isMemoSaveConflictCode(error.code);

export const getMemoSaveConflictInfo = (error: unknown): MemoSaveConflictInfo | null => {
  if (!(error instanceof ApiRequestError) || !isMemoSaveConflictCode(error.code)) {
    return null;
  }

  return {
    code: error.code,
    details: parseMemoSaveConflictDetails(error.details),
  };
};

export const getMemoSaveConflictInfoFromQueueItem = (item: Pick<SyncQueueItem, "status" | "lastError" | "lastErrorCode" | "lastErrorDetails"> | null | undefined): MemoSaveConflictInfo | null => {
  if (!item || item.status !== "conflict") {
    return null;
  }

  const code = item.lastErrorCode && isMemoSaveConflictCode(item.lastErrorCode)
    ? item.lastErrorCode
    : "revision_conflict";

  return {
    code,
    details: parseMemoSaveConflictDetails(item.lastErrorDetails) ?? null,
  };
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

export const formatMemoSaveConflictReason = (t: Translate, info: MemoSaveConflictInfo | null | undefined) => {
  if (!info) {
    return t("editor.saveState.conflictReason.generic");
  }

  if (info.code === "content_conflict") {
    return t("editor.saveState.conflictReason.content");
  }

  if (info.code === "edit_session_conflict") {
    return t("editor.saveState.conflictReason.editSession");
  }

  const expected = info.details?.expectedRevision;
  const current = info.details?.currentRevision;
  if (typeof expected === "number" && typeof current === "number" && expected !== current) {
    return t("editor.saveState.conflictReason.revisionWithVersions", {
      expected,
      current,
    });
  }

  if (info.details?.source === "offline_sync") {
    return t("editor.saveState.conflictReason.offlineStale");
  }

  return t("editor.saveState.conflictReason.revision");
};

export { formatLocalDraftClipboardText } from "@edgeever/shared";
