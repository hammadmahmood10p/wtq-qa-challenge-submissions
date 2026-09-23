"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { addAttachment, removeAttachment } from "@/app/actions/challenge1";
import { MAX_IMAGES_PER_FIELD } from "@/lib/image";

export interface Evidence {
  id: string;
  originalFilename: string;
  sizeBytes: number;
}

/**
 * Screenshot evidence for one half of an entry.
 *
 * Attached by pasting straight into the description — which is what a tester does by
 * reflex after taking a screenshot — or by picking a file. Thumbnails sit beneath the
 * field rather than being embedded in the text, so the description stays plain text
 * that a judge can read and search, and the images stay separately addressable.
 */
export function EvidenceStrip({
  entryId,
  slot,
  items,
  onAdded,
  onRemoved,
  onError,
  disabled,
}: {
  entryId: string;
  slot: "BUG" | "TEST";
  items: Evidence[];
  onAdded: (item: Evidence) => void;
  onRemoved: (id: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (items.length >= MAX_IMAGES_PER_FIELD) {
      onError(`You can attach up to ${MAX_IMAGES_PER_FIELD} images here.`);
      return;
    }

    setBusy(true);
    const formData = new FormData();
    formData.set("file", file);

    const result = await addAttachment(entryId, slot, formData);
    setBusy(false);

    if (!result.ok || !result.attachment) {
      onError(result.error ?? "Could not attach that image.");
      return;
    }

    onAdded({
      id: result.attachment.id,
      originalFilename: result.attachment.originalFilename,
      sizeBytes: result.attachment.sizeBytes,
    });
  }

  async function remove(id: string) {
    // Optimistic: waiting on a round trip to remove a thumbnail feels broken.
    onRemoved(id);
    const result = await removeAttachment(id);
    if (!result.ok) onError(result.error ?? "Could not remove that image.");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy || items.length >= MAX_IMAGES_PER_FIELD}
          className="text-muted hover:text-text inline-flex items-center gap-1.5 text-xs transition-colors disabled:opacity-40"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
          Attach evidence
        </button>
        <span className="text-muted text-[11px]">or paste a screenshot into the box above</span>

        <input
          ref={inputRef}
          type="file"
          // Hidden from sight but not from the accessibility tree: it is the
          // control the visible button opens, and an unnamed file input is what
          // a screen reader lands on if it reaches this by any other route.
          aria-label="Attach a screenshot as evidence"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.id} className="group relative">
              <a
                href={`/api/files/evidence/${item.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title={item.originalFilename}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/files/evidence/${item.id}`}
                  alt={item.originalFilename}
                  className="border-border h-16 w-24 rounded-(--radius-control) border object-cover"
                />
              </a>
              <button
                type="button"
                onClick={() => void remove(item.id)}
                disabled={disabled}
                aria-label={`Remove ${item.originalFilename}`}
                className="bg-danger absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Pulls the first image out of a paste, if there is one. */
export function imageFromPaste(event: React.ClipboardEvent): File | null {
  const item = Array.from(event.clipboardData?.items ?? []).find((i) =>
    i.type.startsWith("image/"),
  );
  return item?.getAsFile() ?? null;
}
