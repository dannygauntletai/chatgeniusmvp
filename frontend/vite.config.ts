import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor': [
              'react',
              'react-dom',
              'react-router-dom',
              '@clerk/clerk-react',
              'socket.io-client'
            ],
            'ui': [
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-popover',
              '@radix-ui/react-toast',
              'cmdk'
            ],
            'features': [
              './src/features/messages',
              './src/features/channels',
              './src/features/files',
              './src/features/search'
            ]
          }
        }
      },
      chunkSizeWarningLimit: 1000
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: parseInt(env.PORT || '3000'),
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
        },
        '/socket.io': {
          target: env.VITE_WS_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
    define: {
      // Make environment variables available globally
      'window.__CLERK_KEY__': JSON.stringify(env.VITE_CLERK_PUBLISHABLE_KEY),
      'window.__API_URL__': JSON.stringify(env.VITE_API_URL),
      'window.__WS_URL__': JSON.stringify(env.VITE_WS_URL),
    },
  };
}); 