/**
 * create-pin.js
 * Creates or schedules a pin on Pinterest using saved auth state.
 * Usage:
 *   node scripts/create-pin.js --image path/to/image.jpg --title "My Pin" --description "Desc" --link https://example.com --board "My Board" [--schedule-date 2026-04-28]
 */
import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = resolve(__dirname, '.pinterest-auth.json');
const PROFILE_DIR = resolve(__dirname, '.pinterest-profile');

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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function createPin({ image, title, description, link, board, scheduleDate }) {
  if (!image || !title || !description || !link || !board) {
    console.error('Missing required args: --image, --title, --description, --link, --board');
    process.exit(1);
  }

  const absoluteImagePath = resolve(image);
  if (!fs.existsSync(absoluteImagePath)) {
    console.error(`Image not found: ${absoluteImagePath}`);
    process.exit(1);
  }

  console.log(`Creating pin: "${title.substring(0, 50)}..."`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: { width: 1280, height: 800 },
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

    // Fill title (Pinterest 2026: input#storyboard-selector-title)
    console.log('Filling title...');
    const titleInput = page.locator('input#storyboard-selector-title');
    await titleInput.waitFor({ timeout: 10000 });
    await titleInput.click();
    await titleInput.fill(title);
    await sleep(1000);

    // Fill description (Pinterest 2026: DraftJS combobox)
    console.log('Filling description...');
    const descInput = page.locator('div[role="combobox"][aria-label*="descrizione"], div[role="combobox"][aria-label*="description"], div.public-DraftEditor-content[role="combobox"]').first();
    await descInput.waitFor({ timeout: 10000 });
    await descInput.click();
    await sleep(500);
    await page.keyboard.type(description, { delay: 10 });
    await sleep(1000);

    // Fill link (Pinterest 2026: input#WebsiteField)
    console.log('Filling link...');
    const linkInput = page.locator('input#WebsiteField');
    await linkInput.fill(link);
    await sleep(2000);

    // Select board (Pinterest 2026: dropdown with search field)
    console.log(`Selecting board: "${board}"...`);
    const boardBtn = page.locator('div[data-test-id="board-dropdown-select-button"]');
    await boardBtn.waitFor({ timeout: 5000 });
    await boardBtn.click();
    await sleep(2000);

    // Search for board
    const boardSearch = page.locator('input#pickerSearchField');
    await boardSearch.waitFor({ timeout: 5000 });
    await boardSearch.fill(board);
    await sleep(2000);

    // Click the board row (exact test-id match)
    const escapedName = board.replace(/[&"'<>]/g, '');
    const boardRow = page.locator(`div[data-test-id="board-row-${escapedName}"]`);
    if (await boardRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await boardRow.click();
      await sleep(1000);
    } else {
      console.warn(`Board "${board}" not found. Trying any board...`);
      const anyBoard = page.locator('div[data-test-id*="board-row-"]').first();
      if (await anyBoard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await anyBoard.click();
        await sleep(1000);
      }
    }

    // Click publish or schedule (Pinterest 2026)
    if (scheduleDate) {
      console.log(`Scheduling pin for ${scheduleDate}...`);
      
      // Click "Pubblica più tardi" toggle - it's a switch group with data-test-id="pin-draft-switch-group"
      // The actual clickable element is a label inside it
      const scheduleToggle = page.locator('[data-test-id="pin-draft-switch-group"] label, [data-test-id="pin-draft-switch-group"]');
      await scheduleToggle.waitFor({ timeout: 10000 });
      await scheduleToggle.click();
      await sleep(2000);
      
      // Parse date (supports YYYY-MM-DD or DD/MM/YYYY)
      let day, month, year;
      if (scheduleDate.includes('-')) {
        [year, month, day] = scheduleDate.split('-');
      } else if (scheduleDate.includes('/')) {
        [day, month, year] = scheduleDate.split('/');
      }
      
      // Try to fill date input if visible as type="date" input
      const dateInput = page.locator('input[type="date"]').first();
      if (await dateInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dateInput.fill(`${year}-${month}-${day}`);
        await sleep(500);
      }
      
      // Also try time input if visible
      const timeInput = page.locator('input[type="time"]').first();
      if (await timeInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await timeInput.fill('12:00');
        await sleep(500);
      }
      
      // Click final save button via test-id
      const finalPublish = page.locator('[data-test-id="storyboard-creation-nav-done"]');
      await finalPublish.waitFor({ timeout: 10000 });
      await finalPublish.click();
      await sleep(5000);
    } else {
      // Just publish immediately
      console.log('Publishing pin immediately...');
      const publishBtn = page.locator('[data-test-id="storyboard-creation-nav-done"]');
      await publishBtn.waitFor({ timeout: 10000 });
      await publishBtn.click();
      await sleep(5000);
    }

    const currentUrl = page.url();
    console.log(`Pin ${scheduleDate ? 'scheduled' : 'published'}! URL: ${currentUrl}`);

    await context.close();
    return { success: true, url: currentUrl };
  } catch (error) {
    console.error('Pin creation failed:', error.message);
    const p = context.pages()[0];
    if (p) {
      await p.screenshot({ path: resolve(__dirname, 'pin-error-screenshot.png') }).catch(() => {});
    }
    await context.close();
    return { success: false, error: error.message };
  }
}

const args = parseArgs();
const result = await createPin(args);
if (!result.success) {
  process.exit(1);
}
