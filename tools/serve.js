/*
 * Minimal static file server for local development.
 *
 * The app has no build step, so all this needs to do is serve `web/` with
 * correct MIME types — ES modules and the service worker are both rejected by
 * browsers if the Content-Type is wrong.
 *
 * Run: node tools/serve.js [port]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.join(__dirname, '..', 'web');
const PORT = parseInt(process.argv[2], 10) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

http.createServer(function handle(req, res) {
  const pathname = decodeURIComponent(url.parse(req.url).pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(ROOT, relative);

  // Refuse anything that escapes the served directory.
  if (file.indexOf(ROOT) !== 0) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(file, function send(error, data) {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + relative);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(PORT, function ready() {
  console.log('Overload dev server on http://localhost:' + PORT);
});
