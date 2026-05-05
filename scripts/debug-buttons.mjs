import { chromium } from 'playwright';

const context = await chromium.launchPersistentContext('scripts/.pinterest-profile', {
  headless: true,
  viewport: { width: 1280, height: 800 }
});
const page = await context.newPage();
await page.goto('https://www.pinterest.com/pin-creation-tool/', { waitUntil: 'networkidle', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

const fileInput = page.locator('input[type="file"]').first();
await fileInput.setInputFiles('public/images/blog/grandma-chic-3-tabletop.jpg');
await new Promise(r => setTimeout(r, 8000));

// Fill title
const titleInput = page.locator('input#storyboard-selector-title');
await titleInput.waitFor({ timeout: 10000 });
await titleInput.click();
await titleInput.fill('Test Pin - Please Delete');
await new Promise(r => setTimeout(r, 1000));

// Fill description
const descInput = page.locator('div[role="combobox"][aria-label*="descrizione"], div.public-DraftEditor-content[role="combobox"]').first();
await descInput.waitFor({ timeout: 10000 });
await descInput.click();
await new Promise(r => setTimeout(r, 500));
await page.keyboard.type('Test description for automation', { delay: 10 });
await new Promise(r => setTimeout(r, 1000));

// Fill link
const linkInput = page.locator('input#WebsiteField');
await linkInput.fill('https://cozyhouse-decor.pages.dev/');
await new Promise(r => setTimeout(r, 2000));

// Find ALL buttons on page
const buttons = await page.evaluate(() => {
  const btns = document.querySelectorAll('button, [role="button"], div[data-test-id*="publish" i], div[data-test-id*="save" i]');
  return Array.from(btns).map(e => ({
    tag: e.tagName,
    text: e.textContent?.trim().substring(0, 50) || '',
    dataTestId: e.getAttribute('data-test-id') || '',
    role: e.getAttribute('role') || '',
    className: (e.className || '').toString().substring(0, 60),
    disabled: e.disabled || e.getAttribute('aria-disabled'),
  }));
});
console.log('=== ALL BUTTONS ===');
console.log(JSON.stringify(buttons, null, 2));

await page.screenshot({ path: 'output/pin-before-publish.png' });
await context.close();
