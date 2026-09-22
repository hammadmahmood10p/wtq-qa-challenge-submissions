"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Built on the native <dialog> element, so focus trapping, Escape-to-close and the
 * inert backdrop come from the browser rather than from code we would have to get
 * right ourselves. That matters for the confirmation modals: a keyboard user must not
 * be able to tab onto the page behind a "this cannot be undone" prompt.
 */
export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Fired by Escape as well as by dialog.close().
      onClose={onClose}
      // Clicking the backdrop lands on the <dialog> itself rather than its contents.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "bg-surface text-text border-border shadow-(--shadow-raised) m-auto w-[calc(100vw-2rem)] max-w-lg rounded-(--radius-card) border p-0",
        "backdrop:bg-black/50 backdrop:backdrop-blur-sm",
        className,
      )}
    >
      <div className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-display font-semibold">{title}</h2>
          {description && <p className="text-muted mt-1 text-sm">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted hover:text-text shrink-0 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-5 py-5">{children}</div>
    </dialog>
  );
}
