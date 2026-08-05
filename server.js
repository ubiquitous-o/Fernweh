// 静的配信のみのサーバ（依存ゼロ、node標準のhttpだけ）。
// fernweh@.service が `node server.js` で起動するキオスク用入口。
// 動画プールはcronのscripts/fetch-videos.jsがpublic/videos.jsonを更新し、
// フロントはそれを直接fetchする。
// （かつてあったランタイムYouTube検索APIは未使用だったため撤去。
//   expressもv2.0.0で依存から外れており、これでnpm ci直後でも起動できる）
import { createServer } from 'http';
import { readFileSync, createReadStream, statSync, realpathSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, normalize, extname, sep } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(__dirname, 'public');
const PUBLIC_REAL = realpathSync(PUBLIC_DIR);

// --- Config ---
// config.jsonはportにだけ使う（無ければデフォルト3333）。
// youtube_api_keyはfetch-videos.jsのローカル実行用で、サーバは使わない
let config = {};
try {
  config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf-8'));
} catch {}

const PORT = config.port || 3333;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filePath = normalize(join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  // シンボリックリンクを解決した実パスが public/ 配下（区切り付きで前方一致）で
  // あることを確認してからエスケープを拒否する。startsWithだけだと
  // 兄弟ディレクトリ（例: public-backup）やsymlink越えを通してしまう
  let realPath;
  try {
    realPath = realpathSync(filePath);
  } catch {
    res.writeHead(404).end('Not Found');
    return;
  }
  if (realPath !== PUBLIC_REAL && !realPath.startsWith(PUBLIC_REAL + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  let stat;
  try {
    stat = statSync(realPath);
  } catch {
    res.writeHead(404).end('Not Found');
    return;
  }
  if (stat.isDirectory()) {
    res.writeHead(404).end('Not Found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(realPath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
  });
  createReadStream(realPath).pipe(res);
});

server.listen(PORT, () => {
  console.log('');
  console.log('┌─────────────────────────────────────────┐');
  console.log('│  🌍  Fernweh                             │');
  console.log(`│  http://localhost:${PORT}                  │`);
  console.log('│  Ctrl+C to quit                          │');
  console.log('└─────────────────────────────────────────┘');
  console.log('');
});
