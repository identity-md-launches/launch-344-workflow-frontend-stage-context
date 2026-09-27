import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
const dir = fileURLToPath(new URL('../../dist/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/preview/')) { res.writeHead(404).end(); return; }
    const path = resolve(dir, '.' + url.pathname.slice('/preview'.length) + (url.pathname.endsWith('/') ? 'index.html' : ''));
    if (!path.startsWith(dir)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(path));
  } catch { res.writeHead(404).end('Not found'); }
});
const port = Number(process.env.PORT || 4173);
server.listen(port, '127.0.0.1', () => console.log(`Production export at http://127.0.0.1:${port}/preview/`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
