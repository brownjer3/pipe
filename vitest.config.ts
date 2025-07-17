import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup/setup-files.ts'],
    globalSetup: './test/setup/global-setup.ts',

    // Projects configuration (replaces workspace)
    projects: [
      {
        name: 'unit',
        include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
        environment: 'node',
        isolate: true,
      },
      {
        name: 'integration',
        include: ['tests/integration/**/*.test.ts'],
        environment: 'node',
        setupFiles: ['./test/setup/integration-setup.ts'],
        testTimeout: 30000,
        sequence: {
          concurrent: false,
        },
      },
      {
        name: 'e2e',
        include: ['tests/e2e/**/*.test.ts'],
        setupFiles: ['./test/setup/e2e-setup.ts'],
        testTimeout: 60000,
        maxWorkers: 1,
      },
      {
        name: 'components',
        include: ['tests/components/**/*.test.ts'],
        environment: 'node',
        isolate: true,
      },
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/types/**',
        'src/**/__mocks__/**',
        'node_modules/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },

    // Pool configuration for optimal performance
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1,
      },
    },

    // Timeout configurations
    testTimeout: 10000,
    hookTimeout: 30000,

    // Reporter configuration
    reporters: process.env.CI ? ['default', 'github-actions', 'junit'] : ['default', 'html'],

    // Output configuration
    outputFile: {
      junit: './test-results/junit.xml',
      html: './test-results/index.html',
    },

    // Mock configuration
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,

    // Type checking (optional, can be enabled later)
    typecheck: {
      enabled: false, // Enable when ready
      checker: 'tsc',
      include: ['**/*.test-d.ts'],
    },

    // Inline snapshot configuration
    snapshotFormat: {
      escapeString: false,
      printBasicPrototype: false,
    },

    // Test file patterns
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.git', 'coverage'],
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@test': resolve(__dirname, './test'),
    },
  },
});
