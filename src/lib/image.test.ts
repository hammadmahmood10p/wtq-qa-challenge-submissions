import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, isImageProblem, validateImage } from "./image";

const png = (extra = "") =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(extra),
  ]);

describe("validateImage", () => {
  it.each([
    ["PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"],
    ["JPEG", Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"],
    ["GIF", Buffer.from("GIF89a"), "image/gif"],
    [
      "WebP",
      Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]),
      "image/webp",
    ],
  ])("accepts %s", (_label, bytes, contentType) => {
    const result = validateImage(bytes);
    expect(isImageProblem(result)).toBe(false);
    if (!isImageProblem(result)) expect(result.contentType).toBe(contentType);
  });

  /**
   * The whole point of reading the bytes. A participant pasting evidence has no reason
   * to send anything else, but the filename and content type are theirs to choose.
   */
  it.each([
    ["HTML", "<html><script>alert(1)</script></html>"],
    ["an SVG", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ["a PDF", "%PDF-1.7"],
    ["plain text", "just some text"],
  ])("rejects %s whatever it is called", (_label, contents) => {
    expect(validateImage(Buffer.from(contents))).toBe("not_an_image");
  });

  it("rejects an empty file", () => {
    expect(validateImage(Buffer.alloc(0))).toBe("empty");
  });

  it("rejects an oversized image", () => {
    expect(validateImage(png("x".repeat(MAX_IMAGE_BYTES)))).toBe("too_large");
  });

  it("requires the signature at the very start", () => {
    expect(validateImage(Buffer.from("junk\x89PNG\r\n\x1a\n"))).toBe("not_an_image");
  });

  /** A RIFF container that is not WebP — an AVI, say — is not an image we accept. */
  it("does not accept RIFF alone", () => {
    const riff = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("AVI ")]);
    expect(validateImage(riff)).toBe("not_an_image");
  });
});
