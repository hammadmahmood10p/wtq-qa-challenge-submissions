/**
 * Which storage drivers are permitted, and why.
 *
 * Separated from the factory so the rule can be read and tested on its own — it is a
 * decision about deployment topology, not about how bytes are written.
 *
 * The original rule was simply "never local in production". That was right for a
 * managed platform, where instances land on different machines with different disks.
 * It is wrong for the deployment the organisers chose: one VM, where every instance
 * mounts the same directory and local disk is the simplest correct answer.
 *
 * So the rule is now about the precondition rather than about the environment. Local
 * storage is permitted in production when, and only when, whoever deployed it has
 * asserted that the directory is shared. If it is not, an upload written by one
 * instance is invisible to the next and a redeploy takes the lot — which is a silent
 * failure, discovered by a judge opening a submission that is not there.
 */

export interface StoragePolicyInput {
  driver: "local" | "s3" | "azure";
  nodeEnv: "development" | "test" | "production";
  /** STORAGE_LOCAL_SHARED_VOLUME — an assertion about the deployment, not a feature. */
  sharedVolume: boolean;
}

/** Returns the reason the configuration is refused, or null when it is acceptable. */
export function storageRefusal({
  driver,
  nodeEnv,
  sharedVolume,
}: StoragePolicyInput): string | null {
  if (driver !== "local") return null;
  if (nodeEnv !== "production") return null;
  if (sharedVolume) return null;

  return (
    "STORAGE_DRIVER=local needs STORAGE_LOCAL_SHARED_VOLUME=true in production, " +
    "which asserts that every instance mounts the same directory — true on a single " +
    "VM with a bind mount, false across separate machines. If instances do not share " +
    "a disk, use STORAGE_DRIVER=s3 or azure instead: uploads would otherwise be " +
    "written by one instance and invisible to the next."
  );
}
