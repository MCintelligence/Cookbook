import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Tauri serves the same build; TAURI_ENV_PLATFORM is set when it runs Vite.
const inTauri = Boolean(process.env.TAURI_ENV_PLATFORM);

export default defineConfig({
  plugins: [
    react(),
    // The service worker is only for the browser build; the native apps update through Tauri.
    !inTauri &&
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['icon.svg'],
        // Precache the fonts and the search engine too, so everything works with no connection.
        workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'] },
        manifest: {
          name: 'Cookbook',
          short_name: 'Cookbook',
          description: 'A cozy, offline writing app. No account needed.',
          theme_color: '#F6EEDF',
          background_color: '#F6EEDF',
          display: 'standalone',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          ],
        },
      }),
  ],
  // SQLite finds its .wasm file next to its own module, which pre-bundling would break.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'es2022' },
  test: { environment: 'node' },
});
