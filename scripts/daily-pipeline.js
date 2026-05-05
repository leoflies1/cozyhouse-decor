/**
 * daily-pipeline.js
 * 
 * Complete daily automation pipeline for CozyHouse Decor:
 * Part A: Generate a new blog post with images and affiliate links
 * Part B: Schedule pins for previous blog posts on Pinterest
 * 
 * Usage: node scripts/daily-pipeline.js [--dry-run] [--skip-blog] [--skip-pins]
 */
import fs from 'fs';
import path from 'path';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BLOG_DIR = resolve(ROOT, 'src/content/blog');
const IMG_DIR = resolve(ROOT, 'public/images/blog');
const STATE_FILE = resolve(__dirname, 'pipeline-state.json');

const REPLICATE_TOKEN = process.env.REPLICATE_TOKEN || 'r8_FZhZE20dEhcBJS4Pz7pxh1eMFpiF5YD3ThUwb';
const AFFILIATE_TAG = process.env.AFFILIATE_TAG || 'cozyhouse0a21-20';
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || '';

// ============================================
// TOPIC ROTATION
// ============================================
const BOARD_MAP = {
  'Bathroom': 'Bathroom Aesthetic',
  'Bedroom': 'Bedroom Decor Ideas',
  'Living Room': 'Living Room Inspiration',
  'Kitchen': 'kitchen Best SetUp',
  'Nursery': 'Nursery Decor',
  'Seasonal': 'Spring Home Decor Ideas',
  'Tips': 'Cozy Home Vibes',
};

const TOPICS = [
  { category: 'Kitchen', rooms: ['kitchen', 'cooking space', 'kitchen island', 'pantry'], budget: 60 },
  { category: 'Bedroom', rooms: ['bedroom', 'master bedroom', 'guest bedroom', 'bedside'], budget: 50 },
  { category: 'Living Room', rooms: ['living room', 'lounge', 'sitting area', 'family room'], budget: 100 },
  { category: 'Bathroom', rooms: ['bathroom', 'bathroom vanity', 'shower room', 'half bath'], budget: 50 },
  { category: 'Nursery', rooms: ['nursery', 'baby room', "children's room", 'playroom'], budget: 40 },
  { category: 'Seasonal', rooms: ['balcony', 'patio', 'outdoor space', 'garden corner'], budget: 80 },
  { category: 'Seasonal', rooms: ['entryway', 'hallway', 'mudroom', 'foyer'], budget: 40 },
  { category: 'Living Room', rooms: ['dining room', 'dining area', 'eating nook'], budget: 60 },
  { category: 'Tips', rooms: ['small apartment', 'studio apartment', 'tiny home', 'cozy space'], budget: 70 },
  { category: 'Seasonal', rooms: ['home office', 'workspace', 'study corner', 'reading room'], budget: 50 },
];

// ============================================
// STATE MANAGEMENT
// ============================================
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return {
    publishedBlogs: [],
    scheduledPins: [],
    topicIndex: 0,
    lastRun: null,
    scheduleQueue: [],
  };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ============================================
// HELPERS
// ============================================
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ============================================
// PART A: BLOG GENERATION
// ============================================

/**
 * Search Amazon for real products using Brave Search
 */
async function searchAmazonProducts(query, maxProducts = 6) {
  const searchQuery = `site:amazon.com/dp ${query} under 30`;
  try {
    const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=${maxProducts}`, {
      headers: { 'X-Subscription-Token': BRAVE_API_KEY, 'Accept': 'application/json' },
    });
    const data = await resp.json();
    
    const products = [];
    for (const result of (data.web?.results || [])) {
      const asinMatch = result.url?.match(/\/dp\/([A-Z0-9]{10})/i);
      if (asinMatch) {
        const asin = asinMatch[1].toUpperCase();
        // Extract product name from title
        const title = result.title?.replace(/^Amazon\.com:?\s*/i, '').substring(0, 100) || query;
        products.push({
          name: title.split(' - ')[0].split(':')[0].trim(),
          asin,
          url: `https://www.amazon.com/dp/${asin}?tag=${AFFILIATE_TAG}`,
          description: result.description?.substring(0, 120) || '',
        });
      }
    }
    return products;
  } catch (e) {
    console.warn(`Amazon search failed for "${query}": ${e.message}`);
    return [];
  }
}

/**
 * Generate image via Replicate FLUX 2 Pro
 */
