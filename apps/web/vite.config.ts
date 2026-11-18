import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      manifest: {
        name: 'NovaRace Flow Scanner',
        short_name: 'NovaRace Flow',
        description: 'NovaRace event check-in and gate operations',
        start_url: '/scanner',
        scope: '/',
        display: 'standalone',
        theme_color: '#282462',
        background_color: '#FCFCFC',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: { chunkSizeWarningLimit: 800 },
});
