"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createChallenge1Item,
  deleteChallenge1Item,
  moveChallenge1Item,
  updateChallenge1Item,
} from "@/app/actions/challenge1";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { MAX_ITEMS_PER_KIND } from "@/lib/challenge1-limits";
import { ItemDrawer, type DrawerItem } from "./item-drawer";
import type { SaveState } from "./save-indicator";

/** How long typing must pause before a save fires. */
const AUTOSAVE_DELAY_MS = 900;

interface Props {
  kind: "BUG_REPORT" | "TEST_CASE";
  label: string;
  plural: string;
  addFirstLabel: string;
  addAnotherLabel: string;
  emptyHint: string;
  initialItems: DrawerItem[];
  onClosed: () => void;
}

/**
 * One section of Challenge 1 — bug reports or test cases.
 *
 * Autosave is per item and debounced, so typing a long description costs one write
 * rather than one per keystroke. That matters at this scale: 1000 participants typing
 * simultaneously against a database a couple of hundred milliseconds away is the
 * traffic shape most likely to fall over (R1, R1b).
 *
 * Local state is authoritative while the participant types. Rewriting the fields from
 * a server response would move the caret mid-sentence, which is unforgivable in a
 * three-hour writing task.
 */
export function ItemSection({
  kind,
  label,
  plural,
  addFirstLabel,
  addAnotherLabel,
  emptyHint,
  initialItems,
  onClosed,
}: Props) {
  const [items, setItems] = useState<DrawerItem[]>(initialItems);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initialItems.length === 1 ? [initialItems[0].id] : []),
  );
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, DrawerItem>());

  // Anything still queued when the page goes away would otherwise be lost.
  useEffect(() => {
    const queued = timers.current;
    return () => queued.forEach(clearTimeout);
  }, []);

  const setSaveState = useCallback((id: string, state: SaveState) => {
    setSaveStates((prev) => ({ ...prev, [id]: state }));
  }, []);

  const flush = useCallback(
    async (id: string) => {
      const draft = pending.current.get(id);
      if (!draft) return;

      pending.current.delete(id);
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);

      setSaveState(id, "saving");
      const result = await updateChallenge1Item(id, draft.title, draft.description);

      if (result.closed) {
        onClosed();
        return;
      }

      if (!result.ok) {
        setSaveState(id, "error");
        setError(result.error ?? "Could not save. Please try again.");
        // Put it back so the explicit save button can retry it.
        pending.current.set(id, draft);
        return;
      }

      setSaveState(id, "saved");
      setError(null);
    },
    [onClosed, setSaveState],
  );

  function onChange(id: string, patch: { title?: string; description?: string }) {
    // The draft is computed here, not inside the setItems updater. A state updater
    // must be pure: React is free to re-run it, or to defer it past the point where
    // the autosave timer fires — and when that happened, the save wrote the item's
    // original empty values while the indicator cheerfully reported "Saved".
    //
    // Reading `pending` first rather than `items` also keeps consecutive edits
    // correct: typing a title and then a description must produce one draft holding
    // both, not two drafts each overwriting the other.
    const current = pending.current.get(id) ?? items.find((item) => item.id === id);
    if (!current) return;

    const updated = { ...current, ...patch };
    pending.current.set(id, updated);
    setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));

    setSaveState(id, "dirty");

    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => void flush(id), AUTOSAVE_DELAY_MS),
    );
  }

  async function addItem() {
    setBusy(true);
    setError(null);

    const result = await createChallenge1Item(kind);
    setBusy(false);

    if (result.closed) return onClosed();

    if (!result.ok || !result.item) {
      setError(result.error ?? `Could not add another ${label.toLowerCase()}.`);
      return;
    }

    const created: DrawerItem = {
      id: result.item.id,
      title: result.item.title,
      description: result.item.description,
    };

    setItems((prev) => [...prev, created]);
    // Open the new one; leave the others as the participant left them.
    setExpanded((prev) => new Set(prev).add(created.id));
  }

  async function removeItem(id: string) {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    pending.current.delete(id);

    // Optimistic: the row is gone from view immediately, and restored if the server
    // disagrees. Waiting on a 200ms round trip to remove a row feels broken.
    const snapshot = items;
    setItems((prev) => prev.filter((item) => item.id !== id));

    const result = await deleteChallenge1Item(id);
    if (result.closed) return onClosed();

    if (!result.ok) {
      setItems(snapshot);
      setError(result.error ?? "Could not delete that item.");
    }
  }

  async function move(id: string, direction: "up" | "down") {
    const index = items.findIndex((item) => item.id === id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= items.length) return;

    // Save anything pending first, so a reorder cannot race an in-flight write.
    await flush(id);

    const snapshot = items;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setItems(reordered);

    const result = await moveChallenge1Item(id, direction);
    if (result.closed) return onClosed();

    if (!result.ok) {
      setItems(snapshot);
      setError(result.error ?? "Could not reorder that item.");
    }
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const atCap = items.length >= MAX_ITEMS_PER_KIND;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">{plural}</h2>
        {items.length > 0 && (
          <p className="text-muted text-xs tabular-nums">
            {items.length} of {MAX_ITEMS_PER_KIND}
          </p>
        )}
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {items.length === 0 ? (
        <div className="border-border rounded-(--radius-card) border border-dashed p-8 text-center">
          <p className="text-muted mb-4 text-sm">{emptyHint}</p>
          <Button variant="aurora" onClick={addItem} loading={busy}>
            <Plus size={15} />
            {addFirstLabel}
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {items.map((item, index) => (
              <ItemDrawer
                key={item.id}
                item={item}
                index={index}
                label={label}
                expanded={expanded.has(item.id)}
                onToggle={() => toggle(item.id)}
                saveState={saveStates[item.id] ?? "idle"}
                onChange={(patch) => onChange(item.id, patch)}
                onSaveNow={() => void flush(item.id)}
                onDelete={() => void removeItem(item.id)}
                onMove={(direction) => void move(item.id, direction)}
                canMoveUp={index > 0}
                canMoveDown={index < items.length - 1}
              />
            ))}
          </div>

          {/* Required by the brief: the add button sits outside the expanded drawer,
              so a participant never has to collapse anything to add the next one. */}
          <Button variant="secondary" onClick={addItem} loading={busy} disabled={atCap}>
            <Plus size={15} />
            {addAnotherLabel}
          </Button>

          {atCap && (
            <p className="text-muted text-xs">
              You have reached the limit of {MAX_ITEMS_PER_KIND}. Edit an existing entry
              instead.
            </p>
          )}
        </>
      )}
    </section>
  );
}
