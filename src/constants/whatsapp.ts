import { Server, Lock, Wifi, QrCode, Zap, LucideIcon } from 'lucide-react';

export interface QrLoadingStage {
  progress: number;
  text: string;
  icon: LucideIcon;
}

export const QR_LOADING_STAGES: QrLoadingStage[] = [
  { progress: 10, text: 'מתחבר לשרת...', icon: Server },
  { progress: 30, text: 'מאמת הרשאות...', icon: Lock },
  { progress: 50, text: 'מאתחל מופע...', icon: Wifi },
  { progress: 70, text: 'מכין קוד QR...', icon: QrCode },
  { progress: 90, text: 'כמעט מוכן...', icon: Zap },
];

export const MAX_CREATION_WAIT_MS = 60000;
export const CREATION_POLL_INTERVAL_MS = 3000;
export const STATUS_POLL_INTERVAL_MS = 8000;
export const QR_REFRESH_INTERVAL_MS = 15000;

export const CREATION_PROGRESS_MESSAGES = {
  initializing: 'מאתחל חיבור...',
  encrypting: 'מגדיר הצפנה...',
  connecting: 'מחבר לשרתים...',
  waiting: 'ממתין לאישור...',
} as const;

export function getCreationProgressMessage(progress: number): string {
  if (progress < 30) return CREATION_PROGRESS_MESSAGES.initializing;
  if (progress < 60) return CREATION_PROGRESS_MESSAGES.encrypting;
  if (progress < 85) return CREATION_PROGRESS_MESSAGES.connecting;
  return CREATION_PROGRESS_MESSAGES.waiting;
}
