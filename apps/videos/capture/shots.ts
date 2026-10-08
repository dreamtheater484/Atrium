// The screens each video scene shows, as small step lists. Each step is one screenshot taken
// after the action; `sel` is where the pointer goes, `focus` is where the camera eases to.
// Selectors are Playwright selectors; {name} is replaced with ids looked up at capture time.

export type Step = { weight?: number; wait?: number; focus?: string; pad?: number } & (
  | { do: 'goto'; path: string }
  | { do: 'click'; sel: string }
  | { do: 'hover'; sel: string }
  | { do: 'type'; sel?: string; text: string }
  | { do: 'press'; key: string }
  | { do: 'files'; sel: string; file: string }
  | { do: 'eval'; js: string }
);

const btn = (name: string) => `role=button[name="${name}"]`;
const item = (name: string) => `role=menuitem[name=/${name}/]`;

export const SHOTS: Record<string, { steps: Step[] }> = {
  'first-run': {
    steps: [
      { do: 'goto', path: '/', weight: 1.4 },
      {
        do: 'hover',
        sel: btn('Load the sample'),
        focus: 'text=Explore a sample',
        pad: 140,
        weight: 1.2,
      },
      { do: 'click', sel: btn('Load the sample'), wait: 2200, weight: 2 },
    ],
  },
  'explore-map': {
    steps: [
      {
        do: 'goto',
        path: '/explore?type=capability&view=map&overlay=health',
        wait: 1200,
        weight: 1.3,
      },
      { do: 'click', sel: 'role=combobox[name="Overlay"]', weight: 0.8 },
      { do: 'click', sel: 'role=option[name="Cost"]', weight: 1.3 },
      {
        do: 'click',
        sel: 'text=Customer Bill Management',
        focus: 'role=dialog',
        pad: 8,
        wait: 1200,
        weight: 2,
      },
    ],
  },
  dashboard: {
    steps: [
      { do: 'goto', path: '/dashboards?id=portfolio', wait: 1500, weight: 1.4 },
      {
        do: 'hover',
        sel: 'text=TIME quadrant',
        focus: 'text=TIME quadrant',
        pad: 260,
        weight: 1.4,
      },
      { do: 'click', sel: btn('Share'), weight: 0.8 },
      { do: 'hover', sel: item('PowerPoint'), focus: 'role=menu', pad: 60, weight: 1.2 },
    ],
  },
  'agent-connect': {
    steps: [
      { do: 'goto', path: '/settings?tab=agents', weight: 1 },
      { do: 'click', sel: btn('Connect coding agent'), focus: 'role=dialog', pad: 10, weight: 1.4 },
      {
        do: 'click',
        sel: btn('Create connection'),
        focus: 'role=dialog',
        pad: 10,
        wait: 1000,
        weight: 2,
      },
    ],
  },
  import: {
    steps: [
      { do: 'goto', path: '/explore?type=application', weight: 0.8 },
      { do: 'click', sel: btn('More ways to add'), weight: 0.6 },
      { do: 'click', sel: item('Import a file'), focus: 'role=dialog', weight: 0.8 },
      {
        do: 'files',
        sel: 'input[type=file]',
        file: '{csv}',
        focus: 'role=dialog',
        wait: 1500,
        weight: 1.6,
      },
      { do: 'click', sel: 'text=Check columns', focus: 'role=dialog', wait: 900, weight: 2 },
      {
        do: 'click',
        sel: 'role=button[name=/^Import \\d+ items$/]',
        focus: 'role=dialog',
        wait: 2000,
        weight: 1.4,
      },
    ],
  },
  autofill: {
    steps: [
      { do: 'goto', path: '/explore?type=application&q=Rollout%20Tracker', weight: 0.8 },
      {
        do: 'click',
        sel: 'role=gridcell >> text=Rollout Tracker',
        focus: 'role=dialog',
        pad: 4,
        wait: 1200,
        weight: 2,
      },
      { do: 'hover', sel: btn('Accept all'), focus: 'role=dialog', pad: 4, weight: 1 },
      {
        do: 'click',
        sel: btn('Accept all'),
        focus: 'role=dialog',
        pad: 4,
        wait: 1200,
        weight: 1.6,
      },
    ],
  },
  graph: {
    steps: [
      { do: 'goto', path: '/explore?type=application&view=graph', wait: 2200, weight: 1.6 },
      { do: 'click', sel: '.react-flow__node >> text=Customer', wait: 2600, weight: 1.6 },
      {
        do: 'goto',
        path: '/explore?type=application&view=graph&focus={legacyCrm}&mode=impact',
        wait: 2600,
        weight: 2,
      },
    ],
  },
  scenario: {
    steps: [
      { do: 'goto', path: '/explore?type=capability&view=map', wait: 1200, weight: 1 },
      { do: 'click', sel: btn('Target 2028'), wait: 1500, weight: 1.6 },
      {
        do: 'eval',
        js: 'document.querySelector(\'[aria-label="Model date"]\')?.focus()',
        weight: 0.2,
      },
      { do: 'goto', path: '/roadmap', wait: 1500, weight: 1.6 },
    ],
  },
  review: {
    steps: [
      { do: 'goto', path: '/changes?tab=review', weight: 1 },
      {
        do: 'click',
        sel: 'role=button[name=/Order Hub publishes order-cancelled events/]',
        focus: 'main',
        wait: 1000,
        weight: 2,
      },
      { do: 'hover', sel: btn('Approve and apply'), weight: 0.8 },
      { do: 'click', sel: btn('Approve and apply'), wait: 1200, weight: 1.4 },
    ],
  },
  packs: {
    steps: [
      { do: 'goto', path: '/settings?tab=packs', weight: 1 },
      { do: 'click', sel: btn('Install'), wait: 1500, weight: 1 },
      {
        do: 'click',
        sel: btn('Map your model'),
        focus: 'role=dialog',
        pad: 6,
        wait: 1200,
        weight: 2,
      },
      {
        do: 'hover',
        sel: 'role=button[name=/^Map \\d+ elements$/]',
        focus: 'role=dialog',
        pad: 6,
        weight: 1,
      },
    ],
  },
  drill: {
    steps: [
      { do: 'goto', path: '/dashboards?id=portfolio', wait: 1500, weight: 1 },
      { do: 'click', sel: 'text=Healthy >> nth=0', wait: 1200, weight: 1.5 },
      {
        do: 'click',
        sel: 'role=gridcell >> text=Legacy CRM',
        focus: 'role=dialog',
        pad: 4,
        wait: 1200,
        weight: 2,
      },
    ],
  },
  cost: {
    steps: [
      { do: 'goto', path: '/dashboards?id=cost', wait: 1500, weight: 1.2 },
      {
        do: 'hover',
        sel: 'text=Cost per capability',
        focus: 'text=Cost per capability',
        pad: 300,
        weight: 2,
      },
    ],
  },
  eol: {
    steps: [
      { do: 'goto', path: '/dashboards?id=technology', wait: 1500, weight: 1.4 },
      { do: 'goto', path: '/explore?type=technology&view=radar', wait: 1500, weight: 1.6 },
    ],
  },
  roadmap: {
    steps: [
      { do: 'goto', path: '/roadmap', wait: 1500, weight: 1.4 },
      { do: 'click', sel: 'role=button[name=/Search or ask/]', weight: 0.6 },
      { do: 'type', text: 'what breaks if we retire Legacy CRM', weight: 0.8 },
      { do: 'press', key: 'Enter', focus: 'role=dialog', pad: 10, wait: 1400, weight: 2 },
    ],
  },
  present: {
    steps: [
      { do: 'goto', path: '/dashboards?id=portfolio', wait: 1500, weight: 1 },
      { do: 'click', sel: btn('Share'), weight: 0.8 },
      { do: 'hover', sel: item('PowerPoint'), focus: 'role=menu', pad: 80, weight: 1.6 },
    ],
  },
  'engineer-home': {
    steps: [
      { do: 'goto', path: '/', weight: 0.6 },
      { do: 'click', sel: 'role=radio[name="Engineers"]', wait: 1500, weight: 2.4 },
    ],
  },
};
