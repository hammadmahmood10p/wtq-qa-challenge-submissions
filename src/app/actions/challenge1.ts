"use server";

import { z } from "zod";
import type { Challenge1Slot } from "@/generated/prisma/enums";
import { AttemptClosedError, requireWritableAttempt } from "@/lib/attempt";
import { requireRole } from "@/lib/auth";
import { assertOwnsAttachment, assertOwnsEntry } from "@/lib/challenge1";
import { DESCRIPTION_MAX, MAX_ENTRIES, TITLE_MAX } from "@/lib/challenge1-limits";
import { db } from "@/lib/db";
import {
  MAX_IMAGES_PER_FIELD,
  imageProblemMessage,
  isImageProblem,
  validateImage,
} from "@/lib/image";
import { buildObjectKey, storage } from "@/lib/storage";

export interface EntryResult {
  ok: boolean;
  /** Present when the attempt has closed, so the UI can stop offering to save. */
  closed?: boolean;
  error?: string;
  entry?: { id: string; position: number };
  attachment?: {
    id: string;
    slot: Challenge1Slot;
    originalFilename: string;
    contentType: string;
    sizeBytes: number;
    position: number;
  };
}

const slotSchema = z.enum(["BUG", "TEST"]);

const contentSchema = z.object({
  bugTitle: z.string().max(TITLE_MAX),
  bugDescription: z.string().max(DESCRIPTION_MAX),
  testTitle: z.string().max(TITLE_MAX),
  testDescription: z.string().max(DESCRIPTION_MAX),
});

/**
 * Wraps every Challenge 1 write.
 *
 * The attempt guard belongs here rather than in each action, so no future handler can
 * be added without it. A closed attempt returns a flag instead of throwing: the caller
 * is usually an autosave running in the background, and the participant should be told
 * their time is up rather than shown a crash.
 */
async function withWritableAttempt(
  work: (ctx: { participantId: string; attemptId: string }) => Promise<EntryResult>,
): Promise<EntryResult> {
  const user = await requireRole("PARTICIPANT");

  try {
    const attempt = await requireWritableAttempt(user.id);
    return await work({ participantId: user.id, attemptId: attempt.id });
  } catch (error) {
    if (error instanceof AttemptClosedError) {
      return {
        ok: false,
        closed: true,
        error: "Your challenge has ended. Nothing more can be saved.",
      };
    }
    console.error("[challenge1]", error);
    return { ok: false, error: "Could not save. Please try again." };
  }
}

