import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://cozyhouse-decor.com',
  integrations: [
    tailwind(),
  ],
});
