"use client";

/**
 * AcademicsManager — the school's structural setup: academic sessions and
 * their terms, classes, and subjects (with which classes offer each one).
 * Maps to `academic_sessions`, `terms`, `classes`, `subjects`, and
 * `class_subjects` in database/schema.sql.
 */

import { useState } from "react";
import { Plus, Pencil, Trash2, Star, ChevronDown, ChevronRight } from "lucide-react";
import { ClassEditor, SessionEditor, SubjectEditor, TermEditor } from "./AcademicsEditors";
import type { ClassRow, SessionRow, SubjectRow, TermRow } from "./types";

type Tab = "sessions" | "classes" | "subjects";

interface AcademicsManagerProps {
  sessions: SessionRow[];
  terms: TermRow[];
  classes: ClassRow[];
  subjects: SubjectRow[];
  onSaveSession: (s: Omit<SessionRow, "id"> & { id?: string }) => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  onSaveTerm: (sessionId: string, t: Omit<TermRow, "id" | "sessionId"> & { id?: string }) => Promise<void>;
  onDeleteTerm: (id: string) => Promise<void>;
  onSaveClass: (c: Omit<ClassRow, "id" | "studentCount"> & { id?: string }) => Promise<void>;
  onDeleteClass: (id: string) => Promise<void>;
  onSaveSubject: (s: Omit<SubjectRow, "id"> & { id?: string }) => Promise<void>;
  onDeleteSubject: (id: string) => Promise<void>;
}

