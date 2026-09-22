/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    // Same-origin API in development: the session cookie (SameSite=Strict) stays first-party.
    // changeOrigin stays false so that the API sees the interface's Origin and Host (ENF-SEC-11).
    proxy: { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false } },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], passWithNoTests: true },
});
