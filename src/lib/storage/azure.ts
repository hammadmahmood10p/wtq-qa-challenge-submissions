import { env } from "@/lib/env";
import type { StorageAdapter } from "./types";

/**
 * Azure Blob Storage driver.
 *
 * Present because 10Pearls is a Microsoft-heavy shop and Azure is a likely answer to
 * R0. Untested against a real account until IT confirms the target — if Azure is
 * chosen, verify this driver on Day 12 before the load test, not on event day.
 */
export class AzureStorageAdapter implements StorageAdapter {
  private async container() {
    const { BlobServiceClient } = await import("@azure/storage-blob");
    if (!env.AZURE_STORAGE_CONNECTION_STRING) {
      throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
    }
    if (!env.AZURE_STORAGE_CONTAINER) {
      throw new Error("AZURE_STORAGE_CONTAINER is not set");
    }
    const service = BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING);
    return service.getContainerClient(env.AZURE_STORAGE_CONTAINER);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const container = await this.container();
    await container.getBlockBlobClient(key).uploadData(body, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string }> {
    const container = await this.container();
    const client = container.getBlockBlobClient(key);
    const body = await client.downloadToBuffer();
    const props = await client.getProperties();
    return { body, contentType: props.contentType ?? "application/octet-stream" };
  }

  async getSignedUrl(
    key: string,
    opts: { expiresInSeconds?: number; inline?: boolean; filename?: string } = {},
  ): Promise<string> {
    const { BlobSASPermissions } = await import("@azure/storage-blob");
    const container = await this.container();
    const client = container.getBlockBlobClient(key);

    return client.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + (opts.expiresInSeconds ?? 300) * 1000),
      contentDisposition: opts.inline
        ? `inline${opts.filename ? `; filename="${opts.filename}"` : ""}`
        : undefined,
    });
  }

  async delete(key: string): Promise<void> {
    const container = await this.container();
    await container.getBlockBlobClient(key).deleteIfExists();
  }
}
