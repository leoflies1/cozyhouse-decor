/**
 * login-pinterest.js
 * Logs into Pinterest and saves browser state for reuse.
 * Usage: node scripts/login-pinterest.js
 */
import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = resolve(__dirname, '.pinterest-auth.json');

const EMAIL = process.env.PINTEREST_EMAIL || 'leoflies.01@gmail.com';
const PASSWORD = process.env.PINTEREST_PASSWORD || 'Look_up.15';
const FALLBACK_EMAIL = 'leobig.up1@gmail.com';

async function login(email) {
  const userDataDir = resolve(__dirname, '.pinterest-profile');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1280, height: 800 },
  });

  try {
    const page = await context.newPage();
    console.log(`Navigating to Pinterest login with ${email}...`);
    await page.goto('https://www.pinterest.com/login/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Fill email
    const emailInput = page.locator('input[id="email"]').first();
    await emailInput.waitFor({ timeout: 10000 });
    await emailInput.fill(email);
    console.log('Email entered.');

    // Click continue/login button
    const continueBtn = page.locator('button[type="submit"], button[data-test-id="registerFormSubmitButton"]').first();
    await continueBtn.click();
    await page.waitForTimeout(3000);

    // Fill password if prompted
    const passwordInput = page.locator('input[id="password"], input[type="password"]').first();
    if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await passwordInput.fill(PASSWORD);
      console.log('Password entered.');

      // Click login/submit
      const loginBtn = page.locator('button[type="submit"], button[data-test-id="registerFormSubmitButton"]').first();
      await loginBtn.click();
      console.log('Login button clicked.');
    }

    // Wait for redirect to home or business hub
    await page.waitForURL(/pinterest\.com\/(business\/|home|explore|search)/, { timeout: 30000 });
    await page.waitForTimeout(3000);

    const url = page.url();
    console.log(`Login successful! Redirected to: ${url}`);

    // Save cookies for non-persistent context usage
    const cookies = await context.cookies();
    const storage = await page.evaluate(() => ({
      localStorage: Object.fromEntries(Object.entries(localStorage)),
    }));

    const authState = {
      cookies,
      storage,
      url,
      email,
      timestamp: new Date().toISOString(),
    };

    const fs = await import('fs');
    fs.writeFileSync(AUTH_FILE, JSON.stringify(authState, null, 2));
    console.log(`Auth state saved to ${AUTH_FILE}`);

    await context.close();
    return authState;
  } catch (error) {
    console.error(`Login failed with ${email}:`, error.message);
    await context.close();
    return null;
  }
}

// Try primary email, fallback to secondary
const result = await login(EMAIL);
if (!result) {
  console.log(`Primary email failed. Trying fallback: ${FALLBACK_EMAIL}`);
  const fallback = await login(FALLBACK_EMAIL);
  if (!fallback) {
    console.error('All login attempts failed.');
    process.exit(1);
  }
}
