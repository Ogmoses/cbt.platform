"use client";

/**
 * QuestionBankManager — browse, filter, create, edit, and delete questions.
 * Pair with QuestionEditor (the modal form) and the `questions` table in
 * database/schema.sql.
 */

import { useMemo, useState } from "react";
import MathText from "@/components/common/MathText";
import { Plus, Pencil, Trash2, Search, ImageIcon, AlertCircle } from "lucide-react";
import QuestionEditor from "./QuestionEditor";
import { QUESTION_TYPE_LABEL, type BankQuestion, type ClassOption, type SubjectOption } from "./types";

interface QuestionBankManagerProps {
  subjects: SubjectOption[];
  classes: ClassOption[];
  questions: BankQuestion[];
  onCreate: (q: Omit<BankQuestion, "id" | "updatedAt" | "subjectName" | "className">) => Promise<void>;
  onUpdate: (id: string, q: Omit<BankQuestion, "id" | "updatedAt" | "subjectName" | "className">) => Promise<{ warning?: string } | void>;
  onDelete: (id: string) => Promise<void>;
}

export default function QuestionBankManager({ subjects, classes, questions, onCreate, onUpdate, onDelete }: QuestionBankManagerProps) {
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editorState, setEditorState] = useState<"closed" | "new" | BankQuestion>("closed");
  const [deleteTarget, setDeleteTarget] = useState<BankQuestion | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  const unclassifiedCount = useMemo(() => questions.filter((q) => !q.classId).length, [questions]);

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (subjectFilter !== "all" && q.subjectId !== subjectFilter) return false;
      if (classFilter === "unclassified" && q.classId) return false;
      if (classFilter !== "all" && classFilter !== "unclassified" && q.classId !== classFilter) return false;
      if (search.trim() && !q.prompt.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [questions, subjectFilter, classFilter, search]);

  const handleSave = async (data: Omit<BankQuestion, "id" | "updatedAt" | "subjectName" | "className"> & { id?: string }) => {
    if (data.id) {
      const result = await onUpdate(data.id, data);
      setEditorState("closed");
      setSaveWarning(result?.warning ?? null);
    } else {
      await onCreate(data);
      // Stays open on create — QuestionEditor resets its own per-question
      // fields and keeps taking entries instead of forcing a full reopen
      // for every question in a batch.
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-[18px] font-semibold text-ink dark:text-white sm:text-[20px]">Question bank</h1>
          <p className="mt-0.5 text-[13px] text-ink/50 dark:text-white/50">{questions.length} question{questions.length === 1 ? "" : "s"} across your subjects</p>
        </div>
        <button
          onClick={() => setEditorState("new")}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-crimson-600 px-4 py-2.5 text-[13px] font-semibold text-on-crimson transition-colors duration-200 hover:bg-crimson-700"
        >
          <Plus size={16} /> New question
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35 dark:text-white/35" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search question text"
            className="w-full rounded-lg border border-black/10 dark:border-white/15 py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-crimson-500"
          />
        </div>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="rounded-lg border border-black/10 dark:border-white/15 px-3 py-2.5 text-[13px] outline-none focus:border-crimson-500"
        >
          <option value="all">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="rounded-lg border border-black/10 dark:border-white/15 px-3 py-2.5 text-[13px] outline-none focus:border-crimson-500"
        >
          <option value="all">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          {unclassifiedCount > 0 && <option value="unclassified">Unclassified ({unclassifiedCount})</option>}
        </select>
      </div>

      {saveWarning && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-[12.5px] text-ink/75 dark:text-white/75">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-warning" />
          <span className="flex-1">{saveWarning}</span>
          <button onClick={() => setSaveWarning(null)} className="text-ink/40 dark:text-white/40 hover:text-ink/60 dark:hover:text-white/60">
            Dismiss
          </button>
        </div>
      )}

      {unclassifiedCount > 0 && classFilter !== "unclassified" && (
        <button
          onClick={() => setClassFilter("unclassified")}
          className="mb-4 flex w-full items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-left text-[12.5px] text-ink/75 dark:text-white/75 transition-colors hover:bg-warning/15"
        >
          <AlertCircle size={15} className="shrink-0 text-warning" />
          {unclassifiedCount} question{unclassifiedCount === 1 ? "" : "s"} from before class-tagging {unclassifiedCount === 1 ? "doesn't" : "don't"} have a class yet — tap to review
        </button>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/15 bg-white dark:bg-[#1A1C20] px-4 py-10 text-center text-[13px] text-ink/45 dark:text-white/45">
          No questions match. Try a different filter, or add your first question.
        </div>
      ) : (
        <div className="divide-y divide-black/5 dark:divide-white/10 rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-[#1A1C20]">
          {filtered.map((q) => (
            <div key={q.id} className="flex items-start gap-3.5 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-cream-100 px-2 py-0.5 text-[10.5px] font-semibold text-crimson-700 dark:text-crimson-500">
                    {QUESTION_TYPE_LABEL[q.type]}
                  </span>
                  <span className="text-[11.5px] text-ink/40 dark:text-white/40">{q.subjectName}{q.topic ? ` · ${q.topic}` : ""}</span>
                  {q.classId ? (
                    <span className="rounded-full bg-background-muted dark:bg-white/5 px-2 py-0.5 text-[10.5px] font-medium text-ink/55 dark:text-white/55">{q.className}</span>
                  ) : (
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10.5px] font-medium text-warning">Unclassified</span>
                  )}
                  {q.imageUrl && <ImageIcon size={12} className="text-ink/30 dark:text-white/30" />}
                </div>
                <MathText text={q.prompt} className="block break-words text-[13.5px] text-ink dark:text-white" />
              </div>
              <span className="shrink-0 pt-0.5 text-[12px] font-medium text-ink/40 dark:text-white/40">{q.points} pt{q.points === 1 ? "" : "s"}</span>
              <div className="flex shrink-0 items-center gap-1 pt-0.5">
                <button onClick={() => setEditorState(q)} className="rounded-md p-1.5 text-ink/40 dark:text-white/40 hover:bg-background-muted dark:hover:bg-white/5 hover:text-ink dark:hover:text-white">
                  <Pencil size={15} />
                </button>
                <button onClick={() => setDeleteTarget(q)} className="rounded-md p-1.5 text-ink/40 dark:text-on-crimson/40 hover:bg-crimson-50 dark:hover:bg-crimson-600/15 hover:text-crimson-700 dark:hover:text-crimson-500">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editorState !== "closed" && (
        <QuestionEditor
          key={editorState === "new" ? "new" : editorState.id}
          initial={editorState === "new" ? null : editorState}
          subjects={subjects}
          classes={classes}
          defaultSubjectId={subjectFilter !== "all" ? subjectFilter : undefined}
          defaultClassId={classFilter !== "all" && classFilter !== "unclassified" ? classFilter : undefined}
          onSave={handleSave}
          onCancel={() => setEditorState("closed")}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white dark:bg-[#1A1C20] p-6 shadow-card-hover">
            <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">Delete this question?</h2>
            <p className="mt-1.5 text-[13px] text-ink/60 dark:text-white/60">
              It will be removed from the bank. Exams that already used it keep their recorded answers.
            </p>
            <div className="mt-4 flex gap-2.5">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-lg border border-black/10 dark:border-white/15 py-2.5 text-[13px] font-medium text-ink/70 dark:text-white/70 hover:bg-background-muted dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onDelete(deleteTarget.id);
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
    </div>
  );
}
