import { expect, test, type Page } from '@playwright/test';
import { closeAll, newPlayer } from './helpers';

type C = { id: number; color: string; value: string };
const card = (id: number, color: string, value: string): C => ({ id: 9000 + id, color, value });

/** Starts a solo game, then rewrites the saved state to a known position and resumes it. */
async function startRigged(
  page: Page,
  bots: number,
  rig: { hand: C[]; botHands?: C[][]; rules?: Record<string, unknown> },
) {
  await page.goto('/');
  await page
    .getByRole('button', { name: /Play With Bots/ })
    .first()
    .click();
  await page.getByPlaceholder('e.g. Sunny').fill('Solo');
  await page.getByLabel('Number of bots').fill(String(bots));
  await page.getByRole('radio', { name: /Easy/ }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('button', { name: 'Call UNO' })).toBeVisible();

  await page.evaluate(
    ({ rig, bots }) => {
      const key = 'chromarush.solo.v1';
      const saved = JSON.parse(localStorage.getItem(key) as string);
      const g = saved.room.game;
      g.players[0].hand = rig.hand;
      g.players.slice(1).forEach((p: { hand: C[] }, i: number) => {
        p.hand = rig.botHands?.[i] ?? [
          { id: 9100 + i * 10, color: 'blue', value: '4' },
          { id: 9101 + i * 10, color: 'green', value: '7' },
          { id: 9102 + i * 10, color: 'green', value: '9' },
        ];
      });
      g.discard.push({ id: 9200, color: 'red', value: '5' });
      g.activeColor = 'red';
      g.current = 0;
      g.direction = 1;
      g.phase = 'play';
      g.pending = null;
      g.wild = null;
      g.drawnCardId = null;
      g.vulnerable = null;
      g.version += 1;
      if (rig.rules) g.rules = { ...g.rules, ...rig.rules };
      void bots;
      // Freeze the bots so the test can inspect the position right after our move.
      localStorage.setItem(key, JSON.stringify(saved));
    },
    { rig, bots },
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Call UNO' })).toBeVisible();
  await expect(page.getByText('Your turn!')).toBeVisible();
}

const status = (page: Page) => page.locator('[role=status][aria-live=polite]');
const hand = (page: Page, title: string) =>
  page.locator(`[aria-label="Your hand"] button[title*="${title}"]`).first();

test.describe('draw cards pass the turn', () => {
  test('3 players: after my +2 the turn moves on and the next bot draws 2', async ({ browser }) => {
    const { context, page } = await newPlayer(browser);
    await startRigged(page, 2, {
      hand: [card(1, 'red', 'draw2'), card(2, 'red', '1'), card(3, 'blue', '3')],
    });
    await hand(page, 'red draw2').click({ force: true });
    await expect(status(page)).toContainText(/must draw 2/); // victim is now the active player
    await expect(page.getByText('Your turn!')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Draw \d+$/ })).toHaveCount(0); // not mine to press
    // the bot taps Draw on its own; the log records it
    await expect(page.getByRole('button', { name: 'Open activity log' })).toContainText(/draws 2/, {
      timeout: 10_000,
    });
    await closeAll(context);
  });

  test('2 players: my +2 hands the turn to the bot first, then back to me', async ({ browser }) => {
    const { context, page } = await newPlayer(browser);
    await startRigged(page, 1, {
      hand: [card(1, 'red', 'draw2'), card(2, 'red', '1'), card(3, 'blue', '3')],
    });
    await hand(page, 'red draw2').click({ force: true });
    await expect(status(page)).toContainText(/must draw 2/);
    await expect(page.getByLabel('Opponents')).toContainText('5', { timeout: 10_000 });
    await expect(status(page)).toContainText('Your turn!', { timeout: 10_000 });
    await closeAll(context);
  });

  test('+4: colour picker, then the bot is the one who must draw 4', async ({ browser }) => {
    const { context, page } = await newPlayer(browser);
    await startRigged(page, 2, {
      hand: [card(1, 'wild', 'wild4'), card(2, 'blue', '3'), card(3, 'blue', '4')],
    });
    await hand(page, 'wild4').click({ force: true });
    const dlg = page.getByRole('dialog', { name: /choose a colour/i });
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button').first().click();
    await expect(page.getByText('Your turn!')).toHaveCount(0);
    await expect(status(page)).toContainText(/(must draw 4|Challenge)|'s turn|draws/);
    await expect(page.getByRole('button', { name: 'Open activity log' })).toContainText(
      /draws|challenge/i,
      { timeout: 10_000 },
    );
    await closeAll(context);
  });
});

test.describe('opponent card count display', () => {
  test('fan of backs plus a big number follows the hand size, capped with the number intact', async ({
    browser,
  }) => {
    const { context, page } = await newPlayer(browser);
    await startRigged(page, 3, {
      hand: [card(1, 'red', 'draw2'), card(2, 'red', '1'), card(3, 'blue', '3')],
      botHands: [
        [card(11, 'blue', '4')],
        [card(21, 'blue', '4'), card(22, 'green', '7'), card(23, 'green', '9')],
        Array.from({ length: 12 }, (_, i) => card(30 + i, 'green', '9')),
      ],
    });
    const tiles = page.getByLabel('Opponents').getByRole('listitem');
    await expect(tiles).toHaveCount(3);
    const info = await tiles.evaluateAll((els) =>
      els.map((el) => ({
        label: el.getAttribute('aria-label'),
        backs: el.querySelectorAll('.uc.back').length,
        number: parseInt(el.querySelector('b')?.textContent ?? '', 10),
        size: parseFloat(getComputedStyle(el.querySelector('b') as Element).fontSize),
      })),
    );
    const byCount = Object.fromEntries(info.map((i) => [i.number, i]));
    expect(byCount[1].backs).toBe(1);
    expect(byCount[3].backs).toBe(3);
    expect(byCount[12].backs).toBe(7); // capped; the number still says 12
    expect(byCount[12].label).toMatch(/: 12 cards$/);
    expect(byCount[1].label).toMatch(/: 1 card$/);
    expect(byCount[3].size).toBeGreaterThanOrEqual(20); // clearly bigger than the old 14px
    await closeAll(context);
  });

  for (const [w, bots] of [
    [360, 19],
    [390, 2],
    [1280, 19],
  ] as const) {
    test(`no horizontal page overflow at ${w}px with ${bots} opponents`, async ({ browser }) => {
      const { context, page } = await newPlayer(browser, { width: w, height: 800 });
      await page.goto('/');
      await page
        .getByRole('button', { name: /Play With Bots/ })
        .first()
        .click();
      await page.getByPlaceholder('e.g. Sunny').fill('Solo');
      await page.getByLabel('Number of bots').fill(String(bots));
      await page.getByRole('button', { name: 'Start game' }).click();
      await expect(page.getByRole('button', { name: 'Call UNO' })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
      await closeAll(context);
    });
  }
});