async function generateImage(prompt, outputPath) {
  console.log(`  Generating image: ${path.basename(outputPath)}`);
  
  try {
    // Create prediction
    const createResp = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: '609793a667ed94b210242837d3c3c9fc9a64ae93685f15d75002ba0ed9a97f2b',
        input: {
          prompt,
          width: 960,
          height: 1440,
          num_outputs: 1,
        },
      }),
    });
    const prediction = await createResp.json();
    
    if (prediction.error) {
      throw new Error(`Replicate error: ${prediction.error}`);
    }
    
    const predictionId = prediction.id;
    console.log(`  Prediction started: ${predictionId}`);
    
    // Poll until complete
    let output = null;
    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      const statusResp = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` },
      });
      const status = await statusResp.json();
      
      if (status.status === 'succeeded') {
        output = status.output;
        break;
      } else if (status.status === 'failed') {
        throw new Error(`Image generation failed: ${status.error}`);
      }
      process.stdout.write('.');
    }
    
    if (!output) {
      throw new Error('Image generation timed out');
    }
    
    const imageUrl = Array.isArray(output) ? output[0] : output;
    
    // Download image
    const imgResp = await fetch(imageUrl);
    const buffer = Buffer.from(await imgResp.arrayBuffer());
    
    // Convert webp to jpg if needed using sharp
    const sharp = (await import('sharp')).default;
    await sharp(buffer)
      .jpeg({ quality: 90 })
      .toFile(outputPath);
    
    console.log(`  ✓ Image saved: ${path.basename(outputPath)}`);
    return outputPath;
  } catch (e) {
    console.error(`  ✗ Image generation failed: ${e.message}`);
    return null;
  }
}

/**
 * Generate a complete blog post
 */
async function generateBlog(state) {
  const topic = TOPICS[state.topicIndex % TOPICS.length];
  state.topicIndex++;
  
  const roomType = topic.rooms[Math.floor(Math.random() * topic.rooms.length)];
  const category = topic.category;
  const budget = topic.budget;
  
  // Generate a blog title
  const titleTemplates = [
    `${budget === 50 ? 'Budget' : 'Affordable'} ${capitalize(roomType)} Upgrades Under $${budget} That Actually Work`,
    `Transform Your ${capitalize(roomType)} With These ${Math.floor(Math.random() * 3) + 5} Amazon Finds Under $${budget}`,
    `The $${budget} ${capitalize(roomType)} Makeover That Changes Everything`,
    `${capitalize(roomType)} Refresh Under $${budget} — No Renovation Needed`,
    `7 ${capitalize(roomType)} Finds Under $${budget} That Look 3x More Expensive`,
  ];
  const title = titleTemplates[Math.floor(Math.random() * titleTemplates.length)];
  const slug = slugify(title);
  
  console.log(`\n📝 Generating blog: "${title}"`);
  console.log(`   Category: ${category}, Room: ${roomType}, Budget: $${budget}`);
  
  // Check if blog already exists
  const blogPath = resolve(BLOG_DIR, `${slug}.md`);
  if (fs.existsSync(blogPath)) {
    console.log(`   Blog already exists: ${slug}.md — skipping.`);
    return null;
  }
  
  // Define blog sections (5-7 sections)
  const sectionCount = Math.floor(Math.random() * 3) + 5; // 5-7
  const sections = generateSections(roomType, sectionCount, budget);
  
  // Search for real products for each section
  console.log(`   Searching Amazon for ${sections.length} sections...`);
  for (const section of sections) {
    const products = await searchAmazonProducts(section.searchQuery, 2);
    if (products.length > 0) {
      section.products = products;
      section.mainProduct = products[0];
    } else {
      // Fallback: create placeholder (shouldn't happen often)
      section.products = [];
      section.mainProduct = null;
    }
    await sleep(1000); // Rate limit
  }
  
  // Generate images for each section
  console.log(`   Generating ${sections.length + 1} images...`);
  const images = [];
  
  // Hero image
  const heroPrompt = `Canon EOS R5 photograph at f/1.4, wide composition of a stunning ${roomType} interior, warm natural afternoon light streaming through windows, layered textiles, curated accessories, 35mm film grain, palette of warm cream sage green terracotta brass and charcoal, cinematic color grading, architectural photography for interior design magazine`;
  const heroPath = resolve(IMG_DIR, `${slug}-hero.jpg`);
  const heroResult = await generateImage(heroPrompt, heroPath);
  images.push(heroPath);
  
  // Section images
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const imgPrompt = `Canon EOS R5 photograph at f/1.4, ${section.imagePrompt}, warm natural light, 35mm film grain, cinematic color grading, palette of warm cream sage green terracotta brass and charcoal, interior photography`;
    const imgPath = resolve(IMG_DIR, `${slug}-${i + 1}.jpg`);
    const result = await generateImage(imgPrompt, imgPath);
    if (result) section.imagePath = path.basename(result);
    images.push(result);
    await sleep(2000); // Rate limit between generations
  }
  
  // Build frontmatter with affiliateLinks and pinterestStrategy
  const affiliateLinks = sections
    .flatMap(s => s.products)
    .map(p => ({
      name: p.name,
      url: p.url,
      description: p.description,
    }));
  
  const pinterestStrategy = {
    board: getBoardForCategory(category),
    scheduleDay: addDays(today(), 2), // Start pinning 2 days from now
    hookText: title.split('—')[0].split('That')[0].trim(),
    priority: 1,
  };
  
  const tags = generateTags(category, roomType, sections);
  
  // Build markdown
  let markdown = `---\n`;
  markdown += `title: "${title}"\n`;
  markdown += `description: "${generateDescription(roomType, budget)}"\n`;
  markdown += `pubDate: ${today()}\n`;
  markdown += `category: "${category}"\n`;
  markdown += `heroImage: "/images/blog/${slug}-hero.jpg"\n`;
  markdown += `tags: [${tags.map(t => `"${t}"`).join(', ')}]\n`;
  markdown += `featured: false\n`;
  
  // affiliateLinks
  if (affiliateLinks.length > 0) {
    markdown += `affiliateLinks:\n`;
    for (const link of affiliateLinks) {
      markdown += `  - name: "${link.name.replace(/"/g, '\\"')}"\n`;
      markdown += `    url: "${link.url}"\n`;
      if (link.description) markdown += `    description: "${link.description.replace(/"/g, '\\"')}"\n`;
    }
  }
  
  // pinterestStrategy
  markdown += `pinterestStrategy:\n`;
  markdown += `  board: "${pinterestStrategy.board}"\n`;
  markdown += `  scheduleDay: "${pinterestStrategy.scheduleDay}"\n`;
  markdown += `  hookText: "${pinterestStrategy.hookText.replace(/"/g, '\\"')}"\n`;
  markdown += `  priority: ${pinterestStrategy.priority}\n`;
  markdown += `---\n\n`;
  
  // Blog content
  markdown += `# ${title}\n\n`;
  markdown += `Your ${roomType} doesn't need a renovation to look incredible. With under $${budget} and a weekend, you can completely transform how this space feels. Here are ${sections.length} upgrades that actually deliver.\n\n`;
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    markdown += `## ${i + 1}. ${section.title}\n\n`;
    markdown += `${section.content}\n\n`;
    
    // Image
    if (section.imagePath) {
      const imgAlt = `${roomType} ${section.title.toLowerCase()}, interior photography`;
      if (section.mainProduct) {
        markdown += `[![${imgAlt}](/images/blog/${section.imagePath})](${section.mainProduct.url})\n\n`;
      } else {
        markdown += `![${imgAlt}](/images/blog/${section.imagePath})\n\n`;
      }
    }
    
    // Shop the Look
    if (section.products.length > 0) {
      markdown += `### 🛒 Shop the Look\n`;
      for (const product of section.products) {
        const priceMatch = product.description?.match(/\$[\d,.]+/);
        const price = priceMatch ? ` — ${priceMatch[0]}` : '';
        markdown += `- [${product.name}${price}](${product.url})${product.description ? ` — ${product.description.substring(0, 80)}` : ''}\n`;
      }
      markdown += `\n---\n\n`;
    }
  }
  
  // Summary table
  markdown += `## Total Investment: Under $${budget}\n\n`;
  markdown += `| Upgrade | Cost | Impact |\n`;
  markdown += `|---|---|---|\n`;
  for (const section of sections) {
    const cost = section.mainProduct?.description?.match(/\$[\d,.]+/)?.[0] || `$${Math.floor(Math.random() * 20) + 10}`;
    const stars = '⭐'.repeat(Math.floor(Math.random() * 2) + 4);
    markdown += `| ${section.title} | ${cost} | ${stars} |\n`;
  }
  
  markdown += `\nPick your favorites and transform your ${roomType} in one weekend — no contractor, no renovation, no stress.\n`;
  
  // Save blog
  fs.writeFileSync(blogPath, markdown);
  console.log(`   ✓ Blog saved: ${slug}.md`);
  
  // Update state
  state.publishedBlogs.push({
    slug,
    title,
    category,
    date: today(),
    images: images.filter(Boolean).map(p => path.basename(p)),
    sections: sections.map(s => ({
      title: s.title,
      image: s.imagePath,
      products: s.products.map(p => p.asin),
    })),
  });
  
  return { slug, title, category, sections, imagePath: path.basename(images[0]) };
}

