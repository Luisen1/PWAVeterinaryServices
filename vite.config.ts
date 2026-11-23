import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { createBuildMetadata } from './scripts/build-metadata.ts';
import {
  publicNames,
  validatePublicEnvironment,
} from './scripts/public-environment.ts';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '');
  // Vercel puede añadir metadatos del sistema durante su compilación. No entran en el cliente.
  for (const name of Object.keys(environment))
    if (name.startsWith('VITE_VERCEL_')) delete environment[name];
  validatePublicEnvironment(environment);
  const metadata = createBuildMetadata({
    environment: process.env.DEPLOY_ENVIRONMENT,
    id: process.env.BUILD_ID,
    backend: environment.VITE_SUPABASE_URL?.trim(),
  });
  return {
    envPrefix: [...publicNames],
    define: { __BUILD_ID__: JSON.stringify(metadata.id) },
    plugins: [
      {
        name: 'veterinary-build-metadata',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'build.json',
            source: JSON.stringify(metadata),
          });
        },
      },
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: null,
        manifest: false,
        injectManifest: {
          globPatterns: [
            '**/*.{js,css,html,png,svg,woff2,webmanifest}',
            'build.json',
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: { target: 'es2022' },
  };
});
