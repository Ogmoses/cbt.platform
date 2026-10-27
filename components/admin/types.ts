// Shared shapes for the Admin console.

export type PersonRole = "student" | "teacher";

export interface TeacherAssignment {
  subjectId: string;
  classId: string;
}

export interface PersonRow {
  id: string;
  role: PersonRole;
  fullName: string;
  email?: string;
  admissionNumber?: string; // students
  staffId?: string; // teachers
  classId?: string; // students: current class (FK -> classes.id)
  subjectNames?: string[]; // teachers: display only, derived from `assignments` by the page
  assignments?: TeacherAssignment[]; // teachers: the real (subject, class) pairs written to teacher_subjects
  isActive: boolean;
}

export interface TodayBatch {
  id: string;
  examTitle: string;
  subjectName: string;
  className: string;
  batchLabel: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  labRoom?: string;
  studentCount: number;
}

export interface AdminStats {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  examsToday: number;
}

export interface ClassRow {
  id: string;
  name: string;
  level?: string;
  studentCount: number;
}

export interface SubjectRow {
  id: string;
  name: string;
  code?: string;
  classIds: string[]; // which classes offer this subject
}

export interface SessionRow {
  id: string;
  name: string; // e.g. "2025/2026"
  isCurrent: boolean;
}

export interface TermRow {
  id: string;
  sessionId: string;
  name: string; // "First Term", "Second Term", "Third Term"
  isCurrent: boolean;
  startsOn?: string; // YYYY-MM-DD
  endsOn?: string; // YYYY-MM-DD
}

export interface LabRoom {
  id: string;
  name: string;
  capacity: number;
}

export interface BatchTemplate {
  id: string;
  label: string; // "Batch A"
  startTime: string; // "08:00"
  endTime: string; // "09:00"
}

export interface PendingResult {
  examId: string;
  examTitle: string;
  subjectName: string;
  className: string;
  teacherName: string;
  studentCount: number;
  averageScore: number;
  maxScore: number;
}

export interface ClassPerformance {
  className: string;
  averagePercent: number;
}

export interface SubjectPerformance {
  subjectName: string;
  averagePercent: number;
}

export interface SchoolProfile {
  schoolName: string;
  motto?: string;
  address?: string;
  logoUrl?: string | null;
  themeColor?: string;
  secondaryColor?: string;
}

export interface GradeBand {
  id: string;
  minScore: number;
  maxScore: number;
  gradeLetter: string;
  remark: string;
}


