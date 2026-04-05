#!/usr/bin/env node

// fetch-videos.js
// YouTube Data API v3 でライブカメラ動画を検索し、public/videos.json に書き出す。
// GitHub Actions (cron) から実行される想定。
//
// Usage: YOUTUBE_API_KEY=xxx node scripts/fetch-videos.js

import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_PATH = join(__dirname, '..', 'public', 'videos.json');

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
        newVideos.push({
          videoId,
          title: item.snippet.title,
          channel: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails?.high?.url || '',
          query,
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
