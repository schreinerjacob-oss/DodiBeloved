import baseConfig from './vite.config';
import { mergeConfig, defineConfig, type UserConfig } from 'vite';

// Get Replit domains from environment
const replitDevDomain = process.env.REPLIT_DEV_DOMAIN?.replace('https://', '');
const allowedHosts: string[] = [
  'localhost',
  '.replit.dev',
  '.replit.app',
  '.repl.co',
];
if (replitDevDomain) {
  allowedHosts.push(replitDevDomain);
}

export default mergeConfig(
  baseConfig as UserConfig,
  defineConfig({
    server: {
      host: '0.0.0.0',
      port: 5000,
      strictPort: true,
      allowedHosts: allowedHosts,
      hmr: {
        clientPort: 443,
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 5000,
      allowedHosts: allowedHosts,
    },
  })
);
