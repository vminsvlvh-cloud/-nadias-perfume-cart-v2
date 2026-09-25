'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const PRIVATE_FILES = new Set([
  'DATABASE_HARDENING.sql',
  'SUPABASE_CHECKOUT.sql',
  'SUPABASE_EVENT_CART.sql',
  'SUPABASE_PRODUCTS_20.sql',
  'INSTALL.txt',
  'LOGO-UPDATE.txt',
  'README.txt',
  'README-MASTER.txt',
  'package.json',
  'server.js',
]);

function applyHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https: *; style-src 'self' 'unsafe-inline' https: *; script-src 'self' 'unsafe-inline' https: *; font-src 'self' data: https: *; connect-src 'self' https: *; media-src 'self' https: *; object-src 'none'; frame-src 'self' https: *;");
}

const server = http.createServer((req, res) => {
  applyHeaders(res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (pathname.includes('\\') || pathname.split('/').some((part) => part.startsWith('.'))) {
    res.writeHead(404).end('Not found');
    return;
  }

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filename = path.resolve(ROOT, relative);
  if (!filename.startsWith(`${ROOT}${path.sep}`) || PRIVATE_FILES.has(path.basename(filename))) {
    res.writeHead(404).end('Not found');
    return;
  }

  const type = TYPES[path.extname(filename).toLowerCase()];
  if (!type) {
    res.writeHead(404).end('Not found');
    return;
  }

  fs.stat(filename, (statError, stat) => {
    if (statError || !stat.isFile()) {
      const notFound = path.join(ROOT, '404.html');
      fs.readFile(notFound, (readError, body) => {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' || readError ? undefined : body);
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=300',
      'Last-Modified': stat.mtime.toUTCString(),
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filename).on('error', () => res.destroy()).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`Static storefront listening on ${PORT}\n`);
});
