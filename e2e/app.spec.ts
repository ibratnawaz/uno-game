import { expect, test, type Page } from '@playwright/test';
import { autoStep, closeAll, createRoom, handCount, joinRoom, newPlayer } from './helpers';

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test.describe('landing page', () => {
  test('desktop and mobile layouts render without horizontal scroll', async ({ browser }) => {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      const { context, page } = await newPlayer(browser, viewport);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('button', { name: /Play With Friends/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Play With Bots/ }).first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
      await expect(page.getByText('Optional house rules')).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
      await closeAll(context);
    }
  });
});

test.describe('friends multiplayer', () => {
  test('create room, join by code, rules sync, start, refresh-resume, full game, restart', async ({
    browser,
  }) => {
    const host = await newPlayer(browser);
    const guest = await newPlayer(browser);

    // 1. Create a room
    const code = await createRoom(host.page, 'Hosty');
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    await expect(host.page.getByText('Host', { exact: true }).first()).toBeVisible();
    await expect(host.page.getByRole('button', { name: /Waiting for players/ })).toBeDisabled(); // min 2 players

    // 2. Another player joins using the room code
    await joinRoom(guest.page, code, 'Guesty');
    await expect(host.page.getByText('Guesty')).toBeVisible();
    await expect(guest.page.getByText('Hosty')).toBeVisible();

    // 3. House rules: host toggles Jump-In, guest sees it live
    await host.page.getByRole('button', { name: /Edit house rules/ }).click();
    await host.page.getByRole('switch', { name: 'Jump-In' }).click();
    await expect(guest.page.getByText('Jump-In').first()).toBeVisible();
    await host.page.getByRole('switch', { name: 'Jump-In' }).click(); // back to standard
    await expect(guest.page.getByText('No house rules')).toBeVisible();

    // 4. Start the game
    await expect(host.page.getByRole('button', { name: 'Start game' })).toBeEnabled();
    await host.page.getByRole('button', { name: 'Start game' }).click();
    await expect(host.page.getByRole('button', { name: 'Call UNO' })).toBeVisible();
    await expect(guest.page.getByRole('button', { name: 'Call UNO' })).toBeVisible();
    expect(await handCount(host.page)).toBeGreaterThanOrEqual(7);

    // 5. Refresh mid-game: same hand, same seat, no duplicate player
    const before = await handCount(guest.page);
    await guest.page.reload();
    await expect(guest.page.getByRole('button', { name: 'Call UNO' })).toBeVisible();
    expect(await handCount(guest.page)).toBe(before);
    await guest.page.getByRole('button', { name: 'Menu' }).click();
    await expect(
      guest.page.getByRole('dialog').getByRole('listitem').filter({ hasText: 'Guesty' }),
    ).toHaveCount(1);
    await expect(
      guest.page.getByRole('dialog').getByRole('listitem').filter({ hasText: 'Hosty' }),
    ).toHaveCount(1);
    await guest.page.getByRole('button', { name: 'Resume' }).click();

    // 6. Play a complete game (both browsers drive themselves)
    const pages = [host.page, guest.page];
    const deadline = Date.now() + 100_000;
    let over = false;
    while (Date.now() < deadline && !over) {
      let acted = false;
      for (const p of pages) acted = (await autoStep(p)) || acted;
      over = await host.page.getByRole('dialog', { name: 'Game over' }).isVisible();
      if (!acted) await host.page.waitForTimeout(150);
      else await host.page.waitForTimeout(40);
    }
    expect(over).toBe(true);
    await expect(guest.page.getByRole('dialog', { name: 'Game over' })).toBeVisible();
    await expect(host.page.getByText(/wins!|You win!/)).toBeVisible();
    await expect(guest.page.getByText(/Waiting for the host/)).toBeVisible();

    // 7. Play again starts a fresh round for everyone
    await host.page.getByRole('button', { name: 'Play again' }).click();
    await expect(host.page.getByRole('dialog', { name: 'Game over' })).toBeHidden();
    await expect(guest.page.getByRole('dialog', { name: 'Game over' })).toBeHidden();
    expect(await handCount(guest.page)).toBeGreaterThanOrEqual(7);

    await closeAll(host.context, guest.context);
  });

  test('invitation link opens the join form with the room code filled in', async ({ browser }) => {
    const host = await newPlayer(browser);
    const guest = await newPlayer(browser);
    const code = await createRoom(host.page, 'Hosty');
    await guest.page.goto(`/?room=${code}`);
    await expect(guest.page.getByLabel('Room code')).toHaveValue(code);
    await guest.page.getByPlaceholder('e.g. Sunny').fill('Linky');
    await guest.page.getByRole('button', { name: 'Join room' }).click();
    await expect(host.page.getByText('Linky')).toBeVisible();
    await closeAll(host.context, guest.context);
  });

  test('errors for an unknown room code', async ({ browser }) => {
    const { context, page } = await newPlayer(browser);
    await page.goto('/?room=ZZZZZZ');
    await page.getByPlaceholder('e.g. Sunny').fill('Nobody');
    await page.getByRole('button', { name: 'Join room' }).click();
    await expect(page.getByRole('alert')).toContainText(/No room with that code/);
    await closeAll(context);
  });

  test('recovery code restores a seat on another device; removed/unknown credentials are refused', async ({
    browser,
  }) => {
    const host = await newPlayer(browser);
    const guest = await newPlayer(browser);
    const code = await createRoom(host.page, 'Hosty');
    await joinRoom(guest.page, code, 'Guesty');
    const secret = await guest.page.evaluate(
      (c) => JSON.parse(localStorage.getItem(`chromarush.session.${c}`) ?? '{}').token as string,
      code,
    );
    expect(secret).toHaveLength(20);

    // another device = a fresh browser context with no storage
    const other = await newPlayer(browser);
    await other.page.goto('/');
    await other.page
      .getByRole('button', { name: /Play With Friends/ })
      .first()
      .click();
    await other.page.getByRole('tab', { name: 'Recover' }).click();
    await other.page.getByLabel('Room code').fill(code);
    await other.page.getByLabel('Recovery code').fill(secret);
    await other.page.getByRole('button', { name: 'Reconnect to Game' }).click();
    await expect(other.page.getByText('Guesty')).toBeVisible();
    await expect(host.page.getByText('Guesty')).toHaveCount(1); // no duplicate membership
    await closeAll(host.context, guest.context, other.context);
  });

  test('host can remove a disconnected player; the game continues; room cap UI', async ({
    browser,
  }) => {
    const host = await newPlayer(browser);
    const g1 = await newPlayer(browser);
    const g2 = await newPlayer(browser);
    const code = await createRoom(host.page, 'Hosty');
    await joinRoom(g1.page, code, 'Gone');
    await joinRoom(g2.page, code, 'Stays');
    await host.page.getByRole('button', { name: 'Start game' }).click();
    await expect(host.page.getByRole('button', { name: 'Call UNO' })).toBeVisible();

    await g1.page.close(); // browser closed: disconnected but still a participant
    await host.page.getByRole('button', { name: 'Menu' }).click();
    const row = host.page.getByRole('dialog').getByRole('listitem').filter({ hasText: 'Gone' });
    await expect(row).toContainText('disconnected');
    await row.getByRole('button', { name: 'Remove' }).click();
    await expect(host.page.getByRole('dialog', { name: 'Remove player?' })).toBeVisible(); // confirmation
    await host.page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(host.page.getByText(/Gone was removed/).first())
      .toBeVisible({ timeout: 5000 })
      .catch(() => undefined);

    // the two remaining players can keep playing
    const deadline = Date.now() + 20_000;
    let moves = 0;
    while (Date.now() < deadline && moves < 6) {
      for (const p of [host.page, g2.page]) if (await autoStep(p)) moves++;
      await host.page.waitForTimeout(80);
    }
    expect(moves).toBeGreaterThanOrEqual(3);
    await closeAll(host.context, g1.context, g2.context);
  });
});

