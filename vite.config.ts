import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    wasm(),
  ],
})
