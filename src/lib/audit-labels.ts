import type { AuditAction } from "@/lib/audit";

/**
 * Turning audit rows into something a person can read.
 *
 * The log is written for machines — `admin.attempt_reopened`, `evaluation.unassigned` —
 * because stable identifiers are what make it queryable years later. The console reads
 * it to answer a different question, usually under pressure: *who did that, and when?*
 * So every action gets a sentence, a category to filter by, and a tone, and the three
 * live here rather than in the page, so they can be tested and so an action added
 * without a label fails visibly instead of rendering a bare code.
 *
 * Pure on purpose: no database, no server-only imports.
 */

export type AuditCategory =
  "Authentication" | "Accounts" | "Attempts" | "Judging" | "Event settings" | "Security";

/** Drives the colour of the row's badge. Severity to a reader, not to the system. */
export type AuditTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface AuditDescriptor {
  label: string;
  category: AuditCategory;
  tone: AuditTone;
}

const DESCRIPTORS: Record<AuditAction, AuditDescriptor> = {
  // --- Authentication -------------------------------------------------------
  "auth.login": { label: "Signed in", category: "Authentication", tone: "neutral" },
  "auth.logout": { label: "Signed out", category: "Authentication", tone: "neutral" },
  "auth.login_failed": {
    label: "Failed sign-in",
    category: "Authentication",
    tone: "warning",
  },
  "auth.password_changed": {
    label: "Changed their password",
    category: "Authentication",
    tone: "info",
  },
  // Its own action rather than a flag, so it cannot be missed in a filtered view.
  "auth.login_master_password": {
    label: "Signed in using the master password",
    category: "Security",
    tone: "danger",
  },

  // --- Accounts -------------------------------------------------------------
  "participant.signup": {
    label: "Registered as a participant",
    category: "Accounts",
    tone: "neutral",
  },
  "judge.signup": { label: "Registered as a judge", category: "Accounts", tone: "neutral" },
  "admin.participant_created": {
    label: "Created a participant",
    category: "Accounts",
    tone: "info",
  },
  "admin.super_admin_created": {
    label: "Created another super admin",
    category: "Security",
    tone: "danger",
  },
  "admin.participant_blocked": {
    label: "Blocked an account",
    category: "Accounts",
    tone: "warning",
  },
  "admin.participant_unblocked": {
    label: "Unblocked an account",
    category: "Accounts",
    tone: "success",
  },
  "admin.participant_removed": {
    label: "Removed an account",
    category: "Accounts",
    tone: "warning",
  },
  "admin.password_reset": {
    label: "Issued a temporary password",
    category: "Accounts",
    tone: "warning",
  },
  "admin.judge_approved": { label: "Approved a judge", category: "Accounts", tone: "success" },
  "admin.judge_rejected": { label: "Rejected a judge", category: "Accounts", tone: "warning" },
  "admin.participants_imported": {
    label: "Bulk-created participants",
    category: "Accounts",
    tone: "info",
  },
  "admin.judges_imported": { label: "Bulk-created judges", category: "Accounts", tone: "info" },
  "admin.participants_bulk_deleted": {
    label: "Permanently deleted participants",
    category: "Accounts",
    tone: "danger",
  },
  "admin.judges_bulk_deleted": {
    label: "Permanently deleted judges",
    category: "Accounts",
    tone: "danger",
  },

  // --- Attempts -------------------------------------------------------------
  "attempt.started": { label: "Started their attempt", category: "Attempts", tone: "neutral" },
  "attempt.track_chosen": { label: "Chose their track", category: "Attempts", tone: "neutral" },
  "challenge1.locked": { label: "Locked Challenge 1", category: "Attempts", tone: "info" },
  "challenge1.unlocked": {
    label: "Reopened Challenge 1 for a participant",
    category: "Attempts",
    tone: "warning",
  },
  "attempt.submitted": { label: "Submitted their work", category: "Attempts", tone: "success" },
  "attempt.auto_submitted": {
    label: "Submitted automatically when time ran out",
    category: "Attempts",
    tone: "info",
  },
  "admin.attempt_reopened": {
    label: "Reopened a sealed attempt",
    category: "Attempts",
    tone: "warning",
  },
  "admin.attempt_reset": {
    label: "Cleared an attempt for a fresh run",
    category: "Attempts",
    tone: "danger",
  },

  // --- Judging --------------------------------------------------------------
  "evaluation.assigned": {
    label: "Took a submission for review",
    category: "Judging",
    tone: "neutral",
  },
  "evaluation.unassigned": {
    label: "Unassigned a submission",
    category: "Judging",
    tone: "warning",
  },
  "evaluation.reopened": {
    label: "Reopened a finalised score for re-evaluation",
    category: "Judging",
    tone: "warning",
  },
  "evaluation.score_saved": { label: "Saved scores", category: "Judging", tone: "neutral" },
  "evaluation.submitted": { label: "Finalised a score", category: "Judging", tone: "success" },
  "evaluation.unlocked": {
    label: "Unlocked a finalised score",
    category: "Judging",
    tone: "warning",
  },
  "evaluation.bonus_adjusted": { label: "Adjusted the bonus", category: "Judging", tone: "info" },

  // --- Event settings -------------------------------------------------------
  "admin.participant_logins_disabled": {
    label: "Closed participant logins",
    category: "Event settings",
    tone: "warning",
  },
  "admin.participant_logins_enabled": {
    label: "Opened participant logins",
    category: "Event settings",
    tone: "success",
  },
  "admin.participants_signed_out": {
    label: "Signed every participant out",
    category: "Event settings",
    tone: "danger",
  },
  "admin.app_url_set": {
    label: "Set the application URL",
    category: "Event settings",
    tone: "info",
  },
  "admin.app_url_cleared": {
    label: "Cleared the application URL",
    category: "Event settings",
    tone: "warning",
  },
  "admin.challenge4_csv_uploaded": {
    label: "Uploaded the Challenge 4 CSV",
    category: "Event settings",
    tone: "info",
  },
  "admin.challenge4_csv_removed": {
    label: "Removed the Challenge 4 CSV",
    category: "Event settings",
    tone: "warning",
  },
  "admin.known_bugs_uploaded": {
    label: "Uploaded the known bugs document",
    category: "Event settings",
    tone: "info",
  },
  "admin.known_bugs_removed": {
    label: "Removed the known bugs document",
    category: "Event settings",
    tone: "warning",
  },

  // --- Security -------------------------------------------------------------
  "admin.master_password_set": {
    label: "Set the master password",
    category: "Security",
    tone: "warning",
  },
  "admin.master_password_cleared": {
    label: "Deleted the master password",
    category: "Security",
    tone: "success",
  },
  "admin.master_password_enabled": {
    label: "Switched the master password ON",
    category: "Security",
    tone: "danger",
  },
  "admin.master_password_disabled": {
    label: "Switched the master password off",
    category: "Security",
    tone: "success",
  },
};

