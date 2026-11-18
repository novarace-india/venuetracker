import { test, expect } from '@playwright/test';
test('admin setup, keyboard scanner, offline queue and reconciliation', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/NovaRace Flow/);
  await expect(page.getByRole('img', { name: 'NovaRace Flow', exact: true })).toBeVisible();
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('NovaRace Flow Scanner');
  expect(manifest.start_url).toBe('/scanner');
  expect(manifest.scope).toBe('/');
  await page.screenshot({ path: 'test-results/novarace-flow-login.png', fullPage: true });
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('browser@example.com');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Create event', exact: true }).first().click();
  await page.getByLabel('Event name', { exact: true }).fill('Community Sports Day');
  await page.getByRole('button', { name: 'Save event' }).click();
  await expect(page.getByRole('heading', { name: 'Your event, in view.' })).toBeVisible();
  await page.getByRole('button', { name: 'Participants', exact: true }).click();
  await page.getByRole('button', { name: 'Add participant' }).click();
  await page.getByLabel('Full name', { exact: true }).fill('Taylor River');
  await page.getByLabel('Email', { exact: true }).fill('taylor@example.com');
  await page.getByRole('button', { name: 'Save participant' }).click();
  await expect(page.getByText('taylor@example.com', { exact: true })).toBeVisible();
  await page.getByLabel('Import participants', { exact: true }).setInputFiles({
    name: 'participants.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Email,Full Name\ntaylor@example.com,Duplicate\nblair@example.com,Blair Stone\n',
    ),
  });
  await expect(page.getByText('1 imported · 1 rejected')).toBeVisible();
  await page.getByRole('button', { name: 'Gates', exact: true }).click();
  await page.getByRole('button', { name: 'Add gate', exact: true }).click();
  await page.getByLabel('Gate name', { exact: true }).fill('Reception');
  await page.getByRole('button', { name: 'Save gate', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reception', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pair a tablet' }).click();
  const code = (await page.locator('.pairing strong').textContent())!;
  const events = await (await page.request.get('/api/events')).json();
  const event = events[0];
  const list = await (await page.request.get(`/api/events/${event.id}/participants`)).json();
  const p = list.items.find((v: { email: string }) => v.email === 'taylor@example.com');
  const pass = await (
    await page.request.get(`/api/events/${event.id}/participants/${p.id}/pass`)
  ).json();
  expect(pass.payload.startsWith('gc1.')).toBe(true);
  await page.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const scanner = await context.newPage();
  scanner.on('pageerror', (e) => errors.push(e.message));
  await scanner.goto('/scanner');
  await scanner.getByLabel('Tablet name').fill('Reception - Tablet 1');
  await scanner.getByLabel('8-digit pairing code').fill(code);
  await scanner.getByRole('button', { name: 'Pair this tablet' }).click();
  await expect(scanner.getByRole('heading', { name: 'Ready to scan' })).toBeVisible();
  await scanner.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const legacyPairId = await scanner.evaluate(
    () => JSON.parse(localStorage.getItem('gc-device')!).id,
  );
  await scanner.reload();
  await expect(scanner.getByRole('heading', { name: 'Ready to scan' })).toBeVisible();
  expect(await scanner.evaluate(() => JSON.parse(localStorage.getItem('gc-device')!).id)).toBe(
    legacyPairId,
  );
  await expect(scanner.getByRole('img', { name: 'NovaRace Flow', exact: true })).toBeVisible();
  await scanner.locator('.scanner-context').click();
  await scanner.keyboard.type(pass.payload, { delay: 1 });
  await scanner.keyboard.press('Enter');
  await expect(scanner.getByText('COLLECTION CONFIRMED', { exact: true })).toBeVisible();
  await expect(scanner.getByRole('heading', { name: 'Taylor River' })).toBeVisible();
  await scanner.screenshot({ path: 'test-results/scanner-success.png', fullPage: true });
  await expect(scanner.getByRole('heading', { name: 'Ready to scan' })).toBeVisible({
    timeout: 8000,
  });
  await context.setOffline(true);
  await scanner.reload();
  await expect(scanner.getByRole('heading', { name: 'Ready to scan' })).toBeVisible();
  await scanner.getByRole('textbox', { name: 'QR scanner input' }).fill(pass.payload);
  await scanner.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(scanner.getByRole('heading', { name: 'Pending validation' })).toBeVisible();
  await expect(scanner.getByRole('button', { name: '1 queued · Recent results' })).toBeVisible();
  await context.setOffline(false);
  await expect(scanner.getByText('PREVIOUS COLLECTION FOUND', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(scanner.getByRole('button', { name: '0 queued · Recent results' })).toBeVisible();
  await scanner.getByRole('button', { name: '0 queued · Recent results' }).click();
  await expect(
    scanner.getByRole('dialog').getByText('Already collected', { exact: true }),
  ).toBeVisible();
  await scanner.getByRole('button', { name: 'Close dialog' }).click();
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: 'Participants', exact: true }).click();
  await page.getByRole('button', { name: 'T Taylor River taylor@example.com' }).click();
  await expect(
    page.getByRole('dialog').getByText('Reception', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Manage collections', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Taylor River · Manage collections' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo latest', exact: true }).click();
  await page.getByLabel('Reason for undo').fill('Browser test correction');
  await page.getByRole('button', { name: 'Confirm undo', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 collection(s) undone');
  await expect(page.getByText('Browser test correction', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/collection-reset-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/collection-reset-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  // Capture offline before another reset: a stale queue must never restore an undone collection.
  await scanner.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect
    .poll(async () =>
      scanner.evaluate(
        (id) => JSON.parse(localStorage.getItem('gc-device-info')!).collectionRevisions[id],
        p.id,
      ),
    )
    .toBe(1);
  await context.setOffline(true);
  await scanner.getByRole('textbox', { name: 'QR scanner input' }).fill(pass.payload);
  await scanner.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(scanner.getByRole('button', { name: '1 queued · Recent results' })).toBeVisible();
  const gates = await (await page.request.get(`/api/events/${event.id}/gates`)).json();
  const gate = gates[0];
  await page.request.post(`/api/events/${event.id}/gates/${gate.id}/scans`, {
    data: { operationId: crypto.randomUUID(), payload: pass.payload, collectionRevision: 1 },
  });
  const snapshot = await (
    await page.request.get(`/api/events/${event.id}/participants/${p.id}/collections`)
  ).json();
  const resetResponse = await page.request.post(
    `/api/events/${event.id}/participants/${p.id}/gates/${gate.id}/reset`,
    {
      data: {
        operationId: crypto.randomUUID(),
        mode: 'all',
        expectedState: snapshot.gates[0].stateToken,
        reason: 'Second correction',
        acknowledgeImpacts: false,
      },
    },
  );
  expect(resetResponse.status()).toBe(200);
  await context.setOffline(false);
  await expect(
    scanner.getByText(
      'Collection state was reset by an admin. Counter state has been refreshed; scan the QR again.',
      { exact: true },
    ),
  ).toBeVisible({ timeout: 15000 });
  await expect(scanner.getByRole('button', { name: '0 queued · Recent results' })).toBeVisible();
  const afterConflict = await (
    await page.request.get(`/api/events/${event.id}/participants/${p.id}/collections`)
  ).json();
  expect(afterConflict.gates[0].activeCount).toBe(0);
  // Simulate a response lost after the server committed: replay must return the same collection.
  await expect(scanner.getByRole('heading', { name: 'Ready to scan' })).toBeVisible({
    timeout: 8000,
  });
  await scanner.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    let dropResponse = true;
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (String(input).endsWith('/api/device/scans') && init?.method === 'POST' && dropResponse) {
        dropResponse = false;
        throw new TypeError('Simulated response lost after server commit');
      }
      return response;
    };
  });
  await scanner.getByRole('textbox', { name: 'QR scanner input' }).fill(pass.payload);
  await scanner.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(scanner.getByRole('button', { name: '1 queued · Recent results' })).toBeVisible();
  await expect(scanner.getByRole('button', { name: '0 queued · Recent results' })).toBeVisible({
    timeout: 15000,
  });
  const afterReplay = await (
    await page.request.get(`/api/events/${event.id}/participants/${p.id}/journey`)
  ).json();
  expect(
    afterReplay.collections.filter((c: { undone_at: string | null }) => !c.undone_at),
  ).toHaveLength(1);
  expect(errors).toEqual([]);
  await context.close();
});
