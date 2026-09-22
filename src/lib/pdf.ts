/**
 * PDF validation for Challenge 2 uploads (decision D9).
 *
 * The declared content type and the filename are both supplied by the client, so
 * neither is evidence of anything — renaming `payload.html` to `report.pdf` takes a
 * second, and this audience will do it to see what happens. The only check that means
 * something is the file's own leading bytes.
 */

/** `%PDF-` — the header every PDF begins with. */
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);

export type PdfProblem = "empty" | "too_large" | "not_pdf";

export function pdfProblemMessage(problem: PdfProblem, maxBytes: number): string {
  switch (problem) {
    case "empty":
      return "That file is empty. Please choose your PDF again.";
    case "too_large":
      return `That file is larger than ${Math.round(maxBytes / 1024 / 1024)}MB. Please upload a smaller PDF.`;
    case "not_pdf":
      return "That file is not a PDF. Please upload your report as a PDF.";
  }
}

export function validatePdf(bytes: Buffer, maxBytes: number): PdfProblem | null {
  if (bytes.length === 0) return "empty";
  if (bytes.length > maxBytes) return "too_large";
  if (!bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) return "not_pdf";
  return null;
}

/**
 * Strips anything a filename could smuggle.
 *
 * It is echoed back in a Content-Disposition header when a judge views the file, so a
 * quote or a newline in it is a header-injection opportunity, and a path separator is
 * a traversal one. The stored object key is a UUID regardless; this is only for
 * display.
 */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "submission.pdf";
  const cleaned = base
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  // Requires at least one letter or digit, so names made entirely of dots, spaces or
  // separators fall back rather than producing something like "....pdf".
  if (!/[a-z0-9]/i.test(cleaned)) return "submission.pdf";

  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}
