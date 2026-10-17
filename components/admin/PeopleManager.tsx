"use client";

/**
 * PeopleManager — admin screen for creating and managing student and
 * teacher accounts, including the bulk CSV import flow.
 */

import { useMemo, useState } from "react";
import { Plus, Upload, Pencil, Trash2, Search, Ban, CheckCircle, KeyRound, Mail, Send } from "lucide-react";
import PersonEditor from "./PersonEditor";
import BulkImportModal, { type ImportRow } from "./BulkImportModal";
import type { PersonRole, PersonRow } from "./types";

interface PeopleManagerProps {
  classOptions: { id: string; name: string }[];
  subjectOptions: { id: string; name: string }[];
  students: PersonRow[];
  teachers: PersonRow[];
  onCreate: (role: PersonRole, person: Omit<PersonRow, "id" | "isActive" | "subjectNames">) => Promise<{ credential?: string; invited?: boolean } | void>;
  onUpdate: (role: PersonRole, id: string, person: Omit<PersonRow, "id" | "isActive" | "subjectNames">) => Promise<void>;
  onToggleActive: (role: PersonRole, id: string, isActive: boolean) => Promise<void>;
  onDelete: (role: PersonRole, id: string) => Promise<void>;
  onResendAccess: (email: string) => Promise<void>;
  onBulkImport: (role: PersonRole, rows: ImportRow[]) => Promise<void>;
}

