import { describe, expect, it } from "vitest";
import {
  AUDIT_CATEGORIES,
  actionsInCategory,
  describeAction,
  describeMetadata,
} from "./audit-labels";

/**
 * The audit log is read when something has gone wrong and nobody has time to decode
 * `admin.attempt_reset`. These tests are about it staying readable.
 */

describe("describeAction", () => {
  it("gives a sentence, a category and a tone", () => {
    const d = describeAction("admin.participant_blocked");

    expect(d.label).toBe("Blocked an account");
    expect(AUDIT_CATEGORIES).toContain(d.category);
    expect(d.tone).toBe("warning");
  });

  it("marks the things that should alarm someone", () => {
    // These three are "somebody is acting as somebody else", or "somebody just took
    // control". They must never render as ordinary rows.
    expect(describeAction("auth.login_master_password").tone).toBe("danger");
    expect(describeAction("admin.super_admin_created").tone).toBe("danger");
    expect(describeAction("admin.participants_bulk_deleted").tone).toBe("danger");
  });

  it("falls back to the raw action rather than blanking the row", () => {
    // The log outlives the code that wrote it: a row from an older release, or an
    // action somebody added without a label, must still be readable.
    const d = describeAction("something.not_yet_labelled");

    expect(d.label).toBe("something.not_yet_labelled");
    expect(d.tone).toBe("neutral");
  });
});

describe("actionsInCategory", () => {
  it("finds the actions behind a filter", () => {
    const security = actionsInCategory("Security");

    expect(security).toContain("auth.login_master_password");
    expect(security).toContain("admin.master_password_enabled");
    expect(security).not.toContain("auth.login");
  });

  it("covers every category with at least one action", () => {
    for (const category of AUDIT_CATEGORIES) {
      expect(actionsInCategory(category).length).toBeGreaterThan(0);
    }
  });
});

describe("describeMetadata", () => {
  it("says nothing when there is nothing to say", () => {
    expect(describeMetadata(null)).toBeNull();
    expect(describeMetadata({})).toBeNull();
    expect(describeMetadata("not an object")).toBeNull();
  });

  it("turns a refusal reason into words", () => {
    expect(describeMetadata({ reason: "bad_password" })).toBe("wrong password");
    expect(describeMetadata({ reason: "status_blocked" })).toBe("account is blocked");
  });

  it("keeps an unrecognised reason rather than dropping it", () => {
    expect(describeMetadata({ reason: "something_new" })).toBe("something_new");
  });

  it("reads counts the way a person would say them", () => {
    expect(describeMetadata({ deleted: 412, filesRemoved: 97 })).toBe(
      "412 deleted · 97 files removed",
    );
  });

  it("omits what the action name already carries", () => {
    // "Submitted automatically when time ran out" does not need "auto yes" after it.
    expect(describeMetadata({ auto: true })).toBeNull();
    expect(describeMetadata({ viaMasterPassword: true })).toBeNull();
  });

  it("shows a change as from and to", () => {
    expect(describeMetadata({ from: 3, to: 5 })).toBe("from 3 to 5");
    expect(describeMetadata({ from: null })).toBe("from none");
  });

  it("flattens a nested filter without printing JSON", () => {
    const text = describeMetadata({
      filter: { q: null, status: "ALL", location: "KARACHI" },
    });

    expect(text).toBe("filter location=KARACHI");
    expect(text).not.toContain("{");
  });

  it("still shows a key it was never taught about", () => {
    // Better an awkward row than a silently missing detail.
    expect(describeMetadata({ sessionsRevoked: 812 })).toBe("812 sessions ended");
    expect(describeMetadata({ someNewField: "value" })).toBe("some new field value");
  });

  it("truncates something long enough to wreck the table", () => {
    const text = describeMetadata({ reason: "x".repeat(300) });

    expect(text!.length).toBeLessThan(120);
  });
});

describe("describeMetadata — noise suppression", () => {
  it("drops identifiers, by key and by shape", () => {
    // "participant id 95cb746d-…" says nothing the To-whom column does not, and
    // crowds out the detail that matters.
    expect(
      describeMetadata({
        participantId: "95cb746d-8d86-43ee-a919-0088fa19ce3e",
        minutes: 45,
      }),
    ).toBe("45 minutes");

    expect(describeMetadata({ previous: "1bfcd9aa-506c-484e-b160-9e840ab466cf" })).toBeNull();
  });

  it("states a flag that is true and stays silent about one that is false", () => {
    expect(describeMetadata({ clearedScores: true })).toBe("cleared scores");
    expect(describeMetadata({ clearedScores: false })).toBeNull();
  });
});
