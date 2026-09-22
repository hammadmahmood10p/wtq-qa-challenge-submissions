import { env } from "@/lib/env";
import type { StorageAdapter } from "./types";

/**
 * S3 driver — AWS S3, MinIO, or any S3-compatible endpoint.
 *
 * The SDK is imported dynamically so that deployments using a different driver never
 * load it, and so an unconfigured S3 setup fails at first use with a clear message
 * rather than at module load with a stack trace.
 */
export class S3StorageAdapter implements StorageAdapter {
  private async client() {
    const { S3Client } = await import("@aws-sdk/client-s3");
    if (!env.S3_BUCKET) throw new Error("S3_BUCKET is not set");
    return new S3Client({
      region: env.S3_REGION ?? "us-east-1",
      endpoint: env.S3_ENDPOINT,
      // Required by MinIO and most S3-compatible services.
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined, // fall back to the instance role
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(
      new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string }> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const res = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return { body: Buffer.from(bytes), contentType: res.ContentType ?? "application/octet-stream" };
  }

  async getSignedUrl(
    key: string,
    opts: { expiresInSeconds?: number; inline?: boolean; filename?: string } = {},
  ): Promise<string> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await this.client();

    const disposition = opts.inline
      ? `inline${opts.filename ? `; filename="${opts.filename}"` : ""}`
      : undefined;

    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        ResponseContentDisposition: disposition,
      }),
      { expiresIn: opts.expiresInSeconds ?? 300 },
    );
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  }
}
