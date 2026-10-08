# Atrium demo videos

Five videos, generated from the real app so they stay current:

| # | Video | For | Script |
|---|---|---|---|
| 1 | Atrium in two minutes | Everyone | [scripts/01-tour.md](scripts/01-tour.md) |
| 2 | From spreadsheet to target state | Architects | [scripts/02-architects.md](scripts/02-architects.md) |
| 3 | Decisions in three clicks | Managers | [scripts/03-managers.md](scripts/03-managers.md) |
| 4 | Architecture where you work | Engineers | [scripts/04-engineers.md](scripts/04-engineers.md) |
| 5 | Architecture-aware AI coding | Engineers and architects | [scripts/05-agents.md](scripts/05-agents.md) |

## How they are made

1. **Scripts** (`scripts/*.md`): one `##` section per scene, a `> ` line for what is on screen
   (`title`, `shot`, `diagram`, `code`, `terminal`, `agent` or `end`), then the voiceover.
2. **Capture** (`capture/`): starts Atrium on a fresh database with the sample, then records each
   shot as sharp 2× screenshots in dark mode, plus real output of the CLI and the MCP tools.
   Nothing is mocked: the terminal and agent scenes show what Atrium really returned.
3. **Voice** (`voice/`): Kokoro-82M (Apache 2.0, free) reads each scene; clip lengths set the
   scene lengths and the caption timing.
4. **Composition** (`src/`): Remotion animates the pointer, clicks and camera over the
   screenshots, and adds title cards, diagrams, burned-in captions and the voice.
5. **Render** (`render.ts`): Remotion renders the picture, then the voice clips are mixed into one
   track and added with ffmpeg. The result is a 1080p MP4, an SRT caption file and a poster
   image per video, in `out/` (not committed). Rendering takes about two minutes per video on
   a recent 8-core CPU.

## Commands

```bash
pnpm build                                   # from the repository root, once
pnpm --filter @atrium/videos capture         # screens and tool output  (~2 min)
pnpm --filter @atrium/videos voice --voice   # voiceover with Kokoro    (CPU is fine)
pnpm --filter @atrium/videos studio          # preview and tweak in the browser
pnpm --filter @atrium/videos render          # all five videos to out/
pnpm --filter @atrium/videos render -- tour  # just one
```

Without `--voice`, `voice` only estimates scene lengths from the text, which is enough to preview.

## Licences

- Remotion is free for individuals and small companies; larger companies need a Remotion company
  licence to render. Check <https://remotion.dev/license> for your situation.
- Kokoro-82M is Apache 2.0. The voices are free to use, including commercially.
- No music is included.

See [voice/README.md](voice/README.md) for trying other free voices on a GPU machine.
