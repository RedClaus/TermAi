import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      // For remote access - use the server's IP for HMR websocket
      host: '192.168.1.186',
      // Disable full page reload on HMR failures
      overlay: true,
    },
    watch: {
      // Use polling for file watching (more reliable over network)
      usePolling: true,
      interval: 1000,
      // Ignore server data files - they change during runtime and shouldn't trigger reloads
      ignored: ['**/server/**', '**/node_modules/**', '**/.git/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3004',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  optimizeDeps: {
    // Exclude ghostty-web from pre-bundling (has WASM)
    exclude: ['ghostty-web'],
  },
  build: {
    // Ensure WASM files are properly handled
    rollupOptions: {
      output: {
        // Ensure WASM files keep their extension
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.wasm')) {
            return 'assets/[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
})
