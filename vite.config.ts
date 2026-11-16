import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const serverPort = process.env.PORT ?? '8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/ws': { target: `ws://localhost:${serverPort}`, ws: true } },
  },
  test: {
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
});