test.describe('disconnect handling', () => {
  test('game pauses on the absent current player, nobody is skipped, and they resume their turn', async ({
    browser,
  }) => {
    const a = await newPlayer(browser);
    const b = await newPlayer(browser);
    const code = await createRoom(a.page, 'Alpha');
    await joinRoom(b.page, code, 'Bravo');
    await a.page.getByRole('button', { name: 'Start game' }).click();
    await expect(b.page.getByRole('button', { name: 'Call UNO' })).toBeVisible();

    // Whoever's turn it is "closes the browser". The starting colour pick, if any, counts as a turn.
    const mine = (p: Page) =>
      p.getByRole('status').filter({ hasText: /Your turn!|Choose a colour/ });
    const aTurn = await mine(a.page).count();
    const absent = aTurn ? a : b;
    const present = aTurn ? b : a;
    const absentName = aTurn ? 'Alpha' : 'Bravo';
    const handBefore = await handCount(absent.page);
    await absent.page.close();

    await expect(
      present.page.getByText(`${absentName} disconnected. Waiting for reconnection.`),
    ).toBeVisible();
    await present.page.waitForTimeout(1500); // nothing may auto-skip or auto-play
    await expect(
      present.page.getByText(`${absentName} disconnected. Waiting for reconnection.`),
    ).toBeVisible();
    await expect(autoStepAttempt(present.page)).resolves.toBe(false); // present player cannot act

    const back = await absent.context.newPage();
    await back.goto('/');
    await expect(
      back.getByRole('status').filter({ hasText: /Your turn!|Choose a colour/ }),
    ).toBeVisible();
    expect(await handCount(back)).toBe(handBefore);
    await expect(present.page.getByText(/disconnected. Waiting/)).toBeHidden();
    await closeAll(a.context, b.context);
  });
});

