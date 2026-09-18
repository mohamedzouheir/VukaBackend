import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies the API to Spring Boot on 8080 so the browser sees one origin
// and no CORS configuration is needed on the backend. VUKA_API overrides the target, for a
// backend on another port: VUKA_API=http://localhost:8081 npm run dev. The build lands in
// ../src/main/resources/static so `mvn package` ships one jar with the dashboard inside it.
const api = process.env.VUKA_API ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/public': {
        target: api,
        changeOrigin: true,
        // In development the full citizen view is Vite's page rather than the jar's, so a page
        // request is answered with citizen.html here unless the light view was asked for. Data
        // under /public/api and the light view itself still come from Spring.
        bypass: (req) => {
          const url = req.url ?? '';
          if (url.startsWith('/public/api/')) return undefined;
          const wantsPage = (req.headers.accept ?? '').includes('text/html');
          return wantsPage && !/[?&]view=lite\b/.test(url) ? '/citizen.html' : undefined;
        },
      },
      '/m': { target: api, changeOrigin: true },
    },
  },
  build: {
    outDir: '../src/main/resources/static',
    emptyOutDir: true,
    // The page weight budget in section 11 of the frontend design is 250KB gzipped for the
    // dashboard. Warn well before that so a careless import is caught in the build log.
    chunkSizeWarningLimit: 400,
    // Two pages, two entry points. The citizen view is its own entry so that a member of the
    // public never downloads the dashboard, its router or the Firebase SDK: what they load is
    // React and one small screen. See src/citizen/ and web/CitizenSurface.java.
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'index.html'),
        citizen: resolve(__dirname, 'citizen.html'),
      },
    },
  },
});
