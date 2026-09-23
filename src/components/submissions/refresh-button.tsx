"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TICK_SECONDS = 15;

/**
 * Refresh Data.
 *
 * The table is shared, so what it shows goes out of date whenever anyone else takes a
 * submission. Polling was the alternative and is worse here: a list that reorders
 * itself under a judge who is halfway down it is disorienting, and on event day it
 * would be a query per judge every few seconds against a database two hundred
 * milliseconds away. A button refreshes on the judge's terms, and the note beside it
 * says how stale what they are reading might be.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Counted up rather than measured against a clock: the label only needs to know
  // roughly how long ago this was, and a counter starting at zero renders identically
  // on the server and on the first client render. Date.now() during render would not.
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + TICK_SECONDS), TICK_SECONDS * 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-3">
      <span className="text-muted hidden text-xs sm:inline">
        {seconds < 45
          ? "Up to date"
          : seconds < 120
            ? "Updated a minute ago"
            : `Updated ${Math.round(seconds / 60)} minutes ago`}
      </span>

      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            router.refresh();
            setSeconds(0);
          })
        }
      >
        <RefreshCw size={14} className={cn(pending && "animate-spin")} />
        Refresh Data
      </Button>
    </div>
  );
}
