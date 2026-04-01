/*
 *  Copyright 2022 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import viteCompression from 'vite-plugin-compression';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devServerTarget =
    env.VITE_DEV_SERVER_TARGET ||
    env.DEV_SERVER_TARGET ||
    'http://localhost:8585/';

  // Use empty base so dynamic imports use relative paths
  // The actual BASE_PATH is injected at runtime by the Java backend via ${basePath} replacement
  return {
    base: '',
    plugins: [
      {
        name: 'html-transform',
        transformIndexHtml(html: string) {
          // Don't replace ${basePath} placeholder - it will be replaced at runtime by Java backend
          // Add ${basePath} prefix to asset paths (with or without leading slash)
          return html
            .replaceAll(
              /(<script[^>]*src=["'])(\.\/)?assets\//g,
              '$1${basePath}assets/'
            )
            .replaceAll(
              /(<link[^>]*href=["'])(\.\/)?assets\//g,
              '$1${basePath}assets/'
            )
            .replaceAll(
              /(<img[^>]*src=["'])(\.\/)?assets\//g,
              '$1${basePath}assets/'
            )
            .replaceAll(
              /(<img[^>]*src=["'])(\.\/)?images\//g,
              '$1${basePath}images/'
            );
        },
      },
      {
        name: 'html-cache-buster',
        transformIndexHtml(html: string) {
          // APP_VERSION is injected by the Maven build
          const appVersion = process.env.APP_VERSION || 'unknown';
          return html.replaceAll(
            /(href|src)="([^"]+\.(?:js|css))(\?[^"]*)?"/g,
            (_, attr, path, qs) =>
              `${attr}="${path}${qs ? qs + '&' : '?'}v=${appVersion}"`
          );
        },
      },
      tailwindcss(),
      react(),
      svgr(),
      tsconfigPaths(),
      nodePolyfills({
        include: ['process', 'buffer'],
        globals: {
          process: true,
          Buffer: true,
        },
      }),
      mode === 'production' &&
        viteCompression({
          algorithm: 'gzip',
          ext: '.gz',
          threshold: 1024, // Only compress files larger than 1KB
          deleteOriginFile: false, // Keep original files for fallback
          // Skip binary formats that are already compressed — re-compressing
          // them wastes build CPU and saves zero bytes.
          filter: /\.(js|mjs|css|html|svg|json|wasm)(\?.*)?$/i,
        }),
      mode === 'production' &&
        viteCompression({
          algorithm: 'brotliCompress',
          ext: '.br',
          threshold: 1024, // Only compress files larger than 1KB
          deleteOriginFile: false, // Keep original files for fallback
          // Same exclusion list — woff2 is already brotli-compressed internally.
          filter: /\.(js|mjs|css|html|svg|json|wasm)(\?.*)?$/i,
        }),
    ].filter(Boolean),

    resolve: {
      alias: {
        process: 'process/browser',
        Quill: path.resolve(__dirname, 'node_modules/quill'),
        '@': path.resolve(__dirname, 'src'),
        '~antd': path.resolve(__dirname, 'node_modules/antd'),
        antd: path.resolve(__dirname, 'node_modules/antd'),
        '@deuex-solutions/react-tour': path.resolve(
          __dirname,
          'node_modules/@deuex-solutions/react-tour/dist/reacttour.min.js'
        ),
      },
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.css', '.less', '.svg'],
      dedupe: [
        'react',
        'react-dom',
        '@mui/material',
        '@mui/system',
        '@emotion/react',
        '@emotion/styled',
        'react-aria',
        'react-aria-components',
        'react-stately',
        '@untitledui/icons',
        '@internationalized/date',
        '@react-aria/utils',
        '@react-stately/utils',
        '@react-types/shared',
        'tailwind-merge',
        'react-hook-form',
      ],
    },

    css: {
      preprocessorMaxWorkers: 1, // Disable parallel Less processing to avoid race conditions in CI
      preprocessorOptions: {
        less: {
          javascriptEnabled: true,
          modifyVars: {},
          math: 'always',
          paths: [
            path.resolve(__dirname, 'node_modules'),
            path.resolve(__dirname, 'src'),
            path.resolve(__dirname, 'src/styles'),
          ],
        },
      },
    },

    server: {
      port: 3000,
      open: true,
      proxy: {
        '/api/': {
          target: devServerTarget,
          changeOrigin: true,
          ws: true,
        },
      },
      watch: {
        ignored: [
          '**/node_modules/**',
          '**/dist/**',
          '**/playwright/**',
          // Ignore test-related files so changes to them don't trigger HMR
          '**/*.test.*',
          '**/*.spec.*',
          '**/*.cy.*',
          '**/__tests__/**',
          '**/*.mock.*',
        ],
      },
      fs: {
        strict: false,
      },
    },

    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      copyPublicDir: true,
      sourcemap: false,
      minify: mode === 'production' ? 'esbuild' : false,
      cssMinify: 'esbuild',
      cssCodeSplit: true,
      reportCompressedSize: false,
      // Each named chunk is now bounded; raise the warning limit only so CI
      // doesn't complain about the few legitimately large vendor chunks.
      chunkSizeWarningLimit: 5000,
      rollupOptions: {
        output: {
          /**
           * manualChunks object — Rollup resolves each package name and groups
           * all its internal modules into the named chunk automatically.
           *
           * Order within this object does not matter; what matters is which
           * chunk a package is assigned to. Keep the comment groups as a guide.
           */
          /**
           * Function-based manualChunks using an explicit package map.
           * This achieves what the object pattern does, but importantly
           * allows us to add a catch-all at the end so unlisted node_modules
           * are properly split out of the main index.js bundle.
           */
          manualChunks: ((packageMap: Record<string, string[]>) => (id: string) => {
            // Find if this module belongs to any of our explicit vendor chunks
            for (const [chunkName, packages] of Object.entries(packageMap)) {
              if (packages.some((pkg) => id.includes(`node_modules/${pkg}/`))) {
                return chunkName;
              }
            }

            // --- THE CRITICAL CATCH-ALL ---
            // If it's a node_module but wasn't in the list above, group it here
            // instead of letting it bloat the main application index.js!
            if (id.includes('node_modules/')) {
              return 'vendor-misc';
            }
          })({
            // ── Login critical path (loaded before auth resolves) ─────────────
            'vendor-react': ['react', 'react-dom', 'scheduler'],
            'vendor-router': ['react-router-dom', 'react-router'],
            'vendor-zustand': ['zustand'],
            'vendor-antd': ['antd', '@ant-design/icons'],
            'vendor-i18n': ['i18next', 'react-i18next'],

            // ── Core UI Components (massive library) ──────────────────────────
            'vendor-core': ['@openmetadata/ui-core-components'],

            // ── MUI / Emotion (authenticated pages only) ──────────────────────
            'vendor-mui': [
              '@mui/material',
              '@mui/system',
              '@mui/icons-material',
              '@mui/x-date-pickers',
              '@mui/x-tree-view',
              '@emotion/react',
              '@emotion/styled',
            ],

            // ── Rich-text editors ─────────────────────────────────────────────
            'vendor-editor-tiptap': [
              '@tiptap/react',
              '@tiptap/core',
              '@tiptap/starter-kit',
              '@tiptap/extension-link',
              '@tiptap/extension-placeholder',
              '@tiptap/extension-table',
              '@tiptap/extension-table-cell',
              '@tiptap/extension-table-header',
              '@tiptap/extension-table-row',
              '@tiptap/extension-task-item',
              '@tiptap/extension-task-list',
              '@tiptap/suggestion',
            ],
            'vendor-editor-quill': [
              'quill',
              'react-quill-new',
              '@toast-ui/react-editor',
              '@windmillcode/quill-emoji',
              'quill-mention',
              'quilljs-markdown',
            ],
            'vendor-codemirror': ['codemirror', 'react-codemirror2'],

            // ── Data Parsers & AST (very heavy) ───────────────────────────────
            'vendor-antlr': ['antlr4'],
            'vendor-schema': ['@apidevtools/json-schema-ref-parser'],
            'vendor-markdown': ['showdown', 'turndown', 'dompurify', 'html-react-parser'],

            // ── Charts & graphs ───────────────────────────────────────────────
            'vendor-recharts': ['recharts'],
            'vendor-reactflow': ['reactflow', '@dagrejs/dagre'],
            'vendor-g6': ['@antv/g6', 'elkjs'],
            'vendor-vis': ['vis-network', 'vis-data'],

            // ── Auth SDKs ─────────────────────────────────────────────────────
            'vendor-auth-okta-auth0': [
              '@okta/okta-react',
              '@okta/okta-auth-js',
              '@auth0/auth0-react',
              'oidc-client',
            ],
            'vendor-auth-azure': [
              '@azure/msal-browser',
              '@azure/msal-react',
            ],

            // ── Forms & Query schemas ─────────────────────────────────────────
            'vendor-query-builder': ['@react-awesome-query-builder/antd'],
            'vendor-rjsf': [
              '@rjsf/core',
              '@rjsf/utils',
              '@rjsf/validator-ajv8',
              'ajv',
            ],

            // ── DnD, tour, sockets ────────────────────────────────────────────
            'vendor-dnd': ['react-dnd', 'react-dnd-html5-backend'],
            'vendor-tour': ['@deuex-solutions/react-tour'],
            'vendor-socketio': ['socket.io-client'],

            // ── Utilities ─────────────────────────────────────────────────────
            'vendor-lodash': ['lodash'],
            'vendor-rapidoc': ['rapidoc'],
            'vendor-analytics': ['analytics', 'use-analytics'],
          }),
          assetFileNames: (assetInfo) => {
            const fileName = assetInfo.names || '';
            
            const ext = fileName.at(-1) ?? '';

            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
              return `images/[name]-[hash][extname]`;
            }

            return `assets/[name]-[hash][extname]`;
          },
        },
      },
    },

    optimizeDeps: {
      include: [
        'antlr4',
        '@azure/msal-browser',
        '@azure/msal-react',
        'codemirror',
        '@deuex-solutions/react-tour',
      ],
      esbuildOptions: {
        target: 'esnext',
      },
    },

    cacheDir: 'node_modules/.vite',

    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      global: 'globalThis',
    },
  };
});
