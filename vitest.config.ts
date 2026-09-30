/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    globals: true,
    // The electron package downloads its binary on the first require('electron'),
    // and parallel workers racing that download fail with EEXIST on a fresh
    // install. Tests never launch the binary; the override skips the download.
    env: {
      ELECTRON_OVERRIDE_DIST_PATH: resolve('node_modules/electron/dist')
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/main/**/*.ts', 'src/renderer/src/**/*.{ts,tsx}'],
      exclude: [
        'src/main/index.ts',
        'src/renderer/src/main.tsx',
        'src/renderer/src/components/**',
        '**/*.d.ts',
        '**/types.ts'
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        statements: 50,
        branches: 50
      }
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'main',
          environment: 'node',
          include: ['tests/main/**/*.test.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          setupFiles: ['./tests/renderer/setup.ts'],
          include: ['tests/renderer/**/*.test.{ts,tsx}']
        }
      }
    ]
  }
})
