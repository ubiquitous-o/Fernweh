#!/usr/bin/env node

// fetch-videos.js
// YouTube Data API v3 でライブカメラ動画を検索し、public/videos.json に書き出す。
// GitHub Actions (cron) から実行される想定。
//
// Usage: YOUTUBE_API_KEY=xxx node scripts/fetch-videos.js

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import nlp from 'compromise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_PATH = join(__dirname, '..', 'public', 'videos.json');
const GEOCACHE_PATH = join(__dirname, 'geocache.json');

const API_KEY = process.env.YOUTUBE_API_KEY;
if (!API_KEY) {
  console.error('YOUTUBE_API_KEY environment variable is required');
  process.exit(1);
}

// --- Search Queries (from server.js) ---
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

const SORT_ORDERS = ['viewCount', 'relevance', 'date'];

// --- Location coordinates for globe pin ---
const LOCATION_COORDS = {
  // LOCATIONS array cities
  'Tokyo': [35.68, 139.69], 'New York': [40.71, -74.01], 'Paris': [48.86, 2.35],
  'London': [51.51, -0.13], 'Bangkok': [13.76, 100.50], 'Dubai': [25.20, 55.27],
  'Sydney': [-33.87, 151.21], 'Rio de Janeiro': [-22.91, -43.17], 'Istanbul': [41.01, 28.98],
  'Rome': [41.90, 12.50], 'Barcelona': [41.39, 2.17], 'Amsterdam': [52.37, 4.90],
  'Seoul': [37.57, 126.98], 'Singapore': [1.35, 103.82], 'Hong Kong': [22.32, 114.17],
  'Mumbai': [19.08, 72.88], 'Cairo': [30.04, 31.24], 'Cape Town': [-33.93, 18.42],
  'Buenos Aires': [-34.60, -58.38], 'Mexico City': [19.43, -99.13],
  'Vancouver': [49.28, -123.12], 'Reykjavik': [64.15, -21.94], 'Oslo': [59.91, 10.75],
  'Helsinki': [60.17, 24.94], 'Prague': [50.08, 14.44], 'Vienna': [48.21, 16.37],
  'Zurich': [47.38, 8.54], 'Havana': [23.11, -82.37], 'Lisbon': [38.72, -9.14],
  'Athens': [37.98, 23.73], 'Santorini': [36.39, 25.46], 'Bali': [-8.34, 115.09],
  'Maldives': [3.20, 73.22], 'Hawaii': [21.31, -157.86], 'Alaska': [61.22, -149.90],
  'Norway': [59.91, 10.75], 'Iceland': [64.15, -21.94], 'Finland': [61.92, 25.75],
  'Sweden': [59.33, 18.07], 'Denmark': [55.68, 12.57], 'Germany': [52.52, 13.41],
  'France': [48.86, 2.35], 'Spain': [40.42, -3.70], 'Portugal': [38.72, -9.14],
  'Greece': [37.98, 23.73], 'Turkey': [41.01, 28.98], 'Tanzania': [-6.37, 34.89],
  'Peru': [-12.05, -77.04], 'Nepal': [27.72, 85.32],
  'New Zealand': [-41.29, 174.78], 'Scotland': [55.95, -3.19], 'Croatia': [45.81, 15.98],
  'Morocco': [33.97, -6.85], 'Vietnam': [21.03, 105.85],
  'Japan': [35.68, 139.69], 'Italy': [41.90, 12.50], 'Switzerland': [46.95, 7.45],
  'Canada': [45.42, -75.70], 'Australia': [-33.87, 151.21],
  // Common place names found in titles
  'Venice': [45.44, 12.32], 'Venice Beach': [33.99, -118.47], 'San Diego': [32.72, -117.16],
  'San Francisco': [37.77, -122.42], 'Los Angeles': [34.05, -118.24],
  'Chicago': [41.88, -87.63], 'Miami': [25.76, -80.19], 'Seattle': [47.61, -122.33],
  'Las Vegas': [36.17, -115.14], 'Washington': [38.91, -77.04],
  'Berlin': [52.52, 13.41], 'Munich': [48.14, 11.58], 'Hamburg': [53.55, 9.99],
  'Madrid': [40.42, -3.70], 'Milan': [45.46, 9.19], 'Naples': [40.85, 14.27],
  'Dublin': [53.35, -6.26], 'Edinburgh': [55.95, -3.19], 'Stockholm': [59.33, 18.07],
  'Copenhagen': [55.68, 12.57], 'Warsaw': [52.23, 21.01], 'Budapest': [47.50, 19.04],
  'Moscow': [55.76, 37.62], 'Beijing': [39.90, 116.40], 'Shanghai': [31.23, 121.47],
  'Taipei': [25.03, 121.57], 'Osaka': [34.69, 135.50], 'Kyoto': [35.01, 135.77],
  'Hokkaido': [43.06, 141.35], 'Sapporo': [43.06, 141.35], 'Okinawa': [26.34, 127.77],
  'Nagoya': [35.18, 136.91], 'Yokohama': [35.44, 139.64], 'Kobe': [34.69, 135.20],
  'Busan': [35.18, 129.08], 'Phuket': [7.88, 98.39], 'Kuala Lumpur': [3.14, 101.69],
  'Jakarta': [-6.21, 106.85], 'Manila': [14.60, 120.98], 'Hanoi': [21.03, 105.85],
  'Nairobi': [-1.29, 36.82], 'Johannesburg': [-26.20, 28.05],
  'Kruger': [-24.01, 31.49], 'Serengeti': [-2.33, 34.83],
  'Anchorage': [61.22, -149.90], 'Honolulu': [21.31, -157.86],
  'Yellowstone': [44.46, -110.83], 'Yosemite': [37.75, -119.59],
  'Niagara': [43.09, -79.07], 'Grand Canyon': [36.11, -112.11],
  'Mt. Fuji': [35.36, 138.73], 'Fuji': [35.36, 138.73], 'Fujisan': [35.36, 138.73],
  'Kilimanjaro': [-3.07, 37.35], 'Everest': [27.99, 86.93],
  'Galveston': [29.30, -94.80], 'Gatlinburg': [35.71, -83.51],
  'Monterey': [36.60, -121.89], 'Florida': [27.99, -81.76],
  'Texas': [31.97, -99.90], 'California': [36.78, -119.42],
  'Kenya': [-0.02, 37.91], 'South Africa': [-30.56, 22.94],
  'Botswana': [-22.33, 24.68], 'Namibia': [-22.96, 18.49],
  'Curacao': [12.17, -68.98], 'Jamaica': [18.11, -77.30],
  'Bahamas': [25.03, -77.40], 'Caribbean': [15.41, -61.37],
  'Thailand': [15.87, 100.99], 'Korea': [37.57, 126.98],
  'Brasov': [45.65, 25.61], 'Transylvania': [46.77, 23.60],
  'Niseko': [42.86, 140.69], 'Hakone': [35.23, 139.11],
  'Levi': [67.80, 24.81], 'Etosha': [-18.86, 16.00],
  // 主要国名
  'Russia': [55.76, 37.62], 'China': [39.90, 116.40], 'India': [28.61, 77.21],
  'Brazil': [-15.83, -47.88], 'Mexico': [19.43, -99.13], 'Argentina': [-34.60, -58.38],
  'Colombia': [4.71, -74.07], 'Chile': [-33.45, -70.67], 'Ecuador': [-0.23, -78.52],
  'Costa Rica': [9.93, -84.08], 'Panama': [8.98, -79.52],
  'United States': [38.90, -77.04], 'United Kingdom': [51.51, -0.13],
  'England': [51.51, -0.13], 'Ireland': [53.35, -6.26], 'Belgium': [50.85, 4.35],
  'Netherlands': [52.37, 4.90], 'Poland': [52.23, 21.01], 'Ukraine': [50.45, 30.52],
  'Romania': [44.43, 26.10], 'Hungary': [47.50, 19.04], 'Serbia': [44.82, 20.46],
  'Bulgaria': [42.70, 23.32], 'Austria': [48.21, 16.37], 'Slovenia': [46.06, 14.51],
  'Cyprus': [35.13, 33.43], 'Malta': [35.90, 14.51], 'Georgia': [41.72, 44.83],
  'Indonesia': [-6.21, 106.85], 'Philippines': [14.60, 120.98],
  'Malaysia': [3.14, 101.69], 'Cambodia': [11.56, 104.93], 'Myanmar': [16.87, 96.20],
  'Sri Lanka': [6.93, 79.85], 'Mongolia': [47.91, 106.90],
  'Israel': [31.77, 35.21], 'Jordan': [31.95, 35.93], 'Lebanon': [33.89, 35.50],
  'Saudi Arabia': [24.71, 46.68], 'Iran': [35.69, 51.39],
  'Egypt': [30.04, 31.24], 'Ethiopia': [-9.03, 38.75], 'Ghana': [5.55, -0.20],
  'Nigeria': [9.08, 7.40], 'Uganda': [0.35, 32.58],
  'Fiji': [-18.13, 178.06], 'Seychelles': [-4.68, 55.49], 'Mauritius': [-20.16, 57.50],
  'Madagascar': [-18.88, 47.51], 'Greenland': [64.18, -51.69],
  'Dominican Republic': [18.49, -69.93], 'Puerto Rico': [18.47, -66.11],
  'Bermuda': [32.32, -64.76], 'Tahiti': [-17.53, -149.57],
};

