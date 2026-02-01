
export interface Detection {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

export interface Screenshot {
  id: string;
  url: string;
  timestamp: string;
  count: number;
}

export interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'alert' | 'success' | 'warning' | 'error';
}

export interface Stats {
  currentCount: number;
  peakCount: number;
  avgCount: number;
  totalDetections: number;
  sessionStartTime: number | null;
}

export enum DetectionSpeed {
  FAST = 'fast',
  NORMAL = 'normal',
  ACCURATE = 'accurate'
}
