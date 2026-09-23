"use client";

import { Check, ExternalLink, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { saveChallengeLink, type SubmissionResult } from "@/app/actions/challenge-submission";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { REQUIRED_PHRASE } from "@/lib/github";

const INITIAL: SubmissionResult = { ok: false };

interface Props {
  existing: { githubUrl: string; verifiedPublic: boolean | null } | null;
}

export function GithubLinkForm({ existing }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveChallengeLink, INITIAL);
  const [url, setUrl] = useState(existing?.githubUrl ?? "");

  useEffect(() => {
    if (state.closed) router.refresh();
  }, [state.closed, router]);

  // The form is noValidate and the field is a text input rather than type="url", on
  // purpose. The server deliberately accepts a link pasted without a scheme —
  // github.com/you/repo-wtq26 is what people actually paste — but native URL
  // validation rejects exactly that, blocking the submit behind a browser tooltip
  // before our own, friendlier message can run.
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert variant="error">{state.error}</Alert>}

      {/* Saved, but with a caveat. Never blocks: GitHub's rate limit is not the
          participant's fault and must not cost them a submission (D10). */}
      {state.ok && state.warning && <Alert variant="warning">{state.warning}</Alert>}

      {state.ok && !state.warning && (
        <Alert variant="success">
          <span className="flex items-center gap-1.5">
            <Check size={14} />
            Your repository link is saved.
          </span>
        </Alert>
      )}

      <Field
        label="GitHub repository link"
        required
        hint={`Must be a public repository whose name contains "${REQUIRED_PHRASE}" — for example, storeTask-${REQUIRED_PHRASE}`}
      >
        {({ id, describedBy, invalid, required }) => (
          <Input
            id={id}
            name="githubUrl"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={`https://github.com/your-name/storeTask-${REQUIRED_PHRASE}`}
            required={required}
            aria-describedby={describedBy}
            invalid={invalid || Boolean(state.error)}
            className="font-mono text-[13px]"
          />
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="brand" loading={pending}>
          <Save size={15} />
          Save
        </Button>

        {existing && (
          <a
            href={existing.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-text inline-flex items-center gap-1.5 text-sm underline transition-colors"
          >
            Open your repository
            <ExternalLink size={13} />
          </a>
        )}
      </div>

      {existing?.verifiedPublic === false && !state.ok && (
        <Alert variant="warning">
          We could not reach this repository when it was saved. Check the name and that
          it is public — your link is stored either way.
        </Alert>
      )}
    </form>
  );
}
