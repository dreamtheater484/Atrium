import { normalizeName } from '@atrium/schema';

/** Lower case, no accents or punctuation, single spaces. Shared by all matching code. */
export const norm = normalizeName;

/** `norm` without spaces, so "Life cycle" and "Lifecycle" compare equal. */
export function compact(s: string): string {
  return norm(s).replace(/ /g, '');
}

/** True when `needle` appears in `haystack` as whole words (both already normalised). */
export function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

/** Cleans a cell's text: no non-breaking spaces, unified newlines, trimmed. */
export function cleanText(s: string): string {
  return s
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** Single-line text: all whitespace collapsed to single spaces. */
export function singleLine(s: string): string {
  return cleanText(s).replace(/\s+/g, ' ');
}

/** Cleans a header: single line, no "required" markers or trailing colons. */
export function cleanHeader(s: string): string {
  return singleLine(s)
    .replace(/\s*[*:]+$/, '')
    .trim();
}

/** Removes bracketed parts: "Annual cost (€)" → "Annual cost". */
export function stripBrackets(s: string): string {
  return s.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ').trim();
}

/** Excel-style column letter for a 0-based index: 0 → A, 27 → AB. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** File name without folders and extension. */
export function baseName(fileName: string): string {
  const file = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
}

/** Lower-case extension without the dot, or ''. */
export function extension(fileName: string): string {
  const file = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(dot + 1).toLowerCase() : '';
}

/** Joins a list for messages: "a, b and c". */
export function humanList(items: readonly string[], conjunction = 'and'): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

/** Decodes bytes to text, handling BOMs, UTF-16 and Windows-1252 files saved by Excel. */
export function decodeText(data: Uint8Array): string {
  const b0 = data[0];
  const b1 = data[1];
  const b2 = data[2];
  if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf)
    return new TextDecoder('utf-8').decode(data.subarray(3));
  if (b0 === 0xff && b1 === 0xfe) return new TextDecoder('utf-16le').decode(data.subarray(2));
  if (b0 === 0xfe && b1 === 0xff) {
    try {
      return new TextDecoder('utf-16be').decode(data.subarray(2));
    } catch {
      // Runtime without UTF-16BE support: swap bytes and read as little endian.
      const swapped = new Uint8Array(data.length - 2);
      for (let i = 2; i + 1 < data.length; i += 2) {
        swapped[i - 2] = data[i + 1]!;
        swapped[i - 1] = data[i]!;
      }
      return new TextDecoder('utf-16le').decode(swapped);
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    try {
      return new TextDecoder('windows-1252').decode(data);
    } catch {
      return new TextDecoder('utf-8').decode(data);
    }
  }
}
