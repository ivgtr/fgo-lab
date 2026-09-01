import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base: process.env['VITE_BASE_PATH'] ?? '/',
  plugins: [react()],
  server: mode === 'e2e' ? { hmr: false } : undefined,
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 500 },
}));