// ============================================
// SECTION GENERATION HELPERS
// ============================================

function generateSections(roomType, count, budget) {
  const allSections = {
    'kitchen': [
      { title: 'Swap Your Cabinet Hardware for Instant Elegance', searchQuery: 'kitchen cabinet pulls brass matte black', imagePrompt: `close-up of modern kitchen cabinet with new brass drawer pulls, warm light` },
      { title: 'Add Under-Cabinet LED Strip Lights', searchQuery: 'under cabinet LED light strip kitchen warm white', imagePrompt: `kitchen counter with warm under-cabinet LED lighting, dishes visible` },
      { title: 'Upgrade Your Dish Soap Setup', searchQuery: 'kitchen soap dispenser set bamboo tray', imagePrompt: `kitchen sink area with bamboo soap dispenser set on marble counter` },
      { title: 'Replace Your Rug With Something That Ties It Together', searchQuery: 'kitchen washable runner rug cotton', imagePrompt: `wide shot of kitchen with patterned cotton runner rug on wood floor` },
      { title: 'Bring in a Herb Garden That Actually Looks Good', searchQuery: 'indoor herb garden kit kitchen counter', imagePrompt: `kitchen window with small potted herb garden, basil rosemary thyme` },
      { title: 'Display Your Cookbooks Like a Design Feature', searchQuery: 'wooden cookbook stand kitchen counter', imagePrompt: `open cookbook on wooden stand next to fresh ingredients on kitchen counter` },
      { title: 'Add a Textured Backsplash Without Tiling', searchQuery: 'peel and stick kitchen backsplash tiles', imagePrompt: `kitchen wall with modern peel and stick backsplash tiles behind stove` },
    ],
    'bedroom': [
      { title: 'New Bedding Changes Everything', searchQuery: 'hotel quality cotton duvet cover set cream white', imagePrompt: `luxurious hotel-style bed with crisp white cotton bedding, layered pillows` },
      { title: 'Layer Throw Pillows Like a Designer', searchQuery: 'decorative throw pillows set neutral bedroom', imagePrompt: `bed with artfully arranged neutral throw pillows, layered textures` },
      { title: 'Add Warm Lighting You Can Control', searchQuery: 'bedside table lamp warm glow ceramic', imagePrompt: `bedside table with ceramic lamp casting warm golden glow on bed` },
      { title: 'The $20 Nightstand Upgrade', searchQuery: 'wooden tray for nightstand organizer', imagePrompt: `styled nightstand with wooden tray, books, candle, small plant` },
      { title: 'Hang Curtains That Make the Room Feel Taller', searchQuery: 'linen curtain panels bedroom floor to ceiling', imagePrompt: `bedroom window with floor-to-ceiling linen curtains, natural light streaming in` },
      { title: 'Add a Cozy Rug Under the Bed', searchQuery: 'soft bedroom rug under bed plush', imagePrompt: `bedroom with plush rug extending from under bed, warm tones` },
      { title: 'Create a Gallery Wall Above the Bed', searchQuery: 'wall art set above bed frames', imagePrompt: `gallery wall above bed with mix of framed art prints and photos` },
    ],
    'living room': [
      { title: 'Swap Your Throw Pillows for Instant Texture', searchQuery: 'textured throw pillows living room neutral', imagePrompt: `living room sofa with arranged textured neutral throw pillows` },
      { title: 'Add an Area Rug That Anchors the Space', searchQuery: 'living room area rug jute or cotton neutral', imagePrompt: `wide living room shot with large neutral area rug under furniture` },
      { title: 'Warm Lighting Overhead Makes All the Difference', searchQuery: 'arc floor lamp brass living room', imagePrompt: `living room corner with brass arc floor lamp casting warm light` },
      { title: 'Style Your Coffee Table Like a Pro', searchQuery: 'decorative coffee table tray candles books', imagePrompt: `styled coffee table with wooden tray, books, candle, small plant` },
      { title: 'Add a Statement Mirror', searchQuery: 'decorative wall mirror living room gold frame', imagePrompt: `living room with large gold frame mirror reflecting light` },
      { title: 'Bring In Plants That Thrive Indoors', searchQuery: 'indoor plant pot living room large floor', imagePrompt: `living room corner with large floor plant in woven basket` },
      { title: 'Drape a Throw Blanket on the Sofa', searchQuery: 'chunky knit throw blanket living room cream', imagePrompt: `sofa corner with casually draped cream knit throw blanket` },
    ],
    'bathroom': [
      { title: 'Swap Your Shower Curtain for Something That Matters', searchQuery: 'fabric shower curtain waffle texture sage green', imagePrompt: `bathroom with sage green waffle shower curtain, natural light` },
      { title: 'Add a Teak Bathtub Tray for Instant Spa Vibes', searchQuery: 'teak bathtub tray caddy expandable', imagePrompt: `wooden teak bath tray with candles and eucalyptus on tub edge` },
      { title: 'Change Your Lighting Without an Electrician', searchQuery: 'battery operated wall sconce brass bathroom', imagePrompt: `bathroom with warm brass sconce casting golden glow on mirror` },
      { title: 'Layer Textiles Like a Hotel', searchQuery: 'egyptian cotton towel set hotel quality', imagePrompt: `stacked cream towels on bathroom shelf with terracotta accents` },
      { title: 'Bring In Plants That Love Humidity', searchQuery: 'pothos plant hanging bathroom snake plant', imagePrompt: `bathroom with hanging pothos and snake plant on windowsill` },
      { title: 'Replace the Mirror for Instant Character', searchQuery: 'round black metal frame mirror bathroom 24 inch', imagePrompt: `bathroom vanity with round black metal frame mirror above` },
      { title: 'Style Your Vanity With a Tray', searchQuery: 'bamboo vanity tray organizer bathroom', imagePrompt: `bathroom counter with bamboo tray holding soap and candle` },
    ],
    'nursery': [
      { title: 'Add a Dreamy Wall Gallery Above the Crib', searchQuery: 'nursery wall art set neutral boho', imagePrompt: `nursery wall above crib with framed art prints and fairy lights` },
      { title: 'Soft Storage Baskets That Hide the Chaos', searchQuery: 'woven storage basket nursery neutral', imagePrompt: `nursery corner with stacked woven storage baskets holding toys` },
      { title: 'The Night Light That Actually Helps Them Sleep', searchQuery: 'nursery night light warm glow dimmable', imagePrompt: `nursery at dusk with warm dim night light on dresser` },
      { title: 'A Cozy Glider Upgrade Under $30', searchQuery: 'nursery glider cushion cover soft', imagePrompt: `nursery glider chair with soft neutral cushion and knit blanket` },
      { title: 'Add a Crib Mobile Worth Looking At', searchQuery: 'nursery crib mobile neutral boho handmade', imagePrompt: `crib with neutral boho mobile hanging above, soft natural light` },
    ],
    'balcony': [
      { title: 'String Lights Transform Any Outdoor Space', searchQuery: 'outdoor string lights balcony warm white', imagePrompt: `small balcony at dusk with warm string lights along railing` },
      { title: 'A Foldable Bistro Set That Fits Any Space', searchQuery: 'folding bistro set balcony small outdoor', imagePrompt: `small balcony with folding wooden bistro set and cushions` },
      { title: 'Potted Herbs That Look Great and Taste Better', searchQuery: 'balcony herb garden planter set', imagePrompt: `balcony railing with small herb planters, basil, mint, rosemary` },
      { title: 'An Outdoor Rug Makes Concrete Feel Like a Room', searchQuery: 'outdoor rug balcony weather resistant', imagePrompt: `balcony floor with patterned weather resistant outdoor rug` },
      { title: 'Add Privacy With Tall Plants', searchQuery: 'balcony privacy plants tall outdoor artificial', imagePrompt: `balcony with tall potted plants along railing providing privacy` },
    ],
    'entryway': [
      { title: 'A Welcome Mat That Sets the Tone', searchQuery: 'decorative entryway doormat boho', imagePrompt: `entryway with patterned boho doormat on wood floor` },
      { title: 'Wall Hooks Instead of a Closet', searchQuery: 'decorative wall hooks entryway wood brass', imagePrompt: `entryway wall with wooden hooks holding coats and bags` },
      { title: 'A Console Table That Holds Everything', searchQuery: 'narrow console table entryway wood', imagePrompt: `narrow entryway with wooden console table and mirror above` },
      { title: 'Add a Tray for Keys and Wallet', searchQuery: 'entryway catchall tray decorative', imagePrompt: `entryway console table with small decorative tray for keys` },
      { title: 'A Mirror That Makes the Space Feel Bigger', searchQuery: 'entryway wall mirror round gold frame', imagePrompt: `entryway with large round gold mirror reflecting light` },
    ],
    'dining room': [
      { title: 'A Table Runner Changes the Entire Vibe', searchQuery: 'linen table runner dining room neutral', imagePrompt: `dining table with cream linen runner and centerpiece` },
      { title: 'Layer Your Table Settings', searchQuery: 'stoneware dinner set neutral dining', imagePrompt: `dining table with layered neutral stoneware plates and cutlery` },
      { title: 'Candle Holders for Instant Ambiance', searchQuery: 'brass candle holders dining table tall', imagePrompt: `dining table with tall brass candle holders, warm candlelight` },
      { title: 'A Statement Light Above the Table', searchQuery: 'dining room pendant light modern', imagePrompt: `dining room with modern pendant light above wooden table` },
      { title: 'Add Cushions to Dining Chairs', searchQuery: 'dining chair cushion covers neutral', imagePrompt: `dining chairs with neutral cushion covers, warm tones` },
    ],
    'small apartment': [
      { title: 'Use Vertical Space You Are Ignoring', searchQuery: 'wall shelves floating small apartment', imagePrompt: `small apartment wall with floating wooden shelves holding plants and books` },
      { title: 'Mirrors Create the Illusion of Space', searchQuery: 'large floor mirror small apartment', imagePrompt: `small apartment corner with large floor mirror making room feel bigger` },
      { title: 'Multi-Purpose Furniture Is Non-Negotiable', searchQuery: 'storage ottoman small apartment multifunctional', imagePrompt: `small living room with storage ottoman doubling as coffee table` },
      { title: 'Hide Your Clutter With Stylish Baskets', searchQuery: 'decorative storage baskets small apartment', imagePrompt: `open shelf with woven storage baskets hiding clutter` },
      { title: 'Use Every Corner With a Reading Nook', searchQuery: 'small reading chair apartment corner', imagePrompt: `apartment corner with small armchair, floor lamp, and throw blanket` },
    ],
    'home office': [
      { title: 'A Desk Pad That Makes Your Setup Look Intentional', searchQuery: 'leather desk pad large workspace', imagePrompt: `desk with large dark leather desk pad and minimal setup` },
      { title: 'Proper Lighting Reduces Eye Strain', searchQuery: 'desk lamp adjustable LED warm', imagePrompt: `home office desk with adjustable LED desk lamp` },
      { title: 'Cable Management Changes Everything', searchQuery: 'cable management tray under desk', imagePrompt: `under desk view with cable management tray hiding wires` },
      { title: 'Add a Plant You Will Not Kill', searchQuery: 'low maintenance desk plant succulent', imagePrompt: `desk with small succulent plant in ceramic pot` },
      { title: 'A Monitor Stand With Storage', searchQuery: 'monitor stand riser with storage wood', imagePrompt: `desk with wooden monitor stand and storage compartments below` },
    ],
  };
  
  // Find matching sections or use default
  const roomSections = allSections[roomType] || allSections['living room'];
  const shuffled = [...roomSections].sort(() => Math.random() - 0.5);
  
  return shuffled.slice(0, count).map(section => ({
    ...section,
    content: generateSectionContent(section.title, roomType, budget),
    products: [],
    mainProduct: null,
    imagePath: null,
  }));
}

