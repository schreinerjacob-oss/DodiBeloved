import { spawn } from 'child_process';
spawn('vite', ['--host', '0.0.0.0', '--port', '5000'], { stdio: 'inherit', shell: true });
