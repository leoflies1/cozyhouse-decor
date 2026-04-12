import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://cozyhouse.vercel.app',
  integrations: [
    tailwind(),
  ],
});
