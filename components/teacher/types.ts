// Shared shapes for the Teacher portal. These mirror `database/schema.sql`
// closely (questions, question_options, exams, exam_batches) so wiring real
// Supabase queries later is mostly a fetch + rename, not a redesign.

export type QuestionType = "multiple_choice" | "true_false" | "fill_blank" | "short_theory";

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface BankQuestion {
  id: string;
  subjectId: string;
  subjectName: string;
  classId: string | null;
  className: string; // "" when unclassified (legacy questions predate this)
  topic: string;
  type: QuestionType;
  prompt: string;
  imageUrl?: string | null;
  points: number;
  options?: QuestionOption[]; // multiple_choice / true_false
  referenceAnswer?: string | null; // fill_blank / short_theory marking guide
  updatedAt: string; // ISO
  /** Set when this question came from a bulk import — every question from
   *  the same import shares the same id, so they can be shown and picked
   *  as one unit instead of N separate rows. See QuestionBankManager and
   *  ExamBuilder's grouping logic. */
  importGroupId?: string | null;
  importGroupLabel?: string | null; // "Subject — Class", set once per group
}

/** A saved-in-progress bulk import review, resumable later — see QuestionImportModal. */
export interface ImportBatch {
  id: string;
  subjectId: string;
  classId: string | null;
  sourceFilename: string | null;
  draftQuestions: unknown; // ReviewQuestion[] from QuestionImportModal, stored as-is
  updatedAt: string;
}

export interface SubjectOption {
  id: string;
  name: string;
}

export interface ClassOption {
  id: string;
  name: string;
}

export interface TermOption {
  id: string;
  name: string;
}

export interface StudentOption {
  id: string;
  fullName: string;
  admissionNumber: string | null;
}

export interface GradingItem {
  id: string; // student_answers.id
  studentName: string;
  questionType: "fill_blank" | "short_theory";
  questionPrompt: string;
  referenceAnswer: string | null; // marking guide / expected answer
  studentAnswerText: string;
  maxPoints: number;
  pointsAwarded: number | null; // null = not yet graded
  feedback?: string;
}

export interface StudentReviewQuestion {
  questionId: string;
  type: QuestionType;
  prompt: string;
  maxPoints: number;
  pointsAwarded: number | null;
  isFlagged: boolean;
  // multiple_choice / true_false
  options?: { id: string; text: string; isCorrect: boolean }[];
  selectedOptionId?: string | null;
  // fill_blank / short_theory
  referenceAnswer?: string | null;
  freeTextAnswer?: string | null;
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  fill_blank: "Fill in the blank",
  short_theory: "Short theory",
};
