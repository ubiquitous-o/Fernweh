// 動画候補プール管理：videos.jsonをロードし、視聴済みを除外、シャッフル、次の動画を返す。
import { guessLocation } from './locations.js';

const WATCHED_KEY = 'fernweh_watched';
const MAX_WATCHED = 150;
const POOL_REFRESH_INTERVAL = 2 * 60 * 60 * 1000; // 2時間（サーバ更新間隔に合わせる）

let videoPool = [];
let videosLoaded = false;
let lastPoolFetch = 0;

function getWatched() {
  try {
    return JSON.parse(localStorage.getItem(WATCHED_KEY) || '[]');
  } catch { return []; }
}

function addWatched(videoId) {
  const watched = getWatched();
  if (!watched.includes(videoId)) {
    watched.push(videoId);
    while (watched.length > MAX_WATCHED) watched.shift();
    localStorage.setItem(WATCHED_KEY, JSON.stringify(watched));
  }
}

async function loadVideoPool() {
  const res = await fetch('videos.json');
  if (!res.ok) throw new Error(`Failed to load videos.json: ${res.status}`);
  const allVideos = await res.json();

  // 視聴済みを除外
  const watched = new Set(getWatched());
  videoPool = allVideos.filter(v => !watched.has(v.videoId));

  // 全部見終わったらリセットして再シャッフル
  if (videoPool.length === 0) {
    localStorage.removeItem(WATCHED_KEY);
    videoPool = [...allVideos];
  }

  // Fisher-Yates シャッフル
  for (let i = videoPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [videoPool[i], videoPool[j]] = [videoPool[j], videoPool[i]];
  }

  videosLoaded = true;
  lastPoolFetch = Date.now();
}

// 動作確認用: URL に ?test=unknown を付けて開くと、すべての映像を「場所不明」として扱う
// （光の柱を立てずに降りる動きや「Destination unknown」「Location unknown」の表示を確かめるため）
const TEST_UNKNOWN_LOCATION = new URLSearchParams(window.location.search).get('test') === 'unknown';
// 映像の情報に、動作確認用の上書きをかける（ふだんは何もしない）。
// 次の映像を取るとき（fetchNext）と、リロードで前の映像を再開するとき（main.js）の両方で通す
export function withTestOverrides(video) {
  return TEST_UNKNOWN_LOCATION ? { ...video, location: null, locationName: null } : video;
}

export async function fetchNext() {
  const poolStale = Date.now() - lastPoolFetch > POOL_REFRESH_INTERVAL;
  if (!videosLoaded || videoPool.length === 0 || poolStale) {
    await loadVideoPool();
  }
  if (videoPool.length === 0) {
    throw new Error('No videos available in videos.json');
  }
  const video = videoPool.shift();
  addWatched(video.videoId);
  // 場所情報が未設定ならランタイムで推測
  if (!video.location) {
    const guess = guessLocation(video.title, video.channel);
    if (guess) {
      video.location = guess.coords;
      video.locationName = guess.name;
    }
  }
  return withTestOverrides(video);
}
