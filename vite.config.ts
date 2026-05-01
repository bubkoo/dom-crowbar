import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import { existsSync, renameSync, rmSync } from 'fs';
import manifest from './manifest.json';

/**
 * Custom plugin to flatten the dist output
 * Moves offscreen.html to dist root
 */
function flattenDist() {
  return {
    name: 'flatten-dist',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      if (!existsSync(distDir)) return;

      // Move offscreen.html to root
      const offscreenSrc = resolve(distDir, 'src/offscreen/index.html');
      const offscreenDest = resolve(distDir, 'offscreen.html');
      if (existsSync(offscreenSrc)) {
        renameSync(offscreenSrc, offscreenDest);
      }

      // Remove src directory if empty
      const srcDir = resolve(distDir, 'src');
      if (existsSync(srcDir)) {
        rmSync(srcDir, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  publicDir: 'public',
  plugins: [crx({ manifest }), flattenDist()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@background': resolve(__dirname, 'src/background'),
      '@content': resolve(__dirname, 'src/content'),
      '@popup': resolve(__dirname, 'src/popup'),
    },
  },
  build: {
    assetsDir: '',
    rollupOptions: {
      input: {
        offscreen: resolve(__dirname, 'src/offscreen/index.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});
