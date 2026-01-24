// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import cloudflare from '@astrojs/cloudflare';
import { loadEnv } from 'vite';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv(process.env.NODE_ENV || 'development', dirname, '');

// https://astro.build/config
export default defineConfig({
  site: env.SITE_URL,
  output: 'server',
  // Disable session storage to avoid KV binding requirements.
  session: {
    driver: 'null'
  },
  // Experimental Fonts API: 构建时下载字体并本地托管，消除 FOUT
  experimental: {
    fonts: [
      {
        provider: fontProviders.google(),
        name: "Inter",
        cssVariable: "--font-inter",
        weights: [400, 500, 600],
        styles: ["normal"],
        subsets: ["latin"],
        fallbacks: ["system-ui", "sans-serif"],
      },
      {
        provider: fontProviders.google(),
        name: "Merriweather",
        cssVariable: "--font-merriweather",
        weights: [300, 400, 700],
        styles: ["normal", "italic"],
        subsets: ["latin"],
        fallbacks: ["Georgia", "serif"],
      },

      {
        provider: fontProviders.google(),
        name: "Playfair Display",
        cssVariable: "--font-playfair",
        weights: [400, 700, 900],
        styles: ["normal", "italic"],
        subsets: ["latin"],
        fallbacks: ["Georgia", "serif"],
      },
    ],
  },
  integrations: [react(), sitemap()],
  image: {
    service: {
      entrypoint: 'astro/assets/services/noop'
    }
  },
  vite: {
    plugins: [/** @type {any} */(tailwindcss())],
    resolve: {
      alias: {
        "@": path.resolve(dirname, "./src"),
        "@server": path.resolve(dirname, "./server/src")
      }
    },

    // @ts-ignore
    test: {
      projects: [
        {
          extends: true,
          plugins: [
            // The plugin will run tests for the stories defined in your Storybook config
            // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
            storybookTest({ configDir: path.join(dirname, '.storybook') }),
          ],
          test: {
            name: 'storybook',
            browser: {
              enabled: true,
              headless: true,
              provider: playwright({}),
              instances: [{ browser: 'chromium' }],
            },
            setupFiles: ['.storybook/vitest.setup.ts'],
          },
        },
      ],
    },
  },

  adapter: cloudflare(),
  devToolbar: {
    enabled: false
  }
});