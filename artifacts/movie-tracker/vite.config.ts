import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const workspaceRoot = path.resolve(import.meta.dirname, '../..');

/**
 * Replit Secrets often set CLERK_PUBLISHABLE_KEY (server name). Vite only
 * embeds VITE_* into the browser bundle — mirror so Sign-in / Get started
 * work after sharing Clerk with Replit without a second secret.
 * Never mirror CLERK_SECRET_KEY (must stay server-only).
 */
function ensureViteClerkPublishableKey(mode: string) {
  const fromFiles = loadEnv(mode, workspaceRoot, '');
  const publishable =
    process.env.VITE_CLERK_PUBLISHABLE_KEY ||
    process.env.CLERK_PUBLISHABLE_KEY ||
    fromFiles.VITE_CLERK_PUBLISHABLE_KEY ||
    fromFiles.CLERK_PUBLISHABLE_KEY;

  if (publishable && !process.env.VITE_CLERK_PUBLISHABLE_KEY) {
    process.env.VITE_CLERK_PUBLISHABLE_KEY = publishable;
  }
}

ensureViteClerkPublishableKey(process.env.NODE_ENV === 'production' ? 'production' : 'development');

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:5000',
        changeOrigin: true,
        // Preserve the browser-facing host/proto and Authorization so Clerk
        // can verify session JWTs on proxied preview hosts (agent.cvm.dev).
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const host = req.headers['x-forwarded-host'] || req.headers.host;
            if (host) {
              proxyReq.setHeader(
                'X-Forwarded-Host',
                Array.isArray(host) ? host[0] : host,
              );
            }
            const proto =
              req.headers['x-forwarded-proto'] ||
              ((req.socket as { encrypted?: boolean })?.encrypted
                ? 'https'
                : 'http');
            proxyReq.setHeader(
              'X-Forwarded-Proto',
              Array.isArray(proto) ? proto[0] : proto,
            );
            const auth = req.headers.authorization;
            if (auth) {
              proxyReq.setHeader(
                'Authorization',
                Array.isArray(auth) ? auth[0] : auth,
              );
            }
          });
        },
      },
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
