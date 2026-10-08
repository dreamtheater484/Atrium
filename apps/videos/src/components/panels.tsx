import type { ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { c, clamp, ease, mono } from '../theme';
import { Backdrop, Rise, Window } from './common';

function lineColor(line: string): string {
  if (/^\s*(✗|x error|error)/i.test(line)) return c.act;
  if (/^\s*(!|warning)/i.test(line)) return c.watch;
  if (/^\s*✓/.test(line)) return c.good;
  if (/^\s*i /.test(line)) return c.muted;
  return c.text;
}

/** A terminal that types a command and then prints real output, line by line. */
export function Terminal({
  command,
  output,
  frames,
  cwd = '~/loyalty-points',
  title = 'Terminal',
}: {
  command: string;
  output: string;
  frames: number;
  cwd?: string;
  title?: string;
}) {
  const frame = useCurrentFrame();
  const typeEnd = 12 + command.length * 1.4;
  const typed = command.slice(0, Math.max(0, Math.floor((frame - 12) / 1.4)));
  const lines = output.replace(/\r/g, '').split('\n').slice(0, 26);
  const printStart = typeEnd + 10;
  const per = Math.max(3, Math.min(9, (frames * 0.45) / Math.max(1, lines.length)));
  return (
    <Backdrop>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Window width={1500} height={860} title={title}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              padding: '30px 38px',
              fontFamily: mono,
              fontSize: 25,
              lineHeight: 1.6,
              background: 'oklch(0.13 0.012 262)',
              color: c.text,
              whiteSpace: 'pre-wrap',
            }}
          >
            <div>
              <span style={{ color: c.good }}>{cwd}</span>
              <span style={{ color: c.muted }}> $ </span>
              {typed}
              {frame < typeEnd + 6 && (
                <span style={{ opacity: Math.floor(frame / 8) % 2 ? 0 : 1, background: c.text }}>
                  &nbsp;
                </span>
              )}
            </div>
            {lines.map((l, i) => {
              const at = printStart + i * per;
              const o = clamp((frame - at) / 5);
              return (
                <div
                  key={`${i}-${l}`}
                  style={{
                    opacity: o,
                    color: lineColor(l),
                    transform: `translateY(${(1 - o) * 6}px)`,
                  }}
                >
                  {l || ' '}
                </div>
              );
            })}
          </div>
        </Window>
      </AbsoluteFill>
    </Backdrop>
  );
}

