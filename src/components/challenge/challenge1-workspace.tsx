"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createEntry,
  deleteEntry,
  moveEntry,
  updateEntry,
} from "@/app/actions/challenge1";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { MAX_ENTRIES } from "@/lib/challenge1-limits";
import { EntryDrawer, type DrawerEntry } from "./entry-drawer";
import type { Evidence } from "./evidence-strip";
import type { SaveState } from "./save-indicator";

/** How long typing must pause before a save fires. */
const AUTOSAVE_DELAY_MS = 900;

/**
 * Challenge 1: a list of findings, each pairing a bug report with its test case.
 *
 * Autosave is per entry and debounced, so writing a long description costs one write
 * rather than one per keystroke. At this scale that is the difference that matters:
 * 1000 people typing at once against a database a couple of hundred milliseconds away
 * is the traffic shape most likely to fall over (R1, R1b).
 *
 * Local state stays authoritative while the participant types. Rewriting the fields
 * from a server response would move the caret mid-sentence, which is unforgivable in a
 * three-hour writing task.
 */
export function Challenge1Workspace({ initialEntries }: { initialEntries: DrawerEntry[] }) {
  const router = useRouter();

  const [entries, setEntries] = useState<DrawerEntry[]>(initialEntries);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initialEntries.length === 1 ? [initialEntries[0].id] : []),
  );
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, DrawerEntry>());

  useEffect(() => {
    const queued = timers.current;
    return () => queued.forEach(clearTimeout);
  }, []);

  const onClosed = useCallback(() => router.refresh(), [router]);

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
      const result = await updateEntry(id, {
        bugTitle: draft.bugTitle,
        bugDescription: draft.bugDescription,
        testTitle: draft.testTitle,
        testDescription: draft.testDescription,
      });

      if (result.closed) return onClosed();

      if (!result.ok) {
        setSaveState(id, "error");
        setError(result.error ?? "Could not save. Please try again.");
        pending.current.set(id, draft); // so the save button can retry it
        return;
      }

      setSaveState(id, "saved");
      setError(null);
    },
    [onClosed, setSaveState],
  );

  function onChange(id: string, patch: Partial<DrawerEntry>) {
    // The draft is computed here, not inside the setEntries updater. A state updater
    // must be pure: React is free to re-run it or defer it past the point the autosave
    // timer fires — and when that happened, the save wrote the entry's original empty
    // values while the indicator reported "Saved".
    const current = pending.current.get(id) ?? entries.find((e) => e.id === id);
    if (!current) return;

    const updated = { ...current, ...patch };
    pending.current.set(id, updated);
    setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));

    setSaveState(id, "dirty");

    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => void flush(id), AUTOSAVE_DELAY_MS),
    );
  }

  /** Attachments save server-side immediately, so only the local copy needs updating. */
  function onEvidenceAdded(id: string, slot: "BUG" | "TEST", item: Evidence) {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry;
        const key = slot === "BUG" ? "bugEvidence" : "testEvidence";
        const next = { ...entry, [key]: [...entry[key], item] };
        if (pending.current.has(id)) pending.current.set(id, next);
        return next;
      }),
    );
    setError(null);
  }

  function onEvidenceRemoved(id: string, slot: "BUG" | "TEST", attachmentId: string) {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry;
        const key = slot === "BUG" ? "bugEvidence" : "testEvidence";
        const next = { ...entry, [key]: entry[key].filter((i) => i.id !== attachmentId) };
        if (pending.current.has(id)) pending.current.set(id, next);
        return next;
      }),
    );
  }

  async function addEntry() {
    setBusy(true);
    setError(null);

    const result = await createEntry();
    setBusy(false);

    if (result.closed) return onClosed();

    if (!result.ok || !result.entry) {
      setError(result.error ?? "Could not add another finding.");
      return;
    }

    const created: DrawerEntry = {
      id: result.entry.id,
      bugTitle: "",
      bugDescription: "",
      testTitle: "",
      testDescription: "",
      bugEvidence: [],
      testEvidence: [],
    };

    setEntries((prev) => [...prev, created]);
    setExpanded((prev) => new Set(prev).add(created.id));
  }

  async function removeEntry(id: string) {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    pending.current.delete(id);

    // Optimistic: waiting on a round trip to remove a row feels broken.
    const snapshot = entries;
    setEntries((prev) => prev.filter((e) => e.id !== id));

    const result = await deleteEntry(id);
    if (result.closed) return onClosed();

    if (!result.ok) {
      setEntries(snapshot);
      setError(result.error ?? "Could not delete that finding.");
    }
  }

  async function move(id: string, direction: "up" | "down") {
    const index = entries.findIndex((e) => e.id === id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= entries.length) return;

    // Save anything pending first, so a reorder cannot race an in-flight write.
    await flush(id);

    const snapshot = entries;
    const reordered = [...entries];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setEntries(reordered);

    const result = await moveEntry(id, direction);
    if (result.closed) return onClosed();

    if (!result.ok) {
      setEntries(snapshot);
      setError(result.error ?? "Could not reorder that finding.");
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

  const atCap = entries.length >= MAX_ENTRIES;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Your findings</h2>
        {entries.length > 0 && (
          <p className="text-muted text-xs tabular-nums">
            {entries.length} of {MAX_ENTRIES}
          </p>
        )}
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {entries.length === 0 ? (
        <div className="border-border rounded-(--radius-card) border border-dashed p-8 text-center">
          <p className="text-muted mx-auto mb-4 max-w-md text-sm">
            For each bug you find, write the report and the test case that covers it
            together. You can attach screenshots as evidence.
          </p>
          <Button variant="brand" onClick={addEntry} loading={busy}>
            <Plus size={15} />
            Add Bug Report
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {entries.map((entry, index) => (
              <EntryDrawer
                key={entry.id}
                entry={entry}
                index={index}
                expanded={expanded.has(entry.id)}
                onToggle={() => toggle(entry.id)}
                saveState={saveStates[entry.id] ?? "idle"}
                onChange={(patch) => onChange(entry.id, patch)}
                onEvidenceAdded={(slot, item) => onEvidenceAdded(entry.id, slot, item)}
                onEvidenceRemoved={(slot, id) => onEvidenceRemoved(entry.id, slot, id)}
                onError={setError}
                onSaveNow={() => void flush(entry.id)}
                onDelete={() => void removeEntry(entry.id)}
                onMove={(direction) => void move(entry.id, direction)}
                canMoveUp={index > 0}
                canMoveDown={index < entries.length - 1}
              />
            ))}
          </div>

          {/* Outside the drawers, so nothing has to be collapsed to add the next one. */}
          <Button variant="secondary" onClick={addEntry} loading={busy} disabled={atCap}>
            <Plus size={15} />
            Add Another Bug Report
          </Button>

          {atCap && (
            <p className="text-muted text-xs">
              You have reached the limit of {MAX_ENTRIES} findings. Edit an existing one
              instead.
            </p>
          )}
        </>
      )}
    </section>
  );
}
