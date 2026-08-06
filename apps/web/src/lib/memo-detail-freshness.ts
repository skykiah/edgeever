import type { MemoDetail } from "@edgeever/shared";
import type { SyncQueueStatus } from "@/lib/local-db";

export type MemoDetailFreshnessFields = Pick<MemoDetail, "revision" | "updatedAt">;

/** Queue statuses that mean local edits must not be overwritten by a stale remote detail. */
const ACTIVE_LOCAL_UPDATE_STATUSES = new Set<SyncQueueStatus>(["pending", "syncing", "error"]);

export const isActiveLocalMemoUpdateStatus = (status: string | null | undefined): boolean =>
  Boolean(status && ACTIVE_LOCAL_UPDATE_STATUSES.has(status as SyncQueueStatus));

/**
 * Decide whether a remote memo detail should replace the local/editor snapshot.
 *
 * Local autosave updates content and `updatedAt` without bumping `revision` until
 * the server accepts the change. While a memo.update is still queued, or while the
 * local row is newer at the same revision, the remote snapshot is treated as stale.
 */
export const shouldAcceptRemoteMemoDetail = (
  local: MemoDetailFreshnessFields | null | undefined,
  remote: MemoDetailFreshnessFields,
  options: { hasPendingLocalUpdate?: boolean } = {},
): boolean => {
  if (!local) return true;
  if (options.hasPendingLocalUpdate) return false;

  if (remote.revision > local.revision) return true;
  if (remote.revision < local.revision) return false;

  const localUpdatedAt = Date.parse(local.updatedAt);
  const remoteUpdatedAt = Date.parse(remote.updatedAt);
  if (Number.isFinite(localUpdatedAt) && Number.isFinite(remoteUpdatedAt)) {
    if (remoteUpdatedAt > localUpdatedAt) return true;
    if (remoteUpdatedAt < localUpdatedAt) return false;
  }

  // Same revision and equal/unknown timestamps: allow remote (e.g. external metadata).
  return true;
};