function highlight(line: string, lang: 'yaml' | 'markdown' | 'json'): ReactNode {
  if (lang === 'markdown') {
    if (/^#{1,3} /.test(line))
      return <span style={{ color: c.primary, fontWeight: 600 }}>{line}</span>;
    if (/^\s*[-*] /.test(line)) return <span style={{ color: c.text }}>{line}</span>;
    return <span style={{ color: c.muted }}>{line}</span>;
  }
  if (/^\s*#/.test(line)) return <span style={{ color: c.subtle }}>{line}</span>;
  const m = /^(\s*-?\s*)("?[\w.@/-]+"?)(:)(.*)$/.exec(line);
  if (m) {
    return (
      <>
        <span style={{ color: c.muted }}>{m[1]}</span>
        <span style={{ color: c.application }}>{m[2]}</span>
        <span style={{ color: c.muted }}>{m[3]}</span>
        <span
          style={{ color: /\d/.test(m[4] ?? '') && !/[a-z]/i.test(m[4] ?? '') ? c.watch : c.good }}
        >
          {m[4]}
        </span>
      </>
    );
  }
  return <span style={{ color: c.text }}>{line}</span>;
}

/** A code editor showing a generated file, lines revealed top to bottom, with a reading band. */
export function CodePanel({
  file,
  content,
  lang,
  frames,
  caption,
}: {
  file: string;
  content: string;
  lang: 'yaml' | 'markdown' | 'json';
  frames: number;
  caption?: string;
}) {
  const frame = useCurrentFrame();
  const lines = content.replace(/\r/g, '').split('\n').slice(0, 30);
  const reveal = clamp(frame / (frames * 0.4));
  const shown = Math.ceil(lines.length * ease(reveal));
  const band = interpolate(
    frame,
    [frames * 0.4, frames * 0.95],
    [0, Math.max(0, lines.length - 6)],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );
  return (
    <Backdrop>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Window width={1500} height={900} title={file}>
          <div style={{ position: 'absolute', inset: 0, background: 'oklch(0.15 0.012 262)' }}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 26 + band * 26.5,
                height: 26.5 * 6,
                background: `color-mix(in oklch, ${c.primary} 9%, transparent)`,
                borderLeft: `3px solid ${c.primary}`,
                opacity: frame > frames * 0.4 ? 1 : 0,
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: '26px 34px',
                fontFamily: mono,
                fontSize: 21,
                lineHeight: '26.5px',
              }}
            >
              {lines.slice(0, shown).map((l, i) => (
                <div key={`${i}-${l}`} style={{ display: 'flex', whiteSpace: 'pre' }}>
                  <span
                    style={{
                      width: 46,
                      color: c.subtle,
                      flexShrink: 0,
                      textAlign: 'right',
                      marginRight: 22,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span>{highlight(l, lang)}</span>
                </div>
              ))}
            </div>
          </div>
        </Window>
        {caption && (
          <Rise delay={12} style={{ position: 'absolute', top: 28, fontSize: 24, color: c.muted }}>
            {caption}
          </Rise>
        )}
      </AbsoluteFill>
    </Backdrop>
  );
}

export interface AgentScript {
  prompt: string;
  tool: string;
  args: string;
  result: string;
  reply: string;
}

/** A coding assistant at work: the request, a tool call to Atrium, the real answer, its reply. */
export function AgentPanel({ s, frames }: { s: AgentScript; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (x: number) => clamp((frame - x * frames) / (fps * 0.5));
  const resultLines = s.result
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 14);
  const bubble = (o: number, children: ReactNode, tone: 'user' | 'tool' | 'result' | 'agent') => (
    <div
      style={{
        opacity: o,
        transform: `translateY(${(1 - o) * 14}px)`,
        borderRadius: 14,
        padding: '16px 22px',
        border: `1px solid ${tone === 'tool' ? `color-mix(in oklch, ${c.primary} 50%, transparent)` : c.border}`,
        background:
          tone === 'user'
            ? c.surface3
            : tone === 'tool'
              ? `color-mix(in oklch, ${c.primary} 12%, ${c.surface})`
              : tone === 'result'
                ? 'oklch(0.15 0.012 262)'
                : c.surface2,
        alignSelf: tone === 'user' ? 'flex-end' : 'stretch',
        maxWidth: tone === 'user' ? 900 : undefined,
      }}
    >
      {children}
    </div>
  );
  return (
    <Backdrop>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Window width={1500} height={920} title="AI coding assistant · connected to Atrium">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              padding: 30,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              fontSize: 24,
            }}
          >
            {bubble(t(0.02), <span>{s.prompt}</span>, 'user')}
            {bubble(
              t(0.18),
              <div style={{ fontFamily: mono, fontSize: 21, color: c.primarySoftText }}>
                <span style={{ color: c.primary, fontWeight: 600 }}>atrium</span> · {s.tool}
                <span style={{ color: c.muted }}>({s.args})</span>
              </div>,
              'tool',
            )}
            {bubble(
              t(0.3),
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 18,
                  lineHeight: 1.55,
                  color: c.muted,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {resultLines.map((l, i) => (
                  <div
                    key={`${i}-${l}`}
                    style={{
                      opacity: clamp((frame - (0.3 * frames + i * 3)) / 6),
                      color: /^#/.test(l) ? c.text : lineColor(l),
                    }}
                  >
                    {l.length > 110 ? `${l.slice(0, 108)}…` : l}
                  </div>
                ))}
              </div>,
              'result',
            )}
            {bubble(t(0.62), <span style={{ lineHeight: 1.45 }}>{s.reply}</span>, 'agent')}
          </div>
        </Window>
      </AbsoluteFill>
    </Backdrop>
  );
}
