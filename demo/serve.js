// Minimal static file server for demo-dist/ using Node's built-in http (no extra deps).
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', 'demo-dist');
const PORT = process.env.PORT || 9009;
// Local-only: stream large rev.ai test media (e.g. GEMS-01.mp4) straight from disk
// at /strict-media/<file> instead of committing 40MB into the repo. Override the
// directory with STRICT_MEDIA_DIR; defaults to ~/cineminds-test.
const STRICT_MEDIA_DIR = process.env.STRICT_MEDIA_DIR || path.join(os.homedir(), 'cineminds-test');
const MEDIA_TYPES = {
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  // Range-aware passthrough for local strict-testing media (video seeking needs 206).
  if (urlPath.startsWith('/strict-media/')) {
    const mediaPath = path.join(STRICT_MEDIA_DIR, urlPath.slice('/strict-media/'.length));
    if (!mediaPath.startsWith(STRICT_MEDIA_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.stat(mediaPath, (err, stat) => {
      if (err) {
        res.writeHead(404);
        res.end(`Media not found: ${mediaPath}`);
        return;
      }
      const type = MEDIA_TYPES[path.extname(mediaPath).toLowerCase()] || 'application/octet-stream';
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': type,
        });
        fs.createReadStream(mediaPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': type, 'Accept-Ranges': 'bytes' });
        fs.createReadStream(mediaPath).pipe(res);
      }
    });
    return;
  }

  // dev demo: never serve a stale index.html / bundle after a rebuild
  res.setHeader('Cache-Control', 'no-cache');
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA-style fallback to index.html
      fs.readFile(path.join(ROOT, 'index.html'), (e2, html) => {
        if (e2) {
          res.writeHead(404);
          res.end('Not found. Run `npm run demo:build` first.');
        } else {
          res.writeHead(200, { 'Content-Type': TYPES['.html'] });
          res.end(html);
        }
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Playground served at http://localhost:${PORT}`);
});
