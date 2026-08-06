import { describe, expect, test } from "bun:test";
import { ApiRequestError } from "./api.ts";
import {
  formatMemoSaveConflictReason,
  getMemoSaveConflictInfo,
  getMemoSaveConflictInfoFromQueueItem,
  parseMemoSaveConflictDetails,
} from "./memo-save-conflict.ts";

const t = (key, options = {}) => {
  if (key === "editor.saveState.conflictReason.revisionWithVersions") {
    return `rev ${options.expected} -> ${options.current}`;
  }
  if (key === "editor.saveState.conflictReason.revision") return "revision";
  if (key === "editor.saveState.conflictReason.content") return "content";
  if (key === "editor.saveState.conflictReason.editSession") return "edit-session";
  if (key === "editor.saveState.conflictReason.offlineStale") return "offline-stale";
  if (key === "editor.saveState.conflictReason.generic") return "generic";
  return key;
};

describe("memo save conflict helpers", () => {
  test("parses revision details from API errors", () => {
    const error = new ApiRequestError("conflict", 409, "revision_conflict", {
      expectedRevision: 3,
      currentRevision: 5,
    });

    expect(getMemoSaveConflictInfo(error)).toEqual({
      code: "revision_conflict",
      details: {
        expectedRevision: 3,
        currentRevision: 5,
        expectedContentHash: undefined,
        currentContentHash: undefined,
        source: undefined,
      },
    });
    expect(formatMemoSaveConflictReason(t, getMemoSaveConflictInfo(error))).toBe("rev 3 -> 5");
  });

  test("maps content and edit-session conflict codes", () => {
    expect(formatMemoSaveConflictReason(t, { code: "content_conflict" })).toBe("content");
    expect(formatMemoSaveConflictReason(t, { code: "edit_session_conflict" })).toBe("edit-session");
  });

  test("maps offline sync conflicts from queue items", () => {
    const info = getMemoSaveConflictInfoFromQueueItem({
      status: "conflict",
      lastError: "stale",
      lastErrorCode: "revision_conflict",
      lastErrorDetails: {
        expectedRevision: 2,
        currentRevision: 2,
        source: "offline_sync",
      },
    });

    expect(info?.code).toBe("revision_conflict");
    expect(formatMemoSaveConflictReason(t, info)).toBe("offline-stale");
  });

  test("ignores non-conflict queue items and empty details", () => {
    expect(getMemoSaveConflictInfoFromQueueItem({ status: "pending", lastError: null })).toBeNull();
    expect(parseMemoSaveConflictDetails({ foo: "bar" })).toBeNull();
    expect(formatMemoSaveConflictReason(t, null)).toBe("generic");
  });
});
