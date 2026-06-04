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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/main/**/*.ts', 'src/renderer/src/**/*.{ts,tsx}'],
      exclude: [
        'src/main/index.ts',
        'src/renderer/src/main.tsx',
        // React components are exercised by the smoke test and manual testing,
        // not by unit tests. Excluding them keeps thresholds meaningful for
        // the logic that is actually unit-tested (main process + stores/utils).
        'src/renderer/src/components/**',
        '**/*.d.ts',
        '**/types.ts'
      ],
      thresholds: {
        lines: 90,
        functions: 88,
        statements: 90,
        branches: 83
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
