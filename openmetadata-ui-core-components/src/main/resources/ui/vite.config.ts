import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    dts({
      include: ['src'],
      outDir: 'dist/types',
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.stories.ts', '**/*.stories.tsx', '**/vite.config.ts']
    })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'OpenMetadataUICore',
      fileName: (format) => `index.${format}.js`,
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@mui/material',
        '@mui/system',
        '@mui/material/styles',
        '@mui/material/Chip',
        '@mui/icons-material',
        '@mui/x-date-pickers',
        '@emotion/react',
        '@emotion/styled',
        '@material/material-color-utilities',
        'notistack',
        'react-aria-components',
        'tailwind-merge'
      ],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          '@mui/material': 'MaterialUI',
          '@mui/system': 'MUISystem',
          '@emotion/react': 'EmotionReact',
          '@emotion/styled': 'EmotionStyled',
          'notistack': 'notistack',
          'react-aria-components': 'ReactAriaComponents',
          'tailwind-merge': 'TailwindMerge'
        }
      }
    },
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2020',
    cssMinify: true
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
