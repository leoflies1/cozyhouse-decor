/**
 * Pinterest Content Orchestrator for CozyHouse
 * 
 * Questo script gestisce la programmazione dei pin su Pinterest,
 * determinando quali articoli promuovere, su quali board, e quando.
 * 
 * USO:
 *   node scripts/pinterest-orchestrator.js [--plan] [--export] [--board <board>]
 * 
 *   --plan    : Mostra il piano settimanale senza eseguire
 *   --export  : Esporta il piano come JSON
 *   --board   : Filtra per board specifica
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = path.join(__dirname, '..', 'src', 'content', 'blog');

// Board mapping per categoria del blog
const CATEGORY_BOARD_MAP = {
  'Living Room': 'Living Room',
  'Bedroom': 'Bedroom',
  'Bathroom': 'Bathroom',
  'Seasonal': 'Spring Decor',
  'Tips & DIY': 'Cozy Home',
  'Easter': 'Easter Decor',
  'Table Setting': 'Table Setting',
};

// Giorni della settimana ottimali per Pinterest (basato su ricerche 2026)
const OPTIMAL_DAYS = {
  0: { name: 'Sunday', priority: 3, bestHours: [8, 20, 21] },    // Evening pins
  1: { name: 'Monday', priority: 5, bestHours: [8, 14, 20] },     // Lunch + Evening
  2: { name: 'Tuesday', priority: 5, bestHours: [7, 15, 20] },    // Peak day
  3: { name: 'Wednesday', priority: 4, bestHours: [8, 14, 21] },  // Mid-week push
  4: { name: 'Thursday', priority: 4, bestHours: [9, 15, 20] },   // Mid-week push
  5: { name: 'Friday', priority: 3, bestHours: [9, 15, 21] },     // Weekend prep
  6: { name: 'Saturday', priority: 5, bestHours: [8, 10, 20] },   // Weekend browsing
};

// Limite pin per giorno (safe per warm-up)
const MAX_PINS_PER_DAY = 5;

// Parse frontmatter from markdown
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const frontmatter = {};
  match[1].split('\n').forEach(line => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      let value = rest.join(':').trim();
      // Handle arrays
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(v => v.trim().replace(/['"]/g, ''));
      }
      // Handle booleans
      if (value === 'true') value = true;
      if (value === 'false') value = false;
      // Handle dates
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) value = new Date(value);
      frontmatter[key.trim()] = value;
    }
  });
  return frontmatter;
}

// Count affiliate links in content
function countAffiliateLinks(content) {
  const affiliatePattern = /rel="nofollow sponsored"/g;
  return (content.match(affiliatePattern) || []).length;
}

// Extract first image path from content
function extractHeroImage(frontmatter) {
  return frontmatter.heroImage || null;
}

// Load all blog posts
function loadBlogPosts() {
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));
  const posts = [];
  
  for (const file of files) {
    const content = fs.readFileSync(path.join(BLOG_DIR, file), 'utf-8');
    const frontmatter = parseFrontmatter(content);
    if (frontmatter) {
      posts.push({
        file,
        slug: file.replace('.md', ''),
        ...frontmatter,
        affiliateCount: countAffiliateLinks(content),
        hasContent: true,
      });
    }
  }
  
  return posts.sort((a, b) => {
    // Featured first, then by date (newest first)
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return new Date(b.pubDate) - new Date(a.pubDate);
  });
}

// Calculate pin score for a post (higher = should pin sooner)
function calculatePinScore(post, dayOfWeek, daysSincePublished) {
  let score = 0;
  
  // Featured posts get bonus
  if (post.featured) score += 30;
  
  // More affiliate links = higher priority
  score += post.affiliateCount * 5;
  
  // Newer posts get bonus (first 7 days)
  if (daysSincePublished <= 7) score += 20;
  else if (daysSincePublished <= 30) score += 10;
  
  // Pinterest strategy override
  if (post.pinterestStrategy?.priority) {
    score += post.pinterestStrategy.priority * 10;
  }
  
  // Day-category affinity
  const board = CATEGORY_BOARD_MAP[post.category] || 'Cozy Home';
  const dayInfo = OPTIMAL_DAYS[dayOfWeek];
  score += dayInfo.priority * 3;
  
  // Tag bonus (seasonal, trending tags get more)
  const trendingTags = ['spring', 'easter', 'cozy', 'budget', 'diy'];
  const tagBonus = post.tags?.filter(t => trendingTags.includes(t.toLowerCase())).length * 3 || 0;
  score += tagBonus;
  
  return score;
}

// Generate weekly pin plan
function generateWeeklyPlan(posts) {
  const plan = [];
  const now = new Date();
  
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    const dayOfWeek = date.getDay();
    const dayInfo = OPTIMAL_DAYS[dayOfWeek];
    
    // Score each post for this day
    const scored = posts.map(post => {
      const daysSincePublished = Math.floor(
        (now - new Date(post.pubDate)) / (1000 * 60 * 60 * 24)
      );
      return {
        post,
        score: calculatePinScore(post, dayOfWeek, daysSincePublished),
      };
    });
    
    // Sort by score, take top N
    scored.sort((a, b) => b.score - a.score);
    const selected = scored.slice(0, MAX_PINS_PER_DAY);
    
    // Assign to time slots
    const slots = dayInfo.bestHours.map((hour, i) => ({
      hour,
      post: selected[i]?.post || null,
      score: selected[i]?.score || 0,
    }));
    
    plan.push({
      date: date.toISOString().split('T')[0],
      dayName: dayInfo.name,
      dayOfWeek,
      dayPriority: dayInfo.priority,
      pins: slots.filter(s => s.post).map(s => ({
        scheduledTime: `${String(s.hour).padStart(2, '0')}:00 Europe/Rome`,
        title: s.post.title,
        slug: s.post.slug,
        board: CATEGORY_BOARD_MAP[s.post.category] || post => post?.category || 'Cozy Home',
        hookText: s.post.pinterestStrategy?.hookText || generateHookText(s.post),
        affiliateLinks: s.post.affiliateCount,
        score: s.score,
      })),
    });
  }
  
  return plan;
}

// Generate hook text for a pin
function generateHookText(post) {
  const templates = [
    `Transform your ${post.category?.toLowerCase() || 'home'} with this simple trick 🏠`,
    `Stop scrolling — you NEED this ${post.category?.toLowerCase() || 'decor'} idea ✨`,
    `POV: You finally made your ${post.category?.toLowerCase() || 'space'} aesthetic AF`,
    `The 1 thing making your ${post.category?.toLowerCase() || 'room'} look cheap (and how to fix it)`,
    `${post.category || 'Home'} inspo that actually works IRL 🤍`,
    `Best ${post.category?.toLowerCase() || 'decor'} hack I've seen this week`,
  ];
  
  // Pick based on tags for variety
  const tagHash = post.tags?.join('') || '';
  const index = (tagHash.length || 0) % templates.length;
  return templates[index];
}

// Print plan
function printPlan(plan) {
  console.log('\n📌 COZYHOUSE PINTEREST WEEKLY PLAN');
  console.log('═'.repeat(60));
  
  for (const day of plan) {
    console.log(`\n📅 ${day.dayName} ${day.date} (priority: ${'⭐'.repeat(day.dayPriority)})`);
    if (day.pins.length === 0) {
      console.log('   No pins scheduled');
      continue;
    }
    for (const pin of day.pins) {
      console.log(`   ${pin.scheduledTime} → "${pin.title}"`);
      console.log(`     Board: ${pin.board} | Hook: "${pin.hookText}"`);
      console.log(`     Affiliate links: ${pin.affiliateLinks} | Score: ${pin.score}`);
    }
  }
  
  const totalPins = plan.reduce((sum, d) => sum + d.pins.length, 0);
  console.log(`\n📊 TOTAL: ${totalPins} pins this week (avg ${Math.round(totalPins / 7)}/day)`);
}

// Export plan as JSON
function exportPlan(plan) {
  const outputPath = path.join(__dirname, '..', 'pinterest-weekly-plan.json');
  fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2));
  console.log(`✅ Plan exported to ${outputPath}`);
}

// Main
function main() {
  const args = process.argv.slice(2);
  const showPlan = args.includes('--plan') || args.length === 0;
  const exportJson = args.includes('--export');
  const boardFilter = args.includes('--board') 
    ? args[args.indexOf('--board') + 1] 
    : null;
  
  const posts = loadBlogPosts();
  console.log(`📂 Loaded ${posts.length} blog posts`);
  
  // Show post stats
  const withAffiliates = posts.filter(p => p.affiliateCount > 0).length;
  const featured = posts.filter(p => p.featured).length;
  console.log(`   ${featured} featured | ${withAffiliates} with affiliate links`);
  console.log(`   Categories: ${[...new Set(posts.map(p => p.category))].join(', ')}`);
  
  let plan = generateWeeklyPlan(posts);
  
  // Filter by board if requested
  if (boardFilter) {
    plan = plan.map(day => ({
      ...day,
      pins: day.pins.filter(p => p.board?.toLowerCase().includes(boardFilter.toLowerCase())),
    }));
  }
  
  if (showPlan) printPlan(plan);
  if (exportJson) exportPlan(plan);
}

main();
