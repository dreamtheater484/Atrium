// Builds src/generated/videos.json from the scripts and, with --voice, records the voiceover.
//
//   pnpm --filter @atrium/videos voice            durations estimated from word counts
//   pnpm --filter @atrium/videos voice --voice    record every scene with Kokoro (CPU is fine)
//   ... --voice --only tour                       just one video
//
// Kokoro-82M (Apache 2.0) runs locally through kokoro-js; the model downloads once from
// Hugging Face. To try a different free voice on a GPU machine, see voice/README.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readScripts, sentences } from '../lib/scripts';
import type { Caption, Scene, VideoData } from '../src/types';

const args = process.argv.slice(2);
const record = args.includes('--voice');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const VOICE = process.env.ATRIUM_VOICE ?? 'af_heart';
const SPEED = Number(process.env.ATRIUM_VOICE_SPEED ?? 1);
const LEAD_IN = 0.45;
const TAIL = 0.9;
const WORDS_PER_SECOND = 2.55;

function captionsFor(text: string, start: number, length: number): Caption[] {
  const parts = sentences(text);
  const total = parts.reduce((n, s) => n + s.length, 0) || 1;
  let t = start;
  return parts.map((s) => {
    const d = (s.length / total) * length;
    const c = { text: s, start: t, end: t + d };
    t += d;
    return c;
  });
}

function wavDuration(samples: number, rate: number) {
  return samples / rate;
}

/** Length of a WAV file, walking its chunks (headers differ between tools). */
function wavSeconds(buf: Buffer): number {
  let pos = 12;
  let byteRate = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') byteRate = buf.readUInt32LE(pos + 16);
    if (id === 'data' && byteRate) return size / byteRate;
    pos += 8 + size + (size % 2);
  }
  throw new Error('Not a WAV file');
}

type Tts = {
  generate: (
    text: string,
    o: { voice: string; speed?: number },
  ) => Promise<{ audio: Float32Array; sampling_rate: number; save: (p: string) => Promise<void> }>;
};

async function loadTts(): Promise<Tts> {
  const { KokoroTTS } = await import('kokoro-js');
  console.log('Loading Kokoro (first time downloads the model)…');
  return (await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'fp32',
    device: 'cpu',
  })) as unknown as Tts;
}

const scripts = readScripts();
const tts = record ? await loadTts() : null;
const out: VideoData[] = [];
for (const script of scripts) {
  const scenes: Scene[] = [];
  for (const sc of script.scenes) {
    const file = `voice/${script.id}/${sc.id}.wav`;
    const abs = join(ROOT, 'public', file);
    let speech: number;
    if (tts && (!only || only === script.id)) {
      mkdirSync(join(ROOT, 'public', 'voice', script.id), { recursive: true });
      const audio = await tts.generate(sc.narration, { voice: VOICE, speed: SPEED });
      await audio.save(abs);
      speech = wavDuration(audio.audio.length, audio.sampling_rate);
      console.log(`  ${script.id} › ${sc.id}: ${speech.toFixed(1)} s`);
    } else if (existsSync(abs)) {
      // Keep clips recorded earlier (by Kokoro or any other TTS) and use their real length.
      speech = wavSeconds(readFileSync(abs));
    } else {
      speech = sc.narration.split(/\s+/).length / WORDS_PER_SECOND;
    }
    const hasAudio = existsSync(abs);
    const minimum = sc.visual.kind === 'end' ? 6 : 3;
    scenes.push({
      id: sc.id,
      visual: sc.visual,
      narration: sc.narration,
      duration: Math.max(minimum, LEAD_IN + speech + TAIL),
      audio: hasAudio ? file : null,
      leadIn: LEAD_IN,
      captions: captionsFor(sc.narration, LEAD_IN, speech),
    });
  }
  out.push({ id: script.id, title: script.title, audience: script.audience, scenes });
  const total = scenes.reduce((n, s) => n + s.duration, 0);
  console.log(
    `${script.title}: ${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')}`,
  );
}
mkdirSync(join(ROOT, 'src', 'generated'), { recursive: true });
writeFileSync(join(ROOT, 'src', 'generated', 'videos.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log('Wrote src/generated/videos.json');
