import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2020', sourcemap: false },
  // Dev: talk to the API on :3000 so cookies stay same-origin.
  server: { proxy: { '/api': 'http://localhost:3000', '/auth': 'http://localhost:3000' } },
});
