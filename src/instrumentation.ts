/**
 * Runs once, before the server accepts its first request.
 *
 * This exists because of a gap found while testing the container configuration. The
 * storage driver is resolved lazily, on the first file operation — so a production
 * deployment with an unusable storage configuration started perfectly, served pages
 * perfectly, and failed at the first upload. On event day that is a participant
 * discovering it, forty minutes in, with a report they cannot hand over.
 *
 * Configuration mistakes should fail the deploy, not the event. `src/lib/env.ts`
 * already validates the shape of every variable at import; this checks the one rule
 * that depends on how the variables combine.
 */
export async function register() {
  // Guarded because this file also runs in the edge runtime, where the storage
  // adapters (and the Node APIs they use) do not exist.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { storageRefusal } = await import("@/lib/storage/policy");
  const { env } = await import("@/lib/env");

  const refusal = storageRefusal({
    driver: env.STORAGE_DRIVER,
    nodeEnv: env.NODE_ENV,
    sharedVolume: env.STORAGE_LOCAL_SHARED_VOLUME,
  });

  if (refusal) {
    // Thrown rather than logged: a container that exits is one an orchestrator will
    // report and refuse to roll out, which is the outcome we want.
    throw new Error(`Invalid storage configuration:\n  ${refusal}`);
  }
}
