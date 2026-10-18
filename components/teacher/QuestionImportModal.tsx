"use client";

/**
 * QuestionImportModal — bulk-imports questions from a Word (.docx) or
 * CSV file instead of typing each one by hand.
 *
 * Two steps, never skippable:
 *  1. Upload — pick a subject/class and a file; the server (see
 *     app/api/teacher/questions/parse-import) reads it and detects
 *     question/option structure, but never guesses which option is
 *     correct, and never extracts images — see the in-UI notice for why.
 *  2. Review — every detected question is editable, and for
 *     multiple_choice/true_false the teacher must tap the correct option
 *     before it can be saved, exactly like creating one by hand. Nothing
 *     reaches the database until "Save" here — saving reuses the exact
 *     same onCreate the single-question form uses, just called once per
 *     reviewed question, so bulk-imported questions go through the same
 *     RLS-governed insert path as any other.
 */

import { useState } from "react";
import { Upload, FileText, AlertTriangle, Image as ImageIcon, Trash2, Loader2, X, CheckCircle2 } from "lucide-react";
import MathText from "@/components/common/MathText";
import type { BankQuestion, ClassOption, QuestionOption, QuestionType, SubjectOption } from "./types";
import { QUESTION_TYPE_LABEL } from "./types";

interface DraftQuestion {
  type: QuestionType;
  prompt: string;
  options: { text: string }[];
  points: number;
  topic?: string;
  hadDiagram: boolean;
  warning?: string;
}

interface ReviewQuestion extends DraftQuestion {
  options: QuestionOption[];
  referenceAnswer: string;
}

interface QuestionImportModalProps {
  subjects: SubjectOption[];
  classes: ClassOption[];
  onCreate: (q: Omit<BankQuestion, "id" | "updatedAt" | "subjectName" | "className">) => Promise<void>;
  onClose: () => void;
}

