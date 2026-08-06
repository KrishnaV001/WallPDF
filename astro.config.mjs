import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: true,
    }),
  ],
  vite: {
    ssr: {
      // Prevents Vite from bundling Shiki natively and dropping its server paths
      external: ['shiki']
    }
  }
});
