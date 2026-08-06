import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindv4 from '@tailwindcss/vite';

export default defineConfig({
  integrations: [
    react()
  ],
  vite: {
    plugins: [
      tailwindv4() // Natively highlights and injects styles inside Vite v8
    ]
  }
});
