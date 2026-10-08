import type { ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { c, clamp, ease, mono } from '../theme';
import { Backdrop, LogoMark, Rise } from './common';

const LAYERS = [
  {
    name: 'Capabilities',
    note: 'what the business does',
    color: c.strategy,
    nodes: ['Customer', 'Billing', 'Ordering', 'Network', 'Analytics'],
  },
  {
    name: 'Processes',
    note: 'how work flows',
    color: c.business,
    nodes: ['Order to cash', 'Trouble to resolve', 'Concept to market'],
  },
  {
    name: 'Applications & data',
    note: 'the systems and what they hold',
    color: c.application,
    nodes: ['CRM', 'Order Hub', 'Billing', 'Data Lake', 'Portal', 'API Gateway'],
  },
  {
    name: 'Technology',
    note: 'what it all runs on',
    color: c.technology,
    nodes: ['Kubernetes', 'PostgreSQL', 'Kafka', 'Java 21'],
  },
];

/** One map: four layers, connected, and the three groups who use it. */
export function OneMap({ frames }: { frames: number }) {
  const frame = useCurrentFrame();
  const W = 1200;
  const rowH = 165;
  const top = 40;
  const LABEL = 300;
  const nodePos = (li: number, ni: number) => {
    const n = LAYERS[li]!.nodes.length;
    return {
      x: LABEL + 30 + ((W - LABEL - 60) * (ni + 0.5)) / n,
      y: top + li * rowH + rowH / 2,
    };
  };
  const links: Array<[number, number, number, number]> = [
    [0, 0, 1, 0],
    [0, 1, 1, 0],
    [0, 2, 1, 0],
    [0, 3, 1, 1],
    [0, 4, 1, 2],
    [1, 0, 2, 0],
    [1, 0, 2, 1],
    [1, 0, 2, 2],
    [1, 1, 2, 0],
    [1, 2, 2, 4],
    [1, 2, 2, 3],
    [2, 0, 3, 3],
    [2, 1, 3, 2],
    [2, 1, 3, 1],
    [2, 2, 3, 1],
    [2, 3, 3, 0],
    [2, 4, 3, 0],
    [2, 5, 3, 0],
  ];
  const linkP = clamp((frame - 40) / 50);
  const audiences = [
    ['Architects', 'keep it right', c.strategy],
    ['Managers', 'decide with it', c.business],
    ['Engineers & AI', 'build with it', c.application],
  ] as const;
  return (
    <Backdrop>
      <AbsoluteFill
        style={{ flexDirection: 'row', alignItems: 'center', padding: '0 100px 60px', gap: 60 }}
      >
        <svg width={W} height={top + LAYERS.length * rowH} style={{ overflow: 'visible' }}>
          {LAYERS.map((l, li) => {
            const o = ease(clamp((frame - li * 8) / 20));
            const y = top + li * rowH;
            return (
              <g key={l.name} opacity={o} transform={`translate(0 ${(1 - o) * 30})`}>
                <rect
                  x={0}
                  y={y + 10}
                  width={W}
                  height={rowH - 20}
                  rx={24}
                  fill={`color-mix(in oklch, ${l.color} 8%, transparent)`}
                  stroke={`color-mix(in oklch, ${l.color} 32%, transparent)`}
                />
                <text x={30} y={y + rowH / 2 - 4} fill={l.color} fontSize={27} fontWeight={600}>
                  {l.name}
                </text>
                <text x={30} y={y + rowH / 2 + 28} fill={c.subtle} fontSize={20}>
                  {l.note}
                </text>
              </g>
            );
          })}
          {links.map(([a, b, d, e], i) => {
            const p1 = nodePos(a, b);
            const p2 = nodePos(d, e);
            const mid = (p1.y + p2.y) / 2;
            const path = `M ${p1.x} ${p1.y + 22} C ${p1.x} ${mid}, ${p2.x} ${mid}, ${p2.x} ${p2.y - 22}`;
            const p = clamp(linkP * 1.6 - i * 0.04);
            return (
              <path
                key={`${a}${b}${d}${e}`}
                d={path}
                fill="none"
                stroke={c.primary}
                strokeOpacity={0.5}
                strokeWidth={2.2}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - p}
              />
            );
          })}
          {LAYERS.map((l, li) =>
            l.nodes.map((n, ni) => {
              const p = nodePos(li, ni);
              const o = ease(clamp((frame - 14 - li * 8 - ni * 2) / 16));
              const w = Math.max(104, n.length * 12.5 + 34);
              return (
                <g key={`${l.name}-${n}`} opacity={o}>
                  <rect
                    x={p.x - w / 2}
                    y={p.y - 22}
                    width={w}
                    height={44}
                    rx={12}
                    fill={c.surface2}
                    stroke={`color-mix(in oklch, ${l.color} 60%, transparent)`}
                    strokeWidth={1.5}
                  />
                  <text
                    x={p.x}
                    y={p.y + 7}
                    textAnchor="middle"
                    fill={c.text}
                    fontSize={18}
                    fontWeight={500}
                  >
                    {n}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          {audiences.map(([who, what, col], i) => (
            <Rise key={who} delay={Math.round(frames * 0.42) + i * 14} distance={30}>
              <div
                style={{
                  padding: '26px 30px',
                  borderRadius: 20,
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderLeft: `6px solid ${col}`,
                  width: 400,
                }}
              >
                <div style={{ fontSize: 34, fontWeight: 600 }}>{who}</div>
                <div style={{ fontSize: 26, color: c.muted, marginTop: 6 }}>{what}</div>
              </div>
            </Rise>
          ))}
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
}

const TOOLS = [
  'get_service_context',
  'find_dependencies',
  'impact_of',
  'list_standards',
  'check_against_standards',
  'propose_change',
];

/** The assistant asks Atrium questions over MCP while it works. */
export function AgentLoop({ frames }: { frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = (children: ReactNode, color: string) => (
    <div
      style={{
        width: 470,
        padding: 34,
        borderRadius: 26,
        background: c.surface,
        border: `1px solid ${c.border}`,
        boxShadow: `0 30px 80px -30px ${color}`,
      }}
    >
      {children}
    </div>
  );
  const active = Math.floor((frame / fps) * 0.9) % TOOLS.length;
  return (
    <Backdrop>
      <AbsoluteFill
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0 }}
      >
        <Rise>
          {card(
            <>
              <div
                style={{
                  fontSize: 22,
                  color: c.muted,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                }}
              >
                Your editor
              </div>
              <div style={{ fontSize: 44, fontWeight: 700, marginTop: 10 }}>Coding assistant</div>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 20,
                  color: c.subtle,
                  marginTop: 18,
                  lineHeight: 1.6,
                }}
              >
                Claude Code · Cursor
                <br />
                VS Code · any MCP client
              </div>
            </>,
            c.application,
          )}
        </Rise>
        <div style={{ width: 520, height: 340, position: 'relative' }}>
          <svg width={520} height={340} style={{ position: 'absolute', inset: 0 }}>
            <line
              x1={10}
              y1={120}
              x2={510}
              y2={120}
              stroke={c.primary}
              strokeOpacity={0.5}
              strokeWidth={3}
              strokeDasharray="10 12"
              strokeDashoffset={-frame * 2}
            />
            <line
              x1={510}
              y1={220}
              x2={10}
              y2={220}
              stroke={c.good}
              strokeOpacity={0.5}
              strokeWidth={3}
              strokeDasharray="10 12"
              strokeDashoffset={-frame * 2}
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              top: 64,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontFamily: mono,
              fontSize: 22,
              color: c.primarySoftText,
            }}
          >
            {TOOLS.map((t, i) => (
              <div
                key={t}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  opacity: i === active ? 1 : 0,
                  transition: 'none',
                }}
              >
                <span
                  style={{
                    padding: '8px 18px',
                    borderRadius: 999,
                    background: c.primarySoft,
                    border: `1px solid ${c.primary}`,
                  }}
                >
                  {t}
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              position: 'absolute',
              top: 244,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: 22,
              color: c.good,
            }}
          >
            context · standards · impact
          </div>
          <div
            style={{
              position: 'absolute',
              top: 290,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: 20,
              color: c.subtle,
              letterSpacing: 3,
            }}
          >
            MODEL CONTEXT PROTOCOL
          </div>
        </div>
        <Rise delay={8}>
          {card(
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <LogoMark size={56} />
                <div style={{ fontSize: 44, fontWeight: 700 }}>Atrium</div>
              </div>
              <div style={{ fontSize: 24, color: c.muted, marginTop: 18, lineHeight: 1.45 }}>
                The shared map: services, dependencies, owners, standards and decisions.
              </div>
            </>,
            c.primary,
          )}
        </Rise>
      </AbsoluteFill>
      <Rise
        delay={Math.round(frames * 0.55)}
        style={{ position: 'absolute', bottom: 150, left: 0, right: 0, textAlign: 'center' }}
      >
        <span style={{ fontSize: 26, color: c.muted }}>
          Suggestions go back to an architect:{' '}
          <span style={{ color: c.text }}>nothing changes without a person.</span>
        </span>
      </Rise>
    </Backdrop>
  );
}

