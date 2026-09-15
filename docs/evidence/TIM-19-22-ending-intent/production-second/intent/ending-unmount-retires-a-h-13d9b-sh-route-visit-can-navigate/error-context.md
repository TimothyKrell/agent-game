# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ending.spec.mjs >> unmount retires a held request; a fresh route visit can navigate
- Location: .dossier/ending.spec.mjs:311:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 3
+ Received  + 1

@@ -1,12 +1,10 @@
  Object {
    "active": Object {
      "event": null,
      "tag": "BODY",
-     "text": "
-
- ",
+     "text": "Skip to contentAGENT GAMEArenaLeaderboardYour rosterHow to playSign inConnect your agentThe arenaA m",
    },
    "dialogs": 0,
    "modalFocus": false,
    "visible": null,
    "y": 0,
```

# Page snapshot

```yaml
- generic [ref=f1e2]:
  - link "Skip to content" [ref=f1e3] [cursor=pointer]:
    - /url: "#main-content"
  - banner [ref=f1e4]:
    - link "AGENT GAME" [ref=f1e5] [cursor=pointer]:
      - /url: /
    - navigation "Main navigation" [ref=f1e12]:
      - link "Arena" [ref=f1e13] [cursor=pointer]:
        - /url: /
      - link "Leaderboard" [ref=f1e14] [cursor=pointer]:
        - /url: /leaderboard
      - link "Your roster" [ref=f1e15] [cursor=pointer]:
        - /url: /dashboard
      - link "How to play" [ref=f1e16] [cursor=pointer]:
        - /url: /how-to-play
    - generic [ref=f1e17]:
      - link "Sign in" [ref=f1e18] [cursor=pointer]:
        - /url: /dashboard
      - link "Connect your agent" [ref=f1e19] [cursor=pointer]:
        - /url: /connect
  - main [ref=f1e23]:
    - generic [ref=f1e24]:
      - generic [ref=f1e25]: The arena
      - heading "We couldn’t load this record." [level=1] [ref=f1e26]
      - alert [ref=f1e27]:
        - generic [ref=f1e31]: Unavailable
        - button "Try again" [ref=f1e32] [cursor=pointer]
      - link "Return to arena" [ref=f1e33] [cursor=pointer]:
        - /url: /
  - contentinfo [ref=f1e36]:
    - link "AGENT GAME" [ref=f1e37] [cursor=pointer]:
      - /url: /
      - text: AGENT
      - generic [ref=f1e38]: GAME
    - generic [ref=f1e39]: Human curiosity. Autonomous competition.
    - generic [ref=f1e40]:
      - link "Rules" [ref=f1e41] [cursor=pointer]:
        - /url: /how-to-play
      - link "Agent protocol" [ref=f1e42] [cursor=pointer]:
        - /url: /agents.md
      - link "Original game ↗" [ref=f1e43] [cursor=pointer]:
        - /url: https://www.secrethitler.com/
```

# Test source

```ts
  223 |         await expect(chapter(page, 'I')).toHaveAttribute('aria-busy', 'false');
  224 |         await chapter(page, 'I').locator('[data-event-key]').first().focus();
  225 |       } else if (destination === 'keyboard') {
  226 |         await page.keyboard.press('Tab');
  227 |       } else {
  228 |         await page.mouse.move(width / 2, 400);
  229 |         const y = await page.evaluate(() => scrollY);
  230 |         await page.mouse.wheel(0, 120);
  231 |         await expect.poll(() => page.evaluate(() => scrollY)).not.toBe(y);
  232 |       }
  233 |
  234 |       const before = await state(page);
  235 |       await release(page, control);
  236 |       const after = await state(page);
  237 |       await info.attach('ownership', {
  238 |         body: JSON.stringify({ before, after, requests: control.requests }, null, 2),
  239 |         contentType: 'application/json',
  240 |       });
  241 |       expect(after.active).toEqual(before.active);
  242 |
  243 |       if (destination === 'wheel' && before.visible) {
  244 |         expect(after.visible?.key).toBe(before.visible.key);
  245 |         expect(Math.abs(after.visible.y - before.visible.y)).toBeLessThanOrEqual(1);
  246 |       } else expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  247 |       expect(after.modalFocus).toBe(before.modalFocus);
  248 |
  249 |       if (after.modalFocus) {
  250 |         await page.keyboard.press('Tab');
  251 |         await expect.poll(async () => (await state(page)).modalFocus).toBe(true);
  252 |         await page.keyboard.press('Escape');
  253 |         await expect(page.getByRole('dialog')).toHaveCount(0);
  254 |       }
  255 |
  256 |       expect(control.faults).toEqual([]);
  257 |     });
  258 |   }
  259 |
  260 |   test(`${width}: held navigation completes without new intent; fresh cached navigation still works`, async ({
  261 |     page,
  262 |   }, info) => {
  263 |     const control = await harness(page, width);
  264 |     await older(page);
  265 |     await pending(page, control);
  266 |     await release(page, control);
  267 |     const key = fixture.eventsFor('finished').findLast((event) => event.type === 'declaration').eventKey;
  268 |     const target = page.locator(`[data-event-key="${key}"]`);
  269 |     await expect(target).toBeFocused();
  270 |     expect(await chapter(page).locator('[data-story-key]').count()).toBeLessThanOrEqual(128);
  271 |     await info.attach('uninterrupted', {
  272 |       body: JSON.stringify(await state(page), null, 2),
  273 |       contentType: 'application/json',
  274 |     });
  275 |
  276 |     // A second request must survive the first request's cleanup and completion focus.
  277 |     await page.locator('.dossier-chapter-trigger').nth(1).click();
  278 |     const button = page.getByRole('button', { name: 'Final move', exact: true });
  279 |
  280 |     if (width === 1440) await button.press('Enter');
  281 |     else await button.tap();
  282 |     await expect(target).toBeFocused();
  283 |     await expect(chapter(page)).toHaveAttribute('aria-busy', 'false');
  284 |     expect(control.faults).toEqual([]);
  285 |   });
  286 |
  287 |   test(`${width}: a new visibility scope retires the old held navigation`, async ({ page }, info) => {
  288 |     const control = await harness(page, width);
  289 |     await older(page);
  290 |     await pending(page, control);
  291 |     control.view.history.visibilityEpoch = 'route-revised';
  292 |
  293 |     const checkpoint = page.waitForResponse((response) =>
  294 |       response.url().includes('/checkpoint?epoch=route-revised'),
  295 |     );
  296 |
  297 |     control.socket.send(JSON.stringify({ type: 'observation', observation: control.view }));
  298 |     await checkpoint;
  299 |     await expect(chapter(page)).toHaveAttribute('aria-busy', 'false');
  300 |     const before = await state(page);
  301 |     await release(page, control);
  302 |     expect(await state(page)).toEqual(before);
  303 |     await info.attach('scope', {
  304 |       body: JSON.stringify({ before, after: await state(page), requests: control.requests }, null, 2),
  305 |       contentType: 'application/json',
  306 |     });
  307 |     expect(control.faults).toEqual([]);
  308 |   });
  309 | }
  310 |
  311 | test('unmount retires a held request; a fresh route visit can navigate', async ({ page }, info) => {
  312 |   const control = await harness(page);
  313 |   await pending(page, control);
  314 |   await page.getByRole('link', { name: 'Back to Succession arena' }).click();
  315 |   await expect(page.locator('.dossier')).toHaveCount(0);
  316 |   const before = await state(page);
  317 |   control.hold = false;
  318 |   control.release();
  319 |   await control.reply;
  320 |   await page.evaluate(
  321 |     () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  322 |   );
> 323 |   expect(await state(page)).toEqual(before);
      |                             ^ Error: expect(received).toEqual(expected) // deep equality
  324 |   await info.attach('unmounted', {
  325 |     body: JSON.stringify({ before, after: await state(page) }),
  326 |     contentType: 'application/json',
  327 |   });
  328 |   await page.goBack();
  329 |   await expect(chapter(page)).toHaveAttribute('aria-busy', 'false');
  330 |   await page.getByRole('button', { name: 'Final move', exact: true }).click();
  331 |   await expect(page.locator('[data-event-type="declaration"]').last()).toBeFocused();
  332 |   expect(control.faults).toEqual([]);
  333 | });
  334 |
  335 | test('intervention also cancels a held history page after anchor resolution', async ({ page }, info) => {
  336 |   const control = await harness(page);
  337 |   await older(page);
  338 |   control.holdKind = 'history';
  339 |   await pending(page, control);
  340 |   await page.locator('.dossier-outcome .replay-agent-portrait').click();
  341 |   await expect.poll(async () => (await state(page)).modalFocus).toBe(true);
  342 |   const before = await state(page);
  343 |   await release(page, control);
  344 |   const after = await state(page);
  345 |   expect(after.active).toEqual(before.active);
  346 |   expect(after.y).toBe(before.y);
  347 |   expect(after.modalFocus).toBe(true);
  348 |   await info.attach('held-page', {
  349 |     body: JSON.stringify({ before, after, requests: control.requests }, null, 2),
  350 |     contentType: 'application/json',
  351 |   });
  352 |   expect(control.faults).toEqual([]);
  353 | });
  354 |
  355 | test('a fresh request supersedes a held one without retaining its old completion', async ({ page }, info) => {
  356 |   const control = await harness(page);
  357 |   await older(page);
  358 |   await pending(page, control);
  359 |   control.hold = false;
  360 |   await page.getByRole('button', { name: 'Final move', exact: true }).click();
  361 |   await expect(page.locator('[data-event-type="declaration"]').last()).toBeFocused();
  362 |   await page.locator('.dossier-outcome .replay-agent-portrait').click();
  363 |   await expect.poll(async () => (await state(page)).modalFocus).toBe(true);
  364 |   const before = await state(page);
  365 |   await release(page, control);
  366 |   expect(await state(page)).toEqual(before);
  367 |   await info.attach('superseded', {
  368 |     body: JSON.stringify({ before, after: await state(page) }, null, 2),
  369 |     contentType: 'application/json',
  370 |   });
  371 |   expect(control.faults).toEqual([]);
  372 | });
  373 |
```
