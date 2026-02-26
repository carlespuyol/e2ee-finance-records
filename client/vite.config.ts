import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

const certsDir = path.resolve(__dirname, '..', 'certs');

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // bind to all interfaces — required for LAN/cloud access
    https: {
      key:  fs.readFileSync(path.join(certsDir, 'key.pem')),
      cert: fs.readFileSync(path.join(certsDir, 'cert.pem')),
    },
    proxy: {
      '/api': {
        target: 'https://localhost:3003',
        secure: false,        // self-signed cert — skip verification on the proxy hop
        changeOrigin: true,
      },
    },
  },
});
