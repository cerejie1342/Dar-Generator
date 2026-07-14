import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
<<<<<<< HEAD
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'DAR Generator',
        short_name: 'DAR',
        description: 'Daily Accomplishment Report Generator for Philippine Government Agencies',
        theme_color: '#17375E',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%2317375E" width="192" height="192"/><text x="50%" y="50%" font-size="120" font-weight="bold" fill="%23ffffff" text-anchor="middle" dominant-baseline="central">DAR</text></svg>',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%2317375E" width="192" height="192"/><text x="50%" y="50%" font-size="120" font-weight="bold" fill="%23ffffff" text-anchor="middle" dominant-baseline="central">DAR</text></svg>',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/accounts\.google\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-accounts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'gemini-api-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60,
              },
            },
          },
          {
            urlPattern: /^https:\/\/api\.github\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'github-api-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
=======
  plugins: [react()],
>>>>>>> parent of 8377b16 (hidden the google OATH and gemini)
  server: { port: 5173 },
});
