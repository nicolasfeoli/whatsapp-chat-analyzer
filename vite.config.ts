import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Minimum percentage of the DOM-free core that the test suite must exercise.
 * The core decides every number the page shows, so an untested branch there is
 * a number nobody has checked.
 */
const CORE_COVERAGE_THRESHOLD_PERCENT = 90;

/**
 * Minimum percentage of the page code and of the worker code that the test
 * suite must exercise, each measured on its own. It is a little lower than for
 * the core because this code contains guards for states the browser never
 * produces (an element missing from a report the page has just drawn, a bucket
 * missing from a timeline it has just built), which no test can reach.
 */
const PAGE_COVERAGE_THRESHOLD_PERCENT = 85;

/** The directive in index.html that forbids the page's scripts every network connection. */
const PRODUCTION_CONNECT_DIRECTIVE = "connect-src 'none'";

/** What the dev server serves instead: connections to itself, for hot module replacement only. */
const DEVELOPMENT_CONNECT_DIRECTIVE = "connect-src 'self' ws://localhost:* ws://127.0.0.1:*";

/**
 * Lets Vite's hot-module-replacement client open its WebSocket during `npm run dev`.
 *
 * The page's Content-Security-Policy forbids every connection, which is the
 * point of the page but also blocks the dev server's own reload channel. This
 * plugin only runs for the dev server (`apply: 'serve'`): the file on disk and
 * the production build keep `connect-src 'none'`.
 */
function allowHotReloadConnectionInDevelopment(): Plugin {
  return {
    name: 'allow-hot-reload-connection-in-development',
    apply: 'serve',
    transformIndexHtml(html: string): string {
      return html.replace(PRODUCTION_CONNECT_DIRECTIVE, DEVELOPMENT_CONNECT_DIRECTIVE);
    },
  };
}

export default defineConfig({
  plugins: [allowHotReloadConnectionInDevelopment()],
  /*
   * A relative base makes every asset URL in the build relative to index.html,
   * so the same dist/ folder works at a domain root and under a GitHub Pages
   * project sub-path such as /whatsapp-chat-analyzer/.
   */
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    /*
     * Vite's module-preload polyfill downloads scripts with fetch(), which the
     * page's Content-Security-Policy (connect-src 'none') forbids. Every
     * browser that can run this page preloads modules natively, so the
     * polyfill is left out and the bundle contains no network call at all.
     */
    modulePreload: { polyfill: false },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      thresholds: {
        'src/core/**/*.ts': {
          lines: CORE_COVERAGE_THRESHOLD_PERCENT,
          branches: CORE_COVERAGE_THRESHOLD_PERCENT,
          functions: CORE_COVERAGE_THRESHOLD_PERCENT,
          statements: CORE_COVERAGE_THRESHOLD_PERCENT,
        },
        'src/ui/**/*.ts': {
          lines: PAGE_COVERAGE_THRESHOLD_PERCENT,
          branches: PAGE_COVERAGE_THRESHOLD_PERCENT,
          functions: PAGE_COVERAGE_THRESHOLD_PERCENT,
          statements: PAGE_COVERAGE_THRESHOLD_PERCENT,
        },
        'src/worker/**/*.ts': {
          lines: PAGE_COVERAGE_THRESHOLD_PERCENT,
          branches: PAGE_COVERAGE_THRESHOLD_PERCENT,
          functions: PAGE_COVERAGE_THRESHOLD_PERCENT,
          statements: PAGE_COVERAGE_THRESHOLD_PERCENT,
        },
      },
    },
  },
});
