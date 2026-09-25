import { env } from "@/lib/env";
import { AzureStorageAdapter } from "./azure";
import { LocalStorageAdapter } from "./local";
import { S3StorageAdapter } from "./s3";
import { storageRefusal } from "./policy";
import type { StorageAdapter } from "./types";

let instance: StorageAdapter | undefined;

export function storage(): StorageAdapter {
  if (instance) return instance;

  const refusal = storageRefusal({
    driver: env.STORAGE_DRIVER,
    nodeEnv: env.NODE_ENV,
    sharedVolume: env.STORAGE_LOCAL_SHARED_VOLUME,
  });

  // Refusing to start beats starting and losing uploads silently.
  if (refusal) throw new Error(refusal);

  switch (env.STORAGE_DRIVER) {
    case "s3":
      instance = new S3StorageAdapter();
      break;
    case "azure":
      instance = new AzureStorageAdapter();
      break;
    default:
      instance = new LocalStorageAdapter();
  }

  return instance;
}

export { buildObjectKey } from "./types";
export type { StorageAdapter } from "./types";
