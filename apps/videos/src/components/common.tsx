import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { c, clamp, ease, sans } from '../theme';

/** Deep, quiet background with two slowly drifting glows and a faint dot grid. */
export function Backdrop({ children }: { children?: ReactNode }) {
  const frame = useCurrentFrame();
  const t = frame / 30;
  return (
    <AbsoluteFill style={{ background: c.bg, fontFamily: sans, color: c.text, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          width: 1400,
          height: 1400,
          left: -300 + Math.sin(t / 7) * 120,
          top: -700 + Math.cos(t / 9) * 80,
          borderRadius: '50%',
          background: `radial-gradient(circle, color-mix(in oklch, ${c.primary} 32%, transparent), transparent 62%)`,
          filter: 'blur(40px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 1200,
          height: 1200,
          right: -400 + Math.cos(t / 8) * 100,
          bottom: -700 + Math.sin(t / 6) * 90,
          borderRadius: '50%',
          background: `radial-gradient(circle, color-mix(in oklch, ${c.data} 20%, transparent), transparent 60%)`,
          filter: 'blur(50px)',
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(color-mix(in oklch, ${c.text} 9%, transparent) 1.2px, transparent 1.2px)`,
          backgroundSize: '34px 34px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 78%)',
        }}
      />
      {children}
    </AbsoluteFill>
  );
}

export function LogoMark({ size = 64, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={style} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill={c.primary} />
      <path
        d="M16 48V30a16 16 0 0 1 32 0v18"
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M26 48V32a6 6 0 0 1 12 0v16"
        fill="none"
        stroke="white"
        strokeOpacity="0.6"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Fades a whole scene in and out so cuts feel soft. */
export function SceneFade({ children, frames }: { children: ReactNode; frames: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10, frames - 10, frames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

/** Element appearing with a short rise, starting at `delay` frames. */
export function Rise({
  children,
  delay = 0,
  distance = 24,
  duration = 18,
  style,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const p = ease(clamp((frame - delay) / duration));
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * distance}px)`, ...style }}>
      {children}
    </div>
  );
}

export function Kicker({ children, color = c.primary }: { children: ReactNode; color?: string }) {
  return (
    <div
      style={{
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: 6,
        textTransform: 'uppercase',
        color,
      }}
    >
      {children}
    </div>
  );
}

/** A window frame like the app's own, used around screens, terminals and code. */
export function Window({
  children,
  title,
  width,
  height,
  style,
}: {
  children: ReactNode;
  title?: string;
  width: number;
  height: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 18,
        background: c.surface,
        border: `1px solid ${c.borderStrong}`,
        boxShadow: `0 40px 120px -20px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03), 0 0 80px -30px ${c.primary}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      <div
        style={{
          height: 42,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '0 18px',
          background: c.surface2,
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        {[c.act, c.watch, c.good].map((col) => (
          <span
            key={col}
            style={{ width: 12, height: 12, borderRadius: 6, background: col, opacity: 0.85 }}
          />
        ))}
        {title && (
          <span
            style={{
              marginLeft: 14,
              fontSize: 16,
              color: c.muted,
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              padding: '3px 14px',
            }}
          >
            {title}
          </span>
        )}
      </div>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

export function useSeconds() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
}
