import { describe, expect, test } from "bun:test";
import {
  isActiveLocalMemoUpdateStatus,
  shouldAcceptRemoteMemoDetail,
} from "./memo-detail-freshness.ts";

describe("memo detail freshness", () => {
  test("treats pending/syncing/error queue statuses as active local updates", () => {
    expect(isActiveLocalMemoUpdateStatus("pending")).toBe(true);
    expect(isActiveLocalMemoUpdateStatus("syncing")).toBe(true);
    expect(isActiveLocalMemoUpdateStatus("error")).toBe(true);
    expect(isActiveLocalMemoUpdateStatus("conflict")).toBe(false);
    expect(isActiveLocalMemoUpdateStatus("idle")).toBe(false);
    expect(isActiveLocalMemoUpdateStatus(undefined)).toBe(false);
  });

  test("accepts remote when there is no local snapshot", () => {
    expect(
      shouldAcceptRemoteMemoDetail(null, {
        revision: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  test("rejects remote while a local memo.update is still queued", () => {
    expect(
      shouldAcceptRemoteMemoDetail(
        { revision: 3, updatedAt: "2026-01-02T00:00:00.000Z" },
        { revision: 4, updatedAt: "2026-01-03T00:00:00.000Z" },
        { hasPendingLocalUpdate: true },
      ),
    ).toBe(false);
  });

  test("accepts a strictly higher remote revision without pending local updates", () => {
    expect(
      shouldAcceptRemoteMemoDetail(
        { revision: 3, updatedAt: "2026-01-02T00:00:00.000Z" },
        { revision: 4, updatedAt: "2026-01-01T00:00:00.000Z" },
      ),
    ).toBe(true);
  });

  test("rejects a lower remote revision", () => {
    expect(
      shouldAcceptRemoteMemoDetail(
        { revision: 5, updatedAt: "2026-01-02T00:00:00.000Z" },
        { revision: 4, updatedAt: "2026-01-03T00:00:00.000Z" },
      ),
    ).toBe(false);
  });

  test("at the same revision prefers the newer updatedAt (local autosave case)", () => {
    const local = { revision: 2, updatedAt: "2026-01-02T12:00:01.000Z" };
    const staleRemote = { revision: 2, updatedAt: "2026-01-02T12:00:00.000Z" };
    const fresherRemote = { revision: 2, updatedAt: "2026-01-02T12:00:02.000Z" };

    expect(shouldAcceptRemoteMemoDetail(local, staleRemote)).toBe(false);
    expect(shouldAcceptRemoteMemoDetail(local, fresherRemote)).toBe(true);
  });

  test("accepts remote when revision and updatedAt match", () => {
    const snapshot = { revision: 2, updatedAt: "2026-01-02T12:00:00.000Z" };
    expect(shouldAcceptRemoteMemoDetail(snapshot, snapshot)).toBe(true);
  });
});
