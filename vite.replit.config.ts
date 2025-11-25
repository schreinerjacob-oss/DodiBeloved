import baseConfig from './vite.config';
import { mergeConfig, defineConfig, type UserConfig } from 'vite';

export default mergeConfig(
  baseConfig as UserConfig,
  defineConfig({
    server: {
      host: '0.0.0.0',
      port: 5000,
      strictPort: true,
      allowedHosts: true,
      hmr: {
        clientPort: 443,
      },
    },
  })
);
