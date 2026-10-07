import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // A second dev server run beside the first keeps its own dependency cache, so neither upsets the other.
  cacheDir: process.env.FLOORPLAN_VITE_CACHE ?? 'node_modules/.vite',
  server: {
    watch: {
      ignored: ['**/.svelte-kit/generated/**'],
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
