import { createServer } from 'vite';
import { resolve } from 'path';

async function start() {
  const server = await createServer({
    server: {
      port: 5000,
      host: '0.0.0.0'
    }
  });
  await server.listen();
  console.log('Vite server running on port 5000');
}

start();
