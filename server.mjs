import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createLocalApiServer } from './src-tauri/sidecar/local-api-server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

async function bootstrap() {
  // Start the local-api-server on an ephemeral port.
  // We disable the cloud fallback to ensure it genuinely serves the local handlers.
  const apiServer = await createLocalApiServer({ 
    port: 0, 
    apiDir: path.join(__dirname, 'api'),
    cloudFallback: 'false',
    mode: 'render-web-service'
  });
  
  const { port: apiPort } = await apiServer.start();
  console.log(`[server.mjs] Internal API Server running on port ${apiPort}`);

  // Proxy /api requests to the internal server
  // Support both http-proxy-middleware v2 and v3 syntax
  const proxyMw = createProxyMiddleware({
    target: `http://127.0.0.1:${apiPort}`,
    changeOrigin: true,
    ws: true,
    onProxyReq: (proxyReq) => {
      // Spoof origin to satisfy local-api-server's CORS policy
      proxyReq.setHeader('Origin', 'https://worldmonitor.app');
    },
    on: {
      proxyReq: (proxyReq) => {
        proxyReq.setHeader('Origin', 'https://worldmonitor.app');
      }
    }
  });

  // Mount without stripping /api since local-api-server expects it
  app.use('/api', (req, res, next) => {
    req.url = '/api' + (req.url === '/' ? '' : req.url);
    proxyMw(req, res, next);
  });

  // Serve the static frontend from dist/
  app.use(express.static(path.join(__dirname, 'dist')));

  // Fallback for SPA routing
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`[server.mjs] Render Web Service listening on port ${PORT}`);
  });
}

bootstrap().catch(err => {
  console.error('[server.mjs] Boot failed:', err);
  process.exit(1);
});
