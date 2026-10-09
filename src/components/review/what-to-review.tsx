"use client";

import { BookOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * The brief the participant was working to, on the page where their work is marked.
 *
 * A judge scoring Challenge 3 should not have to remember what Challenge 3 asked for,
 * and they certainly should not be guessing. The brief is the same text the participant
 * read — passed in as children from the server rather than fetched again here, so the
 * two cannot drift and this component stays free of the content itself.
 *
 * Behind a button rather than always open: a judge marking two hundred submissions
 * needs the brief once and the submission every time, and a wall of task description
 * above every panel would push the actual work below the fold.
 */
export function WhatToReview({
  challengeNumber,
  children,
}: {
  challengeNumber: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const question = `What to review in Challenge ${challengeNumber}?`;

  return (
    <div className="mb-6">
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <BookOpen size={15} />
        {question}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={question}
        description="This is the brief the participant was given. Mark their work against it."
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        {children}
      </Dialog>
    </div>
  );
}
