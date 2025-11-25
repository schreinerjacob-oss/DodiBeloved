import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('Starting dodi PWA production server...');

const viteProcess = spawn('npx', ['vite', 'preview', '--config', 'vite.replit.config.ts', '--host', '0.0.0.0', '--port', '5000'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

viteProcess.on('error', (error) => {
  console.error('Failed to start Vite preview:', error);
  process.exit(1);
});

viteProcess.on('exit', (code) => {
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  viteProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  viteProcess.kill('SIGTERM');
});
