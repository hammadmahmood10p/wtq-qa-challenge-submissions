/**
 * Image validation for bug evidence.
 *
 * Same principle as the PDF check: the declared content type and the filename both
 * come from the client, so neither is evidence of anything. Only the file's own
 * leading bytes are — and an SVG is excluded deliberately, because it is a document
 * that can carry script, not a picture.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_FIELD = 5;

interface Signature {
  contentType: string;
  extension: string;
  matches: (bytes: Buffer) => boolean;
}

const startsWith = (bytes: Buffer, prefix: number[]) =>
  bytes.length >= prefix.length && prefix.every((byte, i) => bytes[i] === byte);

const SIGNATURES: Signature[] = [
  {
    contentType: "image/png",
    extension: ".png",
    matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    contentType: "image/jpeg",
    extension: ".jpg",
    matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  },
  {
    contentType: "image/gif",
    extension: ".gif",
    matches: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]),
  },
  {
    contentType: "image/webp",
    extension: ".webp",
    // "RIFF" then, four bytes later, "WEBP".
    matches: (b) =>
      startsWith(b, [0x52, 0x49, 0x46, 0x46]) &&
      b.length >= 12 &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

export type ImageProblem = "empty" | "too_large" | "not_an_image";

export function imageProblemMessage(problem: ImageProblem): string {
  switch (problem) {
    case "empty":
      return "That file is empty. Please choose the screenshot again.";
    case "too_large":
      return `That image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024}MB. Please attach a smaller one.`;
    case "not_an_image":
      return "That file is not an image. PNG, JPEG, GIF or WebP only.";
  }
}

export function validateImage(
  bytes: Buffer,
): { contentType: string; extension: string } | ImageProblem {
  if (bytes.length === 0) return "empty";
  if (bytes.length > MAX_IMAGE_BYTES) return "too_large";

  const signature = SIGNATURES.find((s) => s.matches(bytes));
  if (!signature) return "not_an_image";

  return { contentType: signature.contentType, extension: signature.extension };
}

export function isImageProblem(
  result: ReturnType<typeof validateImage>,
): result is ImageProblem {
  return typeof result === "string";
}
