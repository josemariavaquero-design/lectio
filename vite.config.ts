
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Use type assertion (process as any) to fix the TS error: Property 'cwd' does not exist on type 'Process'.
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.API_KEY || '')
    },
    build: {
      rollupOptions: {
        // Marcamos como externas las librerías que cargamos vía CDN/Importmap
        external: [
          'react',
          'react-dom',
          'lucide-react',
          '@google/genai',
          'pdfjs-dist'
        ]
      }
    },
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      }
    }
  };
});
