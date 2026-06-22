export type TaskStatus = 'pending' | 'claimed' | 'processing' | 'completed' | 'failed';
export type TaskType = 'analysis' | 'practice-generation';

export interface UploadedImage {
  uid: string;
  name: string;
  dataUrl: string;
}

export interface FileAsset {
  id: string;
  name: string;
  mimeType: string;
  kind?: string;
  summary?: string;
  url: string;
  createdAt: string;
}

export interface Student {
  id: string;
  name: string;
  currentGrade: string;
  notes: string;
  profileSummary: string;
  strengths: string[];
  weaknesses: string[];
  trendSummary: string;
  createdAt: string;
  updatedAt: string;
}

export interface Submission {
  id: string;
  studentId: string;
  studentNameSnapshot: string;
  grade: string;
  subject: string;
  notes: string;
  requestPracticeSuggestion: boolean;
  images: FileAsset[];
  analysisStatus: TaskStatus;
  analysisResult: Record<string, unknown> | null;
  layoutSnapshot: LayoutSnapshot | null;
  recommendedPracticePlan: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  student?: Student;
}

export interface LayoutSnapshot {
  orientation: 'portrait' | 'landscape';
  sections: TemplateSection[];
}

export interface TemplateSection {
  id?: string;
  name: string;
  questionTypeId?: string;
  questionTypeName: string;
  count: number;
  order: number;
  notes?: string;
}

export interface AppTask {
  id: string;
  taskType: TaskType;
  status: TaskStatus;
  statusMessage: string;
  createdAt: string;
  updatedAt: string;
  submissionIds?: string[];
  submissions?: Submission[];
  studentIds?: string[];
  students?: Student[];
  mode?: string;
  subject?: string;
  grade?: string;
  templateId?: string;
  template?: PaperTemplate | null;
  layout?: LayoutSnapshot | null;
  resultFiles?: FileAsset[];
}

export interface QuestionType {
  id: string;
  subject: string;
  name: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
}

export interface PaperTemplate {
  id: string;
  name: string;
  subject: string;
  gradeRange: string[];
  orientation: 'portrait' | 'landscape';
  sections: TemplateSection[];
  isSystem: boolean;
  isActive: boolean;
}

export interface KnowledgePoint {
  id: string;
  subject: string;
  gradeRange: string[];
  name: string;
  source: 'seed' | 'agent' | 'manual';
  isActive: boolean;
}

export interface CatalogResponse {
  catalog: {
    grades: string[];
    subjects: string[];
    textbookVersions: Array<{ stage: string; subject: string; publisher: string; area: string }>;
  };
  questionTypes: QuestionType[];
  paperTemplates: PaperTemplate[];
  knowledgePoints: KnowledgePoint[];
}

export interface BankGroupCount {
  name: string;
  count: number;
}

export interface BankSubjectTermTypeRow {
  label: string;
  grade: string;
  term: string;
  readyByType: Record<string, number>;
  needsSolvingByType?: Record<string, number>;
  readyTotal: number;
  needsSolvingTotal?: number;
}

export interface BankSubjectModule {
  subject: string;
  questionTypes: string[];
  readyTotal: number;
  needsSolvingTotal?: number;
  rows: BankSubjectTermTypeRow[];
}

export interface BankProgress {
  source?: string;
  generatedAt?: string | null;
  serverReceivedAt?: string | null;
  message?: string;
  counters?: Record<string, number | string | null>;
  bySubject?: BankGroupCount[];
  byGrade?: BankGroupCount[];
  byQuestionType?: BankGroupCount[];
  subjectModules?: BankSubjectModule[];
}
