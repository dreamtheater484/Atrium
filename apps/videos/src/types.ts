export type Visual =
  | { kind: 'title'; title: string; subtitle?: string }
  | { kind: 'end'; tagline: string }
  | { kind: 'shot'; name: string }
  | { kind: 'diagram'; name: string }
  | { kind: 'code'; name: string }
  | { kind: 'terminal'; name: string }
  | { kind: 'agent'; name: string };

export interface Caption {
  text: string;
  /** Seconds from the start of the scene. */
  start: number;
  end: number;
}

export interface Scene {
  id: string;
  visual: Visual;
  narration: string;
  /** Seconds the scene lasts (voice plus breathing room). */
  duration: number;
  /** Path under public/ when a voice clip exists. */
  audio: string | null;
  /** Seconds of silence before the voice starts. */
  leadIn: number;
  captions: Caption[];
}

export interface VideoData {
  id: string;
  title: string;
  audience: string;
  scenes: Scene[];
}

/** One screenshot in a captured sequence, with where the pointer goes and what to look at. */
export interface ShotStep {
  file: string;
  /** Pointer target in screenshot pixels (CSS px × scale), or null to leave it where it is. */
  cursor: { x: number; y: number } | null;
  click: boolean;
  /** Region to zoom towards, in screenshot pixels. */
  focus: { x: number; y: number; w: number; h: number } | null;
  /** Relative share of the scene this step stays on screen. */
  weight: number;
  label?: string;
}

export interface ShotData {
  width: number;
  height: number;
  steps: ShotStep[];
}

export interface Captures {
  scale: number;
  shots: Record<string, ShotData>;
  /** Real output from the CLI and MCP server, shown in terminal and code scenes. */
  assets: Record<string, string>;
}
