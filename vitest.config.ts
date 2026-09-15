import {defineConfig} from 'vitest/config';

export default defineConfig({test: {environment: 'node', include: ['src/api/**/*.test.ts', 'src/shell/*.test.ts']}});
