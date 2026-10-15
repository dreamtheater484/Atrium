import { CSRF, expect, resetClicks, test, toast, withinBudget } from '../helpers';

test('J9 · install a reference pack and map the model to it in bulk', async ({ page, request }) => {
  await page.goto('/settings?tab=packs');
  await resetClicks(page);

  const card = page
    .locator('div')
    .filter({ hasText: /^Starter capability reference/ })
    .first();
  await page.getByRole('button', { name: 'Install' }).first().click();
  await toast(page, /Installed/);
  void card;

  await page.getByRole('button', { name: 'Map your model' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Identity and access management').first()).toBeVisible();
  const map = dialog.getByRole('button', { name: /^Map \d+ elements$/ });
  await expect(map).toBeEnabled();
  await map.click();
  await toast(page, /Mapped \d+ elements/);
  await withinBudget(page, 3, 'J9');

  const res = await request.get('/api/v1/packs/starter-capabilities/mapping-suggestions');
  const data = (await res.json()) as { mapped: number; referenceCovered: number };
  expect(data.mapped).toBeGreaterThan(10);
  expect(data.referenceCovered).toBeGreaterThan(5);
});

test('J9 · a framework opens from its pack as a tree, with what of yours maps to it', async ({
  page,
}) => {
  await page.goto('/settings?tab=packs');
  await resetClicks(page);

  // Each installed framework on the pack card opens that framework.
  await page.getByRole('button', { name: /Generic capabilities → capabilities/ }).click();
  await expect(page).toHaveURL(/framework=capabilities/);
  await expect(page.getByRole('heading', { level: 1, name: 'Generic capabilities' })).toBeVisible();
  const tree = page.getByRole('tree', { name: 'Generic capabilities' });
  // The top level starts open, with how much of each branch your model covers.
  await expect(
    tree.getByRole('treeitem', { name: /Identity and access management/ }),
  ).toBeVisible();
  await expect(page.getByText(/^\d+ of 29 mapped$/)).toBeVisible();
  const details = page.getByRole('complementary', { name: 'Details' });
  await expect(details.getByText(/of 29 elements have something of yours mapped/)).toBeVisible();

  // Search inside the framework, then open what it finds.
  await page.getByRole('textbox', { name: 'Search Generic capabilities' }).fill('identity');
  await expect(page.getByText('1 match', { exact: true })).toBeVisible();
  await tree.getByRole('treeitem', { name: /Identity and access management/ }).click();
  await expect(
    details.getByRole('heading', { name: 'Identity and access management' }),
  ).toBeVisible();
  await expect(details.getByText('7.3', { exact: true })).toBeVisible();
  await expect(
    details.getByRole('button', { name: /^Identity & Access Management/ }),
  ).toBeVisible();
  await withinBudget(page, 2, 'J9 browse a framework');

  // The gaps: branches nothing of yours maps to.
  await page.getByRole('textbox', { name: 'Search Generic capabilities' }).fill('');
  await page.getByRole('radio', { name: 'Gaps' }).click();
  await expect(page.getByText(/\d+ branch(es)? with nothing mapped/)).toBeVisible();

  // The same framework as a table, with reference columns instead of owner and health.
  await page.getByRole('radio', { name: 'Table' }).click();
  const grid = page.getByRole('grid');
  for (const column of ['Key', 'Name', 'Level', 'Domain', 'Parent', 'Mapped from'])
    await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
  await expect(grid.getByRole('columnheader', { name: 'Owner' })).toHaveCount(0);
});

test('J9 · the tree keeps up with keyboard use', async ({ page }) => {
  await page.goto('/explore?pack=starter-capabilities&framework=capabilities');
  const tree = page.getByRole('tree', { name: 'Generic capabilities' });
  await page.getByRole('button', { name: 'Close everything' }).click();
  await expect(tree.getByRole('treeitem')).toHaveCount(7);
  const first = tree.getByRole('treeitem').first();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(tree.getByRole('treeitem', { name: /Strategy management/ })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(first).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/node=/);
  await expect(
    page.getByRole('complementary', { name: 'Details' }).getByRole('heading', {
      name: 'Strategy and planning',
    }),
  ).toBeVisible();
});

test('J9 · links between frameworks lead from one to the other', async ({ page, request }) => {
  // Two small linked frameworks, like TM Forum's applications that realize its functions.
  const pack = {
    format: 'atrium-pack',
    manifest: {
      id: 'e2e-frameworks',
      name: 'Example frameworks',
      version: '1.0',
      publisher: 'Atrium tests',
      description: 'Two small frameworks that link to each other.',
      license: 'CC0 1.0',
      frameworks: [
        { id: 'functions', name: 'Example functions', elementType: 'capability' },
        { id: 'apps', name: 'Example applications', elementType: 'application' },
      ],
    },
    elements: [
      el('functions:1', 'functions', 'capability', 'Billing functions', 'Domain'),
      el('functions:1.1', 'functions', 'capability', 'Rate usage', 'Function', 'functions:1'),
      el('functions:1.2', 'functions', 'capability', 'Produce invoices', 'Function', 'functions:1'),
      el('functions:2', 'functions', 'capability', 'Collections', 'Domain'),
      el('functions:2.1', 'functions', 'capability', 'Chase payments', 'Function', 'functions:2'),
      el('apps:1', 'apps', 'application', 'Billing applications', 'Domain'),
      el('apps:1.1', 'apps', 'application', 'Rating engine', 'Level 1', 'apps:1'),
      el('apps:1.2', 'apps', 'application', 'Dunning manager', 'Level 1', 'apps:1'),
    ],
    relations: [
      { type: 'realizes', from: 'apps:1.1', to: 'functions:1.1' },
      { type: 'realizes', from: 'apps:1.2', to: 'functions:2.1' },
    ],
  };
  const res = await request.post('/api/v1/packs/upload', {
    headers: CSRF,
    multipart: {
      file: {
        name: 'example.atrium-pack.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(pack)),
      },
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();

  try {
    await page.goto('/explore?type=capability');
    await page.getByRole('button', { name: 'Reference frameworks' }).click();
    await page.getByRole('menuitem', { name: /Example applications/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Example applications' }),
    ).toBeVisible();
    await page.getByRole('treeitem', { name: /Rating engine/ }).click();

    const details = page.getByRole('complementary', { name: 'Details' });
    await expect(details.getByText('Realizes · Example functions')).toBeVisible();
    await details.getByRole('button', { name: /Rate usage/ }).click();
    await expect(page).toHaveURL(/framework=functions/);
    await expect(page.getByRole('heading', { level: 1, name: 'Example functions' })).toBeVisible();
    await expect(page.getByRole('treeitem', { name: /Rate usage/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(details.getByText('Realized by · Example applications')).toBeVisible();

    // Map one of your capabilities to it from here, and see the coverage follow.
    await expect(page.getByText('0 of 5 mapped')).toBeVisible();
    await details.getByRole('button', { name: 'Map one of your capabilities' }).click();
    await page.getByPlaceholder('Type to search…').fill('invoic');
    await page.getByRole('option').first().click();
    await toast(page, /maps to Rate usage/);
    await expect(page.getByText('1 of 5 mapped')).toBeVisible();
    await expect(page.getByRole('treeitem', { name: /Rate usage/ })).toContainText(
      '1 of your elements map here',
    );

    // The gaps: what nothing of yours maps to. Nothing reaches them through links yet.
    await page.getByRole('radio', { name: 'Gaps' }).click();
    await expect(page.getByText('2 branches with nothing mapped', { exact: true })).toBeVisible();
    const countThrough = page.getByRole('switch', { name: 'Count coverage through links' });
    await expect(countThrough).toHaveCount(0);

    // One of your applications maps to the application that realizes "Chase payments"…
    await page.getByRole('button', { name: 'Reference frameworks' }).click();
    await page.getByRole('menuitem', { name: /Example applications/ }).click();
    await page.getByRole('treeitem', { name: /Dunning manager/ }).click();
    await details.getByRole('button', { name: 'Map one of your applications' }).click();
    await page.getByPlaceholder('Type to search…').fill('collections');
    await page.getByRole('option', { name: /Collections Manager/ }).click();
    await toast(page, /Collections Manager maps to Dunning manager/);

    // …so that function is covered through the applications, apart from direct mappings.
    await details.getByRole('button', { name: /Chase payments/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Example functions' })).toBeVisible();
    await expect(page.getByText('1 of 5 mapped')).toBeVisible();
    await expect(page.getByText('+1 through links')).toBeVisible();
    await expect(page.getByRole('treeitem', { name: /Chase payments/ })).toContainText(
      '1 of your elements reach here through other frameworks',
    );
    await expect(details.getByText('Nothing of yours maps to this directly.')).toBeVisible();
    await expect(details.getByText('Through Example applications')).toBeVisible();
    await expect(details.getByRole('button', { name: /^Collections Manager/ })).toBeVisible();
    await expect(
      details.getByText(/maps to 1\.2 Dunning manager, which realizes this/),
    ).toBeVisible();

    // The gaps can count it as covered, or not.
    await page.getByRole('radio', { name: 'Gaps' }).click();
    const tree = page.getByRole('tree', { name: 'Example functions' });
    await expect(page.getByText('2 branches with nothing mapped', { exact: true })).toBeVisible();
    await expect(tree.getByRole('treeitem', { name: /Collections/ })).toBeVisible();
    await countThrough.click();
    await expect(page).toHaveURL(/through=true/);
    await expect(
      page.getByText('1 branch with nothing mapped, directly or through links', { exact: true }),
    ).toBeVisible();
    await expect(tree.getByRole('treeitem', { name: /Collections/ })).toHaveCount(0);
    await expect(tree.getByRole('treeitem', { name: /Produce invoices/ })).toBeVisible();

    // The overview says where that coverage comes from.
    await details.getByRole('button', { name: 'Close details' }).click();
    await expect(details.getByText(/1 more is covered through other frameworks/)).toBeVisible();
    await expect(
      details.getByRole('button', { name: /1 through Example applications/ }),
    ).toBeVisible();
  } finally {
    await request.delete('/api/v1/packs/e2e-frameworks', { headers: CSRF });
  }
});

function el(
  sourceId: string,
  framework: string,
  type: string,
  name: string,
  level: string,
  parentSourceId?: string,
) {
  return { sourceId, framework, type, name, parentSourceId, attributes: { level } };
}
