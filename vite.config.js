import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: './',
    plugins: [vue()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: Number(env.VITE_CLI_PORT || 8080),
      proxy: {
        '/api': {
          target: `${env.VITE_BASE_PATH || 'http://127.0.0.1'}:${env.VITE_SERVER_PORT || 8888}`,
          changeOrigin: true,
        },
      },
    },
  }
})
