// @ts-check
import { defineConfig } from 'astro/config'
import vercel from '@astrojs/vercel/serverless'
import tailwindcss from '@tailwindcss/vite'
import react from '@astrojs/react'

export default defineConfig({
  output: 'server',
  adapter: vercel({}),
  integrations: [react()],
  site: 'https://nolelamphim.vercel.app',
  security: {
    checkOrigin: false,
  },
  prefetch: true,
  vite: {
    plugins: [/** @type {any} */ (tailwindcss())],
  },
})
