import { chromium } from 'playwright';

const context = await chromium.launchPersistentContext('scripts/.pinterest-profile', {
  headless: true,
  viewport: { width: 1280, height: 800 }
});
const page = await context.newPage();
await page.goto('https://www.pinterest.com/pin-creation-tool/', { waitUntil: 'networkidle', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

const fileInput = page.locator('input[type="file"]').first();
await fileInput.setInputFiles('public/images/blog/bathroom-upgrades-2.jpg');
await new Promise(r => setTimeout(r, 8000));

await page.screenshot({ path: 'output/pin-creation-debug.png', fullPage: false });

const elements = await page.evaluate(() => {
  const els = document.querySelectorAll('input, textarea, div[contenteditable="true"], [role="textbox"]');
  return Array.from(els).map(e => ({
    tag: e.tagName,
    type: e.type || '',
    placeholder: e.placeholder || '',
    dataTestId: e.getAttribute('data-test-id') || '',
    role: e.getAttribute('role') || '',
    name: e.name || '',
    id: e.id || '',
    ariaLabel: e.getAttribute('aria-label') || '',
    className: (e.className || '').toString().substring(0, 80),
  }));
});
console.log(JSON.stringify(elements, null, 2));
await context.close();
