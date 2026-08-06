import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  vite: {
    optimizeDeps: {
      include: ['common-ancestor-path']
    }
  },
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: true,
    }),
  ],
});