function generateSectionContent(sectionTitle, roomType, budget) {
  const templates = [
    `This is the kind of upgrade that seems small until you actually do it. Then you wonder how you lived without it. The key is picking the right piece — something that feels intentional, not random. We found the exact one that nails this look without breaking the bank.`,
    `Most people skip this one because they think it does not matter. It matters. This single change shifts how the entire ${roomType} feels when you walk in. Under $${Math.floor(budget / 3)} and it takes five minutes to set up.`,
    `The difference between a ${roomType} that looks "fine" and one that looks designed often comes down to this one element. It adds warmth, texture, or depth that you cannot get from any other single upgrade. We tested several options and this one wins.`,
    `Do not overthink this. The right choice here creates a ripple effect — it makes everything else in the room look better too. We found options under $${Math.floor(budget / 3)} that look three times their price.`,
    `If your ${roomType} feels flat or unfinished, this is probably why. It is the layer most people forget but designers never skip. One piece, five minutes, and the whole room levels up.`,
    `Cold surfaces, harsh lines, no personality — that is what you get without this. Introducing warmth through texture is the fastest way to make any space feel like home. And it costs way less than you think.`,
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateDescription(roomType, budget) {
  return `Transform your ${roomType} with affordable upgrades under $${budget}. No renovation required — just smart Amazon finds that look expensive.`;
}

function generateTags(category, roomType, sections) {
  const baseTags = {
    'Kitchen': ['kitchen decor', 'kitchen upgrade', 'budget kitchen'],
    'Bedroom': ['bedroom decor', 'bedroom upgrade', 'cozy bedroom'],
    'Living Room': ['living room decor', 'living room ideas', 'apartment decor'],
    'Bathroom': ['bathroom decor', 'bathroom ideas', 'spa bathroom'],
    'Seasonal': ['home decor', 'seasonal decor', 'budget decor'],
    'Tips': ['small spaces', 'apartment living', 'renter friendly'],
  };
  
  const tags = [...(baseTags[category] || ['home decor'])];
  tags.push(`${roomType} ideas`);
  tags.push('amazon finds');
  tags.push('budget decor');
  
  return [...new Set(tags)].slice(0, 6);
}

function getBoardForCategory(category) {
  return BOARD_MAP[category] || 'Cozy Home Vibes';
}

function capitalize(str) {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ============================================
// PART B: PIN SCHEDULING
// ============================================

async function schedulePins(state) {
  const publishedBlogs = state.publishedBlogs;
  if (publishedBlogs.length < 2) {
    console.log('\n📌 Not enough blogs to schedule pins (need at least 2).');
    return;
  }
  
  const todayStr = today();
  
  // Get blogs that have unscheduled sections (exclude today's blog)
  const blogsToPin = publishedBlogs.filter(b => b.date !== todayStr);
  
  if (blogsToPin.length === 0) {
    console.log('\n📌 No previous blogs available to pin today.');
    return;
  }
  
  console.log(`\n📌 Scheduling pins from ${blogsToPin.length} previous blogs...`);
  
  // Schedule 3-5 pins per day from different blogs
  const pinsPerDay = Math.min(5, blogsToPin.length);
  const shuffledBlogs = [...blogsToPin].sort(() => Math.random() - 0.5);
  
  const scheduleTimes = [
    '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '19:00', '20:00', '20:30', '21:00',
  ];
  
  let scheduledCount = 0;
  
  for (let i = 0; i < pinsPerDay; i++) {
    const blog = shuffledBlogs[i];
    if (!blog.sections || blog.sections.length === 0) continue;
    
    // Pick a random section that has not been scheduled yet
    const unscheduledSections = blog.sections.filter(s => 
      !state.scheduledPins.some(p => p.slug === blog.slug && p.section === s.title)
    );
    
    if (unscheduledSections.length === 0) continue;
    
    const section = unscheduledSections[Math.floor(Math.random() * unscheduledSections.length)];
    if (!section.image) continue;
    
    // Schedule for tomorrow onwards (spread across days)
    const scheduleDate = addDays(todayStr, 1 + Math.floor(i / 3));
    const time = scheduleTimes[Math.min(i, scheduleTimes.length - 1)];
    
    const pinTitle = generatePinTitle(section.title, blog.title);
    const pinDesc = generatePinDescription(section.title, blog.slug);
    const board = getBoardForCategory(blog.category);
    const imagePath = resolve(IMG_DIR, section.image);
    const link = `https://cozyhouse-decor.pages.dev/blog/${blog.slug}/`;
    
    if (!fs.existsSync(imagePath)) {
      console.warn(`   ⚠ Image not found: ${section.image}`);
      continue;
    }
    
    const pinData = {
      slug: blog.slug,
      section: section.title,
      image: section.image,
      title: pinTitle,
      description: pinDesc,
      board,
      link,
      scheduleDate,
      time,
      status: 'pending',
    };
    
    // In dry-run mode, just save to state
    if (process.argv.includes('--dry-run')) {
      console.log(`   [DRY-RUN] ${scheduleDate} ${time} — "${pinTitle.substring(0, 50)}..."`);
    } else {
      console.log(`   ${scheduleDate} ${time} — "${pinTitle.substring(0, 50)}..."`);
      
      // TODO: Call create-pin.js
      // For now, save to schedule queue for manual review
      state.scheduleQueue.push(pinData);
    }
    
    state.scheduledPins.push({
      slug: blog.slug,
      section: section.title,
      scheduledDate: scheduleDate,
      status: 'queued',
    });
    
    scheduledCount++;
  }
  
  console.log(`\n   ✓ ${scheduledCount} pins scheduled`);
}

function generatePinTitle(sectionTitle, blogTitle) {
  // Front-load the hook in first 40 chars
  const hooks = [
    `${sectionTitle} — Here's the Secret`,
    `The ${sectionTitle.split(' ').slice(0, 3).join(' ')} Hack Everyone's Using`,
    `Why ${sectionTitle} Changes Everything`,
    `${sectionTitle} (It's Easier Than You Think)`,
  ];
  const hook = hooks[Math.floor(Math.random() * hooks.length)];
  
  // Keep under 100 chars
  return hook.length <= 100 ? hook : hook.substring(0, 97) + '...';
}

function generatePinDescription(sectionTitle, slug) {
  const templates = [
    `Stop scrolling and start doing. This ${sectionTitle.toLowerCase()} is the upgrade your space needs right now. Under $${Math.floor(Math.random() * 30) + 15} and it takes minutes. We found the exact product and linked everything so you don't have to search.\n\nTap to read the full guide and shop the look.`,
    `Your home deserves better than "fine." This ${sectionTitle.toLowerCase()} takes a ${sectionTitle.split(' ').slice(0, 3).join(' ').toLowerCase()} from basic to designed in one weekend. Real products, real prices, no fluff.\n\nCheck out the full list and start upgrading tonight.`,
    `Everyone's doing this ${sectionTitle.toLowerCase()} wrong. The trick isn't spending more — it's choosing the right piece. We tested dozens and found the ones that actually look expensive.\n\nSave this and thank us later.`,
  ];
  
  const desc = templates[Math.floor(Math.random() * templates.length)];
  return desc.length <= 500 ? desc : desc.substring(0, 497) + '...';
}

// ============================================
// BUILD & DEPLOY
// ============================================

function buildAndDeploy() {
  console.log('\n🏗️ Building site...');
  try {
    execSync('npm run build', { cwd: ROOT, stdio: 'pipe' });
    console.log('   ✓ Build successful');
  } catch (e) {
    console.error('   ✗ Build failed:', e.message);
    return false;
  }
  
  console.log('🚀 Deploying to Cloudflare Pages...');
  try {
    execSync('npx wrangler pages deploy dist --commit-dirty=true --branch=main', { cwd: ROOT, stdio: 'pipe' });
    console.log('   ✓ Deploy successful');
  } catch (e) {
    console.error('   ✗ Deploy failed:', e.message);
    return false;
  }
  
  return true;
}

// ============================================
// MAIN
// ============================================

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const skipBlog = process.argv.includes('--skip-blog');
  const skipPins = process.argv.includes('--skip-pins');
  
  console.log('═'.repeat(50));
  console.log(`🏠 CozyHouse Daily Pipeline — ${today()}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('═'.repeat(50));
  
  const state = loadState();
  
  // Part A: Generate new blog
  if (!skipBlog) {
    const blog = await generateBlog(state);
    if (blog) {
      const deployed = buildAndDeploy();
      if (deployed) {
        console.log(`\n✅ Blog published: https://cozyhouse-decor.pages.dev/blog/${blog.slug}/`);
      }
    }
  } else {
    console.log('\n📝 Blog generation skipped (--skip-blog)');
  }
  
  // Part B: Schedule pins
  if (!skipPins) {
    await schedulePins(state);
  } else {
    console.log('\n📌 Pin scheduling skipped (--skip-pins)');
  }
  
  // Save state
  state.lastRun = today();
  saveState(state);
  
  console.log('\n' + '═'.repeat(50));
  console.log(`📊 Summary:`);
  console.log(`   Total blogs: ${state.publishedBlogs.length}`);
  console.log(`   Total pins scheduled: ${state.scheduledPins.length}`);
  console.log(`   Next topic: ${TOPICS[state.topicIndex % TOPICS.length].category} (${TOPICS[state.topicIndex % TOPICS.length].rooms[0]})`);
  console.log('═'.repeat(50));
}

main().catch(e => {
  console.error('Pipeline failed:', e);
  process.exit(1);
});
