import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// HTTPS by default so phones on the LAN can open the camera; VITE_NO_SSL=1 serves plain HTTP for local previews.
const useSsl = !process.env.VITE_NO_SSL;

export default defineConfig({
  plugins: [react(), useSsl && basicSsl()].filter(Boolean),
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
