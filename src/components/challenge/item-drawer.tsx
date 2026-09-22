"use client";

import { ChevronDown, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/challenge1-limits";
import { cn } from "@/lib/utils";
import { SaveIndicator, type SaveState } from "./save-indicator";

export interface DrawerItem {
  id: string;
  title: string;
  description: string;
}

interface Props {
  item: DrawerItem;
  index: number;
  /** "Bug Report" or "Test Case". */
  label: string;
  expanded: boolean;
  onToggle: () => void;
  saveState: SaveState;
  onChange: (patch: { title?: string; description?: string }) => void;
  onSaveNow: () => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled?: boolean;
}

/**
 * One bug report or test case, as an expanding drawer.
 *
 * The expand animation uses a CSS grid row going from 0fr to 1fr rather than
 * animating height, because `height: auto` cannot be transitioned and measuring it in
 * JavaScript reflows the page. With dozens of these open at once that difference is
 * the difference between smooth and visibly stuttering.
 *
 * Content stays mounted while collapsed so that half-typed text is never discarded by
 * closing a drawer, and so an in-flight autosave is not interrupted.
 */
export function ItemDrawer({
  item,
  index,
  label,
  expanded,
  onToggle,
  saveState,
  onChange,
  onSaveNow,
  onDelete,
  onMove,
  canMoveUp,
  canMoveDown,
  disabled,
}: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const isNew = useRef(item.title === "" && item.description === "");

  // A freshly added drawer should be ready to type into — otherwise every new entry
  // costs a click.
  useEffect(() => {
    if (isNew.current && expanded) {
      titleRef.current?.focus();
      isNew.current = false;
    }
  }, [expanded]);

  const heading = item.title.trim() || `Untitled ${label.toLowerCase()}`;

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
          aria-controls={`drawer-${item.id}`}
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
              item.title.trim() ? "font-medium" : "text-muted italic",
            )}
          >
            {heading}
          </span>
        </button>

        <SaveIndicator state={saveState} className="shrink-0" />

        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={!canMoveUp || disabled}
            aria-label={`Move ${label} ${index + 1} up`}
            className="text-muted hover:text-text rounded p-1.5 transition-colors disabled:opacity-30"
          >
            <ChevronDown size={14} className="rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={!canMoveDown || disabled}
            aria-label={`Move ${label} ${index + 1} down`}
            className="text-muted hover:text-text rounded p-1.5 transition-colors disabled:opacity-30"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* 0fr to 1fr: a transitionable stand-in for height: auto. */}
      <div
        id={`drawer-${item.id}`}
        className={cn(
          "grid transition-[grid-template-rows] duration-(--duration-standard) ease-(--ease-entrance)",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-border space-y-4 border-t px-4 py-4">
            <div className="space-y-1.5">
              <label htmlFor={`title-${item.id}`} className="block text-sm font-medium">
                Title
              </label>
              <input
                id={`title-${item.id}`}
                ref={titleRef}
                value={item.title}
                onChange={(e) => onChange({ title: e.target.value })}
                maxLength={TITLE_MAX}
                disabled={disabled}
                placeholder={
                  label === "Bug Report"
                    ? "Short summary of the bug"
                    : "What this test case covers"
                }
                className={inputClasses()}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`desc-${item.id}`} className="block text-sm font-medium">
                  Description
                </label>
                {/* Only shown as the cap approaches — a counter on every field is noise. */}
                {item.description.length > DESCRIPTION_MAX * 0.8 && (
                  <span className="text-muted text-xs tabular-nums">
                    {item.description.length.toLocaleString()} / {DESCRIPTION_MAX.toLocaleString()}
                  </span>
                )}
              </div>
              <textarea
                id={`desc-${item.id}`}
                value={item.description}
                onChange={(e) => onChange({ description: e.target.value })}
                maxLength={DESCRIPTION_MAX}
                disabled={disabled}
                rows={7}
                placeholder={
                  label === "Bug Report"
                    ? "Steps to reproduce, what you expected, what actually happened."
                    : "Preconditions, steps, expected result."
                }
                className={cn(inputClasses(), "resize-y font-mono text-[13px] leading-relaxed")}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              {confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted text-xs">Delete this {label.toLowerCase()}?</span>
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

              {/* Required by the brief. Everything already autosaves, so this is a
                  reassurance button as much as a functional one — it flushes the
                  pending save immediately and confirms it landed. */}
              <Button size="sm" variant="secondary" onClick={onSaveNow} disabled={disabled}>
                <Save size={14} />
                Save {label}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
