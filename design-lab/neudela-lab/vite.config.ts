import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { mockApi } from './mock/mockApi.ts';
import { MOCK } from './mock/seed.ts';

// A full app that is also a Module Federation remote: `neudela_lab` serves remoteEntry.js (and
// mf-manifest.json) exposing every page of src/exposes; react, react-dom and neudela are shared
// singletons, so a host that already has them provides its copy. The async bootstrap in
// src/index.tsx is where the federation runtime negotiates those shares before the app starts.
//
// `npm run dev`      → /tmf-api is proxied to the real TMF736 backend (API_PROXY_TARGET).
// `npm run dev:mock` → /tmf-api and /mock-policy-api are served in-memory by mock/mockApi.ts (data: mock/seed.ts).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useMock = mode === 'mock';

  return {
    plugins: [
      react(),
      federation({
        name: 'neudela_lab',
        filename: 'remoteEntry.js',
        manifest: true,
        exposes: {
          './PartyRevSharingAlgorithm': './src/exposes/PartyRevSharingAlgorithm.tsx',
          './Hub': './src/exposes/Hub.tsx',
        },
        shared: {
          react: { singleton: true, requiredVersion: '19.2.5' },
          'react-dom': { singleton: true, requiredVersion: '19.2.5' },
          neudela: { singleton: true, requiredVersion: '0.2.0' },
        },
        dts: false,
      }),
      ...(useMock ? [mockApi(MOCK)] : []),
    ],
    // the federation runtime uses top-level await
    build: { target: 'esnext' },
    server: {
      port: 4010,
      strictPort: true,
      // a host on another origin loads remoteEntry.js and the exposed chunks
      cors: true,
      proxy: useMock
        ? undefined
        : {
            '/tmf-api': {
              target: env.API_PROXY_TARGET || 'http://localhost:3736',
              changeOrigin: true,
            },
          },
    },
    preview: {
      port: 4010,
      strictPort: true,
      cors: true,
    },
  };
});
