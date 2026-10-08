# Voiceover

`generate.ts` reads each scene's text with **Kokoro-82M** through `kokoro-js` (ONNX, runs on the
CPU). It writes `public/voice/<video>/<scene>.wav` and updates `src/generated/videos.json` with
the real clip lengths, which set scene lengths and caption timing.

```bash
pnpm --filter @atrium/videos voice --voice                 # all videos
pnpm --filter @atrium/videos voice --voice --only agents   # one video
ATRIUM_VOICE=am_michael pnpm --filter @atrium/videos voice --voice   # another Kokoro voice
ATRIUM_VOICE_SPEED=0.95 pnpm --filter @atrium/videos voice --voice   # a little slower
```

Good Kokoro voices for narration: `af_heart` (default), `af_bella`, `am_michael`, `bf_emma`,
`bm_george`.

## On a GPU machine (for example an RTX 5090)

Kokoro is already the best quality-to-effort choice and needs no GPU. To compare other free,
commercially usable models, generate WAV files with the same names; scene lengths and captions follow automatically:

1. Run any TTS that writes `public/voice/<video>/<scene>.wav` (mono or stereo, any sample rate).
   The scene text is in `src/generated/videos.json` (`narration` per scene), so a short Python
   script can loop over it. Check each model's licence before using it commercially.
2. Run `pnpm --filter @atrium/videos voice` (without `--voice`): it keeps your WAV files and
   recalculates scene lengths and captions from them.
3. Render: `pnpm --filter @atrium/videos render`.

Rendering itself is CPU-bound in Remotion; on a fast machine add `--concurrency=16` to the
`remotion render` call in `render.ts` if you want it quicker.
