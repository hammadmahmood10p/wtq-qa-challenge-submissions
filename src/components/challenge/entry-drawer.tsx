"use client";

import { Bug, ChevronDown, FlaskConical, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/challenge1-limits";
import { cn } from "@/lib/utils";
import { EvidenceStrip, imageFromPaste, type Evidence } from "./evidence-strip";
import { SaveIndicator, type SaveState } from "./save-indicator";

export interface DrawerEntry {
  id: string;
  bugTitle: string;
  bugDescription: string;
  testTitle: string;
  testDescription: string;
  bugEvidence: Evidence[];
  testEvidence: Evidence[];
}

interface Props {
  entry: DrawerEntry;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  saveState: SaveState;
  onChange: (patch: Partial<Omit<DrawerEntry, "id" | "bugEvidence" | "testEvidence">>) => void;
  onEvidenceAdded: (slot: "BUG" | "TEST", item: Evidence) => void;
  onEvidenceRemoved: (slot: "BUG" | "TEST", id: string) => void;
  onError: (message: string) => void;
  onSaveNow: () => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled?: boolean;
}

/**
 * One finding: a bug report and the test case that covers it, side by side.
 *
 * The two halves share a drawer because they describe the same thing — writing the
 * test case while the bug is still in front of you is how a tester works, and it means
 * a judge can see the pairing rather than having to match two lists.
 *
 * Side by side on a wide screen, stacked below that: at tablet width two columns of
 * textarea are narrower than the text going into them.
 */
export function EntryDrawer({
  entry,
  index,
  expanded,
  onToggle,
  saveState,
  onChange,
  onEvidenceAdded,
  onEvidenceRemoved,
  onError,
  onSaveNow,
  onDelete,
  onMove,
  canMoveUp,
  canMoveDown,
  disabled,
}: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const isNew = useRef(!entry.bugTitle && !entry.bugDescription);

  // A freshly added drawer should be ready to type into.
  useEffect(() => {
    if (isNew.current && expanded) {
      titleRef.current?.focus();
      isNew.current = false;
    }
  }, [expanded]);

  const heading = entry.bugTitle.trim() || "Untitled finding";

  /** A pasted screenshot is evidence, not text — intercept it before it lands. */
  function onPaste(slot: "BUG" | "TEST") {
    return async (event: React.ClipboardEvent) => {
      const file = imageFromPaste(event);
      if (!file) return;

      event.preventDefault();

      const { addAttachment } = await import("@/app/actions/challenge1");
      const formData = new FormData();
      formData.set("file", file);

      const result = await addAttachment(entry.id, slot, formData);
      if (!result.ok || !result.attachment) {
        onError(result.error ?? "Could not attach that image.");
        return;
      }

      onEvidenceAdded(slot, {
        id: result.attachment.id,
        originalFilename: result.attachment.originalFilename,
        sizeBytes: result.attachment.sizeBytes,
      });
    };
  }

  return (
    <div
      className={cn(
        "border-border bg-surface rounded-(--radius-card) border transition-colors",
        expanded && "border-violet/40",
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={`entry-${entry.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronDown
            size={16}
            className={cn(
              "text-muted shrink-0 transition-transform duration-(--duration-standard)",
              expanded && "rotate-180",
            )}
          />
          <span className="text-muted shrink-0 font-mono text-xs">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span
            className={cn(
              "truncate text-sm",
              entry.bugTitle.trim() ? "font-medium" : "text-muted italic",
            )}
          >
            {heading}
          </span>
          {entry.testTitle.trim() && (
            <span className="border-border text-muted hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] sm:inline">
              test case
            </span>
          )}
        </button>

        <SaveIndicator state={saveState} className="shrink-0" />

        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={!canMoveUp || disabled}
            aria-label={`Move finding ${index + 1} up`}
            className="text-muted hover:text-text rounded p-1.5 transition-colors disabled:opacity-30"
          >
            <ChevronDown size={14} className="rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={!canMoveDown || disabled}
            aria-label={`Move finding ${index + 1} down`}
            className="text-muted hover:text-text rounded p-1.5 transition-colors disabled:opacity-30"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* 0fr to 1fr: a transitionable stand-in for height: auto. */}
      <div
        id={`entry-${entry.id}`}
        className={cn(
          "grid transition-[grid-template-rows] duration-(--duration-standard) ease-(--ease-entrance)",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-border border-t">
            <div className="grid gap-px lg:grid-cols-2">
              {/* ---- Bug report ---- */}
              <section className="bg-surface space-y-3 p-4">
                <h3 className="text-violet flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                  <Bug size={13} />
                  Bug report
                </h3>

                <div className="space-y-1.5">
                  <label htmlFor={`bug-title-${entry.id}`} className="block text-sm font-medium">
                    Title
                  </label>
                  <input
                    id={`bug-title-${entry.id}`}
                    ref={titleRef}
                    value={entry.bugTitle}
                    onChange={(e) => onChange({ bugTitle: e.target.value })}
                    maxLength={TITLE_MAX}
                    disabled={disabled}
                    placeholder="Short summary of the bug"
                    className={inputClasses()}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor={`bug-desc-${entry.id}`} className="block text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    id={`bug-desc-${entry.id}`}
                    value={entry.bugDescription}
                    onChange={(e) => onChange({ bugDescription: e.target.value })}
                    onPaste={onPaste("BUG")}
                    maxLength={DESCRIPTION_MAX}
                    disabled={disabled}
                    rows={8}
                    placeholder="Steps to reproduce, what you expected, what actually happened."
                    className={cn(inputClasses(), "resize-y font-mono text-[13px] leading-relaxed")}
                  />
                  <EvidenceStrip
                    entryId={entry.id}
                    slot="BUG"
                    items={entry.bugEvidence}
                    onAdded={(item) => onEvidenceAdded("BUG", item)}
                    onRemoved={(id) => onEvidenceRemoved("BUG", id)}
                    onError={onError}
                    disabled={disabled}
                  />
                </div>
              </section>

              {/* ---- Test case ---- */}
              <section className="bg-surface-raised/40 border-border space-y-3 border-t p-4 lg:border-t-0 lg:border-l">
                <h3 className="text-violet flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                  <FlaskConical size={13} />
                  Test case for this bug
                </h3>

                <div className="space-y-1.5">
                  <label htmlFor={`test-title-${entry.id}`} className="block text-sm font-medium">
                    Title
                  </label>
                  <input
                    id={`test-title-${entry.id}`}
                    value={entry.testTitle}
                    onChange={(e) => onChange({ testTitle: e.target.value })}
                    maxLength={TITLE_MAX}
                    disabled={disabled}
                    placeholder="What this test case covers"
                    className={inputClasses()}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor={`test-desc-${entry.id}`} className="block text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    id={`test-desc-${entry.id}`}
                    value={entry.testDescription}
                    onChange={(e) => onChange({ testDescription: e.target.value })}
                    onPaste={onPaste("TEST")}
                    maxLength={DESCRIPTION_MAX}
                    disabled={disabled}
                    rows={8}
                    placeholder="Preconditions, steps, expected result."
                    className={cn(inputClasses(), "resize-y font-mono text-[13px] leading-relaxed")}
                  />
                  <EvidenceStrip
                    entryId={entry.id}
                    slot="TEST"
                    items={entry.testEvidence}
                    onAdded={(item) => onEvidenceAdded("TEST", item)}
                    onRemoved={(id) => onEvidenceRemoved("TEST", id)}
                    onError={onError}
                    disabled={disabled}
                  />
                </div>
              </section>
            </div>

            <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
              {confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted text-xs">
                    Delete this finding, and its test case and evidence?
                  </span>
                  <Button size="sm" variant="danger" onClick={onDelete} disabled={disabled}>
                    Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={disabled}
                  className="hover:text-danger"
                >
                  <Trash2 size={14} />
                  Delete
                </Button>
              )}

              {/* Everything autosaves; this flushes immediately and confirms it landed. */}
              <Button size="sm" variant="secondary" onClick={onSaveNow} disabled={disabled}>
                <Save size={14} />
                Save finding
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
