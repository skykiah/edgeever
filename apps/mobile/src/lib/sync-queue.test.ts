import { beforeEach, expect, mock, test } from "bun:test";
import { ApiRequestError } from "@edgeever/client";
import type { MemoDetail } from "@edgeever/shared";

const storage = new Map<string, string>();

mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    removeItem: async (key: string) => {
      storage.delete(key);
    },
    setItem: async (key: string, value: string) => {
      storage.set(key, value);
    },
  },
}));

const {
  discardMobileMemoConflict,
  getMobileConflictDraftClipboardText,
  listMobileSyncQueueItems,
  queueMobileMemoCreate,
  queueMobileMemoUpdate,
  syncMobileQueuedChanges,
} = await import("./sync-queue");
const { writeMobileMemoDraft, clearMobileMemoDraft } = await import("./mobile-drafts");

const basePayload = {
  memoId: "memo-1",
  expectedRevision: 1,
  expectedContentHash: "hash-1",
  title: "First",
  contentMarkdown: "first",
  notebookId: "notebook-1",
  tags: [],
};

beforeEach(() => {
  storage.clear();
});

test("keeps pending updates isolated by instance", async () => {
  await queueMobileMemoUpdate("https://one.example", basePayload);
  await queueMobileMemoUpdate("https://two.example", { ...basePayload, title: "Second instance" });

  expect((await listMobileSyncQueueItems("https://one.example"))[0]?.payload.title).toBe("First");
  expect((await listMobileSyncQueueItems("https://two.example"))[0]?.payload.title).toBe("Second instance");
});

test("keeps a stale mobile edit as an explicit conflict without overwriting the cloud note", async () => {
  const scope = "https://one.example";
  await queueMobileMemoUpdate(scope, basePayload);
  let updateCalled = false;
  const client = {
    createMemoEditSession: async () => ({
      editSession: { id: "edit-2", baseRevision: 2, baseContentHash: "hash-2" },
    }),
    updateMemo: async () => {
      updateCalled = true;
      throw new ApiRequestError("Unexpected update", 500, "unexpected_update");
    },
  };

  const result = await syncMobileQueuedChanges(client as never, scope);
  const queued = (await listMobileSyncQueueItems(scope))[0];

  expect(result.conflicted).toBe(1);
  expect(updateCalled).toBe(false);
  expect(queued?.status).toBe("conflict");
  expect(queued?.payload.contentMarkdown).toBe("first");
});

test("discardMobileMemoConflict clears the local conflict and returns the cloud memo", async () => {
  const scope = "https://one.example";
  await queueMobileMemoUpdate(scope, basePayload);
  await syncMobileQueuedChanges({
    createMemoEditSession: async () => ({
      editSession: { id: "edit-2", baseRevision: 2, baseContentHash: "hash-2" },
    }),
    updateMemo: async () => {
      throw new Error("should not update");
    },
  } as never, scope);

  const cloud = createMemo({ revision: 3, contentHash: "hash-3", contentMarkdown: "cloud wins", title: "Cloud" });
  const client = {
    getMemo: async () => ({ memo: cloud }),
  };

  const adopted = await discardMobileMemoConflict(client as never, scope, "memo-1");
  expect(adopted).toEqual(cloud);
  expect(await listMobileSyncQueueItems(scope)).toEqual([]);
});

test("getMobileConflictDraftClipboardText prefers the queued update payload", async () => {
  const scope = "https://one.example";
  await queueMobileMemoUpdate(scope, {
    ...basePayload,
    title: "Queued title",
    contentMarkdown: "queued body",
    tags: ["demo"],
  });
  await writeMobileMemoDraft({
    memoId: "memo-1",
    expectedRevision: 1,
    title: "Draft title",
    contentMarkdown: "draft body",
    notebookId: "notebook-1",
    tagsText: "other",
    updatedAt: "2026-07-15T00:00:00.000Z",
  });

  const text = await getMobileConflictDraftClipboardText(scope, "memo-1");
  expect(text).toBe("# Queued title\n#demo\n\nqueued body");
  await clearMobileMemoDraft("memo-1");
});

