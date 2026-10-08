import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

export const { fontFamily: sans } = loadInter('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: ['latin'],
});
export const { fontFamily: mono } = loadMono('normal', {
  weights: ['400', '600'],
  subsets: ['latin'],
});

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** The app's dark theme tokens, so the videos look like the product. */
export const c = {
  bg: 'oklch(0.145 0.014 262)',
  background: 'oklch(0.165 0.012 262)',
  surface: 'oklch(0.205 0.013 262)',
  surface2: 'oklch(0.235 0.013 262)',
  surface3: 'oklch(0.27 0.014 262)',
  border: 'oklch(0.29 0.013 262)',
  borderStrong: 'oklch(0.36 0.014 262)',
  text: 'oklch(0.955 0.005 262)',
  muted: 'oklch(0.72 0.014 262)',
  subtle: 'oklch(0.6 0.014 262)',
  primary: 'oklch(0.68 0.16 274)',
  primarySoft: 'oklch(0.29 0.06 274)',
  primarySoftText: 'oklch(0.85 0.08 274)',
  good: 'oklch(0.7 0.12 165)',
  goodSoft: 'oklch(0.3 0.05 165)',
  watch: 'oklch(0.8 0.14 78)',
  watchSoft: 'oklch(0.32 0.06 75)',
  act: 'oklch(0.68 0.18 25)',
  actSoft: 'oklch(0.31 0.07 22)',
  strategy: 'oklch(0.72 0.14 300)',
  business: 'oklch(0.8 0.12 80)',
  application: 'oklch(0.72 0.12 240)',
  data: 'oklch(0.74 0.1 195)',
  technology: 'oklch(0.74 0.12 150)',
  governance: 'oklch(0.72 0.13 15)',
};

export const ease = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