const SHIELDS = [
  ['Its own token', 'Revoke any time. Expires on its own. Rate limited.', c.application],
  [
    'Sees only what you allow',
    'Up to a classification level and chosen domains. Enforced in Atrium and by the database.',
    c.strategy,
  ],
  ['Suggests, never changes', 'Every proposal waits for an architect to approve it.', c.good],
  [
    'Data, not instructions',
    'Answers are marked as data, so text in the model cannot steer the agent.',
    c.watch,
  ],
  ['Every request logged', 'Who asked what, with which token, and when.', c.governance],
] as const;

export function Security({ frames }: { frames: number }) {
  const frame = useCurrentFrame();
  const per = (frames * 0.7) / SHIELDS.length;
  return (
    <Backdrop>
      <AbsoluteFill style={{ padding: '110px 180px', gap: 22, justifyContent: 'center' }}>
        {SHIELDS.map(([title, body, col], i) => {
          const o = ease(clamp((frame - 10 - i * per) / 16));
          const lit = frame >= 10 + i * per;
          return (
            <div
              key={title}
              style={{
                opacity: 0.25 + o * 0.75,
                transform: `translateX(${(1 - o) * -40}px)`,
                display: 'flex',
                alignItems: 'center',
                gap: 30,
                padding: '24px 32px',
                borderRadius: 20,
                background: lit ? c.surface : 'transparent',
                border: `1px solid ${lit ? `color-mix(in oklch, ${col} 45%, transparent)` : c.border}`,
              }}
            >
              <svg
                width={52}
                height={52}
                viewBox="0 0 24 24"
                fill="none"
                stroke={col}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z" />
                <path d="M9 12l2 2 4-4" opacity={o} />
              </svg>
              <div>
                <div style={{ fontSize: 36, fontWeight: 600 }}>{title}</div>
                <div style={{ fontSize: 25, color: c.muted, marginTop: 4 }}>{body}</div>
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 22,
          letterSpacing: 6,
          color: c.primary,
          fontWeight: 600,
          opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      >
        SAFE BY DESIGN
      </div>
    </Backdrop>
  );
}
