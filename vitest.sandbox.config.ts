import { defineConfig } from 'vitest/config';

// Runs against the real FIZ API sandbox (fiz_test_ key). See test/sandbox/.
export default defineConfig({
  test: { include: ['test/sandbox/**/*.test.ts'], testTimeout: 60_000, passWithNoTests: true },
});