test("rebases a newer local save when an older save finishes syncing", async () => {
  await queueMobileMemoUpdate("https://one.example", basePayload);

  let markUpdateStarted: (() => void) | undefined;
  const updateStarted = new Promise<void>((resolve) => {
    markUpdateStarted = resolve;
  });
  let resolveUpdate: ((memo: MemoDetail) => void) | undefined;
  const updateResponse = new Promise<MemoDetail>((resolve) => {
    resolveUpdate = resolve;
  });
  const syncedMemo = createMemo({ revision: 2, contentHash: "hash-2", contentMarkdown: "first" });
  const client = {
    createMemoEditSession: async () => ({ editSession: { id: "edit-1", baseRevision: 1, baseContentHash: "hash-1" } }),
    updateMemo: async () => {
      markUpdateStarted?.();
      return updateResponse.then((memo) => ({ memo }));
    },
  };

  const firstSync = syncMobileQueuedChanges(client as never, "https://one.example");
  await updateStarted;
  await queueMobileMemoUpdate("https://one.example", {
    ...basePayload,
    title: "Newest",
    contentMarkdown: "newest",
  });
  resolveUpdate?.(syncedMemo);
  await firstSync;

  const queued = (await listMobileSyncQueueItems("https://one.example"))[0];
  expect(queued?.payload.title).toBe("Newest");
  expect(queued?.payload.expectedRevision).toBe(2);
  expect(queued?.payload.expectedContentHash).toBe("hash-2");
});

test("syncs an offline create and reports its temporary id", async () => {
  await queueMobileMemoCreate("https://one.example", {
    memoId: "local:one",
    title: "Offline",
    contentMarkdown: "offline body",
    notebookId: "notebook-1",
    tags: ["offline"],
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const remoteMemo = createMemo({ id: "memo-remote", title: "Offline", contentMarkdown: "offline body" });
  let syncedTemporaryId = "";

  await syncMobileQueuedChanges({ createMemo: async () => ({ memo: remoteMemo }) } as never, "https://one.example", {
    onSynced: (_memo, item) => {
      syncedTemporaryId = item.memoId;
    },
  });

  expect(syncedTemporaryId).toBe("local:one");
  expect(await listMobileSyncQueueItems("https://one.example")).toHaveLength(0);
});

test("promotes an edit made while an offline create is syncing", async () => {
  const scope = "https://one.example";
  await queueMobileMemoCreate(scope, {
    memoId: "local:one",
    title: "Offline",
    contentMarkdown: "first",
    notebookId: "notebook-1",
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  let markCreateStarted: (() => void) | undefined;
  const createStarted = new Promise<void>((resolve) => {
    markCreateStarted = resolve;
  });
  let resolveCreate: ((memo: MemoDetail) => void) | undefined;
  const createResponse = new Promise<MemoDetail>((resolve) => {
    resolveCreate = resolve;
  });
  const client = {
    createMemo: async () => {
      markCreateStarted?.();
      return createResponse.then((memo) => ({ memo }));
    },
  };
  const sync = syncMobileQueuedChanges(client as never, scope);
  await createStarted;
  await queueMobileMemoUpdate(scope, {
    ...basePayload,
    memoId: "local:one",
    title: "Newest",
    contentMarkdown: "newest",
  });
  resolveCreate?.(createMemo({ id: "memo-remote", revision: 0, contentHash: "hash-remote" }));
  await sync;

  const queued = (await listMobileSyncQueueItems(scope))[0];
  expect(queued?.kind).toBe("memo.update");
  expect(queued?.memoId).toBe("memo-remote");
  expect(queued?.payload.title).toBe("Newest");
  expect(queued?.payload.expectedContentHash).toBe("hash-remote");
});

const createMemo = (overrides: Partial<MemoDetail> = {}): MemoDetail => ({
  id: "memo-1",
  notebookId: "notebook-1",
  title: "First",
  excerpt: "first",
  tags: [],
  isPinned: false,
  isArchived: false,
  isDeleted: false,
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  contentJson: { type: "doc", content: [] },
  contentMarkdown: "first",
  contentText: "first",
  contentHash: "hash-1",
  sourceMemoIds: [],
  mergeSourceCount: 0,
  mergedIntoMemoId: null,
  ...overrides,
});