export async function createEntry(): Promise<EntryResult> {
  return withWritableAttempt(async ({ attemptId }) => {
    const count = await db.challenge1Entry.count({ where: { attemptId } });
    if (count >= MAX_ENTRIES) {
      return {
        ok: false,
        error: `You can add up to ${MAX_ENTRIES} findings. Edit an existing one instead.`,
      };
    }

    const last = await db.challenge1Entry.findFirst({
      where: { attemptId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const entry = await db.challenge1Entry.create({
      data: { attemptId, position: (last?.position ?? -1) + 1 },
      select: { id: true, position: true },
    });

    return { ok: true, entry };
  });
}

/** The autosave target: the whole entry, both halves, on a debounce. */
export async function updateEntry(
  entryId: string,
  content: {
    bugTitle: string;
    bugDescription: string;
    testTitle: string;
    testDescription: string;
  },
): Promise<EntryResult> {
  return withWritableAttempt(async ({ participantId }) => {
    await assertOwnsEntry(entryId, participantId);

    const parsed = contentSchema.safeParse(content);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await db.challenge1Entry.update({ where: { id: entryId }, data: parsed.data });
    return { ok: true };
  });
}

export async function deleteEntry(entryId: string): Promise<EntryResult> {
  return withWritableAttempt(async ({ participantId }) => {
    await assertOwnsEntry(entryId, participantId);

    // Collect the stored objects before the rows go, or they are orphaned with no
    // record of where they were.
    const attachments = await db.challenge1Attachment.findMany({
      where: { entryId },
      select: { fileKey: true },
    });

    await db.challenge1Entry.delete({ where: { id: entryId } });

    await Promise.all(
      attachments.map((a) => storage().delete(a.fileKey).catch(() => {})),
    );

    return { ok: true };
  });
}

/**
 * Moves an entry one place up or down by swapping positions with its neighbour.
 *
 * Buttons rather than drag and drop: this has to work by keyboard, on a trackpad, and
 * in a hurry.
 */
export async function moveEntry(
  entryId: string,
  direction: "up" | "down",
): Promise<EntryResult> {
  return withWritableAttempt(async ({ participantId, attemptId }) => {
    await assertOwnsEntry(entryId, participantId);

    const entry = await db.challenge1Entry.findUniqueOrThrow({
      where: { id: entryId },
      select: { id: true, position: true },
    });

    const neighbour = await db.challenge1Entry.findFirst({
      where: {
        attemptId,
        position: direction === "up" ? { lt: entry.position } : { gt: entry.position },
      },
      orderBy: { position: direction === "up" ? "desc" : "asc" },
      select: { id: true, position: true },
    });

    if (!neighbour) return { ok: true }; // already at the end

    // Both writes or neither: a half-applied swap leaves two entries sharing a
    // position and an order that changes on every read.
    await db.$transaction([
      db.challenge1Entry.update({ where: { id: entry.id }, data: { position: neighbour.position } }),
      db.challenge1Entry.update({ where: { id: neighbour.id }, data: { position: entry.position } }),
    ]);

    return { ok: true };
  });
}

/**
 * Attaches a screenshot to one half of an entry.
 *
 * A bug report without evidence is far harder to act on, and pasting a screenshot is
 * what a tester does by reflex — so this accepts a paste as readily as a file picked
 * from disk. What it will not accept is anything that is not actually an image: the
 * bytes are checked, not the name or the declared type.
 */
export async function addAttachment(
  entryId: string,
  rawSlot: string,
  formData: FormData,
): Promise<EntryResult> {
  return withWritableAttempt(async ({ participantId, attemptId }) => {
    await assertOwnsEntry(entryId, participantId);

    const slot = slotSchema.parse(rawSlot) as Challenge1Slot;

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose an image to attach." };
    }

    const count = await db.challenge1Attachment.count({ where: { entryId, slot } });
    if (count >= MAX_IMAGES_PER_FIELD) {
      return {
        ok: false,
        error: `You can attach up to ${MAX_IMAGES_PER_FIELD} images here.`,
      };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const validated = validateImage(bytes);
    if (isImageProblem(validated)) {
      return { ok: false, error: imageProblemMessage(validated) };
    }

    const key = buildObjectKey(`c1/${slot.toLowerCase()}`, attemptId, validated.extension);
    await storage().put(key, bytes, validated.contentType);

    const last = await db.challenge1Attachment.findFirst({
      where: { entryId, slot },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const attachment = await db.challenge1Attachment.create({
      data: {
        entryId,
        slot,
        fileKey: key,
        originalFilename: file.name.slice(0, 120) || `evidence${validated.extension}`,
        contentType: validated.contentType,
        sizeBytes: bytes.length,
        position: (last?.position ?? -1) + 1,
      },
      select: {
        id: true,
        slot: true,
        originalFilename: true,
        contentType: true,
        sizeBytes: true,
        position: true,
      },
    });

    return { ok: true, attachment };
  });
}

export async function removeAttachment(attachmentId: string): Promise<EntryResult> {
  return withWritableAttempt(async ({ participantId }) => {
    await assertOwnsAttachment(attachmentId, participantId);

    const attachment = await db.challenge1Attachment.delete({
      where: { id: attachmentId },
      select: { fileKey: true },
    });

    await storage().delete(attachment.fileKey).catch(() => {});
    return { ok: true };
  });
}
