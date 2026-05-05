import { chromium } from 'playwright';
const context = await chromium.launchPersistentContext('scripts/.pinterest-profile', {headless:true,viewport:{width:1280,height:800}});
const page = await context.newPage();
await page.goto('https://www.pinterest.com/pin-creation-tool/',{waitUntil:'networkidle',timeout:30000});
await new Promise(r=>setTimeout(r,3000));
const fi = page.locator('input[type="file"]').first();
await fi.setInputFiles('public/images/blog/grandma-chic-3-tabletop.jpg');
await new Promise(r=>setTimeout(r,8000));
// Fill title
await page.locator('input#storyboard-selector-title').fill('Test board picker');
await new Promise(r=>setTimeout(r,2000));

// Click the specific "Scegli una bacheca" button
const boardBtn = page.locator('div[data-test-id="board-dropdown-select-button"]');
await boardBtn.click();
await new Promise(r=>setTimeout(r,5000));
await page.screenshot({path: 'output/board-dropdown.png'});

// Now dump EVERYTHING visible in the flyout
const flyout = await page.evaluate(() => {
  const flyout = document.querySelector('[data-test-id="board-picker-flyout"]');
  if (!flyout) return 'NO FLYOUT FOUND';
  const items = flyout.querySelectorAll('div, span, a, button');
  const texts = [];
  items.forEach(e => {
    const t = e.textContent?.trim();
    if (t && t.length > 0 && t.length < 60) texts.push(t);
  });
  return [...new Set(texts)];
});
console.log('=== FLYOUT CONTENTS ===');
console.log(JSON.stringify(flyout, null, 2));

// Try to find board items in the flyout
const boardItems = await page.evaluate(() => {
  const flyout = document.querySelector('[data-test-id="board-picker-flyout"]');
  if (!flyout) return 'NO FLYOUT';
  const items = flyout.querySelectorAll('[role="option"], [role="button"], div:not([data-test-id*=sidebar]):not([data-test-id*=draft])');
  const result = [];
  items.forEach(e => {
    const t = e.textContent?.trim()?.substring(0,60);
    if (t && t.length > 2 && t !== 'Scegli una bacheca') {
      const cls = Array.from(e.classList).join(' ').substring(0,40);
      result.push({text: t, testId: e.getAttribute('data-test-id')||'', class: cls, tag: e.tagName});
    }
  });
  return result;
});
console.log('=== BOARD ITEMS ===');
console.log(JSON.stringify(boardItems, null, 2));

// Also get all input/fields
const inputs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('input')).map(e => ({id: e.id, placeholder: e.placeholder, type: e.type, ariaLabel: e.getAttribute('aria-label')||''}));
});
console.log('=== INPUTS ===');
console.log(JSON.stringify(inputs, null, 2));

await context.close();