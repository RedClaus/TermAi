import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  // Main process configuration
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'main/index.ts')
        },
        output: {
          dir: resolve(__dirname, 'dist/main')
        },
        external: ['electron', 'node-pty']
      },
      target: 'node18'
    },
    plugins: [
      externalizeDepsPlugin({
        // Don't externalize workspace packages - they should be bundled
        exclude: ['@termai/pty-service', '@termai/ui-core', '@termai/shared-types']
      })
    ],
    resolve: {
      alias: {
        '@termai/ui-core': resolve(__dirname, '../../packages/ui-core/src'),
        '@termai/shared-types': resolve(__dirname, '../../packages/shared-types/src'),
        '@termai/pty-service': resolve(__dirname, '../../packages/pty-service/src')
      }
    }
  },

  // Preload script configuration
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'preload/index.ts')
        },
        output: {
          dir: resolve(__dirname, 'dist/preload')
        }
      }
    },
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    resolve: {
      alias: {
        '@termai/shared-types': resolve(__dirname, '../../packages/shared-types/src')
      }
    }
  },

  // Renderer process configuration (React app)
  renderer: {
    root: resolve(__dirname, 'renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'renderer/index.html')
        },
        output: {
          dir: resolve(__dirname, 'dist/renderer')
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@termai/ui-core/styles': resolve(__dirname, '../../packages/ui-core/src/styles'),
        '@termai/ui-core': resolve(__dirname, '../../packages/ui-core/src'),
        '@termai/shared-types': resolve(__dirname, '../../packages/shared-types/src'),
        '@': resolve(__dirname, 'renderer/src')
      }
    },
    server: {
      port: 5174
    }
  }
});
