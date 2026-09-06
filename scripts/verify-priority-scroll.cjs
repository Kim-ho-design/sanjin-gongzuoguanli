// Run against a local preview. All priority writes are intercepted; no task data changes.
// PLAYWRIGHT_MODULE may point to an installed Playwright package.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 600 } });
      let fail = false;
      await page.route('**/api/tasks/*', async route => {
        if (route.request().method() !== 'PATCH') return route.continue();
        await new Promise(resolve => setTimeout(resolve, 100));
        await route.fulfill({ status: fail ? 500 : 200, json: fail ? { error: 'test' } : { ok: true } });
      });
      await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:5190');
      await page.waitForSelector('.week-task select');
      await page.waitForTimeout(700);
      for (const shouldFail of [false, true]) {
        fail = shouldFail;
        const select = page.locator('.week-task select').last();
        await select.scrollIntoViewIfNeeded();
        const handle = await select.elementHandle();
        const before = await page.evaluate(() => scrollY);
        await select.selectOption('1');
        await page.waitForTimeout(700);
        const after = await page.evaluate(() => scrollY);
        assert(await handle.evaluate(node => node.isConnected), 'Card control must not remount');
        assert(Math.abs(after - before) < 50, `Unexpected scroll jump: ${before} -> ${after}`);
        console.log(`PASS ${width}px ${fail ? 'failure' : 'success'}: scroll ${before} -> ${after}, original node retained`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
