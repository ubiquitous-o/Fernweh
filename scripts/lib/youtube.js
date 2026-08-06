// YouTube Data API v3 のラッパー: 検索 + videos.list での説明文取得。
// クエリ生成・フィルタ条件もここに集約。地域レシピはregions.js。
// キーは環境変数 YOUTUBE_API_KEY → config.json youtube_api_key の順で探す
// （gemini.jsと同じ流儀。ローカル実行はconfig.jsonで足りる）。
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadApiKey() {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;
  try {
    const config = JSON.parse(readFileSync(join(__dirname, '..', '..', 'config.json'), 'utf-8'));
    if (config.youtube_api_key && !config.youtube_api_key.startsWith('YOUR_')) {
      return config.youtube_api_key;
    }
  } catch {}
  return null;
}

const API_KEY = loadApiKey();

if (!API_KEY) {
  console.error('YOUTUBE_API_KEY environment variable (or config.json youtube_api_key) is required');
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

// 英語等のNGワード（\bはASCII単語境界なのでラテン文字専用）
const EXCLUDE_PATTERNS = /\b(gaming|gameplay|fortnite|minecraft|gta|valorant|apex|cod|warzone|pubg|roblox|music|song|playlist|dj set|radio|podcast|talk|\w*news\w*|live tv|reaction|asmr|cooking|tutorial|how to|unbox|review|trailer|anime|cartoon|movie|film|episode|series|drama|vlog|mukbang|karaoke|concert|remix|GDP|population|count|disney|chatvote|room|earthquake|walking|dashboard|darshan|aarti|puja|pooja|bhajan|kirtan|satsang|masjid|salah|adhan|azan|quran|koran|worship|sermon|prayers?|rosary|church service|holy mass|santa misa|monitoring|seismic|live draw|live drawing|lotto|lottery|togel|jackpot|pcso|tracking)\b/i;
// CJKのNGワード。JSの\bはCJKで機能しない（アニメ|ディズニー を\b付きで書くと
// 絶対にマッチしない）ため、境界なしの部分一致で別パターンにする
const EXCLUDE_PATTERNS_CJK = /(アニメ|ディズニー|ゲーム|実況|作業用|ラジオ|雑談|ニュース|地震|音楽|歌ってみた|게임|뉴스|노래방|音樂|新聞|遊戲|दर्शन|आरती|पूजा|صلاة|قرآن|أذان|礼拝|航班動態|塔台通訊)/;

const EXCLUDE_CHANNELS = new Set([
  'Utonish',
]);

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 地域レシピ（regions.js）から現地語クエリを組む。
// 現地語の検索語 × 現地の地名が最も強い。英語baseやトピック混合も少し混ぜる
export function generateRegionQuery(region) {
  const r = Math.random();
  const term = pick(region.terms);
  if (r < 0.4) return `${term} ${pick(region.places)}`;
  if (r < 0.6) return term;
  if (r < 0.8) return `${pick(BASE_QUERIES)} ${pick(region.places)}`;
  return `${term} ${pick(TOPICS)}`;
}

export async function searchLiveVideos(query, order, region = null) {
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
  // 地域指定でYouTubeの関連度をその地域に寄せる
  // （未指定だと実行サーバ所在地=米国に引っ張られる）
  if (region) {
    params.set('regionCode', region.regionCode);
    params.set('relevanceLanguage', region.lang);
  }
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
  const descriptions = {};
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: 'snippet',
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
      descriptions[item.id] = item.snippet.description || '';
    }
  }
  return descriptions;
}

// 検索結果からゲーム・音楽など非カメラ系を除外
// NGワード・NGチャンネルを除外する。除外で0件になってもそのまま0件を返す
// （以前あった「全滅時は無除外で返す」フォールバックは、ゲーム配信だらけの
// 検索結果が丸ごとプール入りする穴だった）
export function filterCameraStreams(items) {
  return items.filter((item) => {
    const title = item.snippet.title;
    if (EXCLUDE_CHANNELS.has(item.snippet.channelTitle)) return false;
    if (EXCLUDE_PATTERNS.test(title)) return false;
    if (EXCLUDE_PATTERNS_CJK.test(title)) return false;
    return true;
  });
}