export default function AcademicsManager({
  sessions,
  terms,
  classes,
  subjects,
  onSaveSession,
  onDeleteSession,
  onSaveTerm,
  onDeleteTerm,
  onSaveClass,
  onDeleteClass,
  onSaveSubject,
  onDeleteSubject,
}: AcademicsManagerProps) {
  const [tab, setTab] = useState<Tab>("sessions");

  return (
    <div className="pb-10">
      <h1 className="font-display text-[18px] font-semibold text-ink dark:text-white sm:text-[20px]">Classes &amp; subjects</h1>
      <p className="mt-0.5 text-[13px] text-ink/50 dark:text-white/50">Academic structure the rest of the platform builds on.</p>

      <div className="mt-4 mb-5 grid w-full max-w-md grid-cols-3 rounded-lg bg-background-muted dark:bg-white/5 p-1">
        {([["sessions", "Sessions & terms"], ["classes", "Classes"], ["subjects", "Subjects"]] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md py-2 text-[12px] font-semibold transition-colors duration-200 ${tab === t ? "bg-white dark:bg-[#1A1C20] text-crimson-700 dark:text-crimson-500 shadow-card" : "text-ink/50 dark:text-white/50"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "sessions" && (
        <SessionsTab sessions={sessions} terms={terms} onSaveSession={onSaveSession} onDeleteSession={onDeleteSession} onSaveTerm={onSaveTerm} onDeleteTerm={onDeleteTerm} />
      )}
      {tab === "classes" && <ClassesTab classes={classes} onSave={onSaveClass} onDelete={onDeleteClass} />}
      {tab === "subjects" && <SubjectsTab subjects={subjects} classes={classes} onSave={onSaveSubject} onDelete={onDeleteSubject} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SessionsTab({ sessions, terms, onSaveSession, onDeleteSession, onSaveTerm, onDeleteTerm }: {
  sessions: SessionRow[];
  terms: TermRow[];
  onSaveSession: AcademicsManagerProps["onSaveSession"];
  onDeleteSession: AcademicsManagerProps["onDeleteSession"];
  onSaveTerm: AcademicsManagerProps["onSaveTerm"];
  onDeleteTerm: AcademicsManagerProps["onDeleteTerm"];
}) {
  const [expanded, setExpanded] = useState<string | null>(sessions.find((s) => s.isCurrent)?.id ?? sessions[0]?.id ?? null);
  const [sessionEditor, setSessionEditor] = useState<"closed" | "new" | SessionRow>("closed");
  const [termEditor, setTermEditor] = useState<{ sessionId: string; term: "new" | TermRow } | null>(null);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button onClick={() => setSessionEditor("new")} className="flex items-center gap-1.5 rounded-lg bg-crimson-600 px-3.5 py-2 text-[12.5px] font-semibold text-on-crimson hover:bg-crimson-700">
          <Plus size={14} /> New session
        </button>
      </div>

      <div className="space-y-2.5">
        {sessions.map((session) => {
          const sessionTerms = terms.filter((t) => t.sessionId === session.id);
          const isOpen = expanded === session.id;
          return (
            <div key={session.id} className="rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-[#1A1C20]">
              <button onClick={() => setExpanded(isOpen ? null : session.id)} className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left">
                {isOpen ? <ChevronDown size={15} className="text-ink/40 dark:text-white/40" /> : <ChevronRight size={15} className="text-ink/40 dark:text-white/40" />}
                <span className="flex-1 text-[13.5px] font-medium text-ink dark:text-white">{session.name}</span>
                {session.isCurrent && (
                  <span className="flex items-center gap-1 rounded-full bg-crimson-50 dark:bg-crimson-600/15 px-2 py-0.5 text-[11px] font-semibold text-crimson-700 dark:text-crimson-500">
                    <Star size={10} fill="currentColor" /> Current
                  </span>
                )}
                <span onClick={(e) => { e.stopPropagation(); setSessionEditor(session); }} className="rounded-md p-1 text-ink/40 dark:text-white/40 hover:bg-background-muted dark:hover:bg-white/5 hover:text-ink dark:hover:text-white">
                  <Pencil size={14} />
                </span>
                <span onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }} className="rounded-md p-1 text-ink/40 dark:text-white/40 hover:bg-crimson-50 dark:hover:bg-crimson-600/15 hover:text-crimson-700 dark:hover:text-crimson-500">
                  <Trash2 size={14} />
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-black/5 dark:border-white/10 px-4 py-3">
                  {sessionTerms.length === 0 ? (
                    <p className="py-2 text-[12.5px] text-ink/40 dark:text-white/40">No terms yet.</p>
                  ) : (
                    <div className="divide-y divide-black/5 dark:divide-white/10">
                      {sessionTerms.map((term) => (
                        <div key={term.id} className="flex items-center gap-2.5 py-2.5">
                          <span className="flex-1 text-[13px] text-ink dark:text-white">{term.name}</span>
                          {term.startsOn && term.endsOn && <span className="text-[11.5px] text-ink/40 dark:text-white/40">{term.startsOn} – {term.endsOn}</span>}
                          {term.isCurrent && <Star size={12} className="text-crimson-600" fill="currentColor" />}
                          <button onClick={() => setTermEditor({ sessionId: session.id, term })} className="rounded-md p-1 text-ink/40 dark:text-white/40 hover:bg-background-muted dark:hover:bg-white/5 hover:text-ink dark:hover:text-white">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => onDeleteTerm(term.id)} className="rounded-md p-1 text-ink/40 dark:text-white/40 hover:bg-crimson-50 dark:hover:bg-crimson-600/15 hover:text-crimson-700 dark:hover:text-crimson-500">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setTermEditor({ sessionId: session.id, term: "new" })}
                    className="mt-2.5 flex items-center gap-1.5 text-[12px] font-medium text-crimson-700 dark:text-crimson-500 hover:text-crimson-800"
                  >
                    <Plus size={13} /> Add term
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sessionEditor !== "closed" && (
        <SessionEditor
          key={sessionEditor === "new" ? "new" : sessionEditor.id}
          initial={sessionEditor === "new" ? null : sessionEditor}
          onSave={async (s) => {
            await onSaveSession(s);
            setSessionEditor("closed");
          }}
          onCancel={() => setSessionEditor("closed")}
        />
      )}

      {termEditor && (
        <TermEditor
          key={termEditor.term === "new" ? "new" : termEditor.term.id}
          initial={termEditor.term === "new" ? null : termEditor.term}
          onSave={async (t) => {
            await onSaveTerm(termEditor.sessionId, t);
            setTermEditor(null);
          }}
          onCancel={() => setTermEditor(null)}
        />
      )}
    </div>
  );
}

function ClassesTab({ classes, onSave, onDelete }: { classes: ClassRow[]; onSave: AcademicsManagerProps["onSaveClass"]; onDelete: AcademicsManagerProps["onDeleteClass"] }) {
  const [editor, setEditor] = useState<"closed" | "new" | ClassRow>("closed");

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button onClick={() => setEditor("new")} className="flex items-center gap-1.5 rounded-lg bg-crimson-600 px-3.5 py-2 text-[12.5px] font-semibold text-on-crimson hover:bg-crimson-700">
          <Plus size={14} /> New class
        </button>
      </div>
      <div className="divide-y divide-black/5 dark:divide-white/10 rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-[#1A1C20]">
        {classes.map((c) => (
          <div key={c.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-ink dark:text-white">{c.name}</p>
              <p className="text-[12px] text-ink/45 dark:text-white/45">{c.level} · {c.studentCount} students</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
              <button onClick={() => setEditor(c)} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-background-muted dark:hover:bg-white/5 hover:text-ink dark:hover:text-white">
                <Pencil size={15} />
              </button>
              <button onClick={() => onDelete(c.id)} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-crimson-50 dark:hover:bg-crimson-600/15 hover:text-crimson-700 dark:hover:text-crimson-500">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editor !== "closed" && (
        <ClassEditor
          key={editor === "new" ? "new" : editor.id}
          initial={editor === "new" ? null : editor}
          onSave={async (c) => {
            await onSave(c);
            setEditor("closed");
          }}
          onCancel={() => setEditor("closed")}
        />
      )}
    </div>
  );
}

function SubjectsTab({ subjects, classes, onSave, onDelete }: {
  subjects: SubjectRow[];
  classes: ClassRow[];
  onSave: AcademicsManagerProps["onSaveSubject"];
  onDelete: AcademicsManagerProps["onDeleteSubject"];
}) {
  const [editor, setEditor] = useState<"closed" | "new" | SubjectRow>("closed");
  const classNameById = (id: string) => classes.find((c) => c.id === id)?.name ?? id;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button onClick={() => setEditor("new")} className="flex items-center gap-1.5 rounded-lg bg-crimson-600 px-3.5 py-2 text-[12.5px] font-semibold text-on-crimson hover:bg-crimson-700">
          <Plus size={14} /> New subject
        </button>
      </div>
      <div className="divide-y divide-black/5 dark:divide-white/10 rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-[#1A1C20]">
        {subjects.map((s) => (
          <div key={s.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-ink dark:text-white">{s.name}{s.code ? ` (${s.code})` : ""}</p>
              <p className="truncate text-[12px] text-ink/45 dark:text-white/45">{s.classIds.length === 0 ? "Not assigned to a class yet" : s.classIds.map(classNameById).join(", ")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
              <button onClick={() => setEditor(s)} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-background-muted dark:hover:bg-white/5 hover:text-ink dark:hover:text-white">
                <Pencil size={15} />
              </button>
              <button onClick={() => onDelete(s.id)} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-crimson-50 dark:hover:bg-crimson-600/15 hover:text-crimson-700 dark:hover:text-crimson-500">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editor !== "closed" && (
        <SubjectEditor
          key={editor === "new" ? "new" : editor.id}
          initial={editor === "new" ? null : editor}
          classOptions={classes}
          onSave={async (s) => {
            await onSave(s);
            setEditor("closed");
          }}
          onCancel={() => setEditor("closed")}
        />
      )}
    </div>
  );
}
