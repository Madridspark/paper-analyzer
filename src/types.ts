export type GradingStatus = 'correct' | 'wrong' | 'partial' | 'unable';

export interface StoredSettings {
  apiKey: string;
  model: string;
}

export interface UploadedImage {
  uid: string;
  name: string;
  dataUrl: string;
}

export interface PaperAnalysis {
  paperTitle: string;
  summary: {
    totalScore: number;
    studentScore: number;
    accuracy: number;
    comment: string;
  };
  questions: AnalyzedQuestion[];
  knowledgePoints: KnowledgePointStat[];
  errorTags: ErrorTagStat[];
  recommendations: string[];
}

export interface AnalyzedQuestion {
  number: string;
  type: string;
  stem: string;
  studentAnswer: string;
  standardAnswer: string;
  gradingStatus: GradingStatus;
  score: number;
  studentScore: number;
  knowledgePoints: string[];
  errorTags: string[];
  explanation: string;
  confidence: number;
}

export interface KnowledgePointStat {
  name: string;
  status: 'mastered' | 'practice' | 'weak';
  wrongCount: number;
  suggestion: string;
}

export interface ErrorTagStat {
  name: string;
  count: number;
}

export interface GeneratedPaper {
  title: string;
  description: string;
  questions: GeneratedQuestion[];
  answerKey: GeneratedAnswer[];
}

export interface GeneratedQuestion {
  number: string;
  type: string;
  stem: string;
  score: number;
  knowledgePoint: string;
  answer: string;
  explanation: string;
}

export interface GeneratedAnswer {
  number: string;
  answer: string;
  explanation: string;
}

export interface HistoryItem {
  id: string;
  grade: string;
  subject: string;
  studentName: string;
  analyzedAt: string;
  report: PaperAnalysis;
  generatedPapers: GeneratedPaper[];
}
