import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs: works at ncx3.github.io/<repo>/ and at the domain root.
  base: './',
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
