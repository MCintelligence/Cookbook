import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Tauri serves the same build; TAURI_ENV_PLATFORM is set when it runs Vite.
const inTauri = Boolean(process.env.TAURI_ENV_PLATFORM);

export default defineConfig({
  plugins: [
    react(),
    // The desktop app updates through Tauri, so its build gets an empty stand-in for the service worker.
    inTauri && {
      name: 'no-service-worker',
      resolveId: (id: string) => (id === 'virtual:pwa-register' ? '\0pwa-register-stub' : null),
      load: (id: string) => (id === '\0pwa-register-stub' ? 'export function registerSW() { return () => Promise.resolve(); }' : null),
    },
    // The service worker is only for the browser build; the native apps update through Tauri.
    !inTauri &&
      VitePWA({
        // A new version waits until the writer chooses "Update and restart" (see UpdateBanner).
        registerType: 'prompt',
        includeAssets: ['icon.svg'],
        // Precache the fonts and the search engine too, so everything works with no connection.
        // The grammar engine's WebAssembly is about 20 MB, above Workbox's usual limit.
        workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,aff,dic}', 'dictionaries/word-pairs.txt'], maximumFileSizeToCacheInBytes: 32 * 1024 * 1024 },
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
  // Harper's the same, for the grammar engine.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm', 'harper.js'] },
  // The proofreader's worker loads the grammar engine only when it is first needed.
  worker: { format: 'es' },
  // The version shown in Settings › Updates and privacy.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'es2022',
    // Libraries that change rarely get chunks of their own, so an update only downloads the app's own code.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'editor', test: /node_modules[\\/](@tiptap|prosemirror-[a-z]+|orderedmap|rope-sequence|w3c-keyname|linkifyjs|fast-equals)[\\/]/ },
            { name: 'formats', test: /node_modules[\\/](yaml|fflate)[\\/]/ },
          ],
        },
      },
    },
  },
  test: { environment: 'node' },
});
