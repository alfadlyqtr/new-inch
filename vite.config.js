import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,gif}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 1 year
              },
              // Note: cacheKeyWillBeUsed is not a valid Workbox runtimeCaching option and breaks Vercel build (AJV schema)
            }
          }
        ]
      },
      includeAssets: ['logo.jpg'],
      manifest: {
        name: 'INCH - Tailoring SaaS',
        short_name: 'INCH',
        description: 'Professional tailoring SaaS platform',
        theme_color: '#7c3aed',
        icons: [
          {
            src: '/logo.jpg',
            sizes: '192x192',
            type: 'image/jpeg'
          },
          {
            src: '/logo.jpg',
            sizes: '512x512',
            type: 'image/jpeg'
          }
        ]
      }
    })
  ],
  server: {
    host: 'localhost',
    port: 5174,
    strictPort: true,
  },
})