function extractLocationFromDict(text) {
  // Check longer names first to avoid partial matches
  const sorted = Object.keys(LOCATION_COORDS).sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      return { coords: LOCATION_COORDS[name], name };
    }
  }
  return null;
}

// --- compromise.js: 地名抽出 ---
// ライブカメラタイトルで地名と誤認されやすい語を除外
const NLP_IGNORE = new Set([
  'live', 'hd', 'cam', 'camera', 'webcam', 'stream', 'view', 'channel',
  '4k', '24/7', 'earth', 'world', 'nature', 'city', 'beach', 'sunset',
  'sunrise', 'weather', 'sky', 'panorama', 'scenic', 'beautiful',
]);

function extractPlacesNLP(text) {
  const doc = nlp(text);
  const places = doc.places().out('array');
  return places.filter(p => !NLP_IGNORE.has(p.toLowerCase()));
}

// --- Geocoding: geocache.json + Nominatim ---
let geocache = {};
try {
  if (existsSync(GEOCACHE_PATH)) {
    geocache = JSON.parse(readFileSync(GEOCACHE_PATH, 'utf-8'));
  }
} catch {
  geocache = {};
}

function saveGeocache() {
  writeFileSync(GEOCACHE_PATH, JSON.stringify(geocache, null, 2) + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geocode(placeName) {
  // キャッシュチェック
  if (geocache[placeName] !== undefined) {
    return geocache[placeName]; // null もキャッシュ（見つからなかった場所）
  }
  // Nominatim REST
  const params = new URLSearchParams({
    q: placeName,
    format: 'json',
    limit: '1',
  });
  try {
    await sleep(1100); // レート制限: 1req/秒
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
    // 見つからなかった場所もキャッシュ
    geocache[placeName] = null;
    saveGeocache();
    return null;
  } catch (err) {
    console.warn(`Nominatim request failed: ${err.message}`);
    return null;
  }
}

// --- 統合: 辞書 → compromise.js + Geocoding フォールバック ---
// 優先順位: タイトル → チャンネル名（検索クエリは使わない）
// Returns { coords: [lat, lon], name: string } or null
async function extractLocation(title, query, channel) {
  // ① タイトルから辞書マッチ（最優先）
  const titleDict = extractLocationFromDict(title);
  if (titleDict) return titleDict;

  // ② タイトルからNLP抽出 + ジオコーディング
  const titlePlaces = extractPlacesNLP(title);
  for (const place of titlePlaces) {
    if (LOCATION_COORDS[place]) return { coords: LOCATION_COORDS[place], name: place };
    const coords = await geocode(place);
    if (coords) return { coords, name: place };
  }

  // ③ チャンネル名から辞書マッチ
  if (channel) {
    const chDict = extractLocationFromDict(channel);
    if (chDict) return chDict;

    // ④ チャンネル名からNLP抽出 + ジオコーディング
    const chPlaces = extractPlacesNLP(channel);
    for (const place of chPlaces) {
      if (LOCATION_COORDS[place]) return { coords: LOCATION_COORDS[place], name: place };
      const coords = await geocode(place);
      if (coords) return { coords, name: place };
    }
  }

  return null;
}

const EXCLUDE_PATTERNS = /\b(gaming|gameplay|fortnite|minecraft|gta|valorant|apex|cod|warzone|pubg|roblox|music|song|playlist|dj set|radio|podcast|talk show|news|reaction|asmr|cooking|tutorial|how to|unbox|review|trailer|anime|cartoon|movie|film|episode|series|drama|vlog|mukbang|karaoke|concert|remix)\b/i;
const INCLUDE_PATTERNS = /\b(cam|webcam|live cam|camera|view|skyline|beach|city|nature|street|traffic|weather|airport|harbor|port|landscape|panorama|scenic|earth|world|ocean|sea|mountain|river|lake|volcano|aurora|wildlife|animal|bird|nest|reef|ISS|space station|observatory)\b/i;

// --- Helpers ---
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateQuery() {
  const base = pick(BASE_QUERIES);
  if (Math.random() < 0.7) {
    const location = pick(LOCATIONS);
    if (Math.random() < 0.5) {
      const topic = pick(TOPICS);
      return `${base} ${topic} ${location}`;
    }
    return `${base} ${location}`;
  }
  const topic = pick(TOPICS);
  return `${base} ${topic}`;
}

// --- YouTube API ---
async function searchLiveVideos(query, order) {
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

  const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube API error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  return data.items || [];
}

// --- Filter ---
function filterCameraStreams(items) {
  const cameraLike = items.filter(item => {
    const title = item.snippet.title;
    if (EXCLUDE_PATTERNS.test(title)) return false;
    if (INCLUDE_PATTERNS.test(title)) return true;
    return true;
  });
  return cameraLike.length > 0 ? cameraLike : items;
}

// --- Main ---
async function main() {
  // Load existing videos to merge
  let existing = [];
  try {
    existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
  } catch {
    // First run or corrupted file
  }

  const existingIds = new Set(existing.map(v => v.videoId));
  const newVideos = [];
  const SEARCH_COUNT = 4; // 4 searches per cron run

  for (let i = 0; i < SEARCH_COUNT; i++) {
    const query = generateQuery();
    const order = pick(SORT_ORDERS);

    try {
      const items = await searchLiveVideos(query, order);
      console.log(`[${i + 1}/${SEARCH_COUNT}] "${query}" (${order}) -> ${items.length} results`);

      const filtered = filterCameraStreams(items);
      for (const item of filtered) {
        const videoId = item.id.videoId;
        if (!videoId || existingIds.has(videoId)) continue;
        existingIds.add(videoId);
        const title = item.snippet.title;
        const channel = item.snippet.channelTitle;
        const result = await extractLocation(title, query, channel);
        newVideos.push({
          videoId,
          title,
          channel,
          thumbnail: item.snippet.thumbnails?.high?.url || '',
          query,
          location: result?.coords || null,
          locationName: result?.name || null,
          fetchedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`Search ${i + 1} failed:`, err.message);
    }
  }

  // Merge: new videos first, then existing (cap at 200 to keep file manageable)
  const merged = [...newVideos, ...existing].slice(0, 200);

  writeFileSync(OUTPUT_PATH, JSON.stringify(merged, null, 2));
  console.log(`\nDone: ${newVideos.length} new videos added, ${merged.length} total in videos.json`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
