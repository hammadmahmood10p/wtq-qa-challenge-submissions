import { env } from "@/lib/env";
import { AzureStorageAdapter } from "./azure";
import { LocalStorageAdapter } from "./local";
import { S3StorageAdapter } from "./s3";
import type { StorageAdapter } from "./types";

let instance: StorageAdapter | undefined;

export function storage(): StorageAdapter {
  if (instance) return instance;

  if (env.STORAGE_DRIVER === "local" && env.NODE_ENV === "production") {
    // A multi-instance production deployment on local disk loses uploads silently:
    // whichever instance handles the read may not be the one that handled the write,
    // and a redeploy wipes everything. Better to refuse to start.
    throw new Error(
      "STORAGE_DRIVER=local is not permitted in production. Set it to 's3' or 'azure'.",
    );
  }

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
