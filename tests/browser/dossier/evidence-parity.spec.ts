import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const row = (page: Page, type: string, source: string) =>
  page.locator(`[data-event-type="${type}"][data-source-id="${source}"]`).first();

for (const width of [1440, 390]) {
  test(`${width}: canonical rows use compact prototype evidence geometry`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.goto('/matches/tim-6-replay-prototype?variant=C&sample=components');
    await expect(page.getByText('20 scenario groups ready')).toBeVisible();

    const election = row(page, 'election', '56');
    await expect(election.locator('.dossier-vote-bar > span')).toHaveCount(10);
    await expect(election.locator('.dossier-vote-bar > .approved')).toHaveCount(7);
    await expect(election.locator('.dossier-vote-bar > .rejected')).toHaveCount(3);

    const policy = row(page, 'policy', '67');
    await expect(policy.locator('.dossier-track-slots').nth(0).locator('i')).toHaveCount(5);
    await expect(policy.locator('.dossier-track-slots').nth(1).locator('i')).toHaveCount(6);

    const opening = row(page, 'act-started', '963');
    await expect(opening.locator('.dossier-story')).toBeVisible();
    await expect(opening.locator('.dossier-evidence')).toBeVisible();
    await expect(opening.locator('.dossier-ten-cards > span')).toHaveCount(10);
    await expect(opening.locator('.dossier-ten-cards .influence-back')).toHaveCount(20);
    await expect(opening).toContainText('4 agents × 3');
    await expect(opening).toContainText('6 agents × 2');
    await expect(opening).not.toContainText('OPENING STATE');

    const challenge = row(page, 'challenge-resolved', '1010');
    await expect(challenge.locator('.dossier-actor')).toBeVisible();
    await expect(challenge.locator('.dossier-evidence > .dossier-responses')).toHaveCount(1);
    await expect(challenge.locator('.dossier-evidence')).toContainText('Published responses · 9');
    await expect(challenge.locator('.dossier-evidence')).not.toContainText('claim ·');

    const ordinaryLoss = row(page, 'influence-lost', '1018');
    await expect(ordinaryLoss.locator('.dossier-event-panel')).toHaveCount(1);
    await expect(ordinaryLoss.locator('.dossier-event-card-detail')).toHaveCount(1);
    await expect(ordinaryLoss.locator('.dossier-remaining')).toHaveCount(0);

    const elimination = row(page, 'influence-lost', '1064');
    await expect(elimination.locator('.dossier-event-panel')).toHaveCount(1);
    await expect(elimination.locator('.dossier-event-card-detail')).toHaveCount(1);
    await expect(elimination.locator('.dossier-remaining')).toHaveCount(1);
    await expect(elimination).toHaveClass(/dossier-departure/);
    await expect(elimination.locator('.dossier-copy > h3')).toContainText('eliminated');

    const proof = row(page, 'proof', '1011');
    const visualRows = { election, policy, opening, challenge, proof, ordinaryLoss };

    for (const [name, locator] of Object.entries(visualRows)) {
      await locator.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`) });
    }

    const metrics = Object.fromEntries(
      await Promise.all(
        Object.entries(visualRows).map(async ([name, locator]) => {
          const box = await locator.boundingBox();

          return [name, box && { width: Math.round(box.width), height: Math.round(box.height) }];
        }),
      ),
    );

    await testInfo.attach('row-metrics', {
      body: JSON.stringify(metrics, null, 2),
      contentType: 'application/json',
    });

    if (width === 1440) {
      expect((await ordinaryLoss.boundingBox())!.height).toBeLessThanOrEqual(280);
      expect((await opening.boundingBox())!.height).toBeLessThanOrEqual(210);
      expect((await challenge.boundingBox())!.height).toBeLessThanOrEqual(180);
      expect((await proof.boundingBox())!.height).toBeLessThanOrEqual(240);
    }

    const privateBefore = await page.locator('.dossier-private').count();
    await page.getByRole('checkbox', { name: 'Show private archive' }).check();
    await expect.poll(() => page.locator('.dossier-private').count()).toBeGreaterThan(privateBefore);
  });
}
