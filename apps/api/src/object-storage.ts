import type { ObjectStorageSettings } from "@edgeever/shared";
import { AppError } from "./app-error";
import { decryptSecret } from "./secret-encryption";
import type { BlobStoreAdapter, DatabaseAdapter } from "./storage-contract";
import { createWorkerS3BlobStore, type WorkerS3Config } from "./worker-s3-blob-store";

export const BUILTIN_STORAGE_CONFIG_ID = "builtin";
export const S3_STORAGE_CONFIG_ID = "instance-s3";

export const resolveObjectStorageEncryptionKey = (value: string | undefined) => {
  const key = value?.trim();
  return key && key.length >= 32 ? key : undefined;
};

export type ObjectStorageConfigRow = {
  id: string;
  provider: "builtin" | "s3";
  display_name: string;
  endpoint: string | null;
  region: string | null;
  bucket: string | null;
  access_key_id: string | null;
  secret_access_key_encrypted: string | null;
  force_path_style: number;
  object_prefix: string;
  is_active: number;
};

type ObjectStorageEnvironment = {
  storage: { db: DatabaseAdapter; resources: BlobStoreAdapter };
  EDGE_EVER_STORAGE_ENCRYPTION_KEY?: string;
  EDGE_EVER_R2_BUCKET_NAME?: string;
};

const selectConfigSql = `SELECT id, provider, display_name, endpoint, region, bucket, access_key_id,
  secret_access_key_encrypted, force_path_style, object_prefix, is_active FROM object_storage_configs`;

export const getActiveObjectStorageConfig = (db: DatabaseAdapter) =>
  db.prepare(`${selectConfigSql} WHERE is_active = 1 LIMIT 1`).first<ObjectStorageConfigRow>();

export const getObjectStorageConfig = (db: DatabaseAdapter, id: string) =>
  db.prepare(`${selectConfigSql} WHERE id = ?`).bind(id).first<ObjectStorageConfigRow>();

export const mapObjectStorageSettings = (
  row: ObjectStorageConfigRow,
  encryptionConfigured: boolean,
): ObjectStorageSettings => ({
  provider: row.provider,
  displayName: row.display_name,
  endpoint: row.endpoint,
  region: row.region,
  bucket: row.bucket,
  accessKeyId: row.access_key_id,
  hasSecretAccessKey: Boolean(row.secret_access_key_encrypted),
  forcePathStyle: Boolean(row.force_path_style),
  objectPrefix: row.object_prefix,
  encryptionConfigured,
});

const toWorkerS3Config = async (
  row: ObjectStorageConfigRow,
  encryptionKey: string | undefined,
): Promise<WorkerS3Config> => {
  if (!encryptionKey || !row.secret_access_key_encrypted) {
    throw new AppError(
      "object_storage_unavailable",
      "The external object storage credential cannot be decrypted. Configure EDGE_EVER_STORAGE_ENCRYPTION_KEY.",
      503,
    );
  }
  if (!row.endpoint || !row.region || !row.bucket || !row.access_key_id) {
    throw new AppError("object_storage_unavailable", "The external object storage configuration is incomplete.", 503);
  }

  return {
    endpoint: row.endpoint,
    region: row.region,
    bucket: row.bucket,
    accessKeyId: row.access_key_id,
    secretAccessKey: await decryptSecret(row.secret_access_key_encrypted, encryptionKey),
    forcePathStyle: Boolean(row.force_path_style),
    objectPrefix: row.object_prefix,
  };
};

export const resolveObjectStorage = async (env: ObjectStorageEnvironment, configId?: string | null) => {
  const row = configId
    ? await getObjectStorageConfig(env.storage.db, configId)
    : await getActiveObjectStorageConfig(env.storage.db);

  if (!row && configId) {
    throw new AppError("object_storage_unavailable", "The resource's object storage configuration no longer exists.", 503);
  }

  if (!row || row.provider === "builtin") {
    return {
      configId: BUILTIN_STORAGE_CONFIG_ID,
      bucketName: env.EDGE_EVER_R2_BUCKET_NAME?.trim() || "edgeever-resources",
      store: env.storage.resources,
    };
  }

  return {
    configId: row.id,
    bucketName: row.bucket ?? "external-object-storage",
    store: createWorkerS3BlobStore(await toWorkerS3Config(row, resolveObjectStorageEncryptionKey(env.EDGE_EVER_STORAGE_ENCRYPTION_KEY))),
  };
};

export const deleteStoredObjects = async (
  env: ObjectStorageEnvironment,
  resources: Array<{ storage_config_id?: string | null; object_key: string }>,
) => {
  const groups = new Map<string, string[]>();
  for (const resource of resources) {
    const id = resource.storage_config_id || BUILTIN_STORAGE_CONFIG_ID;
    groups.set(id, [...(groups.get(id) ?? []), resource.object_key]);
  }

  for (const [configId, objectKeys] of groups) {
    const { store } = await resolveObjectStorage(env, configId);
    await store.delete(objectKeys);
  }
};
