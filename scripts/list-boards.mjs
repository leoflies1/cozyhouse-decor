import { chromium } from 'playwright';

const context = await chromium.launchPersistentContext('scripts/.pinterest-profile', {
  headless: true,
  viewport: { width: 1280, height: 800 }
});
const page = await context.newPage();
await page.goto('https://www.pinterest.com/leoflies01/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 8000));
await page.screenshot({ path: 'output/pinterest-boards-list.png' });

const allText = await page.evaluate(() => {
  // Get all visible text that could be board names
  const items = [];
  document.querySelectorAll('div, a, span, h2, h3').forEach(el => {
    const t = el.textContent?.trim();
    if (t && t.length > 3 && t.length < 50 && el.children.length < 3) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 50 && rect.width < 400 && rect.height < 40) {
        items.push(t);
      }
    }
  });
  return [...new Set(items)];
});
console.log(JSON.stringify(allText, null, 2));
await context.close();
