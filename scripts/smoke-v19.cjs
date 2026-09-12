// v19 冒烟：随手记浮窗 + 余额状态灯 截图（1280 桌面 / 390 手机）
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:5190';
const OUT = process.env.SHOT_DIR || 'D:/Desktop/coding项目/个人工作进度管理看板/反馈截图/v19-smoke';

(async () => {
  const browser = await chromium.launch(
    process.env.EXEC_PATH ? { executablePath: process.env.EXEC_PATH } : {},
  );
  try {
    // ---- 桌面 1280 ----
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/desktop-1-home.png` });

    // 余额状态灯点击浮层
    await page.click('button[aria-label="DeepSeek 余额状态"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/desktop-2-balance-pop.png` });
    await page.click('button[aria-label="DeepSeek 余额状态"]'); // 关掉浮层

    // 随手记浮窗：列表
    await page.click('text=✎ 随手记');
    await page.waitForSelector('text=WORK NOTES');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/desktop-3-notes-list.png` });

    // 输入一条并回车提交
    await page.fill('input[placeholder*="一句话记下"]', '临时会议改期，打断了原本的写稿安排');
    await page.press('input[placeholder*="一句话记下"]', 'Enter');
    await page.waitForTimeout(900);
    const body1 = await page.content();
    if (!body1.includes('临时会议改期')) throw new Error('新增记录未出现在列表');

    // AI 总结本月
    await page.click(`button:has-text("AI 总结")`);
    await page.waitForSelector('.report-md', { timeout: 60000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/desktop-4-notes-summary.png` });
    const body2 = await page.content();
    if (!body2.includes('复盘') && !body2.includes('##')) throw new Error('总结内容异常');
    await page.close();

    // ---- 手机 390 ----
    const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await m.goto(BASE, { waitUntil: 'networkidle' });
    await m.waitForTimeout(800);
    await m.screenshot({ path: `${OUT}/mobile-1-home.png` });
    await m.click('text=✎ 随手记');
    await m.waitForSelector('text=WORK NOTES');
    await m.waitForTimeout(700);
    await m.screenshot({ path: `${OUT}/mobile-2-notes.png` });
    await m.close();

    console.log('SMOKE OK');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