export const AUDIT_CATEGORIES: AuditCategory[] = [
  "Authentication",
  "Accounts",
  "Attempts",
  "Judging",
  "Event settings",
  "Security",
];

/**
 * An unknown action still renders.
 *
 * The log is append-only and outlives the code that wrote it: a row from a release
 * where some action has since been renamed must still be readable, and a new action
 * someone forgot to label here must not blank the page mid-event.
 */
export function describeAction(action: string): AuditDescriptor {
  return (
    DESCRIPTORS[action as AuditAction] ?? {
      label: action,
      category: "Accounts",
      tone: "neutral",
    }
  );
}

/** Every action belonging to a category, for the filter. */
export function actionsInCategory(category: AuditCategory): string[] {
  return Object.entries(DESCRIPTORS)
    .filter(([, d]) => d.category === category)
    .map(([action]) => action);
}

const REASONS: Record<string, string> = {
  bad_password: "wrong password",
  participant_logins_disabled: "participant logins were closed",
  status_blocked: "account is blocked",
  status_removed: "account was removed",
  status_submitted_locked: "already submitted",
  status_pending_approval: "not yet approved",
};

/**
 * The metadata, as a short phrase rather than as JSON.
 *
 * Known keys are spelled out; anything unrecognised still appears, because a row whose
 * detail is hidden because nobody taught this function about it is worse than one that
 * reads a little awkwardly.
 */
export function describeMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;

  const record = metadata as Record<string, unknown>;
  const entries = Object.entries(record);
  if (entries.length === 0) return null;

  const parts: string[] = [];

  // `from` and `to` describe one change between them, so they are emitted together.
  // Handled before the loop because "from 3 · to 5" reads as two facts rather than as
  // the single movement it is.
  const hasFrom = "from" in record;
  const hasTo = "to" in record;

  if (hasFrom && hasTo) {
    parts.push(`from ${describeValue(record.from)} to ${describeValue(record.to)}`);
  }

  for (const [key, value] of entries) {
    if (value === null && key !== "from" && key !== "to") continue;
    if (value === undefined || value === "") continue;

    // Checked before anything generic below, or the boolean rule would render these
    // as "auto" and "via master password" — which the action's own sentence already
    // says, more clearly.
    if (ALREADY_IN_THE_LABEL.has(key)) continue;

    // Identifiers are for querying the log, not for reading it. A row saying
    // "participant id 95cb746d-8d86-43ee-a919-0088fa19ce3e" tells a reader nothing
    // the To-whom column does not already say by name, and crowds out the detail that
    // does matter. Dropped whether they are spotted by key or by shape.
    if (/(^|[a-z])Id$/.test(key) || isUuid(value)) continue;

    // A flag that is false is the absence of a thing, and absences do not need
    // stating: "cleared scores no" is noise where saying nothing is accurate.
    if (value === false) continue;
    if (value === true) {
      parts.push(humanKey(key));
      continue;
    }

    switch (key) {
      case "reason":
        // Through describeValue so it is length-capped: rejection reasons are stored
        // up to 500 characters, and one of those unwrapped destroys the table layout.
        parts.push(REASONS[String(value)] ?? describeValue(value));
        break;
      case "durationMinutes":
      case "minutes":
        parts.push(`${value} minutes`);
        break;
      case "deleted":
        parts.push(`${value} deleted`);
        break;
      case "filesRemoved":
        parts.push(`${value} files removed`);
        break;
      case "sessionsRevoked":
        parts.push(`${value} sessions ended`);
        break;
      case "created":
        parts.push(`${value} created`);
        break;
      case "failed":
      case "skipped":
        parts.push(`${value} skipped`);
        break;
      case "total":
        parts.push(`total ${value}`);
        break;
      case "from":
        if (!hasTo) parts.push(`from ${describeValue(value)}`);
        break;
      case "to":
        if (!hasFrom) parts.push(`to ${describeValue(value)}`);
        break;
      case "self":
        if (value === true) parts.push("for themselves");
        break;
      case "filter":
        parts.push(`filter ${describeValue(value)}`);
        break;
      default:
        parts.push(`${humanKey(key)} ${describeValue(value)}`);
    }
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Keys whose content the action's own sentence already states. */
const ALREADY_IN_THE_LABEL = new Set(["auto", "viaMasterPassword", "endsAt"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID.test(value);
}

function humanKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

function describeValue(value: unknown): string {
  if (value === null) return "none";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== "ALL" && v !== undefined)
      .map(([k, v]) => `${humanKey(k)}=${v}`);
    return parts.length > 0 ? parts.join(", ") : "none";
  }
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}
