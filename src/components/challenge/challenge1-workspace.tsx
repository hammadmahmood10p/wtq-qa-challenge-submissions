"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { DrawerItem } from "./item-drawer";
import { ItemSection } from "./item-section";

/**
 * Challenge 1's two sections.
 *
 * Both need to react the same way when the attempt closes underneath them — the clock
 * running out mid-sentence, or another tab submitting — so that decision lives here
 * once rather than in each section.
 */
export function Challenge1Workspace({
  bugReports,
  testCases,
}: {
  bugReports: DrawerItem[];
  testCases: DrawerItem[];
}) {
  const router = useRouter();

  // The server has already stopped accepting writes; refreshing lets the page say so
  // rather than leaving a participant typing into a form that no longer does anything.
  const onClosed = useCallback(() => router.refresh(), [router]);

  return (
    <div className="space-y-10">
      <ItemSection
        kind="BUG_REPORT"
        label="Bug Report"
        plural="Bug Reports"
        addFirstLabel="Add Bug Report"
        addAnotherLabel="Add Another Bug Report"
        emptyHint="Report each bug you find, with enough detail for someone else to reproduce it."
        initialItems={bugReports}
        onClosed={onClosed}
      />

      <ItemSection
        kind="TEST_CASE"
        label="Test Case"
        plural="Test Cases"
        addFirstLabel="Add Test Case"
        addAnotherLabel="Add Another Test Case"
        emptyHint="Write test cases covering the bugs you identified. These carry into your Phase 2 checklist."
        initialItems={testCases}
        onClosed={onClosed}
      />
    </div>
  );
}
