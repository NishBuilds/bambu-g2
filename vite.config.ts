import { defineConfig } from 'vite'

const port = Number(process.env.PORT ?? 5175)

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port,
    strictPort: false,
  },
})
