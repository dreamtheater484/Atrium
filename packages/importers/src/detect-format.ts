import { extension } from './text';
import type { ImportFormat } from './types';

const SNIFF_BYTES = 64 * 1024;

/** Zip container (xlsx, docx, ...): "PK\x03\x04". */
export function isZip(data: Uint8Array): boolean {
  return data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

/** Old binary Office file (.xls 97-2003): D0 CF 11 E0. */
export function isLegacyOffice(data: Uint8Array): boolean {
  return data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0;
}

function sniffText(data: Uint8Array): string {
  const head = data.subarray(0, SNIFF_BYTES);
  let text: string;
  if (head[0] === 0xff && head[1] === 0xfe) text = new TextDecoder('utf-16le').decode(head.subarray(2));
  else text = new TextDecoder('utf-8').decode(head);
  return text.replace(/^﻿/, '');
}

/** Whether the start of a text file looks like delimited rows (consistent separators per line). */
function looksDelimited(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 10);
  if (lines.length === 0) return false;
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const withSep = counts.filter((n) => n > 0);
    if (withSep.length === 0) continue;
    if (lines.length === 1) return true;
    const freq = new Map<number, number>();
    for (const n of withSep) freq.set(n, (freq.get(n) ?? 0) + 1);
    if (Math.max(...freq.values()) >= Math.ceil(lines.length * 0.6)) return true;
  }
  return false;
}

/**
 * Works out a file's format from its contents first and its extension second, so a renamed
 * or extension-less file is still recognised.
 */
export function detectFormat(fileName: string, data: Uint8Array): ImportFormat {
  const ext = extension(fileName);
  if (isZip(data)) return 'xlsx';
  if (isLegacyOffice(data)) return 'unknown';
  const text = sniffText(data);
  const head = text.trimStart();
  if (!head) return 'unknown';

  if (head.startsWith('<')) {
    const isModel = /<(?:[\w-]+:)?model[\s>]/.test(head);
    if (isModel && /opengroup\.org\/xsd\/archimate/i.test(head)) return 'archimate';
    if (isModel && /archimate/i.test(head)) return 'archimate';
    return 'unknown';
  }
  if (head.startsWith('{') || head.startsWith('[')) {
    if (/"apiVersion"\s*:\s*"backstage\.io\//.test(head)) return 'backstage';
    if (/"apiVersion"\s*:\s*"atrium\/v1"/.test(head)) return 'atrium-yaml';
    return 'json';
  }
  if (/^apiVersion:\s*["']?backstage\.io\//m.test(head)) return 'backstage';
  if (/^apiVersion:\s*["']?atrium\/v1\b/m.test(head)) return 'atrium-yaml';

  if (['csv', 'tsv', 'tab', 'txt'].includes(ext)) return 'csv';
  if (ext === 'json') return 'json';
  if (['yaml', 'yml', 'xml', 'xls'].includes(ext)) return 'unknown';
  return looksDelimited(head) ? 'csv' : 'unknown';
}
