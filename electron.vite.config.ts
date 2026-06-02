import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'

  return {
    main: {
      plugins: [externalizeDepsPlugin({ include: ['electron'] })],
      resolve: {
        alias: {
          '@main': resolve('src/main'),
          '@shared': resolve('src/shared')
        }
      },
      build: {
        outDir: 'out/main',
        minify: isProduction
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin({ include: ['electron'] })],
      resolve: {
        alias: {
          '@shared': resolve('src/shared')
        }
      },
      build: {
        outDir: 'out/preload',
        minify: isProduction
      }
    },
    renderer: {
      root: 'src/renderer',
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@shared': resolve('src/shared')
        }
      },
      css: {
        postcss: {
          plugins: [tailwindcss(), autoprefixer()]
        }
      },
      plugins: [react()],
      define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0')
      },
      build: {
        outDir: 'out/renderer',
        minify: isProduction
      }
    }
  }
})
