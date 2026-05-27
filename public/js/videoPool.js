// 動画候補プール管理：videos.jsonをロードし、視聴済みを除外、シャッフル、次の動画を返す。
import { guessLocation } from './locations.js';

const WATCHED_KEY = 'fernweh_watched';
const BLOCKED_KEY = 'fernweh_blocked'; // error 100/101/150 等の永続ブロック
const FAILURES_KEY = 'fernweh_failures'; // timeout/暫定失敗のカウント（連続N回でblocked化）
const MAX_WATCHED = 150;
const MAX_BLOCKED = 500;
const MAX_FAILURE_ENTRIES = 500; // 失敗カウンタの保持上限
const MAX_FAILURES = 2; // この回数連続で失敗したらblockedに昇格
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

function getBlocked() {
  try {
    return JSON.parse(localStorage.getItem(BLOCKED_KEY) || '[]');
  } catch { return []; }
}

// error 100(削除) / 101(embed禁止) / 150(ドメイン制限) を食らった動画を永続ブロック。
// status.embeddable=true でも実行時に失敗するケース（ドメイン制限）が videos.json に紛れる
// → 一度ハマったら以後 fetchNext で除外し続ける。
export function addBlocked(videoId) {
  if (!videoId) return;
  const blocked = getBlocked();
  if (!blocked.includes(videoId)) {
    blocked.push(videoId);
    while (blocked.length > MAX_BLOCKED) blocked.shift();
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(blocked));
  }
}

function getFailures() {
  try {
    return JSON.parse(localStorage.getItem(FAILURES_KEY) || '{}');
  } catch { return {}; }
}

function writeFailures(failures) {
  // 上限超えたら挿入順（=古い順）に削る
  const keys = Object.keys(failures);
  if (keys.length > MAX_FAILURE_ENTRIES) {
    const drop = keys.length - MAX_FAILURE_ENTRIES;
    for (let i = 0; i < drop; i++) delete failures[keys[i]];
  }
  localStorage.setItem(FAILURES_KEY, JSON.stringify(failures));
}

// タイムアウトやコード5など、暫定的な失敗を記録。MAX_FAILURES 回貯まったらblockedに昇格。
// 一過性のネットワーク不調で正常動画を誤爆しないよう、しきい値で吸収する。
export function recordFailure(videoId) {
  if (!videoId) return;
  const failures = getFailures();
  const count = (failures[videoId] || 0) + 1;
  if (count >= MAX_FAILURES) {
    delete failures[videoId];
    writeFailures(failures);
    addBlocked(videoId);
  } else {
    failures[videoId] = count;
    writeFailures(failures);
  }
}

// PLAYING 到達したら失敗カウントをリセット。
export function clearFailure(videoId) {
  if (!videoId) return;
  const failures = getFailures();
  if (failures[videoId] !== undefined) {
    delete failures[videoId];
    writeFailures(failures);
  }
}

async function loadVideoPool() {
  const res = await fetch('videos.json');
  if (!res.ok) throw new Error(`Failed to load videos.json: ${res.status}`);
  const allVideos = await res.json();

  // 視聴済み & 永続ブロックを除外
  const watched = new Set(getWatched());
  const blocked = new Set(getBlocked());
  videoPool = allVideos.filter(v => !watched.has(v.videoId) && !blocked.has(v.videoId));

  // 全部見終わったらwatchedだけリセットして再シャッフル（blockedは保持）
  if (videoPool.length === 0) {
    localStorage.removeItem(WATCHED_KEY);
    videoPool = allVideos.filter(v => !blocked.has(v.videoId));
  }

  // Fisher-Yates シャッフル
  for (let i = videoPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [videoPool[i], videoPool[j]] = [videoPool[j], videoPool[i]];
  }

  videosLoaded = true;
  lastPoolFetch = Date.now();
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
  return video;
}
