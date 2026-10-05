import { Bug, ClipboardCheck, FlaskConical } from "lucide-react";

/**
 * What a complete finding looks like, stated on the page where it is being judged.
 *
 * The organisers set these out, and judges were otherwise carrying them in their heads
 * or in a separate document. With a panel marking hundreds of findings in an afternoon,
 * a standard that lives somewhere else is a standard that drifts between judges — and
 * two judges applying different ideas of "complete" is the one thing scoring cannot
 * survive.
 *
 * Deliberately a reminder of what to look for, not a checklist that scores anything.
 * The marks stay in the rubric; this says what the marks are about.
 */

const BUG_REPORT = ["Title", "Steps to reproduce", "Actual result", "Expected result", "Evidence"];

const TEST_CASE = ["Title", "Steps to execute", "Expected result"];

export function Challenge1Criteria() {
  return (
    <section className="border-violet/30 bg-violet/5 rounded-(--radius-card) border p-5">
      <h3 className="font-display flex items-center gap-2 text-sm font-semibold">
        <ClipboardCheck size={15} className="text-violet shrink-0" />
        What to look for in each finding
      </h3>

      <p className="text-muted mt-1.5 text-xs">
        Every finding below should pair one bug report with the test case that covers it. These are
        the parts each should contain.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Panel
          icon={<Bug size={14} className="text-danger-strong shrink-0" />}
          title="The bug report must have"
        >
          {BUG_REPORT}
        </Panel>

        <Panel
          icon={<FlaskConical size={14} className="text-info-strong shrink-0" />}
          title="The test case must have"
        >
          {TEST_CASE}
        </Panel>
      </div>
    </section>
  );
}

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: string[];
}) {
  return (
    <div className="border-border bg-surface rounded-(--radius-control) border px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        {icon}
        {title}
      </p>
      <ul className="mt-2 space-y-1">
        {children.map((item) => (
          <li key={item} className="text-muted flex gap-2 text-[13px]">
            <span aria-hidden="true" className="bg-violet mt-1.5 size-1 shrink-0 rounded-full" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
