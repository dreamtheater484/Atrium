import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { c } from '../theme';
import { Backdrop, Kicker, LogoMark, Rise } from './common';

export function TitleCard({
  title,
  subtitle,
  audience,
}: {
  title: string;
  subtitle?: string;
  audience: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const words = title.split(' ');
  return (
    <Backdrop>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 180px',
          gap: 34,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            transform: `scale(${0.6 + logo * 0.4})`,
            transformOrigin: 'left center',
            opacity: logo,
          }}
        >
          <LogoMark size={74} />
          <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: -0.5 }}>Atrium</span>
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 104,
            lineHeight: 1.04,
            fontWeight: 700,
            letterSpacing: -3,
            maxWidth: 1500,
          }}
        >
          {words.map((w, i) => (
            <span
              key={`${w}-${i}`}
              style={{
                display: 'inline-block',
                marginRight: 26,
                opacity: interpolate(frame, [8 + i * 3, 22 + i * 3], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
                transform: `translateY(${interpolate(frame, [8 + i * 3, 26 + i * 3], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
              }}
            >
              {w}
            </span>
          ))}
        </h1>
        {subtitle && (
          <Rise delay={20 + words.length * 3}>
            <div style={{ fontSize: 38, color: c.muted, fontWeight: 400 }}>{subtitle}</div>
          </Rise>
        )}
        <Rise delay={30 + words.length * 3}>
          <Kicker>{audience}</Kicker>
        </Rise>
      </div>
    </Backdrop>
  );
}

export function EndCard({ tagline }: { tagline: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 13 } });
  return (
    <Backdrop>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 40,
          textAlign: 'center',
        }}
      >
        <div style={{ transform: `scale(${logo})` }}>
          <LogoMark size={150} />
        </div>
        <Rise delay={10}>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -3 }}>Atrium</div>
        </Rise>
        <Rise delay={20}>
          <div style={{ fontSize: 42, color: c.muted, maxWidth: 1300, lineHeight: 1.3 }}>
            {tagline}
          </div>
        </Rise>
        <Rise delay={34}>
          <div style={{ display: 'flex', gap: 18, marginTop: 20 }}>
            {[
              ['Architects', c.strategy],
              ['Managers', c.business],
              ['Engineers & AI', c.application],
            ].map(([label, col]) => (
              <span
                key={label}
                style={{
                  fontSize: 26,
                  padding: '12px 26px',
                  borderRadius: 999,
                  border: `1px solid color-mix(in oklch, ${col} 45%, transparent)`,
                  background: `color-mix(in oklch, ${col} 14%, transparent)`,
                  color: col,
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </Rise>
      </div>
    </Backdrop>
  );
}
