export type TaskStatus = 'pending' | 'claimed' | 'processing' | 'completed' | 'failed';

export interface UploadedImage {
  uid: string;
  name: string;
  dataUrl: string;
}

export interface PaperTaskFile {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  url: string;
}

export interface PaperTaskResult extends PaperTaskFile {
  kind: 'report' | 'practice-paper' | 'answer-key' | 'summary' | 'attachment';
  summary: string;
  createdAt: string;
}

export interface PaperTask {
  id: string;
  status: TaskStatus;
  statusMessage: string;
  grade: string;
  subject: string;
  studentName: string;
  practiceCount: number;
  difficulty: string;
  notes: string;
  images: PaperTaskFile[];
  results: PaperTaskResult[];
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  completedAt?: string;
  failedAt?: string;
}
