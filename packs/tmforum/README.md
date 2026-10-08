# TM Forum pack

Loads TM Forum's reference models into Atrium as a read-only **reference layer**:

| Framework | Becomes in Atrium |
|---|---|
| eTOM (Business Process Framework) | Reference business processes, with their level hierarchy |
| SID (Information Framework) | Reference data objects (domains, ABEs, entities) |
| ODA Functional Framework | Reference capabilities (functional domains, blocks, functions) |
| ODA Components | Reference applications, linked to the Open APIs they expose and use |

Your own elements link to the reference with **maps to**. That gives gap and overlap heatmaps against the standard, and lets coding agents ask "which ODA component covers this?".

## Licensing

TM Forum material is largely member content. This folder contains **only the importer configuration** (`manifest.json`), never TM Forum content. You load the source files you are licensed to use.

## Loading or updating

1. Settings → Industry packs → TM Forum → **Add files**.
2. Drop the spreadsheets (Excel or CSV) exported from TM Forum. Atrium detects which framework each sheet holds from its name and columns (see `detect` in `manifest.json`), and finds the id, name, parent and description columns (see `columns`).
3. Atrium shows what will be added, renamed, changed or removed compared to the installed version. Only the latest version is kept.
4. Your existing mappings move to the new version automatically. When an element disappears, a mapping is kept on the closest replacement if the source says so; otherwise it is flagged for review.

Hierarchies come from a parent column, or from dotted identifiers (`1.2.3` sits under `1.2`), which is how eTOM numbers its processes.

## Extending

The pack format is described in `packages/packs-core/src/index.ts` (`atrium-pack` JSON). Any source that can be turned into that JSON can be installed. To add another industry, create a folder like this one with a `manifest.json`.
