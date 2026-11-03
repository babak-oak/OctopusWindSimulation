import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from /OctopusWindSimulation/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/OctopusWindSimulation/',
  build: { outDir: 'dist', sourcemap: true },
});
