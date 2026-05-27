// YouTube Data API v3 のラッパー: 検索 + videos.list での説明文取得。
// クエリ生成・フィルタ条件もここに集約。
import { LOCATIONS } from './locations.js';

const API_KEY = process.env.YOUTUBE_API_KEY;

if (!API_KEY) {
  console.error('YOUTUBE_API_KEY environment variable is required');
  process.exit(1);
}

// --- Search Queries ---
export const BASE_QUERIES = [
  'live camera', 'live webcam', 'live cam', 'live stream camera',
  'live view', '24/7 live cam', 'webcam live',
];

export const TOPICS = [
  'city', 'nature', 'street', 'ocean', 'beach', 'mountain',
  'skyline', 'animal', 'wildlife', 'aurora', 'train railway',
  'airport', 'underwater', 'volcano', 'space ISS',
  'safari', 'aurora borealis', 'coral reef', 'river',
  'harbor port', 'sunset', 'countryside', 'temple shrine',
  'bridge', 'lake', 'rainforest', 'desert', 'glacier',
  'waterfall', 'castle', 'market', 'canal',
  // 地理
  'island', 'fjord', 'cliff', 'cave', 'plateau',
  // 動物
  'bird nest', 'aquarium', 'zoo', 'dolphin', 'whale',
  // 都市
  'intersection', 'plaza', 'rooftop', 'construction',
  // 交通
  'highway', 'railway station', 'ferry',
  // 自然現象
  'geyser', 'tide pool', 'storm',
];

export const SORT_ORDERS = ['viewCount', 'relevance', 'date'];

const EXCLUDE_PATTERNS = /\b(gaming|gameplay|fortnite|minecraft|gta|valorant|apex|cod|warzone|pubg|roblox|music|song|playlist|dj set|radio|podcast|talk|news|reaction|asmr|cooking|tutorial|how to|unbox|review|trailer|anime|cartoon|movie|film|episode|series|drama|vlog|mukbang|karaoke|concert|remix|GDP|population|count|アニメ|disney|ディズニー|chatvote)\b/i;
const INCLUDE_PATTERNS = /\b(cam|webcam|live cam|camera|view|skyline|beach|city|nature|street|traffic|weather|airport|harbor|port|landscape|panorama|scenic|earth|world|ocean|sea|mountain|river|lake|volcano|aurora|wildlife|animal|bird|nest|reef|ISS|space station|observatory)\b/i;

const EXCLUDE_CHANNELS = new Set([
  'Utonish',
]);

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateQuery() {
  const r = Math.random();
  if (r < 0.5) {
    // 50%: base + location (± topic)
    const base = pick(BASE_QUERIES);
    const location = pick(LOCATIONS);
    if (Math.random() < 0.5) {
      return `${base} ${pick(TOPICS)} ${location}`;
    }
    return `${base} ${location}`;
  } else if (r < 0.75) {
    // 25%: base + topic (no location)
    return `${pick(BASE_QUERIES)} ${pick(TOPICS)}`;
  } else {
    // 25%: baseなし — topic + location or location + webcam 等
    const location = pick(LOCATIONS);
    const topic = pick(TOPICS);
    const patterns = [
      `${topic} ${location} webcam`,
      `${location} ${topic} live`,
      `${location} live camera`,
      `${topic} webcam ${location}`,
    ];
    return pick(patterns);
  }
}

export async function searchLiveVideos(query, order) {
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
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube API error: ${res.status} - ${err}`);
  }
  const data = await res.json();
  return data.items || [];
}

// videoIds（任意件数）に対して50件ずつvideos.listを叩き、id→description のマップを返す
export async function fetchVideoDescriptions(videoIds) {
  const details = await fetchVideoDetails(videoIds);
  const descriptions = {};
  for (const id of Object.keys(details)) {
    descriptions[id] = details[id].description || '';
  }
  return descriptions;
}

// videoIds（任意件数）に対して50件ずつvideos.listを叩き、id→詳細メタデータのマップを返す。
// 削除済み/private な動画は API 応答に含まれないため、結果マップに存在しない=「使えない」。
// 返るフィールド: { embeddable, privacyStatus, isLive, description }
export async function fetchVideoDetails(videoIds) {
  const details = {};
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: 'snippet,status',
      id: batch.join(','),
      key: API_KEY,
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
    if (!res.ok) {
      console.warn(`videos.list error: ${res.status}`);
      continue;
    }
    const data = await res.json();
    for (const item of (data.items || [])) {
      details[item.id] = {
        embeddable: item.status?.embeddable === true,
        privacyStatus: item.status?.privacyStatus || 'unknown',
        // liveBroadcastContent: 'live' | 'upcoming' | 'none'
        // 配信終了した過去のライブは 'none' になる → これを弾く
        isLive: item.snippet?.liveBroadcastContent === 'live',
        description: item.snippet?.description || '',
      };
    }
  }
  return details;
}

// fetchVideoDetails の戻り値を判定。API応答なし(=削除/private)もNG扱い。
export function isUsableVideo(d) {
  if (!d) return false;
  if (!d.embeddable) return false;
  if (d.privacyStatus !== 'public') return false;
  if (!d.isLive) return false;
  return true;
}

// 検索結果からゲーム・音楽など非カメラ系を除外
export function filterCameraStreams(items) {
  const cameraLike = items.filter((item) => {
    const title = item.snippet.title;
    const channel = item.snippet.channelTitle;
    if (EXCLUDE_CHANNELS.has(channel)) return false;
    if (EXCLUDE_PATTERNS.test(title)) return false;
    if (INCLUDE_PATTERNS.test(title)) return true;
    return true;
  });
  return cameraLike.length > 0 ? cameraLike : items;
}
