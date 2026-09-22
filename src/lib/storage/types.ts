/**
 * Storage abstraction.
 *
 * The 10Pearls IT team has not yet told us where this deploys (R0 in
 * docs/DELIVERY_PLAN.md). Challenge 2 PDFs have to live somewhere, and being told
 * "actually, Azure" a week before the event must not mean rewriting upload code.
 *
 * So every driver implements this interface, and STORAGE_DRIVER selects one.
 * Switching hosts is an environment variable, not a change request.
 */
export interface StorageAdapter {
  /** Stores bytes under an opaque key and returns that key. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;

  /**
   * A short-lived URL for reading the object.
   *
   * `inline` controls Content-Disposition. The judges' "View File" button requires
   * the PDF to render in the browser rather than download, which is what inline does.
   */
  getSignedUrl(key: string, opts?: { expiresInSeconds?: number; inline?: boolean; filename?: string }): Promise<string>;

  /** Reads the object back. Used by the local driver's streaming route. */
  get(key: string): Promise<{ body: Buffer; contentType: string }>;

  delete(key: string): Promise<void>;
}

/**
 * Keys are opaque and unguessable. A participant must never be able to read another
 * participant's submission by incrementing a number in a URL — a room full of QA
 * engineers will absolutely try this.
 */
export function buildObjectKey(prefix: string, attemptId: string, extension: string): string {
  const random = crypto.randomUUID();
  return `${prefix}/${attemptId}/${random}${extension}`;
}
