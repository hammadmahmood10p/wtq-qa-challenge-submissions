"use server";

import { z } from "zod";
import type { Challenge1ItemKind } from "@/generated/prisma/enums";
import { AttemptClosedError, requireWritableAttempt } from "@/lib/attempt";
import { requireRole } from "@/lib/auth";
import {
  DESCRIPTION_MAX,
  MAX_ITEMS_PER_KIND,
  TITLE_MAX,
  assertOwnsItem,
} from "@/lib/challenge1";
import { db } from "@/lib/db";

export interface ItemResult {
  ok: boolean;
  /** Present when the attempt has closed, so the UI can stop offering to save. */
  closed?: boolean;
  error?: string;
  item?: { id: string; title: string; description: string; position: number };
}

const kindSchema = z.enum(["BUG_REPORT", "TEST_CASE"]);

const contentSchema = z.object({
  title: z.string().max(TITLE_MAX, `Title must be ${TITLE_MAX} characters or fewer`),
  description: z
    .string()
    .max(DESCRIPTION_MAX, `Description must be ${DESCRIPTION_MAX} characters or fewer`),
});

/**
 * Wraps every Challenge 1 write.
 *
 * The attempt guard belongs here rather than in each action so no future handler can
 * be added without it. A closed attempt returns a flag instead of throwing, because
 * the caller is an autosave running in the background — the participant should be
 * told their time is up, not shown a crash.
 */
async function withWritableAttempt<T extends ItemResult>(
  work: (ctx: { participantId: string; attemptId: string }) => Promise<T>,
): Promise<T | ItemResult> {
  const user = await requireRole("PARTICIPANT");

  try {
    const attempt = await requireWritableAttempt(user.id);
    return await work({ participantId: user.id, attemptId: attempt.id });
  } catch (error) {
    if (error instanceof AttemptClosedError) {
      return { ok: false, closed: true, error: "Your challenge has ended. Nothing more can be saved." };
    }
    console.error("[challenge1]", error);
    return { ok: false, error: "Could not save. Please try again." };
  }
}

export async function createChallenge1Item(rawKind: string): Promise<ItemResult> {
  return withWritableAttempt(async ({ attemptId }) => {
    const kind = kindSchema.parse(rawKind) as Challenge1ItemKind;

    const count = await db.challenge1Item.count({ where: { attemptId, kind } });
    if (count >= MAX_ITEMS_PER_KIND) {
      return {
        ok: false,
        error: `You can add up to ${MAX_ITEMS_PER_KIND} of these. Edit an existing one instead.`,
      };
    }

    const last = await db.challenge1Item.findFirst({
      where: { attemptId, kind },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const item = await db.challenge1Item.create({
      data: {
        attemptId,
        kind,
        title: "",
        description: "",
        position: (last?.position ?? -1) + 1,
      },
      select: { id: true, title: true, description: true, position: true },
    });

    return { ok: true, item };
  });
}

/**
 * The autosave target. Called on a debounce as the participant types, and again when
 * they press the explicit save button.
 */
export async function updateChallenge1Item(
  itemId: string,
  title: string,
  description: string,
): Promise<ItemResult> {
  return withWritableAttempt(async ({ participantId }) => {
    await assertOwnsItem(itemId, participantId);

    const parsed = contentSchema.safeParse({ title, description });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await db.challenge1Item.update({
      where: { id: itemId },
      data: { title: parsed.data.title, description: parsed.data.description },
    });

    return { ok: true };
  });
}

export async function deleteChallenge1Item(itemId: string): Promise<ItemResult> {
  return withWritableAttempt(async ({ participantId }) => {
    await assertOwnsItem(itemId, participantId);
    await db.challenge1Item.delete({ where: { id: itemId } });
    return { ok: true };
  });
}

/**
 * Moves an item one place up or down by swapping positions with its neighbour.
 *
 * Buttons rather than drag and drop: this has to work by keyboard, on a trackpad, in
 * a hurry, and it is one of the few places where a fiddly interaction would cost a
 * participant real time.
 */
export async function moveChallenge1Item(
  itemId: string,
  direction: "up" | "down",
): Promise<ItemResult> {
  return withWritableAttempt(async ({ participantId, attemptId }) => {
    await assertOwnsItem(itemId, participantId);

    const item = await db.challenge1Item.findUniqueOrThrow({
      where: { id: itemId },
      select: { id: true, kind: true, position: true },
    });

    const neighbour = await db.challenge1Item.findFirst({
      where: {
        attemptId,
        kind: item.kind,
        position: direction === "up" ? { lt: item.position } : { gt: item.position },
      },
      orderBy: { position: direction === "up" ? "desc" : "asc" },
      select: { id: true, position: true },
    });

    // Already at the end of its section.
    if (!neighbour) return { ok: true };

    // Both writes or neither: a half-applied swap would leave two items sharing a
    // position and an order that changes on every read.
    await db.$transaction([
      db.challenge1Item.update({ where: { id: item.id }, data: { position: neighbour.position } }),
      db.challenge1Item.update({ where: { id: neighbour.id }, data: { position: item.position } }),
    ]);

    return { ok: true };
  });
}
