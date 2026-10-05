"use client";

import { Bug, ChevronDown, FlaskConical, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  isEntryComplete,
  missingEntryParts,
} from "@/lib/challenge1-limits";
import { NO_CLIPBOARD_HINT, noClipboard } from "@/lib/no-clipboard";
import { cn } from "@/lib/utils";
import { EvidenceStrip, type Evidence } from "./evidence-strip";
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
  const [blocked, setBlocked] = useState(false);
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
  const complete = isEntryComplete(entry);
  const missing = missingEntryParts(entry);

  /**
   * The clipboard is closed on all four assessed fields.
   *
   * Challenge 1 measures the participant's own manual testing, and a bug report pasted
   * in from somewhere else is not that. It took the pasted-screenshot shortcut with it
   * — a paste handler cannot admit images while refusing text without becoming the
   * thing it is meant to prevent — so the evidence strip gained drag-and-drop to
   * replace it.
   *
   * Worth saying plainly: this stops the casual paste, not a determined one. It is a
   * speed bump.
   */
  const clipboard = noClipboard(() => setBlocked(true));

  return (
    <div
      className={cn(
        // Signature moment 2: a new finding expands into place rather than
        // appearing, and the ones below it settle rather than jumping. It matters
        // most at the fortieth, which is where this screen actually gets used.
        "border-border bg-surface drawer-in rounded-(--radius-card) border transition-colors",
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
          {/* Whether this finding will actually be handed in. Stated on the closed
              drawer, because that is what someone scanning forty of them sees, and
              discovering at submission time that half were never counted is the
              failure this is here to prevent. */}
          {complete ? (
            <span className="border-success/40 bg-success/10 text-success-strong hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium sm:inline">
              Counted
            </span>
          ) : (
            <span
              title={`Still needs: ${missing.join(", ")}`}
              className="border-warning/40 bg-warning/10 text-warning-strong hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium sm:inline"
            >
              Not counted yet
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
                    {...clipboard}
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
                    {...clipboard}
                    onChange={(e) => onChange({ bugDescription: e.target.value })}
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
                    {...clipboard}
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
                    {...clipboard}
                    onChange={(e) => onChange({ testDescription: e.target.value })}
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

            {/* A blocked paste does nothing visible, and nothing-visible reads as a
                broken field. Someone who thinks the form is broken spends their time
                on that instead of on testing, so it says why. */}
            {blocked && (
              <p className="border-info/30 bg-info/8 text-info-strong border-t px-4 py-2.5 text-xs">
                {NO_CLIPBOARD_HINT} Screenshots are still welcome — use{" "}
                <strong>Attach evidence</strong> or drag an image onto the strip below
                each box.
              </p>
            )}

            {/* Said in full where there is room for it, since the pill on the header
                only has space to say that something is wrong, not what. */}
            {!complete && (
              <p className="border-warning/30 bg-warning/8 text-warning-strong border-t px-4 py-2.5 text-xs">
                This finding will not be handed in until you fill in the{" "}
                {missing.join(", ").replace(/, ([^,]*)$/, " and $1")}.
              </p>
            )}

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
                  className="hover:text-danger-strong"
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
