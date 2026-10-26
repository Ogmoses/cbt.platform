"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, X, Link2, Check, Pause, Play, BadgeCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Status = "pending" | "active" | "suspended";

interface SchoolStats {
  school_id: string;
  name: string;
  code: string;
  status: Status;
  created_at: string;
  students: number;
  teachers: number;
  exams: number;
  exam_sessions: number;
}

const STATUS_STYLE: Record<Status, string> = {
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  active: "bg-success/10 text-success",
  suspended: "bg-crimson-50 text-crimson-700 dark:bg-crimson-600/15 dark:text-crimson-500",
};
const STATUS_ORDER: Record<Status, number> = { pending: 0, active: 1, suspended: 2 };

/** "Bright Future Academy" -> "bright-future-academy" (3–40 chars, as the database requires) */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export default function OwnerSchools() {
  const supabase = useMemo(() => createClient(), []);
  const [schools, setSchools] = useState<SchoolStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    // Returns rows only for the platform owner (enforced in the database).
    const { data, error: rpcError } = await supabase.rpc("platform_school_stats");
    if (rpcError) {
      setError("Couldn't load schools. Try again.");
      return;
    }
    setError(null);
    setSchools((data ?? []) as SchoolStats[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: "approve" | "suspend" | "reactivate") => {
    if (action === "suspend" && !window.confirm("Suspend this school? Nobody there will be able to sign in or use the platform until you reactivate it.")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/owner/schools", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't update the school.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the school.");
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (s: SchoolStats) => {
    const link = `${window.location.origin}/s/${s.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(s.school_id);
      setTimeout(() => setCopiedId((c) => (c === s.school_id ? null : c)), 2000);
    } catch {
      window.prompt("Copy this school's link:", link);
    }
  };

  const sorted = useMemo(
    () => [...(schools ?? [])].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name)),
    [schools]
  );
  const totals = useMemo(() => {
    const list = schools ?? [];
    return {
      schools: list.length,
      pending: list.filter((s) => s.status === "pending").length,
      students: list.reduce((n, s) => n + Number(s.students), 0),
      teachers: list.reduce((n, s) => n + Number(s.teachers), 0),
    };
  }, [schools]);

  if (!schools && !error) {
    return (
      <div className="flex items-center justify-center py-20 text-ink/40 dark:text-white/40">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Schools", totals.schools],
          ["Awaiting approval", totals.pending],
          ["Students", totals.students],
          ["Teachers", totals.teachers],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg bg-white p-4 shadow-card dark:bg-[#1A1C20]">
            <p className="text-[12px] text-ink/50 dark:text-white/50">{label}</p>
            <p className="mt-1 font-display text-[22px] font-semibold text-ink dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">All schools</h2>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-lg bg-crimson-600 px-3.5 py-2 text-[13px] font-medium text-on-crimson hover:bg-crimson-700"
        >
          <Plus size={15} /> Add school
        </button>
      </div>

      {error && <p className="rounded-md bg-crimson-50 px-3 py-2 text-[12.5px] text-crimson-700 dark:bg-crimson-600/15 dark:text-crimson-500">{error}</p>}

      <div className="space-y-3">
        {sorted.map((s) => (
          <div key={s.school_id} className="rounded-lg bg-white p-4 shadow-card dark:bg-[#1A1C20]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-display text-[14.5px] font-semibold text-ink dark:text-white">{s.name}</p>
                <p className="mt-0.5 truncate text-[12px] text-ink/45 dark:text-white/45">/s/{s.code}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${STATUS_STYLE[s.status]}`}>{s.status}</span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[
                ["Students", s.students],
                ["Teachers", s.teachers],
                ["Exams", s.exams],
                ["Sittings", s.exam_sessions],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-md bg-background-muted py-2 dark:bg-white/5">
                  <p className="text-[15px] font-semibold text-ink dark:text-white">{Number(value)}</p>
                  <p className="text-[10.5px] text-ink/45 dark:text-white/45">{label}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyLink(s)}
                className="flex items-center gap-1.5 rounded-md bg-background-muted px-3 py-1.5 text-[12px] font-medium text-ink/70 hover:text-crimson-600 dark:bg-white/5 dark:text-white/70"
              >
                {copiedId === s.school_id ? <Check size={13} /> : <Link2 size={13} />}
                {copiedId === s.school_id ? "Copied" : "Copy link"}
              </button>
              {s.status === "pending" && (
                <button type="button" disabled={busyId === s.school_id} onClick={() => act(s.school_id, "approve")} className="flex items-center gap-1.5 rounded-md bg-crimson-600 px-3 py-1.5 text-[12px] font-medium text-on-crimson disabled:opacity-60">
                  {busyId === s.school_id ? <Loader2 size={13} className="animate-spin" /> : <BadgeCheck size={13} />} Approve
                </button>
              )}
              {s.status === "active" && (
                <button type="button" disabled={busyId === s.school_id} onClick={() => act(s.school_id, "suspend")} className="flex items-center gap-1.5 rounded-md bg-background-muted px-3 py-1.5 text-[12px] font-medium text-ink/70 hover:text-crimson-600 disabled:opacity-60 dark:bg-white/5 dark:text-white/70">
                  {busyId === s.school_id ? <Loader2 size={13} className="animate-spin" /> : <Pause size={13} />} Suspend
                </button>
              )}
              {s.status === "suspended" && (
                <button type="button" disabled={busyId === s.school_id} onClick={() => act(s.school_id, "reactivate")} className="flex items-center gap-1.5 rounded-md bg-crimson-600 px-3 py-1.5 text-[12px] font-medium text-on-crimson disabled:opacity-60">
                  {busyId === s.school_id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Reactivate
                </button>
              )}
            </div>
          </div>
        ))}
        {sorted.length === 0 && <p className="py-10 text-center text-[13px] text-ink/45 dark:text-white/45">No schools yet.</p>}
      </div>

      {showAdd && (
        <AddSchoolModal
          onClose={() => setShowAdd(false)}
          onAdded={async () => {
            setShowAdd(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AddSchoolModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeEdited, setCodeEdited] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    link: string;
    name: string;
    emailSent: boolean;
    emailError: string | null;
    adminEmail: string;
    inviteLink: string | null;
    expiresInHours: number;
  } | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, adminName, adminEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't add the school.");
      setResult({
        link: data.link,
        name: data.school.name,
        emailSent: data.emailSent,
        emailError: data.emailError,
        adminEmail: data.adminEmail,
        inviteLink: data.inviteLink,
        expiresInHours: data.expiresInHours,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the school.");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-lg border border-black/10 px-3 py-2.5 text-[14px] outline-none focus:border-crimson-500 dark:border-white/15 dark:bg-white/5 dark:text-white";
  const label = "mb-1 block text-[12px] font-medium text-ink/60 dark:text-white/60";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={result ? undefined : onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-card-hover dark:bg-[#1A1C20] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-[16px] font-semibold text-ink dark:text-white">{result ? "School added" : "Add a school"}</h3>
          <button type="button" onClick={result ? onAdded : onClose} aria-label="Close" className="text-ink/40 hover:text-ink dark:text-white/40">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="space-y-3 text-[13.5px] text-ink/70 dark:text-white/70">
            <p>
              <strong className="text-ink dark:text-white">{result.name}</strong> is active.{" "}
              {result.emailSent ? `An invite email is on its way to ${result.adminEmail}.` : "The school and its admin account were created, but the invite email could not be sent."}
            </p>
            {!result.emailSent && result.inviteLink && (
              <div className="space-y-2 rounded-md bg-amber-50 p-3 dark:bg-amber-500/15">
                <p className="text-[12.5px] text-amber-800 dark:text-amber-300">
                  Send this invite link to {result.adminEmail} yourself (it works once and expires in {result.expiresInHours} hours). They use it to set their password.
                </p>
                <p className="break-all rounded bg-white px-2.5 py-2 font-mono text-[11.5px] text-ink dark:bg-black/30 dark:text-white">{result.inviteLink}</p>
                <button type="button" onClick={() => navigator.clipboard?.writeText(result.inviteLink!)} className="w-full rounded-md bg-amber-600 py-2 text-[12.5px] font-medium text-white">
                  Copy invite link
                </button>
                {result.emailError && <p className="text-[11px] text-amber-700/80 dark:text-amber-300/70">Email error: {result.emailError}</p>}
              </div>
            )}
            <p>The school's own link:</p>
            <p className="break-all rounded-md bg-background-muted px-3 py-2 font-mono text-[12.5px] text-ink dark:bg-white/5 dark:text-white">{result.link}</p>
            <button type="button" onClick={() => navigator.clipboard?.writeText(result.link)} className="w-full rounded-lg bg-background-muted py-2.5 text-[13px] font-medium text-ink dark:bg-white/5 dark:text-white">
              Copy link
            </button>
            <button type="button" onClick={onAdded} className="w-full rounded-lg bg-crimson-600 py-2.5 text-[13px] font-medium text-on-crimson">
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div>
              <label className={label}>School name</label>
              <input
                className={input}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!codeEdited) setCode(slugify(e.target.value));
                }}
                placeholder="Bright Future Academy"
              />
            </div>
            <div>
              <label className={label}>School code (part of its link — can't be changed later)</label>
              <input
                className={input}
                value={code}
                onChange={(e) => {
                  setCodeEdited(true);
                  setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                }}
                placeholder="bright-future-academy"
              />
              <p className="mt-1 text-[11.5px] text-ink/45 dark:text-white/45">Their link will be …/s/{code || "school-code"}</p>
            </div>
            <div>
              <label className={label}>First admin's name</label>
              <input className={input} value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Mrs. Ada Okafor" />
            </div>
            <div>
              <label className={label}>First admin's email</label>
              <input className={input} type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@theirschool.com" />
            </div>
            {error && <p className="rounded-md bg-crimson-50 px-3 py-2 text-[12.5px] text-crimson-700 dark:bg-crimson-600/15 dark:text-crimson-500">{error}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={saving || !name.trim() || !code || !adminName.trim() || !adminEmail.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-crimson-600 py-2.5 text-[14px] font-medium text-on-crimson disabled:opacity-50"
            >
              {saving && <Loader2 size={15} className="animate-spin" />} {saving ? "Adding…" : "Add school & invite admin"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
