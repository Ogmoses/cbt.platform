"use client";

/**
 * Small create/edit modals for Academics: sessions, terms, classes,
 * subjects. Mount each with a `key` tied to the row's id (or "new") so
 * form state resets cleanly per item — same pattern as PersonEditor.
 */

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { ClassRow, SessionRow, SubjectRow, TermRow } from "./types";

function Shell({ title, onCancel, onSubmit, saving, error, children }: {
  title: string;
  onCancel: () => void;
  onSubmit: () => void;
  saving: boolean;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white dark:bg-[#1A1C20] shadow-card-hover">
        <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 px-5 py-4">
          <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">{title}</h2>
          <button onClick={onCancel} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-background-muted dark:hover:bg-white/5">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3.5 px-5 py-4">
          {children}
          {error && <p className="rounded-md bg-crimson-50 dark:bg-crimson-600/15 px-3 py-2 text-[12.5px] text-crimson-700 dark:text-crimson-500">{error}</p>}
        </div>
        <div className="flex gap-2.5 border-t border-black/5 dark:border-white/10 px-5 py-4">
          <button onClick={onCancel} disabled={saving} className="flex-1 rounded-lg border border-black/10 dark:border-white/15 py-2.5 text-[13px] font-medium text-ink/70 dark:text-white/70 hover:bg-background-muted dark:hover:bg-white/5 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onSubmit} disabled={saving} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-crimson-600 py-2.5 text-[13px] font-semibold text-on-crimson hover:bg-crimson-700 disabled:opacity-70">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-ink/60 dark:text-white/60">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-black/10 dark:border-white/15 px-3.5 py-2.5 text-[13px] outline-none focus:border-crimson-500"
      />
    </label>
  );
}

function CurrentToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg bg-background-muted dark:bg-white/5 px-3.5 py-2.5">
      <span className="text-[13px] text-ink/75 dark:text-white/75">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-crimson-600" : "bg-black/15"}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white dark:bg-[#1A1C20] shadow-sm transition-transform duration-200 ${checked ? "translate-x-[16px]" : "translate-x-0"}`} />
      </button>
    </label>
  );
}

// ---------------------------------------------------------------------------

export function SessionEditor({ initial, onSave, onCancel }: { initial?: SessionRow | null; onSave: (s: Omit<SessionRow, "id"> & { id?: string }) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [isCurrent, setIsCurrent] = useState(initial?.isCurrent ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return setError("Name the session, e.g. 2025/2026.");
    setSaving(true);
    try {
      await onSave({ id: initial?.id, name: name.trim(), isCurrent });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title={initial ? "Edit session" : "New academic session"} onCancel={onCancel} onSubmit={submit} saving={saving} error={error}>
      <TextInput label="Name" value={name} onChange={setName} placeholder="e.g. 2025/2026" />
      <CurrentToggle checked={isCurrent} onChange={setIsCurrent} label="Set as current session" />
    </Shell>
  );
}

export function TermEditor({ initial, onSave, onCancel }: { initial?: TermRow | null; onSave: (t: Omit<TermRow, "id" | "sessionId"> & { id?: string }) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "First Term");
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? "");
  const [isCurrent, setIsCurrent] = useState(initial?.isCurrent ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return setError("Name the term.");
    setSaving(true);
    try {
      await onSave({ id: initial?.id, name: name.trim(), startsOn, endsOn, isCurrent });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title={initial ? "Edit term" : "New term"} onCancel={onCancel} onSubmit={submit} saving={saving} error={error}>
      <label className="block">
        <span className="mb-1 block text-[12px] font-medium text-ink/60 dark:text-white/60">Name</span>
        <select value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-black/10 dark:border-white/15 px-3 py-2.5 text-[13px] outline-none focus:border-crimson-500">
          {["First Term", "Second Term", "Third Term"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <TextInput label="Starts" value={startsOn} onChange={setStartsOn} type="date" />
        <TextInput label="Ends" value={endsOn} onChange={setEndsOn} type="date" />
      </div>
      <CurrentToggle checked={isCurrent} onChange={setIsCurrent} label="Set as current term" />
    </Shell>
  );
}

export function ClassEditor({ initial, onSave, onCancel }: { initial?: ClassRow | null; onSave: (c: Omit<ClassRow, "id" | "studentCount"> & { id?: string }) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [level, setLevel] = useState(initial?.level ?? "Junior");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return setError("Name the class, e.g. JSS1.");
    setSaving(true);
    try {
      await onSave({ id: initial?.id, name: name.trim(), level });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title={initial ? "Edit class" : "New class"} onCancel={onCancel} onSubmit={submit} saving={saving} error={error}>
      <TextInput label="Name" value={name} onChange={setName} placeholder="e.g. JSS1" />
      <label className="block">
        <span className="mb-1 block text-[12px] font-medium text-ink/60 dark:text-white/60">Level</span>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="w-full rounded-lg border border-black/10 dark:border-white/15 px-3 py-2.5 text-[13px] outline-none focus:border-crimson-500">
          <option value="Junior">Junior</option>
          <option value="Senior">Senior</option>
        </select>
      </label>
    </Shell>
  );
}

export function SubjectEditor({ initial, classOptions, onSave, onCancel }: {
  initial?: SubjectRow | null;
  classOptions: ClassRow[];
  onSave: (s: Omit<SubjectRow, "id"> & { id?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [classIds, setClassIds] = useState<string[]>(initial?.classIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleClass = (id: string) => setClassIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const submit = async () => {
    if (!name.trim()) return setError("Name the subject.");
    setSaving(true);
    try {
      await onSave({ id: initial?.id, name: name.trim(), code: code.trim() || undefined, classIds });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title={initial ? "Edit subject" : "New subject"} onCancel={onCancel} onSubmit={submit} saving={saving} error={error}>
      <TextInput label="Name" value={name} onChange={setName} placeholder="e.g. Mathematics" />
      <TextInput label="Code (optional)" value={code} onChange={setCode} placeholder="e.g. MTH101" />
      <div>
        <span className="mb-1.5 block text-[12px] font-medium text-ink/60 dark:text-white/60">Offered to</span>
        <div className="flex flex-wrap gap-1.5">
          {classOptions.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleClass(c.id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors duration-200 ${
                classIds.includes(c.id) ? "bg-crimson-600 text-on-crimson" : "bg-background-muted dark:bg-white/5 text-ink/60 dark:text-white/60 hover:bg-black/5"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );
}
