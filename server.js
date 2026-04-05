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
  console.error('⚠  config.json not found. Copy config.example.json and set your API key');
  process.exit(1);
}

const API_KEY = config.youtube_api_key;
const PORT = config.port || 3333;

if (!API_KEY || API_KEY === 'YOUR_YOUTUBE_DATA_API_V3_KEY_HERE') {
  console.error('⚠  Set your YouTube Data API v3 key in config.json');
  process.exit(1);
}

const app = express();
app.use(express.static(join(__dirname, 'public')));

// --- Search Queries ---
// Combine base queries x topics x locations for variety
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

// Generate a random search query
function generateQuery() {
  const base = BASE_QUERIES[Math.floor(Math.random() * BASE_QUERIES.length)];
  // 70% chance to include a location, 30% topic only
  if (Math.random() < 0.7) {
    const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    // 50% chance to also include a topic
    if (Math.random() < 0.5) {
      const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
      return `${base} ${topic} ${location}`;
    }
    return `${base} ${location}`;
  }
  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  return `${base} ${topic}`;
}

// Randomize sort order
const SORT_ORDERS = ['viewCount', 'relevance', 'date'];

function randomOrder() {
  return SORT_ORDERS[Math.floor(Math.random() * SORT_ORDERS.length)];
}

// Track recent video IDs to avoid duplicates
const recentVideoIds = new Set();
const MAX_RECENT = 50;

function addRecent(id) {
  recentVideoIds.add(id);
  if (recentVideoIds.size > MAX_RECENT) {
    const first = recentVideoIds.values().next().value;
    recentVideoIds.delete(first);
  }
}

// --- Quota tracking ---
let quotaExceeded = false;
let quotaResumeTime = 0;

// --- YouTube Data API v3 Search ---
async function searchLiveVideos(query, order, pageToken) {
  if (quotaExceeded && Date.now() < quotaResumeTime) {
    const waitMin = Math.ceil((quotaResumeTime - Date.now()) / 60000);
    throw new Error(`Quota exceeded. Retry in ${waitMin} min`);
  }

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
    if (res.status === 403) {
      quotaExceeded = true;
      quotaResumeTime = Date.now() + 60 * 60 * 1000; // Wait 1 hour
      console.error('⚠️  Quota exceeded. Pausing API calls for 1 hour.');
      throw new Error('Quota exceeded. Pausing for 1 hour');
    }
    const err = await res.text();
    throw new Error(`YouTube API error: ${res.status} - ${err}`);
  }

  // Quota is fine, reset flag
  quotaExceeded = false;
  const data = await res.json();
  return { items: data.items || [], nextPageToken: data.nextPageToken || null };
}

// --- Page token cache (for accessing page 2+) ---
const pageTokenCache = new Map();

// --- Candidate pool (avoid new API calls on playback failures) ---
let candidatePool = [];
let lastQuery = '';

async function fillCandidatePool() {
  const query = generateQuery();
  const order = randomOrder();

  let pageToken = null;
  const cacheKey = `${query}|${order}`;
  if (Math.random() < 0.5 && pageTokenCache.has(cacheKey)) {
    pageToken = pageTokenCache.get(cacheKey);
  }

  const { items, nextPageToken } = await searchLiveVideos(query, order, pageToken);

  console.log(`🔍 Search: "${query}" (${order}${pageToken ? ', page2' : ''}) → ${items.length} results`);

  if (nextPageToken) {
    pageTokenCache.set(cacheKey, nextPageToken);
  }

  // Filter out non-camera streams (gaming, music, talk shows, etc.)
  const EXCLUDE_PATTERNS = /\b(gaming|gameplay|fortnite|minecraft|gta|valorant|apex|cod|warzone|pubg|roblox|music|song|playlist|dj set|radio|podcast|talk show|news|reaction|asmr|cooking|tutorial|how to|unbox|review|trailer|anime|cartoon|movie|film|episode|series|drama|vlog|mukbang|karaoke|concert|remix)\b/i;
  const INCLUDE_PATTERNS = /\b(cam|webcam|live cam|camera|view|skyline|beach|city|nature|street|traffic|weather|airport|harbor|port|landscape|panorama|scenic|earth|world|ocean|sea|mountain|river|lake|volcano|aurora|wildlife|animal|bird|nest|reef|ISS|space station|observatory)\b/i;

  const cameraLike = items.filter(item => {
    const title = item.snippet.title;
    if (EXCLUDE_PATTERNS.test(title)) return false;
    if (INCLUDE_PATTERNS.test(title)) return true;
    // Allow if title doesn't match either pattern (might still be a camera)
    return true;
  });

  // Exclude recently shown videos
  const pool = cameraLike.length > 0 ? cameraLike : items;
  const fresh = pool.filter(item => !recentVideoIds.has(item.id.videoId));
  candidatePool = fresh.length > 0 ? fresh : pool;
  lastQuery = query;

  // Shuffle for variety
  for (let i = candidatePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidatePool[i], candidatePool[j]] = [candidatePool[j], candidatePool[i]];
  }
}

// --- API Endpoint ---
app.get('/api/next-live', async (req, res) => {
  try {
    // Only call API when pool is empty
    if (candidatePool.length === 0) {
      await fillCandidatePool();
    }

    if (candidatePool.length === 0) {
      return res.json({ error: 'No live streams found', query: lastQuery });
    }

    // Pop one candidate from the pool (no new API call needed)
    const chosen = candidatePool.shift();

    addRecent(chosen.id.videoId);

    const result = {
      videoId: chosen.id.videoId,
      title: chosen.snippet.title,
      channel: chosen.snippet.channelTitle,
      thumbnail: chosen.snippet.thumbnails?.high?.url || '',
      query: lastQuery,
    };

    console.log(`📺 Selected: "${result.title}" (${result.channel}) [${candidatePool.length} remaining]`);
    res.json(result);
  } catch (err) {
    const isQuota = quotaExceeded;
    if (!isQuota) console.error('❌ Error:', err.message);
    const retryAfter = isQuota ? Math.ceil((quotaResumeTime - Date.now()) / 1000) : 0;
    res.status(isQuota ? 429 : 500).json({ error: err.message, retryAfter });
  }
});

// --- Search endpoint (returns multiple candidates) ---
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

// --- Start ---
app.listen(PORT, () => {
  console.log('');
  console.log('┌─────────────────────────────────────────┐');
  console.log('│  🌍  Fernweh                             │');
  console.log(`│  http://localhost:${PORT}                  │`);
  console.log('│  Ctrl+C to quit                          │');
  console.log('└─────────────────────────────────────────┘');
  console.log('');
});
