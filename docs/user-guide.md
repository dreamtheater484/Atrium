# User guide

Atrium keeps one map of your organisation: **capabilities** (what the business does),
**business processes**, **applications** and their **interfaces**, **data objects**,
**technologies**, **initiatives**, and the **principles, standards and decisions** that govern
them, grouped in **domains** and owned by **teams**.

There are no save buttons. Every change is kept, can be undone, and shows up in history.

## Getting around

- **Search or ask** (Ctrl K, or `/`): find anything, or ask in plain words: *what breaks if we
  retire Legacy CRM*, *who owns billing*, *what runs on Java 8*, *what is end of life this year*.
- **N** adds something of the type you are looking at. **Add → Import a file** loads a spreadsheet.
- **Today · Target · Scenarios** at the top decides which version of the map you see and edit.
- Click any box, row or node to open the **inspector** next to it; edit right there.

## Architects

**Start.** Load the sample, drop in a spreadsheet, or add your top-level capabilities. Pasting
rows copied from Excel into any table works too.

**Import.** Excel, CSV, ArchiMate exchange files, Backstage catalog files and `atrium.yaml` are
recognised. Atrium guesses what each sheet and column means (check or change it under *Check
columns*), matches rows to what exists (by id, key, exact name, then similar name) so nothing is
duplicated, and shows how many items are new, updated or unchanged before you import. It
remembers your choices for the next file with the same columns. Undo removes the whole import.

**Fill the gaps.** Home lists what is missing most. Grey suggestions in an element (owner and
domain from its parent, version and end-of-life dates for technology, likely capabilities for an
application) are accepted one by one or with *Accept all*.

**Data completeness.** Home and the dashboards show how much of the picture is known, so a total
never looks more complete than it is:
- *Run costs*: applications with a cost, either their own or a share of a contract. Mark a cost
  as an *Estimate* (Cost basis) and dashboards say how much of the total is estimated.
- *Integrations*: applications with at least one mapped data flow, dependency or interface. Tick
  *Standalone* for those that really exchange nothing. Impact analysis warns when applications in
  the chain have no mapped integrations, because the real impact may then be larger.
- *End-of-support dates*: versioned technologies and vendor products (not in-house software or
  SaaS). Set *Support model* to rolling releases or managed service for products without dates.
Click a row to see exactly what is missing.

**Contracts.** Add a contract (licence, subscription, support agreement) with its yearly cost and
link it to the applications or technologies it *covers*. Its cost is shared evenly over the
applications it covers, including those running on a covered technology, so lump-sum deals show
up in cost per domain and per capability without double counting.

**Find end-of-support dates.** *Find dates* on Home or the dashboard looks up missing dates:
endoflife.date first, then (when an AI provider is connected) Claude searches the vendor's site.
Only product names, vendors and versions are looked up, and nothing classified above *internal*.
Results arrive as one suggestion in *Changes*, each with the page it came from and a quote; drop
the ones you don't trust and approve the rest. Dates found this way are checked again after six
months.

**Extended support.** *Extended support until* records how long a vendor sells paid extended
support. Tick *On extended support* when you actually pay for it: then the item counts as
"watch" until that date instead of "act".

**Views.**
- *Capability map*: coloured by health, cost, lifecycle, coverage, TIME, importance or quality.
- *Graph*: starts with domains and how much they talk to each other; click a domain to see its
  applications, or centre on one element to see everything around it, its data flows or its
  impact.
- *Landscape*: applications grouped by domain. *Table*: sort, filter, select and bulk edit.
- *Radar*: technologies by ring and category. *Roadmap*: initiatives and lifecycles on a timeline.
- The time slider shows the map on any date, from the lifecycle dates you entered.
- Every view exports: PNG and SVG for graphs, PowerPoint for maps and dashboards, Excel and CSV
  for tables, ArchiMate for the whole model.

**Plan.** Switch to *Target* (or create a scenario) and edit as usual: retire an application,
add a platform, move a capability. Changes are kept apart from today and marked on the map.
*See what's different* lists them; *Submit for review* asks colleagues to agree. *Apply to today*
makes it reality when the time comes.

**Review.** Edits from people outside their area, CI syncs for other teams and agent proposals
arrive in *Changes → Waiting for review*, each with a before and after. *Approve and apply* or
*Decline* with a note; anything applied can be undone from history.

**Reference models.** Settings → Industry packs. Install the starter capability reference, or
load your licensed TM Forum files (eTOM, SID, ODA Functional Framework and Components). *Map your
model* suggests the closest reference element for each of yours; strong matches are pre-ticked,
so mapping is one click. Updating a pack later moves your mappings to the new version.

## Managers

Open **Dashboards**. *Portfolio health* shows applications in use, run cost, the share that is
healthy and end-of-life exposure, the health split, cost per domain and the TIME quadrant
(invest, tolerate, migrate, eliminate). *Cost* splits spend per capability, *Technology* shows
end-of-life risk and the radar, *Architecture* the model's completeness.

- Every number is clickable and shows the applications behind it, with the reasons.
- **Share → PowerPoint** gives an editable deck with native charts; **Copy link** shares the view;
  **Underlying data** downloads Excel.
- **Customise** copies a dashboard so you can add, remove and resize widgets.
- The **Managers** view on Home shows the same essentials when you open Atrium.

## Engineers

The **Engineers** view on Home lists your team's services, their health and what needs
attention. Services your team owns, you edit directly; elsewhere your edits become suggestions.
Describe a service in `atrium.yaml`, check it and sync it from CI, and connect your coding
assistant: see [agents.md](agents.md) and [atrium-yaml.md](atrium-yaml.md).

## Teams, roles and reviews (team mode)

| Role | Can |
|---|---|
| Admin | Everything, plus people, tokens, webhooks, packs and backups |
| Architect | Edit everything they may see, edit scenarios, review suggestions |
| Engineer | Edit their teams' services; suggest everything else |
| Manager | Read, use dashboards and export; suggest changes |
| Viewer | Read and export |

Classification (public, internal, confidential, restricted) limits what people and tokens can
see. Comments support @mentions; people get notifications for mentions and reviews, and see who
else is looking at the same thing.

## Keyboard

| Key | |
|---|---|
| Ctrl K or `/` | Search or ask |
| N | Add an element |
| Shift Enter (in Add) | Add and start the next one |
| Esc | Close the inspector or a dialog |
