import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false, // keep popup, options, background
    lib: {
      entry: resolve(__dirname, 'src/content/content-script.tsx'),
      name: 'ContentScript',
      formats: ['iife'],
      fileName: () => 'content.js'
    }
  }
});
