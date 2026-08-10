import { defineConfig } from 'vite';

export default defineConfig({
  // WSL2: bind all interfaces so the Windows-side browser can reach it.
  server: {
    host: true,
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