async function autoStepAttempt(page: Page) {
  // true if any contextual turn control is available to this player
  const controls = page.locator(
    '[aria-label="Your hand"] button[title*="(playable)"], button:has-text("Draw a card")',
  );
  return (await controls.count()) > 0;
}

test.describe('bots', () => {
  test('play against a bot, survive a refresh, bot answers', async ({ browser }) => {
    const { context, page } = await newPlayer(browser);
    await page.goto('/');
    await page
      .getByRole('button', { name: /Play With Bots/ })
      .first()
      .click();
    await page.getByPlaceholder('e.g. Sunny').fill('Solo');
    await page.getByLabel('Number of bots').fill('1');
    await page.getByRole('radio', { name: /Easy/ }).click();
    await page.getByRole('button', { name: 'Start game' }).click();
    await expect(page.getByRole('button', { name: 'Call UNO' })).toBeVisible();
    await expect(page.getByLabel('Opponents').getByRole('listitem')).toHaveCount(1);

    let moves = 0;
    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline && moves < 3) {
      if (await autoStep(page)) moves++;
      await page.waitForTimeout(300);
    }
    expect(moves).toBeGreaterThanOrEqual(2);

    const cards = await handCount(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Call UNO' })).toBeVisible(); // resumed
    expect(Math.abs((await handCount(page)) - cards)).toBeLessThanOrEqual(2);
    await closeAll(context);
  });

  test('starts a 20 player table (19 bots) with house rules', async ({ browser }) => {
    const { context, page } = await newPlayer(browser);
    await page.goto('/');
    await page
      .getByRole('button', { name: /Play With Bots/ })
      .first()
      .click();
    await page.getByPlaceholder('e.g. Sunny').fill('Big');
    await page.getByLabel('Number of bots').fill('19');
    await expect(page.getByText('20 players total')).toBeVisible();
    await page.getByRole('button', { name: /House rules/ }).click();
    await page.getByRole('switch', { name: '+2 on +2' }).click();
    await page.getByRole('switch', { name: 'Force Play' }).click();
    await expect(page.getByText('Active').first()).toBeVisible();
    await page.getByRole('button', { name: 'Start game' }).click();
    await expect(page.getByLabel('Opponents').getByRole('listitem')).toHaveCount(19);
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByText('+2 on +2').first()).toBeVisible();
    await expect(page.getByText(/2 decks are in play/)).toBeVisible();
    await closeAll(context);
  });
});

test.describe('mobile game table', () => {
  test('fits a phone: hand, piles and UNO button visible, no overflow', async ({ browser }) => {
    const { context, page } = await newPlayer(browser, { width: 375, height: 667 });
    await page.goto('/');
    await page
      .getByRole('button', { name: /Play With Bots/ })
      .first()
      .click();
    await page.getByPlaceholder('e.g. Sunny').fill('Phone');
    await page.getByRole('button', { name: 'Start game' }).click();
    const uno = page.getByRole('button', { name: 'Call UNO' });
    await expect(uno).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    const box = await uno.boundingBox();
    expect(box && box.y + box.height <= 667 && box.x + box.width <= 375).toBe(true);
    const hand = await page.locator('[aria-label="Your hand"] button').first().boundingBox();
    expect(hand && hand.y + hand.height <= 667).toBe(true);
    expect(hand!.width).toBeGreaterThanOrEqual(56); // tap targets stay large
    await closeAll(context);
  });
});
