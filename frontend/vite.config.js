import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/lightweight-charts/')) {
            return 'chart-vendor'
          }

          if (/\/node_modules\/(react|react-dom|react-router-dom)(\/|$)/.test(id)) {
            return 'react-vendor'
          }

          if (id.includes('/node_modules/')) {
            return 'vendor'
          }
        },
      },
    },
  },
})
