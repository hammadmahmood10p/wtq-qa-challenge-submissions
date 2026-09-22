"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pageCount,
  total,
  noun,
}: {
  page: number;
  pageCount: number;
  total: number;
  noun: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function goTo(next: number) {
    const updated = new URLSearchParams(params.toString());
    if (next <= 1) updated.delete("page");
    else updated.set("page", String(next));
    router.push(`${pathname}?${updated.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Stating the total matters at this scale: "page 3 of 40" is how an admin
          knows a filter actually narrowed anything. */}
      <p className="text-muted text-sm">
        {total.toLocaleString()} {noun}
        {pageCount > 1 && (
          <>
            {" · "}page {page} of {pageCount}
          </>
        )}
      </p>

      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => goTo(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft size={15} />
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => goTo(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
          >
            Next
            <ChevronRight size={15} />
          </Button>
        </div>
      )}
    </div>
  );
}
