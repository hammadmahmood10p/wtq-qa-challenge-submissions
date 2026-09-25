"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { csvProblemMessage, previewCsv, safeCsvFilename, validateCsv } from "@/lib/csv";
import {
  getApplicationUrl,
  getChallenge4Csv,
  normaliseApplicationUrl,
  setApplicationUrl,
  setChallenge4Csv,
} from "@/lib/event-config";
import { storage } from "@/lib/storage";

/**
 * The two pieces of event configuration a super admin can change while the event is
 * running: the application under test, and the Challenge 4 CSV.
 *
 * Every participant-facing page reads these per request, so a save here reaches a
 * participant on their next page load. The `revalidatePath` calls below are for the
 * pages Next may have cached; the values themselves need no restart.
 */

export interface EventConfigState {
  ok?: boolean;
  message?: string;
  /** The first few lines of an uploaded CSV, so the admin can see what landed. */
  preview?: string[];
}

/** Everything a participant might be looking at that mentions either value. */
function refreshParticipantPages() {
  revalidatePath("/admin");
  revalidatePath("/challenge");
  revalidatePath("/challenge/c1");
  revalidatePath("/challenge/c2");
  revalidatePath("/challenge/c4");
  revalidatePath("/challenge/run");
}

export async function adminSetApplicationUrl(input: string): Promise<EventConfigState> {
  const admin = await requireRole("SUPER_ADMIN");

  const trimmed = input.trim();

  if (!trimmed) {
    return { message: "Enter the address participants should open, or use Clear to remove it." };
  }

  const url = normaliseApplicationUrl(trimmed);
  if (!url) {
    return {
      message: "That is not a valid web address. It should look like https://shop.example.com",
    };
  }

  const previous = await getApplicationUrl();
  await setApplicationUrl(url);

  await audit({
    action: "admin.app_url_set",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
    entityType: "setting",
    metadata: { from: previous, to: url },
  });

  refreshParticipantPages();
  return { ok: true, message: `Participants will now be sent to ${url}` };
}

export async function adminClearApplicationUrl(): Promise<EventConfigState> {
  const admin = await requireRole("SUPER_ADMIN");

  const previous = await getApplicationUrl();
  await setApplicationUrl(null);

  await audit({
    action: "admin.app_url_cleared",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
    entityType: "setting",
    metadata: { from: previous },
  });

  refreshParticipantPages();
  return { ok: true, message: "The link has been removed. Participants will see it as pending." };
}

/**
 * Replaces the Challenge 4 CSV.
 *
 * The old file is deleted only after the new one is stored and the setting points at
 * it. Doing it the other way round means a failed upload leaves participants with
 * nothing, which on event day is worse than leaving them with yesterday's file.
 */
export async function adminUploadChallenge4Csv(
  _prev: EventConfigState,
  formData: FormData,
): Promise<EventConfigState> {
  const admin = await requireRole("SUPER_ADMIN");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Choose a CSV file to upload." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  const problem = validateCsv(bytes);
  if (problem) return { message: csvProblemMessage(problem) };

  const filename = safeCsvFilename(file.name);
  const key = `challenge4/${crypto.randomUUID()}.csv`;

  try {
    await storage().put(key, bytes, "text/csv; charset=utf-8");
  } catch (error) {
    console.error("[csv:upload]", error);
    return { message: "Could not store the file. Please try again." };
  }

  const previous = await getChallenge4Csv();

  await setChallenge4Csv({
    key,
    filename,
    sizeBytes: bytes.length,
    uploadedAt: new Date(),
  });

  // Best effort. An orphaned object costs storage; a failed delete must not make the
  // administrator think the upload failed.
  if (previous?.key) {
    try {
      await storage().delete(previous.key);
    } catch {
      /* ignore */
    }
  }

  await audit({
    action: "admin.challenge4_csv_uploaded",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
    entityType: "setting",
    metadata: { filename, sizeBytes: bytes.length, replaced: previous?.filename ?? null },
  });

  refreshParticipantPages();

  return {
    ok: true,
    message: `${filename} is now available to participants.`,
    preview: previewCsv(bytes),
  };
}

export async function adminRemoveChallenge4Csv(): Promise<EventConfigState> {
  const admin = await requireRole("SUPER_ADMIN");

  const existing = await getChallenge4Csv();
  if (!existing) return { ok: true };

  await setChallenge4Csv(null);

  try {
    await storage().delete(existing.key);
  } catch {
    /* ignore — the setting is what participants read */
  }

  await audit({
    action: "admin.challenge4_csv_removed",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
    entityType: "setting",
    metadata: { filename: existing.filename },
  });

  refreshParticipantPages();
  return { ok: true, message: "The CSV has been removed. Participants will see it as pending." };
}
