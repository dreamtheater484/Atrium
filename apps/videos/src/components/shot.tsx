import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { c, clamp, easeInOut } from '../theme';
import type { ShotData } from '../types';
import { Backdrop, Window } from './common';

const WIN_W = 1600;
const WIN_H = 900 + 42;

/**
 * Plays a captured sequence. For each step the pointer travels to what was clicked (on the
 * previous screen), clicks, the screen changes, and the camera eases towards the step's focus.
 */
export function Shot({ shot, path, frames }: { shot: ShotData; path: string; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const steps = shot.steps;
  const total = steps.reduce((n, s) => n + s.weight, 0) || 1;
  // Frame where each step starts.
  const starts: number[] = [];
  let acc = 0;
  for (const s of steps) {
    starts.push(Math.round((acc / total) * frames));
    acc += s.weight;
  }
  let i = 0;
  while (i + 1 < steps.length && frame >= starts[i + 1]!) i++;
  const stepStart = starts[i]!;
  const stepLen = (i + 1 < steps.length ? starts[i + 1]! : frames) - stepStart;
  const local = frame - stepStart;
  const step = steps[i]!;
  const prev = steps[i - 1];

  // Phases inside a step: travel (on the previous screen), click, switch, settle.
  const travel = i === 0 || !step.cursor ? 0 : Math.min(stepLen * 0.34, fps * 1.1);
  const switchAt = travel + (step.click ? 6 : 0);
  const showPrev = i > 0 && local < switchAt;
  const fade = clamp((local - switchAt) / 7);

  // Pointer position, in screenshot pixels.
  const lastCursor = (k: number) => {
    for (let j = k; j >= 0; j--) if (steps[j]!.cursor) return steps[j]!.cursor!;
    return { x: shot.width * 0.55, y: shot.height * 0.6 };
  };
  const from = lastCursor(i - 1);
  const to = step.cursor ?? from;
  const tp = travel ? easeInOut(clamp(local / travel)) : 1;
  // A gentle arc instead of a straight line.
  const arc =
    Math.sin(tp * Math.PI) * Math.min(80, Math.hypot(to.x - from.x, to.y - from.y) * 0.12);
  const cx = from.x + (to.x - from.x) * tp;
  const cy = from.y + (to.y - from.y) * tp - arc;

  // Camera: wide while the pointer travels, then towards the focus of the new screen.
  const scale = WIN_W / shot.width;
  const focusOf = (s: typeof step | undefined) => s?.focus ?? null;
  const zoomFor = (f: ReturnType<typeof focusOf>) => {
    if (!f) return { z: 1, fx: shot.width / 2, fy: shot.height / 2 };
    const z = Math.min(1.5, Math.max(1, (shot.width * 0.62) / f.w, (shot.height * 0.62) / f.h));
    return { z, fx: f.x + f.w / 2, fy: f.y + f.h / 2 };
  };
  const settle = easeInOut(clamp((local - switchAt - 4) / (fps * 1.2)));
  const prevCam = zoomFor(focusOf(prev));
  const thisCam = zoomFor(focusOf(step));
  // While travelling, ease out of the previous zoom so the target is in view.
  const out = travel ? easeInOut(clamp(local / Math.max(1, travel * 0.8))) : 1;
  const base =
    showPrev || local < switchAt + 4
      ? {
          z: prevCam.z + (1 - prevCam.z) * out,
          fx: prevCam.fx + (shot.width / 2 - prevCam.fx) * out,
          fy: prevCam.fy + (shot.height / 2 - prevCam.fy) * out,
        }
      : { z: 1, fx: shot.width / 2, fy: shot.height / 2 };
  const cam =
    showPrev || local < switchAt + 4
      ? base
      : {
          z: 1 + (thisCam.z - 1) * settle,
          fx: shot.width / 2 + (thisCam.fx - shot.width / 2) * settle,
          fy: shot.height / 2 + (thisCam.fy - shot.height / 2) * settle,
        };
  // Keep the zoomed view inside the screenshot.
  const viewW = shot.width / cam.z;
  const viewH = shot.height / cam.z;
  const vx = clamp(cam.fx - viewW / 2, 0, shot.width - viewW);
  const vy = clamp(cam.fy - viewH / 2, 0, shot.height - viewH);
  const transform = `scale(${cam.z * scale}) translate(${-vx}px, ${-vy}px)`;

  const clickAt = travel + 1;
  const ripple = step.click ? clamp((local - clickAt) / 14) : 0;
  const pressed = step.click && local >= clickAt - 2 && local <= clickAt + 5;

  const img = (s: typeof step, opacity: number) => (
    <Img
      src={staticFile(`captures/${path}/${s.file}`)}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: shot.width,
        height: shot.height,
        opacity,
      }}
    />
  );

  return (
    <Backdrop>
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 34 }}>
        <Window
          width={WIN_W}
          height={WIN_H}
          title={`localhost:7300${(showPrev && prev ? prev : step).label ?? ''}`}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform }}>
            {showPrev && prev ? (
              img(prev, 1)
            ) : (
              <>
                {prev && fade < 1 && img(prev, 1)}
                {img(step, i === 0 ? 1 : fade)}
              </>
            )}
            {/* Pointer, drawn in screenshot space so it follows the camera. */}
            <div
              style={{
                position: 'absolute',
                left: cx,
                top: cy,
                transform: `scale(${(1 / (cam.z * scale)) * 1.05})`,
                transformOrigin: '0 0',
              }}
            >
              {step.click && ripple > 0 && ripple < 1 && (
                <div
                  style={{
                    position: 'absolute',
                    left: -40 * (0.4 + ripple),
                    top: -40 * (0.4 + ripple),
                    width: 80 * (0.4 + ripple),
                    height: 80 * (0.4 + ripple),
                    borderRadius: '50%',
                    border: `4px solid ${c.primary}`,
                    opacity: 1 - ripple,
                  }}
                />
              )}
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                style={{
                  transform: `scale(${pressed ? 0.86 : 1})`,
                  filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))',
                }}
              >
                <path
                  d="M4 2.5 L4 19.5 L8.6 15.4 L11.6 22 L14.6 20.7 L11.7 14.2 L18 14.2 Z"
                  fill="white"
                  stroke="black"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </Window>
      </AbsoluteFill>
    </Backdrop>
  );
}

export function MissingShot({ name }: { name: string }) {
  return (
    <Backdrop>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Window width={WIN_W} height={WIN_H} title="localhost:7300">
          <AbsoluteFill
            style={{ alignItems: 'center', justifyContent: 'center', color: c.muted, fontSize: 34 }}
          >
            Screen “{name}” not captured yet: run pnpm videos:capture
          </AbsoluteFill>
        </Window>
      </AbsoluteFill>
    </Backdrop>
  );
}
