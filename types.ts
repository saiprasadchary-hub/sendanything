
export enum AppState {
  IDLE = 'IDLE',
  SENDING_PREPARE = 'SENDING_PREPARE',
  SENDING_WAITING = 'SENDING_WAITING',
  RECEIVING_INPUT = 'RECEIVING_INPUT',
  TRANSFERRING = 'TRANSFERRING',
  RECONNECTING = 'RECONNECTING',
  COMPLETED = 'COMPLETED',
  INTERRUPTED = 'INTERRUPTED'
}

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  path?: string; // Relative path for folder preservation
}

export interface FileItem {
  file: File;
  path: string; // Relative path including filename
}

export interface TransferProgress {
  fileName: string;
  progress: number;
  speed: number;
  bytesTransferred: number;
  totalBytes: number;
  estimatedTime?: number; // Seconds
}

export interface PeerMessage {
  type: 'METADATA' | 'CHUNK' | 'COMPLETE' | 'ERROR' | 'RESUME' | 'ACK' | 'ALL_DONE' | 'TEXT' | 'PING' | 'PONG';
  payload: any;
}

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'waiting'
  | 'sender-connected'
  | 'receiver-connected'
  | 'established'
  | 'error'
  | 'reconnecting';

export interface HistoryItem {
  id: string;
  type: 'sent' | 'received';
  timestamp: number;
  files: { name: string; size: number }[];
  totalSize: number;
}

export interface ChatMessage {
  id: string;
  sender: 'me' | 'peer';
  text: string;
  timestamp: number;
}
