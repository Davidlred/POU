import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// dedupe: the Expo apps hoist a different React into the root node_modules; use one copy here.
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 5173 },
});
