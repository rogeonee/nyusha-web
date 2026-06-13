import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'server-only': path.resolve(
        __dirname,
        'tests/helpers/server-only-stub.ts',
      ),
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'ai-chatbot/**', '.next/**'],
  },
});
