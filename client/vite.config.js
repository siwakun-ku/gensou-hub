import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Where the dev server forwards /api. Stays localhost because the proxy runs on
// this machine, next to the API, no matter which device is browsing.
const API_TARGET = process.env.VITE_PROXY_TARGET || 'http://localhost:5000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Listen on every interface so phones and other machines on the LAN can
    // open http://<this-machine-ip>:5173. Vite prints the addresses on start.
    host: true,
    port: 5173,
    // Fail loudly instead of quietly moving to 5174, which would break the
    // address you handed out to everyone else.
    strictPort: true,
    proxy: {
      // Lets the app call "/api/..." with no CORS and no hardcoded host, from
      // whichever device is browsing.
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  // `npm run preview` serves the production build the same way.
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});
