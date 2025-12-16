
export type Language = 'es' | 'en';

export interface VoiceOption {
  id: string;
  name: string; // Display name
  geminiVoiceName: string; // The technical name for the API
  gender: 'male' | 'female';
  accent?: string; // e.g., 'British', 'American', 'Castilian'
  description: string;
}

export type ChunkStatus = 'pending' | 'optimizing' | 'generating' | 'success' | 'error';

// Internal technical chunk (hidden from user mostly)
export interface InternalChunk {
  id: string;
  text: string;
  blob?: Blob;
  status: ChunkStatus;
  error?: string;
}

export interface TextChunk {
  id: string;
  title: string;
  audioUrl?: string;
  blob?: Blob;
  downloaded?: boolean;
  // Optional fields used in components
  index?: number;
  text?: string;
  charCount?: number;
  estimatedDurationSec?: number;
  estimatedGenTimeSec?: number;
  status?: string;
}

// User-facing Section (Chapter/Document)
export interface ProjectSection {
  id: string;
  index: number;
  title: string;
  content: string;
  
  // State
  status: 'idle' | 'generating' | 'paused' | 'merging' | 'completed' | 'error';
  progress: number; // 0 to 100
  currentStep?: string; // e.g. "Generating part 3/10"
  
  // Configuration per section
  voiceId?: string; // If null, uses global voice
  
  // Results
  audioUrl?: string; // The final merged URL (or the first part if split)
  blob?: Blob;
  
  // If user chose to keep parts separate
  isMultiPart?: boolean; 
  parts?: { url: string; blob: Blob; title: string }[];
  
  // Metadata
  estimatedDuration: number;
  charCount: number;
  
  // Statistics
  actualDuration?: number; // In seconds
  generationTime?: number; // In seconds
}

export interface GenerationSettings {
  pitch: number; // Range: -2 (Deep) to 2 (High), 0 is normal
  speed: number; // Range: 0.5 (Slow) to 2.0 (Fast), 1 is normal
  dialogueMode: boolean; // Keep short lines separate
  autoOptimize: boolean;
}

export enum AppState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