export default function QuestionImportModal({ subjects, classes, onCreate, onClose }: QuestionImportModalProps) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [skippedLineCount, setSkippedLineCount] = useState(0);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!file || !subjectId) return;
    setParsing(true);
    setParseError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/teacher/questions/parse-import", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't read that file.");

      const drafts: ReviewQuestion[] = (data.questions as DraftQuestion[]).map((d) => ({
        ...d,
        options: d.options.map((o) => ({ id: crypto.randomUUID(), text: o.text, isCorrect: false })),
        referenceAnswer: "",
      }));
      if (drafts.length === 0) {
        setParseError("No questions were recognized in that file. Check it follows a numbered-question, lettered-option layout (1. ... A. ... B. ...).");
        return;
      }
      setQuestions(drafts);
      setSkippedLineCount(data.skippedLineCount ?? 0);
      setStep("review");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setParsing(false);
    }
  };

  const updateQuestion = (index: number, patch: Partial<ReviewQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const updateOption = (qIndex: number, optId: string, patch: Partial<QuestionOption>) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIndex ? { ...q, options: q.options.map((o) => (o.id === optId ? { ...o, ...patch } : o)) } : q))
    );
  };

  const markCorrect = (qIndex: number, optId: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIndex ? { ...q, options: q.options.map((o) => ({ ...o, isCorrect: o.id === optId })) } : q))
    );
  };

  const discardQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const needsCorrectAnswer = (q: ReviewQuestion) =>
    (q.type === "multiple_choice" || q.type === "true_false") && !q.options.some((o) => o.isCorrect);

  const invalidCount = questions.filter((q) => !q.prompt.trim() || needsCorrectAnswer(q)).length;

  const handleSaveAll = async () => {
    if (invalidCount > 0 || questions.length === 0) return;
    setSaving(true);
    setSaveError(null);
    setSaveProgress(0);
    try {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await onCreate({
          subjectId,
          classId: classId || null,
          topic: q.topic ?? "",
          type: q.type,
          prompt: q.prompt,
          points: q.points,
          options: q.type === "multiple_choice" || q.type === "true_false" ? q.options : undefined,
          referenceAnswer: q.type === "fill_blank" || q.type === "short_theory" ? q.referenceAnswer || null : undefined,
        });
        setSaveProgress(i + 1);
      }
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Something went wrong partway through saving. Questions already saved are kept — retry to continue with the rest.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-card-hover dark:bg-[#1A1C20]">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4 dark:border-white/10">
          <h2 className="font-display text-[15px] font-semibold text-ink dark:text-white">
            {step === "upload" ? "Import questions" : `Review ${questions.length} question${questions.length === 1 ? "" : "s"}`}
          </h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink/40 hover:bg-background-muted dark:text-white/40 dark:hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        {step === "upload" ? (
          <div className="space-y-4 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-ink/60 dark:text-white/60">Subject</span>
                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-crimson-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-ink/60 dark:text-white/60">Class</span>
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  className="w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-crimson-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
                >
                  <option value="">Unclassified</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-black/15 px-4 py-8 text-center dark:border-white/20">
              <Upload size={22} className="text-ink/35 dark:text-white/35" />
              <span className="text-[13px] font-medium text-ink dark:text-white">{file ? file.name : "Choose a .docx or .csv file"}</span>
              <span className="text-[11.5px] text-ink/45 dark:text-white/45">Numbered questions, lettered options (1. ... A. ... B. ...)</span>
              <input
                type="file"
                accept=".docx,.csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <div className="space-y-2 rounded-lg bg-background-muted p-3 dark:bg-white/5">
              <p className="flex items-start gap-2 text-[12px] text-ink/70 dark:text-white/70">
                <ImageIcon size={14} className="mt-0.5 shrink-0" />
                Diagrams aren't imported — any question that had one is flagged on the review screen so you can add it back manually.
              </p>
              <p className="flex items-start gap-2 text-[12px] text-ink/70 dark:text-white/70">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                Formulas made with Word's Equation Editor tool won't come through — type them as plain text instead (e.g. <code className="rounded bg-black/5 px-1 dark:bg-white/10">x^2</code>), which renders correctly on its own.
              </p>
              <p className="flex items-start gap-2 text-[12px] text-ink/70 dark:text-white/70">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                You'll pick the correct answer for every question yourself on the next screen — nothing is guessed.
              </p>
            </div>

            {parseError && (
              <div className="rounded-md bg-crimson-50 px-3 py-2 text-[12.5px] text-crimson-700 dark:bg-crimson-600/10 dark:text-crimson-500">{parseError}</div>
            )}

            <button
              onClick={handleParse}
              disabled={!file || !subjectId || parsing}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-crimson-600 py-3 text-[13px] font-semibold text-on-crimson transition-colors duration-200 hover:bg-crimson-700 disabled:opacity-60"
            >
              {parsing ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              {parsing ? "Reading file…" : "Read file"}
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {skippedLineCount > 0 && (
                <div className="flex items-start gap-2 rounded-md bg-background-muted px-3 py-2 text-[12px] text-ink/60 dark:bg-white/5 dark:text-white/60">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {skippedLineCount} line{skippedLineCount === 1 ? "" : "s"} in the file didn't match the expected format and {skippedLineCount === 1 ? "wasn't" : "weren't"} imported.
                </div>
              )}

              {questions.map((q, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3.5 ${
                    !q.prompt.trim() || needsCorrectAnswer(q) ? "border-crimson-300 bg-crimson-50/30 dark:border-crimson-600/40 dark:bg-crimson-600/5" : "border-black/10 dark:border-white/15"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-ink/40 dark:text-white/40">Q{i + 1}</span>
                      <select
                        value={q.type}
                        onChange={(e) => updateQuestion(i, { type: e.target.value as QuestionType })}
                        className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11.5px] dark:border-white/15 dark:bg-white/5 dark:text-white"
                      >
                        {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
                          <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>
                        ))}
                      </select>
                      {q.hadDiagram && (
                        <span className="flex items-center gap-1 rounded-full bg-crimson-100 px-2 py-0.5 text-[10.5px] font-medium text-crimson-700 dark:bg-crimson-600/20 dark:text-crimson-500">
                          <ImageIcon size={10} /> Had a diagram
                        </span>
                      )}
                    </div>
                    <button onClick={() => discardQuestion(i)} className="text-ink/30 hover:text-crimson-600 dark:text-white/30">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <textarea
                    value={q.prompt}
                    onChange={(e) => updateQuestion(i, { prompt: e.target.value })}
                    rows={2}
                    className="mb-2 w-full resize-none rounded-md border border-black/10 px-2.5 py-2 text-[13px] outline-none focus:border-crimson-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
                  />
                  {q.prompt.trim() && (
                    <MathText text={q.prompt} className="mb-2 block text-[12px] text-ink/50 dark:text-white/50" />
                  )}

                  {q.type === "multiple_choice" || q.type === "true_false" ? (
                    <div className="space-y-1.5">
                      {q.options.map((opt) => (
                        <div key={opt.id} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => markCorrect(i, opt.id)}
                            aria-label="Mark correct"
                            className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 ${
                              opt.isCorrect ? "border-crimson-600 bg-crimson-600" : "border-black/20 dark:border-white/25"
                            }`}
                          >
                            {opt.isCorrect && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </button>
                          <input
                            value={opt.text}
                            onChange={(e) => updateOption(i, opt.id, { text: e.target.value })}
                            disabled={q.type === "true_false"}
                            className="flex-1 rounded-md border border-black/10 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-crimson-500 disabled:bg-background-muted dark:border-white/15 dark:bg-white/5 dark:text-white dark:disabled:bg-white/10"
                          />
                        </div>
                      ))}
                      {needsCorrectAnswer(q) && <p className="text-[11px] text-crimson-600">Tap the circle next to the correct option.</p>}
                    </div>
                  ) : (
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-ink/50 dark:text-white/50">Marking guide (optional, shown only to the grader)</span>
                      <textarea
                        value={q.referenceAnswer}
                        onChange={(e) => updateQuestion(i, { referenceAnswer: e.target.value })}
                        rows={2}
                        className="w-full resize-none rounded-md border border-black/10 px-2.5 py-2 text-[12.5px] outline-none focus:border-crimson-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
                      />
                    </label>
                  )}

                  {q.warning && <p className="mt-1.5 text-[11px] text-warning">{q.warning}</p>}
                </div>
              ))}

              {questions.length === 0 && <p className="py-8 text-center text-[13px] text-ink/45 dark:text-white/45">Every question was discarded.</p>}
            </div>

            <div className="border-t border-black/5 px-5 py-3.5 dark:border-white/10">
              {saveError && <p className="mb-2 text-[12px] text-crimson-600">{saveError}</p>}
              {invalidCount > 0 && !saving && (
                <p className="mb-2 text-[12px] text-crimson-600">
                  {invalidCount} question{invalidCount === 1 ? "" : "s"} still need{invalidCount === 1 ? "s" : ""} attention before you can save — see highlighted cards above.
                </p>
              )}
              <button
                onClick={handleSaveAll}
                disabled={saving || invalidCount > 0 || questions.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-crimson-600 py-3 text-[13px] font-semibold text-on-crimson transition-colors duration-200 hover:bg-crimson-700 disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {saving ? `Saving ${saveProgress}/${questions.length}…` : `Save ${questions.length} question${questions.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
