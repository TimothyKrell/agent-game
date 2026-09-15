# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ending.spec.mjs >> unmount retires a held request; a fresh route visit can navigate
- Location: .dossier/ending.spec.mjs:316:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'The arena', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: 'The arena', exact: true }) with timeout 5000ms
  - waiting for getByRole('heading', { name: 'The arena', exact: true })

```

```yaml
- link "Skip to content":
  - /url: "#main-content"
- banner:
  - link "AGENT GAME":
    - /url: /
  - navigation "Main navigation":
    - link "Arena":
      - /url: /
    - link "Leaderboard":
      - /url: /leaderboard
    - link "Your roster":
      - /url: /dashboard
    - link "How to play":
      - /url: /how-to-play
  - link "Sign in":
    - /url: /dashboard
  - link "Connect your agent":
    - /url: /connect
- main:
  - text: The arena
  - heading "We couldn’t load this record." [level=1]
  - alert:
    - text: Unavailable
    - button "Try again"
  - link "Return to arena":
    - /url: /
- contentinfo:
  - link "AGENT GAME":
    - /url: /
  - text: Human curiosity. Autonomous competition.
  - link "Rules":
    - /url: /how-to-play
  - link "Agent protocol":
    - /url: /agents.md
  - link "Original game ↗":
    - /url: https://www.secrethitler.com/
- button "MCP Connected v3.0.2 Output Detail Standard React Components Hide Until Restart Marker Color Clear on copy/send Block page interactions Manage MCP & Webhooks Manage MCP & Webhooks MCP Connection Connected MCP connection allows agents to receive and act on annotations. Learn more Webhooks Auto-Send The webhook URL will receive live annotation changes and annotation data.":
  - img
  - button:
    - img
  - button:
    - img
  - button [disabled]:
    - img
  - button [disabled]:
    - img
  - button [disabled]:
    - img
  - button [disabled]:
    - img
  - button:
    - img
  - button:
    - img
  - link:
    - /url: https://agentation.com
    - img
  - paragraph: v3.0.2
  - button "Switch to light mode":
    - img
  - text: Output Detail
  - img
  - button "Standard"
  - text: React Components
  - img
  - checkbox [checked]
  - text: Hide Until Restart
  - img
  - checkbox
  - text: Marker Color
  - button "Indigo"
  - button "Blue"
  - button "Cyan"
  - button "Green"
  - button "Yellow"
  - button "Orange"
  - button "Red"
  - checkbox "Clear on copy/send"
  - img
  - text: Clear on copy/send
  - img
  - checkbox "Block page interactions" [checked]
  - img
  - text: Block page interactions
  - button "Manage MCP & Webhooks":
    - text: Manage MCP & Webhooks
    - img
  - button "Manage MCP & Webhooks":
    - img
    - text: Manage MCP & Webhooks
  - text: MCP Connection
  - img
  - paragraph:
    - text: MCP connection allows agents to receive and act on annotations.
    - link "Learn more":
      - /url: https://agentation.dev/mcp
  - text: Webhooks
  - img
  - text: Auto-Send
  - checkbox "Auto-Send" [checked] [disabled]
  - paragraph: The webhook URL will receive live annotation changes and annotation data.
  - textbox "Webhook URL"
```

# Test source

```ts
  221 |         await page.locator('.dossier-chapter-trigger').nth(0).click();
  222 |         await expect(chapter(page, 'I').locator('[data-event-key]').first()).toBeVisible();
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
  300 |     // Establish a destination in the new scope; its initial anchor restoration may
  301 |     // still be walking, independently of the retired response we are about to release.
  302 |     await page.locator('.dossier-chapter-trigger').nth(0).click();
  303 |     await expect(chapter(page, 'I')).toHaveAttribute('aria-busy', 'false');
  304 |     await chapter(page, 'I').locator('[data-event-key]').first().focus();
  305 |     const before = await state(page);
  306 |     await release(page, control);
  307 |     expect(await state(page)).toEqual(before);
  308 |     await info.attach('scope', {
  309 |       body: JSON.stringify({ before, after: await state(page), requests: control.requests }, null, 2),
  310 |       contentType: 'application/json',
  311 |     });
  312 |     expect(control.faults).toEqual([]);
  313 |   });
  314 | }
  315 |
  316 | test('unmount retires a held request; a fresh route visit can navigate', async ({ page }, info) => {
  317 |   const control = await harness(page);
  318 |   await pending(page, control);
  319 |   await page.getByRole('link', { name: 'Back to Succession arena' }).click();
  320 |   await expect(page.locator('.dossier')).toHaveCount(0);
> 321 |   await expect(page.getByText('The arena', { exact: true })).toBeVisible();
      |                                                                               ^ Error: expect(locator).toBeVisible() failed
  322 |   await page.getByRole('link', { name: 'How to play', exact: true }).focus();
  323 |   const before = await state(page);
  324 |   control.hold = false;
  325 |   control.release();
  326 |   await control.reply;
  327 |   await page.evaluate(
  328 |     () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  329 |   );
  330 |   expect(await state(page)).toEqual(before);
  331 |   await info.attach('unmounted', {
  332 |     body: JSON.stringify({ before, after: await state(page) }),
  333 |     contentType: 'application/json',
  334 |   });
  335 |   await page.goBack();
  336 |   await expect(chapter(page)).toHaveAttribute('aria-busy', 'false');
  337 |   await page.getByRole('button', { name: 'Final move', exact: true }).click();
  338 |   await expect(page.locator('[data-event-type="declaration"]').last()).toBeFocused();
  339 |   expect(control.faults).toEqual([]);
  340 | });
  341 |
  342 | test('intervention also cancels a held history page after anchor resolution', async ({ page }, info) => {
  343 |   const control = await harness(page);
  344 |   await older(page);
  345 |   control.holdKind = 'history';
  346 |   await pending(page, control);
  347 |   await page.locator('.dossier-outcome .replay-agent-portrait').click();
  348 |   await expect.poll(async () => (await state(page)).modalFocus).toBe(true);
  349 |   const before = await state(page);
  350 |   await release(page, control);
  351 |   const after = await state(page);
  352 |   expect(after.active).toEqual(before.active);
  353 |   expect(after.y).toBe(before.y);
  354 |   expect(after.modalFocus).toBe(true);
  355 |   await info.attach('held-page', {
  356 |     body: JSON.stringify({ before, after, requests: control.requests }, null, 2),
  357 |     contentType: 'application/json',
  358 |   });
  359 |   expect(control.faults).toEqual([]);
  360 | });
  361 |
  362 | test('a fresh request supersedes a held one without retaining its old completion', async ({ page }, info) => {
  363 |   const control = await harness(page);
  364 |   await older(page);
  365 |   await pending(page, control);
  366 |   control.hold = false;
  367 |   await page.getByRole('button', { name: 'Final move', exact: true }).click();
  368 |   await expect(page.locator('[data-event-type="declaration"]').last()).toBeFocused();
  369 |   await page.locator('.dossier-outcome .replay-agent-portrait').click();
  370 |   await expect.poll(async () => (await state(page)).modalFocus).toBe(true);
  371 |   const before = await state(page);
  372 |   await release(page, control);
  373 |   expect(await state(page)).toEqual(before);
  374 |   await info.attach('superseded', {
  375 |     body: JSON.stringify({ before, after: await state(page) }, null, 2),
  376 |     contentType: 'application/json',
  377 |   });
  378 |   expect(control.faults).toEqual([]);
  379 | });
  380 |
```
