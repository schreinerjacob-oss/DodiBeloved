import { createServer } from 'vite';

async function start() {
  const server = await createServer({
    server: {
      port: 5000,
      host: '0.0.0.0'
    },
    build: {
      outDir: 'dist'
    }
  });
  await server.listen();
  console.log('Vite production preview running on port 5000');
}

start();
