// Reads the Markdown video scripts in ../scripts. Each `##` heading is a scene; its `> ` line
// says what is on screen; the rest is the voiceover.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { Visual } from '../src/types';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export interface ScriptScene {
  id: string;
  visual: Visual;
  narration: string;
}

export interface Script {
  id: string;
  title: string;
  audience: string;
  file: string;
  scenes: ScriptScene[];
}

function parseVisual(line: string, where: string): Visual {
  const m = /^(\w+):\s*(.*)$/.exec(line.trim());
  if (!m) throw new Error(`${where}: the "> " line must look like "kind: value"`);
  const [, kind, rest] = m as unknown as [string, string, string];
  const [a, b] = rest.split('|').map((s) => s.trim());
  switch (kind) {
    case 'title':
      return { kind: 'title', title: a ?? '', subtitle: b };
    case 'end':
      return { kind: 'end', tagline: a ?? '' };
    case 'shot':
    case 'diagram':
    case 'code':
    case 'terminal':
    case 'agent':
      return { kind, name: a ?? '' } as Visual;
    default:
      throw new Error(`${where}: unknown visual "${kind}"`);
  }
}

export function readScripts(): Script[] {
  const dir = join(ROOT, 'scripts');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const raw = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n');
      const fm = /^---\n([\s\S]*?)\n---\n/.exec(raw);
      if (!fm) throw new Error(`${file}: missing front matter`);
      const meta = parseYaml(fm[1]!) as { id: string; title: string; audience: string };
      const scenes: ScriptScene[] = [];
      for (const block of raw.slice(fm[0].length).split(/\n## /).slice(1)) {
        const [head, ...lines] = block.split('\n');
        const id = head!.trim();
        const visualLine = lines.find((l) => l.startsWith('> '));
        if (!visualLine) throw new Error(`${file} › ${id}: missing "> " visual line`);
        const narration = lines
          .filter((l) => !l.startsWith('> '))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        scenes.push({ id, visual: parseVisual(visualLine.slice(2), `${file} › ${id}`), narration });
      }
      return { ...meta, file, scenes };
    });
}

/** Sentences for captions; keeps "e.g." style abbreviations together. */
export function sentences(text: string): string[] {
  return text
    .replace(/\b(e\.g|i\.e|etc)\./g, '$1§')
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.replace(/§/g, '.').trim())
    .filter(Boolean);
}
