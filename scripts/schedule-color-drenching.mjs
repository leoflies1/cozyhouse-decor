import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = resolve(__dirname, '.pinterest-profile');
const ROOT = resolve(__dirname, '..');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const pins = [
  {
    image: 'public/images/blog/color-drenching-hero.jpg',
    title: 'Color Drenching Is the One Living Room Trend That Actually Delivers in 2026',
    description: 'One color. Every surface. Zero hesitation. Color drenching is taking over Pinterest this spring and the best part? You can fake the whole look for under $100 without touching a paintbrush. Sage green curtains pooling on the floor velvet pillows layered on the sofa a chunky knit throw draped over the arm and a rug that ties it all together. Same color different textures. Thats the formula. We found every single piece on Amazon and linked them below.',
    link: 'https://cozyhouse-decor.pages.dev/blog/color-drenching-living-room/',
    board: 'Living Room Inspiration'
  },
  {
    image: 'public/images/blog/color-drenching-1.jpg',
    title: 'The Sage Green Curtains That Make Your Living Room Look Designed',
    description: 'Curtains are the fastest way to color drench a room without painting. These sage green linen blackout panels hit the floor perfectly and the texture catches light in a way that makes the whole room feel richer. Under $25 a panel and your living room instantly goes from basic to intentional. Pair them with velvet pillows and a chunky throw for the full effect.',
    link: 'https://cozyhouse-decor.pages.dev/blog/color-drenching-living-room/',
    board: 'Living Room Inspiration'
  },
  {
    image: 'public/images/blog/color-drenching-2.jpg',
    title: 'The Pillow Stacking Trick That Makes Your Sofa Look Expensive',
    description: 'Stop buying random pillows. When color drenching the rule is simple: same color family different textures. Velvet in back linen in front chunky knit on the arm. The eye follows the color not the object so everything looks intentional even though nothing matches perfectly. These sage green velvet covers are $14 for a set of two and they transform your entire sofa.',
    link: 'https://cozyhouse-decor.pages.dev/blog/color-drenching-living-room/',
    board: 'Living Room Inspiration'
  },
  {
    image: 'public/images/blog/color-drenching-3.jpg',
    title: 'The $18 Throw Blanket That Makes Color Drenching Actually Work',
    description: 'Heres the secret about color drenching that nobody tells you: texture matters more than shade. A chunky knit sage green throw draped over the arm of the sofa breaks up the velvet pillows while keeping the palette locked in. Under $20 and your living room sofa goes from meh to magazine. Throw it over the arm not folded neatly. Trust me.',
    link: 'https://cozyhouse-decor.pages.dev/blog/color-drenching-living-room/',
    board: 'Living Room Inspiration'
  },
  {
    image: 'public/images/blog/color-drenching-4.jpg',
    title: 'The Rug Rule for Color Drenched Rooms: Complement Dont Compete',
    description: 'A sage and ivory rug under the coffee table anchors your color drenched living room without stealing the show. The green tones blend with the walls and the ivory lines break the solid color just enough that the room doesnt feel like a green box. This 4x6 rug is $35 and ties the whole seating area into the color scheme effortlessly.',
    link: 'https://cozyhouse-decor.pages.dev/blog/color-drenching-living-room/',
    board: 'Living Room Inspiration'
  },
  {
    image: 'public/images/blog/color-drenching-5.jpg',
    title: 'The One Accent Piece That Separates Good Color Drenching From Great',
    description: 'Same color but a few shades darker creates depth without breaking the spell. A ceramic sage green vase with dried eucalyptus on the coffee table is the kind of detail that makes people say how did you do this without realizing every single thing in the room is green. Under $16 and it might be the most important piece in the whole setup.',
    link: 'https://cozyhouse-decor.pages.dev/blog/color-drenching-living-room/',
    board: 'Living Room Inspiration'
  }
];

// Schedule dates: tomorrow + 5 following days
const today = new Date();
const dates = [];
for (let i = 1; i <= pins.length; i++) {
  const d = new Date(today);
  d.setDate(d.getDate() + i);
  dates.push(d.toISOString().split('T')[0]);
}

// Create a single pin script and call it for each
import { spawn } from 'child_process';

async function schedulePin(pin, date) {
  return new Promise((resolve, reject) => {
    const args = [
      'scripts/create-pin.js',
      '--image', pin.image,
      '--title', pin.title,
      '--description', pin.description,
      '--link', pin.link,
      '--board', pin.board
    ];
    
    const proc = spawn('node', args, { cwd: ROOT, stdio: ['pipe', 'inherit', 'inherit'] });
    
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Exit code ${code}`));
    });
    proc.on('error', reject);
  });
}

console.log('Starting to create pins...');
for (let i = 0; i < pins.length; i++) {
  console.log(`\n===== PIN ${i+1}/${pins.length} — scheduled for ${dates[i]} =====`);
  try {
    await schedulePin(pins[i], dates[i]);
    console.log(`Pin ${i+1} done!`);
  } catch (e) {
    console.error(`Pin ${i+1} failed: ${e.message}`);
  }
  if (i < pins.length - 1) await sleep(5000);
}
console.log('\nALL PINS DONE!');