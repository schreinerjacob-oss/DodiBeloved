import { spawn } from 'child_process';
spawn('vite', ['preview', '--host', '0.0.0.0', '--port', '5000'], { stdio: 'inherit', shell: true });
