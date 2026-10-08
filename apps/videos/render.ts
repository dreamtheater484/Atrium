// Renders the videos to out/ as 1080p MP4, with SRT captions and a poster image each.
//   pnpm videos:render                 all five
//   pnpm videos:render -- tour agents  just these
//
// Remotion renders the picture; the voice track is mixed here and added with ffmpeg. That keeps
// rendering independent of ffprobe, which some Windows setups (Smart App Control) block.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/scripts';
import type { VideoData } from './src/types';

const FPS = 30;
const RATE = 48_000;

const videos = JSON.parse(
  readFileSync(join(ROOT, 'src', 'generated', 'videos.json'), 'utf8'),
) as VideoData[];
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const out = join(ROOT, 'out');
mkdirSync(out, { recursive: true });

const stamp = (t: number) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};

const remotion = join(
  ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'remotion.cmd' : 'remotion',
);
const run = (args: string[], inherit = true) =>
  execFileSync(remotion, args, {
    cwd: ROOT,
    stdio: inherit ? 'inherit' : 'ignore',
    shell: process.platform === 'win32',
  });

/** Samples of a 16-bit PCM WAV file. */
const samples = (buf: Buffer) => {
  let pos = 12;
  while (pos + 8 <= buf.length) {
    const size = buf.readUInt32LE(pos + 4);
    if (buf.toString('ascii', pos, pos + 4) === 'data') {
      const data = buf.subarray(pos + 8, Math.min(buf.length, pos + 8 + size));
      return new Int16Array(
        data.buffer.slice(data.byteOffset, data.byteOffset + (data.length & ~1)),
      );
    }
    pos += 8 + size + (size % 2);
  }
  throw new Error('Not a WAV file');
};

/** Any audio file as mono 48 kHz 16-bit samples (Remotion's ffmpeg only writes 16-bit PCM). */
const decode = (file: string, tmp: string) => {
  run(
    [
      'ffmpeg',
      '-v',
      'error',
      '-y',
      '-i',
      file,
      '-c:a',
      'pcm_s16le',
      '-ac',
      '1',
      '-ar',
      `${RATE}`,
      tmp,
    ],
    false,
  );
  const pcm = samples(readFileSync(tmp));
  rmSync(tmp);
  return pcm;
};

/** One voice track for the whole video, each clip placed where its scene starts. */
function voiceTrack(v: VideoData, file: string) {
  const frames = v.scenes.reduce((n, s) => n + Math.round(s.duration * FPS), 0);
  const track = new Int16Array(Math.ceil((frames / FPS) * RATE));
  let start = 0;
  for (const scene of v.scenes) {
    if (scene.audio) {
      const clip = decode(join(ROOT, 'public', scene.audio), `${file}.clip.wav`);
      const at = Math.round(((start + Math.round(scene.leadIn * FPS)) / FPS) * RATE);
      track.set(clip.subarray(0, Math.max(0, track.length - at)), at);
    }
    start += Math.round(scene.duration * FPS);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + track.byteLength, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(track.byteLength, 40);
  writeFileSync(file, Buffer.concat([header, Buffer.from(track.buffer)]));
}

const props = join(out, '.silent.json');
writeFileSync(props, JSON.stringify({ silent: true }));
for (const v of videos) {
  if (wanted.length && !wanted.includes(v.id)) continue;
  const n = String(videos.indexOf(v) + 1).padStart(2, '0');
  const base = join(out, `${n}-${v.id}`);
  // Captions file next to the video.
  let t = 0;
  let i = 1;
  const srt: string[] = [];
  for (const scene of v.scenes) {
    for (const cap of scene.captions)
      srt.push(`${i++}\n${stamp(t + cap.start)} --> ${stamp(t + cap.end)}\n${cap.text}\n`);
    t += scene.duration;
  }
  writeFileSync(`${base}.srt`, srt.join('\n'));
  console.log(`Rendering ${v.title}…`);
  run(['render', 'src/index.ts', v.id, `${base}.picture.mp4`, `--props=${props}`]);
  if (v.scenes.some((s) => s.audio)) {
    voiceTrack(v, `${base}.voice.wav`);
    run([
      'ffmpeg',
      '-v',
      'error',
      '-y',
      '-i',
      `${base}.picture.mp4`,
      '-i',
      `${base}.voice.wav`,
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      `${base}.mp4`,
    ]);
    rmSync(`${base}.voice.wav`);
    rmSync(`${base}.picture.mp4`);
  } else {
    renameSync(`${base}.picture.mp4`, `${base}.mp4`);
  }
  run(['still', 'src/index.ts', v.id, `${base}.jpg`, '--frame=75', `--props=${props}`]);
}
rmSync(props);
