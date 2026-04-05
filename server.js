import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Config ---
let config;
try {
  config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf-8'));
} catch {
  console.error('⚠  config.json が見つからない。config.example.json をコピーして API キーを設定してね');
  process.exit(1);
}

const API_KEY = config.youtube_api_key;
const PORT = config.port || 3333;

if (!API_KEY || API_KEY === 'YOUR_YOUTUBE_DATA_API_V3_KEY_HERE') {
  console.error('⚠  config.json に YouTube Data API v3 キーを設定してね');
  process.exit(1);
}

const app = express();
app.use(express.static(join(__dirname, 'public')));

// --- Search Queries ---
// ベースクエリ × ランダム地名で組み合わせ爆発させる
const BASE_QUERIES = [
  'live camera', 'live webcam', 'live cam', 'live stream camera',
  'live view', '24/7 live cam', 'webcam live',
];

const TOPICS = [
  'city', 'nature', 'street', 'ocean beach', 'mountain',
  'skyline', 'animals wildlife', 'aurora', 'train railway',
  'airport', 'underwater', 'volcano', 'space ISS',
  'safari', 'Northern Lights', 'coral reef', 'river',
  'harbor port', 'sunset', 'countryside', 'temple shrine',
  'bridge', 'lake', 'rainforest', 'desert', 'glacier',
  'waterfall', 'castle', 'market', 'canal',
];

const LOCATIONS = [
  'Tokyo', 'New York', 'Paris', 'London', 'Bangkok', 'Dubai',
  'Sydney', 'Rio de Janeiro', 'Istanbul', 'Rome', 'Barcelona',
  'Amsterdam', 'Seoul', 'Singapore', 'Hong Kong', 'Mumbai',
  'Cairo', 'Cape Town', 'Buenos Aires', 'Mexico City',
  'Vancouver', 'Reykjavik', 'Oslo', 'Helsinki', 'Prague',
  'Vienna', 'Zurich', 'Havana', 'Lisbon', 'Athens',
  'Santorini', 'Bali', 'Maldives', 'Hawaii', 'Alaska',
  'Norway', 'Iceland', 'Tanzania', 'Peru', 'Nepal',
  'New Zealand', 'Scotland', 'Croatia', 'Morocco', 'Vietnam',
  'Japan', 'Italy', 'Switzerland', 'Canada', 'Australia',
];

// ランダムにクエリを合成する
function generateQuery() {
  const base = BASE_QUERIES[Math.floor(Math.random() * BASE_QUERIES.length)];
  // 70%の確率で地名を付ける、30%でトピックのみ
  if (Math.random() < 0.7) {
    const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    // 半分の確率でトピックも付ける
    if (Math.random() < 0.5) {
      const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
      return `${base} ${topic} ${location}`;
    }
    return `${base} ${location}`;
  }
  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  return `${base} ${topic}`;
}

// ソート順もランダム化
const SORT_ORDERS = ['viewCount', 'relevance', 'date'];

function randomOrder() {
  return SORT_ORDERS[Math.floor(Math.random() * SORT_ORDERS.length)];
}

// 最近使った動画IDを記録（重複回避）
const recentVideoIds = new Set();
const MAX_RECENT = 50;

function addRecent(id) {
  recentVideoIds.add(id);
  if (recentVideoIds.size > MAX_RECENT) {
    const first = recentVideoIds.values().next().value;
    recentVideoIds.delete(first);
  }
}

// --- YouTube Data API v3 Search ---
async function searchLiveVideos(query, order, pageToken) {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    eventType: 'live',
    videoEmbeddable: 'true',
    maxResults: '25',
    order,
    key: API_KEY,
  });
  if (pageToken) params.set('pageToken', pageToken);

  const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube API error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  return { items: data.items || [], nextPageToken: data.nextPageToken || null };
}

// --- ページトークンキャッシュ（2ページ目以降へアクセスするため）---
const pageTokenCache = new Map();

// --- API Endpoint ---
app.get('/api/next-live', async (req, res) => {
  try {
    const query = generateQuery();
    const order = randomOrder();

    // 50%の確率で2ページ目を試す（キャッシュがあれば）
    let pageToken = null;
    const cacheKey = `${query}|${order}`;
    if (Math.random() < 0.5 && pageTokenCache.has(cacheKey)) {
      pageToken = pageTokenCache.get(cacheKey);
    }

    console.log(`🔍 検索: "${query}" (${order}${pageToken ? ', page2' : ''})`);

    const { items, nextPageToken } = await searchLiveVideos(query, order, pageToken);

    // 次ページトークンをキャッシュ
    if (nextPageToken) {
      pageTokenCache.set(cacheKey, nextPageToken);
    }

    // 最近表示した動画を除外
    const fresh = items.filter(item => !recentVideoIds.has(item.id.videoId));
    const candidates = fresh.length > 0 ? fresh : items;

    if (candidates.length === 0) {
      return res.json({ error: 'No live streams found', query });
    }

    // 全候補からランダムに選択（上位5件制限なし）
    const idx = Math.floor(Math.random() * candidates.length);
    const chosen = candidates[idx];

    addRecent(chosen.id.videoId);

    const result = {
      videoId: chosen.id.videoId,
      title: chosen.snippet.title,
      channel: chosen.snippet.channelTitle,
      thumbnail: chosen.snippet.thumbnails?.high?.url || '',
      query,
    };

    console.log(`📺 選択: "${result.title}" (${result.channel})`);
    res.json(result);
  } catch (err) {
    console.error('❌ エラー:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- 複数候補を返すエンドポイント ---
app.get('/api/search-live', async (req, res) => {
  try {
    const query = req.query.q || 'live camera';
    const { items } = await searchLiveVideos(query, 'viewCount');

    const results = items.map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.high?.url || '',
    }));

    res.json({ query, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Weather Location Endpoint ---
app.get('/api/weather-location', (req, res) => {
  const location = config.weather_location || {
    latitude: 35.6762,
    longitude: 139.6503,
    name: '東京',
  };
  res.json(location);
});

// --- Start ---
app.listen(PORT, () => {
  console.log('');
  console.log('┌─────────────────────────────────────────┐');
  console.log('│  🌍  Fernweh                             │');
  console.log(`│  http://localhost:${PORT}                  │`);
  console.log('│  Ctrl+C で終了                           │');
  console.log('└─────────────────────────────────────────┘');
  console.log('');
});
