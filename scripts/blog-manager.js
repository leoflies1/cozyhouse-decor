/**
 * CozyHouse Blog Manager
 * 
 * Gestisce articoli del blog con metadata per affiliate link.
 * 
 * USO:
 *   node scripts/blog-manager.js list [--category <cat>] [--has-affiliates]
 *   node scripts/blog-manager.js stats
 *   node scripts/blog-manager.js affiliate-report
 *   node scripts/blog-manager.js new --title "..." --category "..." --tags "tag1,tag2"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = path.join(__dirname, '..', 'src', 'content', 'blog');

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const frontmatter = {};
  match[1].split('\n').forEach(line => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      let value = rest.join(':').trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(v => v.trim().replace(/['"]/g, ''));
      }
      if (value === 'true') value = true;
      if (value === 'false') value = false;
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) value = new Date(value);
      frontmatter[key.trim()] = value;
    }
  });
  return frontmatter;
}

function extractAffiliateLinks(content) {
  const regex = /<a\s+href="([^"]+)"[^>]*rel="nofollow sponsored"[^>]*>([^<]+)<\/a>/g;
  const links = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push({ url: match[1], text: match[2] });
  }
  return links;
}

function loadPosts() {
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));
  return files.map(file => {
    const content = fs.readFileSync(path.join(BLOG_DIR, file), 'utf-8');
    const frontmatter = parseFrontmatter(content);
    return {
      file,
      slug: file.replace('.md', ''),
      frontmatter: frontmatter || {},
      affiliateLinks: extractAffiliateLinks(content),
    };
  }).filter(p => p.frontmatter.title);
}

function listPosts(args) {
  const category = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;
  const hasAffiliates = args.includes('--has-affiliates');
  
  let posts = loadPosts();
  
  if (category) posts = posts.filter(p => p.frontmatter.category === category);
  if (hasAffiliates) posts = posts.filter(p => p.affiliateLinks.length > 0);
  
  console.log('\n📝 CozyHouse Blog Articles');
  console.log('═'.repeat(60));
  
  for (const post of posts) {
    const f = post.frontmatter;
    const affCount = post.affiliateLinks.length;
    const featured = f.featured ? '⭐' : '  ';
    const affBadge = affCount > 0 ? `[${affCount} aff]` : '';
    console.log(`${featured} ${f.category || 'Uncategorized'} | ${post.slug}`);
    console.log(`   "${f.title}" ${affBadge}`);
    console.log(`   Tags: ${(f.tags || []).join(', ') || 'none'}`);
    console.log(`   Published: ${f.pubDate}${f.updatedDate ? ` | Updated: ${f.updatedDate}` : ''}`);
    console.log('');
  }
  
  console.log(`📊 Total: ${posts.length} articles`);
}

function showStats() {
  const posts = loadPosts();
  
  const categories = {};
  const tagCounts = {};
  let totalAffiliates = 0;
  
  for (const post of posts) {
    const cat = post.frontmatter.category || 'Uncategorized';
    categories[cat] = (categories[cat] || 0) + 1;
    totalAffiliates += post.affiliateLinks.length;
    
    for (const tag of (post.frontmatter.tags || [])) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  
  console.log('\n📊 CozyHouse Blog Stats');
  console.log('═'.repeat(40));
  console.log(`Total articles: ${posts.length}`);
  console.log(`Total affiliate links: ${totalAffiliates}`);
  console.log(`Featured articles: ${posts.filter(p => p.frontmatter.featured).length}`);
  
  console.log('\n📁 Categories:');
  for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat}: ${count}`);
  }
  
  console.log('\n🏷️ Top Tags:');
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [tag, count] of topTags) {
    console.log(`   ${tag}: ${count}`);
  }
}

function affiliateReport() {
  const posts = loadPosts().filter(p => p.affiliateLinks.length > 0);
  
  console.log('\n💰 Affiliate Link Report');
  console.log('═'.repeat(50));
  
  const domainCounts = {};
  
  for (const post of posts) {
    console.log(`\n📄 "${post.frontmatter.title}" (${post.affiliateLinks.length} links)`);
    for (const link of post.affiliateLinks) {
      try {
        const domain = new URL(link.url).hostname;
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        console.log(`   ${domain} → "${link.text}"`);
      } catch {
        console.log(`   ${link.url} → "${link.text}"`);
      }
    }
  }
  
  console.log('\n📈 Link Distribution by Domain:');
  for (const [domain, count] of Object.entries(domainCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${domain}: ${count} links`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'list';
  
  switch (command) {
    case 'list': listPosts(args); break;
    case 'stats': showStats(); break;
    case 'affiliate-report': affiliateReport(); break;
    default:
      console.log('Usage: blog-manager.js [list|stats|affiliate-report]');
  }
}

main();
