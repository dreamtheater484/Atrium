# TM Forum pack

Loads TM Forum's reference models into Atrium as a read-only **reference layer**. It reads the
Excel workbooks TM Forum publishes to members:

| File | Framework | Becomes in Atrium |
|---|---|---|
| GB921 *Business Process Framework Processes in Excel* | eTOM | Reference business processes: level 1 domains (Market, Sales, Product, …) down to level 7, with their vertical groups |
| GB922 *Information Framework (SID) Model in Excel* | SID | Reference data objects: domains, aggregate business entities (ABEs) and business entities, with their attribute names |
| GB1033F *Functional Framework in Excel* | ODA Functional Framework | Reference capabilities: functional domains, aggregate functions (levels 1 and 2) and functions |
| GB929F *Application Framework (TAM) in Excel* | Application Framework | Reference applications by domain, linked to the functions they contain ("realizes") |
| A spreadsheet of ODA components | ODA Components | Reference applications, read by their column headers (id, name, description) |

Your own elements link to the reference with **maps to**. That gives gap and overlap heatmaps against the standard, and lets coding agents ask "which TM Forum application covers this?".

## Licensing

TM Forum material is largely member content. This folder contains **only the importers** (`manifest.json` and `src/`), never TM Forum content; the tests use small invented workbooks. You load the source files you are licensed to use.

## Loading or updating

1. Settings → Industry packs → TM Forum → **Add source files** (or **Update with new files**).
2. Choose the workbooks, several at once. Atrium recognises each one by its columns, whatever the file is called. Leave the version empty to take it from the files ("Version 26.0.0" on the title page).
3. **Check the files** shows what each framework contributes, what will be added, changed, renamed or removed, and per file which sheets were read and why others were skipped.
4. **Install**. All four workbooks (about 7,300 elements) take around half a minute.

Good to know:

- **Only the frameworks in the upload are replaced.** Loading just a new SID file leaves the installed eTOM, functions and applications as they are.
- **Load GB929F together with GB1033F** the first time, so the applications can be linked to their functions. Later updates of either file keep the links they can.
- Each framework remembers the release it came from; the pack card shows it.
- Your mappings move along: elements are matched on their TM Forum id, then on name. When an element disappears, mappings to it are flagged for review.

## What the readers take care of

The workbooks are written for people, so the readers smooth over their layout:

- **Cover pages, notices, change logs and "Deleted" sheets** are skipped. Rows marked deleted ("(Deleted)", "deliberately unused") inside the lists are left out.
- **eTOM** lists a process once per vertical group: it is loaded once, with all its groups. The level 1 domains have no rows of their own and are named from the Domain column. A process whose parent was removed goes under the nearest higher process. The "[\*\*]" marker is kept as an attribute, not in the name.
- **SID** is an outline, not a table ("Parent.Child" in column A, entities in B, attributes in C). Only the "All Domains" sheet is read, as the domain sheets repeat it. An entity listed under several ABEs is placed under the first and lists the others.
- **Functional Framework**: aggregate functions come from "AF All" and functions from "Functions". Descriptions that spill over into unnamed columns are joined back together. Functions in a placeholder group ("Aggregated Function TBD") go under their domain, or under "Functions without a domain".
- **Application Framework**: Excel stored some level 1 ids as numbers, which turns "5.10" into 5.1. The reader puts them back using the sub-applications ("5.10.1" belongs under the 5.1 it shares words with). When nothing tells two applications on one id apart, the second gets "(2)" after its id.
- Each element keeps its TM Forum id as its key, prefixed with the framework (`etom:1.1.1`, `sid:CustomerAccount`, `oda-ff:1065`, `tam:5.10.1`), plus attributes such as `level`, `domain` and `uid`.

## Extending

Generic pack logic (combining files, links by name, column detection) is in `packages/packs-core/src/sources.ts`; the pack format in `packages/packs-core/src/index.ts` (`atrium-pack` JSON). Any source that can be turned into that JSON can be installed. To support another TM Forum workbook, add a reader in `src/` and list it in `src/index.ts`. To add another industry, create a folder like this one with a `manifest.json`, and readers when its sources need them.
