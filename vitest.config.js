import { fileURLToPath, URL } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.js'],
    restoreMocks: true,
    // 主工作区会保存 Superpowers/Codex 生成的临时 worktree；测试只应扫描当前源码。
    exclude: [...configDefaults.exclude, '.worktrees/**'],
  },
})
