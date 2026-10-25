import http from 'node:http';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const publicFiles = new Set([
  'index.html', 'produk.html', 'cart.html', 'data.json', 'css/style.css', 'js/app.js', 'js/cart.js',
  'images/rental.png', 'images/RENTAL-MOBIL.jpg',
  'images/Product/corolla.jpeg', 'images/Product/civic.jpg', 'images/Product/fortuner.webp',
  'images/Product/pajero.webp', 'images/Product/Avanza.jpeg', 'images/Product/xenia.jpg',
]);
const types = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const port = Number(process.env.PORT || 8095);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT harus 1 sampai 65535.');
const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Metode tidak didukung.');
    return;
  }
  let path;
  try { path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).slice(1) || 'index.html'; }
  catch { response.writeHead(400); response.end(); return; }
  if (!publicFiles.has(path)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Halaman tidak ditemukan.');
    return;
  }
  try {
    const body = await readFile(new URL(path, root));
    response.writeHead(200, { 'Content-Type': types[path.split('.').at(-1)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Berkas aplikasi belum dapat dibaca.');
  }
});
server.on('error', () => { console.error('Server gagal dijalankan. Periksa port atau proses lain.'); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Rental Car: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
