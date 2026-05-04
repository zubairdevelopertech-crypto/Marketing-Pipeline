const { createProxyMiddleware } = require('http-proxy-middleware');

const BACKEND = 'http://localhost:3001';

// SSE-safe proxy config (no buffering, long timeout)
const sseProxy = createProxyMiddleware({
  target: BACKEND,
  changeOrigin: true,
  selfHandleResponse: false,
  proxyTimeout: 900000,
  timeout: 900000,
  on: {
    proxyRes: (proxyRes) => {
      proxyRes.headers['x-accel-buffering'] = 'no';
      proxyRes.headers['cache-control'] = 'no-cache';
    },
  },
});

// Standard proxy for static assets (images)
const staticProxy = createProxyMiddleware({
  target: BACKEND,
  changeOrigin: true,
});

module.exports = function (app) {
  app.use('/api', sseProxy);
  app.use('/outputs', staticProxy); // serves generated images from backend/clients/
};
