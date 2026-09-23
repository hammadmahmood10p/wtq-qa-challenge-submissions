import { z } from "zod";

/**
 * Query parameters for the submissions table.
 *
 * Everything falls back to a default rather than erroring: these values come from the
 * URL, and a hand-edited or stale link must not be able to break the screen a judge is
 * working in.
 */
export const submissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  q: z.string().trim().max(120).optional(),
  review: z.enum(["ALL", "REVIEWED", "NOT_REVIEWED"]).catch("ALL"),
  location: z.enum(["ALL", "KARACHI", "LAHORE", "ISLAMABAD"]).catch("ALL"),
  sort: z.enum(["score", "name", "submitted", "location"]).catch("submitted"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
});

export type SubmissionsQueryInput = z.infer<typeof submissionsQuerySchema>;

/** Narrows Next's searchParams shape to something the schema can read. */
export function parseSubmissionsQuery(raw: Record<string, string | string[] | undefined>) {
  const first = (key: string) => (typeof raw[key] === "string" ? raw[key] : undefined);

  return submissionsQuerySchema.parse({
    page: first("page"),
    q: first("q"),
    review: first("review"),
    location: first("location"),
    sort: first("sort"),
    dir: first("dir"),
  });
}
