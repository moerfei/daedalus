import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// daedalus B 轨模板：Vite + React18 + Tailwind3（自研 shadcn 风格组件，无 radix）
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  preview: {
    port: 4173,
    host: '127.0.0.1',
  },
})
