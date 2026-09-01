import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import runtimeContract from '../../scripts/e2e-runtime-contract.json' with { type: 'json' };

export default defineConfig(({ mode }) => ({
  base: process.env['VITE_BASE_PATH'] ?? '/',
  plugins: [react()],
  server:
    mode === 'e2e'
      ? {
          hmr: runtimeContract.server.hmrUpdates,
          forwardConsole: runtimeContract.server.forwardConsole,
        }
      : undefined,
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 500 },
}));
