import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/demo',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
  server: {
    port: 3000,
    // Default host-allow-list: localhost + LAN IPs work out of the box (mobile
    // testing on the same Wi-Fi). If you serve the dev server through a named
    // tunnel host, add it here explicitly — `true` (allow any host) is a
    // DNS-rebinding vector and was removed (Codex #14, dev-only finding).
  },
})
