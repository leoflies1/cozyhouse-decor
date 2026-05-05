import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = resolve(__dirname, 'scripts/.pinterest-profile');

async function debug() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await page.goto('https://www.pinterest.com/pin-creation-tool/', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles('public/images/blog/new-neutrals-1-pin.jpg');
  await new Promise(r => setTimeout(r, 8000));
  
  await page.screenshot({ path: 'scripts/pin-ui-after-upload.png' });
  console.log('Screenshot saved');
  
  const html = await page.content();
  const scheduleMatches = html.match(/[Pp]i[ù'].?tardi|[Ss]chedule|[Pp]rogramma/g) || [];
  console.log('Schedule mentions found:', scheduleMatches.length, scheduleMatches);
  
  const buttons = await page.locator('button').all();
  console.log('Buttons found:', buttons.length);
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text.trim()) console.log('  Button:', text.trim().substring(0, 60));
  }
  
  await context.close();
}
debug().catch(e => { console.error(e); process.exit(1); });