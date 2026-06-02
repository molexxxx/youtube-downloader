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
        '**/*.d.ts',
        '**/types.ts'
      ],
      thresholds: {
        lines: 42,
        functions: 29,
        statements: 40,
        branches: 38
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
