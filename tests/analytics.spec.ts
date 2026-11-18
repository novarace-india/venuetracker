import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
test('analytics charts, settings, cohort filters, participant timelines and report downloads', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('browser@example.com');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Select event', { exact: true })).toBeVisible();
  const events = await (await page.request.get('/api/events')).json();
  const event = events.find((e: { name: string }) => e.name === 'Analytics Summit');
  await page.getByLabel('Select event', { exact: true }).selectOption(event.id);
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Gate participation', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.analytics-kpi').filter({ hasText: 'Attendance in period' }).locator('strong'),
  ).toHaveText('80.0%');
  await page.getByLabel('Add funnel gate').selectOption({ label: 'Reception' });
  await page.getByLabel('Add funnel gate').selectOption({ label: 'Kit Collection' });
  await page.getByLabel('Add funnel gate').selectOption({ label: 'Meal' });
  await expect(page.locator('.funnel-stage')).toHaveCount(3);
  await expect(page.locator('.funnel-stage').last().locator('b')).toContainText('1');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/analytics-leadership.png', fullPage: true });
  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF report', exact: true }).click();
  const pdf = await pdfDownload;
  await pdf.saveAs('test-results/analytics-leadership.pdf');
  expect(
    (
      await PDFDocument.load(await readFile('test-results/analytics-leadership.pdf'))
    ).getPageCount(),
  ).toBeGreaterThan(3);
  const excelDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel report', exact: true }).click();
  const excel = await excelDownload;
  await excel.saveAs('test-results/analytics-leadership.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('test-results/analytics-leadership.xlsx');
  expect(workbook.getWorksheet('Gate performance')).toBeDefined();
  expect(workbook.getWorksheet('Participants')!.rowCount).toBe(8);
  await page.getByRole('tab', { name: 'Gate operations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gate performance scorecard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gate demand by local hour' })).toBeVisible();
  await page.screenshot({ path: 'test-results/analytics-operations.png', fullPage: true });
  await page
    .getByRole('button', { name: 'Kit Collection, 9:00: 2 collections', exact: true })
    .click();
  await expect(
    page.getByRole('tab', { name: 'Participant journeys', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.pagination')).toContainText('2 participants');
  await page.getByRole('button', { name: 'View journey for Alex Guest' }).click();
  await expect(page.getByRole('dialog').getByText('Gate journey', { exact: false })).toBeVisible();
  await expect(page.locator('.analytics-timeline li')).toHaveCount(5);
  await expect(page.locator('.journey-summary').getByText('3 / 3', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/analytics-journey.png' });
  const journeyDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Journey PDF', exact: true }).click();
  const jp = await journeyDownload;
  await jp.saveAs('test-results/analytics-participant.pdf');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('tab', { name: 'Leadership overview', exact: true }).click();
  await page.getByRole('button', { name: 'Definitions & targets', exact: true }).click();
  await page.getByLabel('Kit Collection target (%)', { exact: true }).fill('80');
  await page.getByRole('button', { name: 'Save analytics settings' }).click();
  await expect(page.getByText('Participation below target', { exact: true })).toBeVisible();
  await page.getByLabel('Inspect arrival interval', { exact: true }).selectOption('0');
  await expect(
    page.locator('.analytics-kpi').filter({ hasText: 'Attendance in period' }).locator('strong'),
  ).toHaveText('40.0%');
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(
    page.locator('.analytics-kpi').filter({ hasText: 'Attendance in period' }).locator('strong'),
  ).toHaveText('80.0%');
  await page.getByLabel('Ticket type', { exact: true }).selectOption('VIP');
  await expect(
    page.locator('.analytics-kpi').filter({ hasText: 'Attendance in period' }).locator('strong'),
  ).toHaveText('100.0%');
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(
    page.locator('.analytics-kpi').filter({ hasText: 'Attendance in period' }).locator('strong'),
  ).toHaveText('80.0%');
  // Operational collections are editable from analytics, independent of chart filters.
  await page.getByRole('tab', { name: 'Participant journeys', exact: true }).click();
  if (await page.getByRole('button', { name: 'Clear chart selection' }).isVisible())
    await page.getByRole('button', { name: 'Clear chart selection' }).click();
  await page.getByRole('button', { name: 'View journey for Alex Guest' }).click();
  await page.getByRole('button', { name: 'Manage collections', exact: true }).click();
  const reception = page
    .locator('.collection-card')
    .filter({ has: page.getByRole('heading', { name: 'Reception · Entrance', exact: true }) });
  await reception.getByRole('button', { name: 'Undo latest', exact: true }).click();
  await page.getByLabel('Reason for undo').fill('Arrival recorded for wrong participant');
  await expect(page.getByRole('button', { name: 'Confirm undo', exact: true })).toBeDisabled();
  await page.getByLabel('I acknowledge the attendance and downstream collection impact.').check();
  await page.getByRole('button', { name: 'Confirm undo', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 collection(s) undone');
  await expect(
    page.getByRole('heading', { name: 'Alex Guest · Manage collections' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(
    page.locator('.analytics-timeline').getByText('undone', { exact: true }),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('tab', { name: 'Leadership overview', exact: true }).click();
  await expect(
    page.locator('.analytics-kpi').filter({ hasText: 'Attendance in period' }).locator('strong'),
  ).toHaveText('60.0%');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/analytics-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
