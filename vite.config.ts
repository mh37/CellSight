import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In dev mode, proxy /api and /media requests to the Go server running on port 5001.
    // In production (Wails build), these are handled natively by the MediaAssetHandler.
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})

