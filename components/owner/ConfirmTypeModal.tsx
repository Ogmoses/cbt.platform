"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

/**
 * A "you really mean it" dialog for irreversible actions: the button stays
 * disabled until the person types the confirmation word exactly, so a stray
 * tap can't trigger it. Mistakes inside the typed word are forgiven for case
 * only.
 */
export default function ConfirmTypeModal({
  title,
  children,
  confirmWord,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  confirmWord: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === confirmWord.toLowerCase();

  const run = async () => {
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Nothing was changed.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" onClick={busy ? undefined : onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-card-hover dark:bg-[#1A1C20] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15">
              <AlertTriangle size={18} />
            </span>
            <h3 className="font-display text-[16px] font-semibold text-ink dark:text-white">{title}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="text-ink/40 hover:text-ink disabled:opacity-40 dark:text-white/40">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2.5 text-[13.5px] leading-relaxed text-ink/75 dark:text-white/75">{children}</div>

        <label className="mt-4 block">
          <span className="mb-1 block text-[12px] font-medium text-ink/60 dark:text-white/60">
            To confirm, type <strong className="font-mono text-red-600">{confirmWord}</strong>
          </span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            className="w-full rounded-lg border border-black/10 px-3 py-2.5 font-mono text-[14px] outline-none focus:border-red-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
          />
        </label>

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700 dark:bg-red-500/15 dark:text-red-400">{error}</p>}

        <div className="mt-4 flex gap-2.5">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-lg bg-background-muted py-2.5 text-[13.5px] font-medium text-ink disabled:opacity-50 dark:bg-white/5 dark:text-white">
            Cancel
          </button>
          <button
            type="button"
            onClick={run}
            disabled={!matches || busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-[13.5px] font-semibold text-white transition-opacity disabled:opacity-35"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
