import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173 },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing libraries so the app bundle stays
        // small and browser caching actually helps between deploys.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          maps: ['react-leaflet', 'leaflet'],
          pdf: ['jspdf', 'html2canvas'],
          charts: ['recharts'],
        },
      },
    },
  },
});
