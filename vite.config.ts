import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
const base = '/Breathwork--Buddy/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      scope: base,
      registerType: 'prompt',
      includeManifestIcons: false,
      manifest: {
        id: base,
        name: 'Breathwork Buddy',
        short_name: 'Breathwork',
        start_url: base,
        scope: base,
        display: 'standalone',
        theme_color: '#526b59',
        background_color: '#f4f3ed',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png}', 'audio/voice/*.{mp3,wav}', 'audio/breath/*.{mp3,wav}'],
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