export default function PeopleManager({
  classOptions,
  subjectOptions,
  students,
  teachers,
  onCreate,
  onUpdate,
  onToggleActive,
  onDelete,
  onResendAccess,
  onBulkImport,
}: PeopleManagerProps) {
  const [tab, setTab] = useState<PersonRole>("student");
  const [search, setSearch] = useState("");
  const [editorState, setEditorState] = useState<"closed" | "new" | PersonRow>("closed");
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PersonRow | null>(null);
  const [createdStudent, setCreatedStudent] = useState<{ name: string; studentId: string } | null>(null);
  const [invitedTeacher, setInvitedTeacher] = useState<{ name: string; email: string } | null>(null);

  const classNameById = (id?: string) => classOptions.find((c) => c.id === id)?.name ?? "No class";

  const handleResendAccess = async (person: PersonRow) => {
    if (!person.email) return; // students have no email to resend to
    await onResendAccess(person.email);
    setInvitedTeacher({ name: person.fullName, email: person.email });
  };

  const people = tab === "student" ? students : teachers;
  const filtered = useMemo(
    () => people.filter((p) => !search.trim() || p.fullName.toLowerCase().includes(search.trim().toLowerCase())),
    [people, search]
  );

  const handleSave = async (person: Omit<PersonRow, "id" | "isActive" | "subjectNames"> & { id?: string }) => {
    if (person.id) {
      await onUpdate(tab, person.id, person);
    } else {
      const result = await onCreate(tab, person);
      if (tab === "student" && person.admissionNumber) setCreatedStudent({ name: person.fullName, studentId: person.admissionNumber });
      else if (result?.invited) setInvitedTeacher({ name: person.fullName, email: person.email ?? "" });
    }
    setEditorState("closed");
  };

  return (
    <div>
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-[18px] font-semibold text-ink dark:text-white sm:text-[20px]">Students &amp; teachers</h1>
          <p className="mt-0.5 text-[13px] text-ink/50 dark:text-white/50">{students.length} students · {teachers.length} teachers</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/15 px-3.5 py-2.5 text-[13px] font-medium text-ink/70 dark:text-white/70 hover:bg-background-muted dark:hover:bg-white/5"
          >
            <Upload size={15} /> Bulk import
          </button>
          <button
            onClick={() => setEditorState("new")}
            className="flex items-center gap-1.5 rounded-lg bg-crimson-600 px-3.5 py-2.5 text-[13px] font-semibold text-on-crimson hover:bg-crimson-700"
          >
            <Plus size={15} /> Add {tab}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 rounded-lg bg-background-muted dark:bg-white/5 p-1 sm:w-64">
          {(["student", "teacher"] as PersonRole[]).map((r) => (
            <button
              key={r}
              onClick={() => {
                setTab(r);
                setSearch("");
              }}
              className={`rounded-md py-2 text-[12.5px] font-semibold capitalize transition-colors duration-200 ${
                tab === r ? "bg-white dark:bg-[#1A1C20] text-crimson-700 dark:text-crimson-500 shadow-card" : "text-ink/50 dark:text-white/50"
              }`}
            >
              {r}s
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35 dark:text-white/35" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${tab}s`}
            className="w-full rounded-lg border border-black/10 dark:border-white/15 py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-crimson-500"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/15 bg-white dark:bg-[#1A1C20] px-4 py-10 text-center text-[13px] text-ink/45 dark:text-white/45">
          No {tab}s match. Add one, or bulk import from a CSV.
        </div>
      ) : (
        <div className="divide-y divide-black/5 dark:divide-white/10 rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-[#1A1C20]">
          {filtered.map((p) => (
            <div key={p.id} className="flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[13.5px] font-medium ${p.isActive ? "text-ink dark:text-white" : "text-ink/40 dark:text-white/40"}`}>{p.fullName}</p>
                <p className="truncate text-[12px] text-ink/50 dark:text-white/50">
                  {p.role === "student" ? `${classNameById(p.classId)} · ${p.admissionNumber}` : `${p.email} · ${p.staffId}${p.subjectNames?.length ? ` · ${p.subjectNames.join(", ")}` : ""}`}
                </p>
              </div>
              {!p.isActive && <span className="w-fit shrink-0 rounded-full bg-background-muted dark:bg-white/5 px-2 py-0.5 text-[11px] font-medium text-ink/50 dark:text-white/50">Inactive</span>}
              <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                <button onClick={() => setEditorState(p)} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-background-muted dark:hover:bg-white/5 hover:text-ink dark:hover:text-white" title="Edit">
                  <Pencil size={15} />
                </button>
                {p.role === "teacher" && (
                  <button onClick={() => handleResendAccess(p)} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-background-muted dark:hover:bg-white/5 hover:text-ink dark:hover:text-white" title="Resend access email">
                    <Send size={15} />
                  </button>
                )}
                <button
                  onClick={() => onToggleActive(tab, p.id, !p.isActive)}
                  className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-background-muted dark:hover:bg-white/5 hover:text-ink dark:hover:text-white"
                  title={p.isActive ? "Deactivate" : "Reactivate"}
                >
                  {p.isActive ? <Ban size={15} /> : <CheckCircle size={15} />}
                </button>
                <button onClick={() => setDeleteTarget(p)} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-crimson-50 dark:hover:bg-crimson-600/15 hover:text-crimson-700 dark:hover:text-crimson-500" title="Delete">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editorState !== "closed" && (
        <PersonEditor
          key={editorState === "new" ? "new" : editorState.id}
          role={tab}
          initial={editorState === "new" ? null : editorState}
          classOptions={classOptions}
          subjectOptions={subjectOptions}
          onSave={handleSave}
          onCancel={() => setEditorState("closed")}
        />
      )}

      {importOpen && (
        <BulkImportModal
          role={tab}
          classOptions={classOptions}
          subjectOptions={subjectOptions.map((s) => s.name)}
          onImport={(rows) => onBulkImport(tab, rows)}
          onClose={() => setImportOpen(false)}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white dark:bg-[#1A1C20] p-6 shadow-card-hover">
            <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">Delete {deleteTarget.fullName}?</h2>
            <p className="mt-1.5 text-[13px] text-ink/60 dark:text-white/60">
              This removes their account permanently. Consider deactivating instead if they might return.
            </p>
            <div className="mt-4 flex gap-2.5">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-lg border border-black/10 dark:border-white/15 py-2.5 text-[13px] font-medium text-ink/70 dark:text-white/70 hover:bg-background-muted dark:hover:bg-white/5">
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onDelete(tab, deleteTarget.id);
                  setDeleteTarget(null);
                }}
                className="flex-1 rounded-lg bg-crimson-600 py-2.5 text-[13px] font-semibold text-on-crimson hover:bg-crimson-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {createdStudent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white dark:bg-[#1A1C20] p-6 shadow-card-hover">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-crimson-50 dark:bg-crimson-600/15 text-crimson-700 dark:text-crimson-500">
              <KeyRound size={18} />
            </div>
            <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">Account created</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink/60 dark:text-white/60">
              No password to hand over — {createdStudent.name} signs in with their full name (not case-sensitive) and their student ID:
            </p>
            <p className="mt-3 rounded-md bg-background-muted dark:bg-white/5 px-3 py-2.5 text-center font-mono text-[15px] font-semibold text-ink dark:text-white">
              {createdStudent.studentId}
            </p>
            <button
              onClick={() => setCreatedStudent(null)}
              className="mt-4 w-full rounded-lg bg-crimson-600 py-2.5 text-[13px] font-semibold text-on-crimson hover:bg-crimson-700"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {invitedTeacher && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white dark:bg-[#1A1C20] p-6 shadow-card-hover">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-crimson-50 dark:bg-crimson-600/15 text-crimson-700 dark:text-crimson-500">
              <Mail size={18} />
            </div>
            <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">Invite sent</h2>
            <p className="mt-1.5 text-[13px] text-ink/60 dark:text-white/60">
              {invitedTeacher.name} will get an email at <span className="font-medium text-ink dark:text-white">{invitedTeacher.email}</span> to set their own password and sign in.
            </p>
            <button
              onClick={() => setInvitedTeacher(null)}
              className="mt-4 w-full rounded-lg bg-crimson-600 py-2.5 text-[13px] font-semibold text-on-crimson hover:bg-crimson-700"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
