import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    author: z.string().default('CozyHouse Team'),
    featured: z.boolean().default(false),
    affiliateLinks: z.array(z.object({
      name: z.string(),
      url: z.string(),
      description: z.string().optional(),
      category: z.string().optional(),
      commission: z.string().optional(),
    })).default([]),
    pinterestStrategy: z.object({
      board: z.string().optional(),
      scheduleDay: z.string().optional(),
      hookText: z.string().optional(),
      priority: z.number().default(1),
    }).optional(),
  }),
});

export const collections = { blog };
