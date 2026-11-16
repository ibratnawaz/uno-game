import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export async function newPlayer(browser: Browser, viewport = { width: 1100, height: 800 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  return { context, page };
}

export async function createRoom(page: Page, name: string) {
  await page.goto('/');
  await page
    .getByRole('button', { name: /Play With Friends/ })
    .first()
    .click();
  await page.getByPlaceholder('e.g. Sunny').fill(name);
  await page.getByRole('button', { name: 'Create private room' }).click();
  const codeBtn = page.getByLabel(/^Room code [A-Z0-9 ]+\. Tap to copy/);
  await expect(codeBtn).toBeVisible();
  return ((await codeBtn.textContent()) ?? '').trim();
}

export async function joinRoom(page: Page, code: string, name: string) {
  await page.goto('/');
  await page
    .getByRole('button', { name: /Play With Friends/ })
    .first()
    .click();
  await page.getByRole('tab', { name: 'Join Room' }).click();
  await page.getByPlaceholder('e.g. Sunny').fill(name);
  await page.getByLabel('Room code').fill(code);
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.getByText('Players', { exact: true })).toBeVisible();
}

/** Performs one useful action if it is this player's turn. Returns true if it acted. */
export async function autoStep(page: Page): Promise<boolean> {
  if (page.isClosed()) return false;
  const colour = page.getByRole('dialog', { name: /choose a colour/i });
  if (await colour.isVisible().catch(() => false)) {
    await colour.getByRole('button').first().click();
    return true;
  }
  const playable = page.locator('[aria-label="Your hand"] button[title*="(playable)"]');
  if ((await playable.count()) > 0) {
    await playable.first().click({ force: true });
    return true;
  }
  for (const name of [/^Draw \d+$/, /^Pass turn$/]) {
    const b = page.getByRole('button', { name });
    if (await b.isVisible().catch(() => false)) {
      await b.click();
      return true;
    }
  }
  const draw = page.getByRole('button', { name: 'Draw a card' });
  if (await draw.isVisible().catch(() => false)) {
    await draw.click();
    return true;
  }
  return false;
}

export const handCount = async (page: Page) =>
  page.locator('[aria-label="Your hand"] button').count();

export async function closeAll(...contexts: BrowserContext[]) {
  await Promise.all(contexts.map((c) => c.close().catch(() => undefined)));
}
