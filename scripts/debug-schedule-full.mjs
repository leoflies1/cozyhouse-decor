import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = resolve(__dirname, '.pinterest-profile');
const SCREENSHOT_DIR = resolve(__dirname, 'schedule-debug');

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      parsed[args[i].replace('--', '')] = args[i + 1] || '';
      i++;
    }
  }
  return parsed;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function debugSchedule() {
  const args = parseArgs();
  const imagePath = args.image || 'public/images/blog/new-neutrals-1-pin.jpg';
  const absoluteImagePath = resolve(imagePath);
  
  if (!fs.existsSync(absoluteImagePath)) {
    console.error(`Image not found: ${absoluteImagePath}`);
    process.exit(1);
  }
  
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });

  try {
    const page = await context.newPage();
    await page.goto('https://www.pinterest.com/pin-creation-tool/', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);
    
    // Check login
    if (page.url().includes('login')) {
      console.error('Not logged in. Run login-pinterest.js first.');
      await context.close();
      process.exit(1);
    }
    
    // Upload image
    console.log('Uploading image...');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(absoluteImagePath);
    await sleep(8000);
    
    // Fill title
    const titleInput = page.locator('input#storyboard-selector-title');
    await titleInput.waitFor({ timeout: 10000 });
    await titleInput.fill('Test Debug Scheduling Pin');
    await sleep(1000);
    
    // Screenshot 1: full page after upload + title
    await page.screenshot({ path: resolve(SCREENSHOT_DIR, '01-after-title.png'), fullPage: false });
    console.log('Screenshot 1 saved: after title');
    
    // Fill description
    const descInput = page.locator('div[role="combobox"]').first();
    await descInput.waitFor({ timeout: 10000 });
    await descInput.click();
    await page.keyboard.type('Test description for debug scheduling', { delay: 5 });
    await sleep(1000);
    
    // Fill link
    await page.locator('input#WebsiteField').fill('https://example.com');
    await sleep(2000);
    
    // Screenshot 2: before clicking publish
    await page.screenshot({ path: resolve(SCREENSHOT_DIR, '02-before-publish.png'), fullPage: false });
    console.log('Screenshot 2 saved: before publish');
    
    // Dump ALL text on the page to find schedule-related buttons/links
    const allText = await page.evaluate(() => document.body.innerText);
    console.log('\n=== ALL PAGE TEXT (first 4000 chars) ===');
    console.log(allText.substring(0, 4000));
    console.log('...');
    console.log(allText.substring(allText.length - 2000));
    
    // Dump all interactive elements (buttons, links, labels)
    const elements = await page.evaluate(() => {
      const results = [];
      const selectors = ['button', 'a', 'label', 'div[role="button"]', 'div[role="option"]', '[data-test-id]'];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const text = el.textContent?.trim() || '';
          const testId = el.getAttribute('data-test-id') || '';
          const role = el.getAttribute('role') || '';
          const tag = el.tagName.toLowerCase();
          if (text || testId) {
            results.push({
              tag,
              text: text.substring(0, 100),
              testId: testId.substring(0, 80),
              role,
              class: (el.className || '').substring(0, 60),
              visible: el.offsetParent !== null
            });
          }
        });
      });
      return results;
    });
    
    console.log('\n=== INTERACTIVE ELEMENTS ===');
    elements.slice(0, 50).forEach(el => {
      if (el.visible) console.log(`  [${el.tag}] "${el.text}" | test-id="${el.testId}" | role="${el.role}"`);
    });
    
    // Now try to find "Pubblica" / schedule button
    const publishButtons = elements.filter(el => 
      el.visible && (el.text.toLowerCase().includes('pubblica') || el.text.toLowerCase().includes('publi') || el.text.toLowerCase().includes('schedule') || el.text.toLowerCase().includes('programma'))
    );
    console.log(`\n=== PUBLISH/SCHEDULE RELATED ELEMENTS (${publishButtons.length}) ===`);
    publishButtons.forEach(el => {
      console.log(`  [${el.tag}] "${el.text}" | test-id="${el.testId}" | class="${el.class}"`);
    });
    
    // Check what's actually clickable near the publish area
    // Also check for aria-labels
    const ariaLabels = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('[aria-label]').forEach(el => {
        const label = el.getAttribute('aria-label') || '';
        const tag = el.tagName.toLowerCase();
        if (label.toLowerCase().includes('pubblica') || label.toLowerCase().includes('publish') || label.toLowerCase().includes('schedule') || label.toLowerCase().includes('programma')) {
          results.push({ tag, 'aria-label': label });
        }
      });
      return results;
    });
    console.log(`\n=== ARIA-LABELS MATCHING (${ariaLabels.length}) ===`);
    ariaLabels.forEach(el => console.log(`  [${el.tag}] aria-label="${el['aria-label']}"`));
    
    await page.screenshot({ path: resolve(SCREENSHOT_DIR, '03-final.png'), fullPage: false });
    console.log('\nScreenshot 3 saved: final');
    
    console.log('\n=== DEBUG COMPLETE ===');
    await context.close();
    
  } catch (error) {
    console.error('Debug failed:', error.message);
    try {
      const p = context.pages()[0];
      if (p) await p.screenshot({ path: resolve(SCREENSHOT_DIR, 'error.png') }).catch(() => {});
    } catch(_) {}
    await context.close();
    process.exit(1);
  }
}

debugSchedule();