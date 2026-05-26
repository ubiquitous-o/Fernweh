// Nominatimでのジオコーディング + キャッシュ（geocache.json）。
// キャッシュエントリは locations.js の LOCATION_COORDS / LABELS にも統合される（auto-learning）。
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  LOCATION_COORDS, LOCATION_LABELS, LOCATION_BLOCKLIST, buildDictCache,
} from './locations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GEOCACHE_PATH = join(__dirname, '..', 'geocache.json');

let geocache = {};
try {
  if (existsSync(GEOCACHE_PATH)) {
    geocache = JSON.parse(readFileSync(GEOCACHE_PATH, 'utf-8'));
  }
} catch {
  geocache = {};
}

// geocache のエントリを辞書マッチにも活用（Gemini呼び出し削減）
export function integrateGeocacheIntoDict() {
  for (const [name, coords] of Object.entries(geocache)) {
    if (!coords) continue;
    const commaIdx = name.indexOf(',');
    const dictKey = commaIdx > 0 ? name.substring(0, commaIdx).trim() : name.trim();
    if (dictKey.length < 3) continue;
    if (LOCATION_BLOCKLIST.has(dictKey)) continue;
    if (LOCATION_COORDS[dictKey]) continue;
    LOCATION_COORDS[dictKey] = coords;
    LOCATION_LABELS[dictKey] = name;
  }
  buildDictCache();
}

function saveGeocache() {
  writeFileSync(GEOCACHE_PATH, JSON.stringify(geocache, null, 2) + '\n');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function geocode(placeName) {
  // キャッシュチェック（nullもキャッシュ＝見つからなかった場所）
  if (geocache[placeName] !== undefined) {
    return geocache[placeName];
  }
  const params = new URLSearchParams({
    q: placeName,
    format: 'json',
    limit: '1',
  });
  try {
    await sleep(1100); // Nominatim レート制限: 1req/秒
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'Fernweh-LiveCam-Globe/1.0 (https://github.com/fernweh)' },
    });
    if (!res.ok) {
      console.warn(`Nominatim error: ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (data.length > 0) {
      const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      geocache[placeName] = coords;
      saveGeocache();
      return coords;
    }
    geocache[placeName] = null;
    saveGeocache();
    return null;
  } catch (err) {
    console.warn(`Nominatim request failed: ${err.message}`);
    return null;
  }
}
