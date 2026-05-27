// 動画切替の中心ロジック（preload方式）：
// 非アクティブレイヤーで次の動画を事前ロード → タップ時に既にPLAYING状態なら砂嵐なしで瞬間swap。
import { state } from './state.js';
import { getLayer } from './dom.js';
import { startNoise, stopNoise } from './noise.js';
import { playGlitch, clearGlitch } from './glitch.js';
import { createPlayer, destroyPlayer } from './player.js';
import { fetchNext } from './videoPool.js';
import {
  showInfo, showOverlays, hideLoading, clearError,
  hideOverlaysInstant, showOverlaysInstant,
} from './ui.js';
import { updateGlobe } from './globe.js';
import { updateCameraTime } from './clock.js';
import { resetSwitchTimer } from './progress.js';

// YT embedがvideo切替時に必ず出すタイトル/再生ボタン/ロゴオーバーレイを覆い隠す時間。
// PLAYING到達後、この秒数経つとintro UIが消えるので 'ready' とみなす。
const POST_LOAD_HOLD_MS = 4000;
// preload失敗時のリトライ間隔
const PRELOAD_RETRY_MS = 3000;
// switchVideo時にpreload失敗していたら何度試すか
const MAX_INLINE_ATTEMPTS = 3;
const INLINE_RETRY_DELAY_MS = 500;

// --- preload: 非アクティブレイヤーに次の動画を事前ロード ---

function resetPreload() {
  if (state.preload.readyTimerId) {
    clearTimeout(state.preload.readyTimerId);
  }
  state.preload = {
    layerId: null,
    data: null,
    status: 'idle',
    playingAt: 0,
    readyTimerId: null,
  };
}

export async function startPreload() {
  // 既に進行中なら何もしない
  if (state.preload.status === 'loading'
    || state.preload.status === 'playing'
    || state.preload.status === 'ready') {
    return;
  }

  const inactiveLayer = state.activeLayer === 'a' ? 'b' : 'a';
  state.preload = {
    layerId: inactiveLayer,
    data: null,
    status: 'loading',
    playingAt: 0,
    readyTimerId: null,
  };

  try {
    const data = await fetchNext();
    state.preload.data = data;
    await createPlayer(inactiveLayer, data.videoId);

    // PLAYING到達。POST_LOAD_HOLD_MS後にintro UIが消えるので 'ready' に
    state.preload.playingAt = performance.now();
    state.preload.status = 'playing';
    state.preload.readyTimerId = setTimeout(() => {
      if (state.preload.status === 'playing') {
        state.preload.status = 'ready';
        state.preload.readyTimerId = null;
      }
    }, POST_LOAD_HOLD_MS);
  } catch (err) {
    console.warn('preload failed:', err?.message || err);
    destroyPlayer(inactiveLayer);
    state.preload.status = 'failed';
    // しばらく待ってからリトライ
    setTimeout(() => {
      if (state.preload.status === 'failed') {
        resetPreload();
        startPreload();
      }
    }, PRELOAD_RETRY_MS);
  }
}

// --- 実際のレイヤー切替（共通処理） ---

function performSwap() {
  const nextLayerId = state.preload.layerId;
  const data = state.preload.data;
  const $nextLayer = getLayer(nextLayerId);
  const oldLayerId = state.activeLayer;
  const $currentLayer = getLayer(oldLayerId);

  // 表示切替
  $nextLayer.classList.remove('hidden');
  $nextLayer.classList.add('visible');
  $currentLayer.classList.remove('visible');
  $currentLayer.classList.add('hidden');

  // 旧player破棄
  destroyPlayer(oldLayerId);
  clearGlitch($currentLayer);

  state.activeLayer = nextLayerId;
  state.currentInfo = data;

  // preloadは消費したのでリセット（タイマーはperformSwapで解放）
  if (state.preload.readyTimerId) {
    clearTimeout(state.preload.readyTimerId);
  }
  state.preload = {
    layerId: null,
    data: null,
    status: 'idle',
    playingAt: 0,
    readyTimerId: null,
  };

  // 後処理UI
  hideLoading();
  showInfo(data);
  showOverlays();
  updateGlobe(data.location, data.locationName);
  updateCameraTime();
  resetSwitchTimer(switchVideo);

  // 次のpreloadを即キック
  startPreload();
}

// preloadが 'ready' になるまで待つ。失敗時はリロード試行して結果を返す。
async function waitForPreloadReady() {
  const startWait = performance.now();
  const MAX_WAIT_MS = 30000; // 全体タイムアウト

  while (true) {
    const s = state.preload.status;
    if (s === 'ready') return true;
    if (s === 'playing') {
      // 残りホールド時間 = POST_LOAD_HOLD_MS - 経過時間
      const elapsed = performance.now() - state.preload.playingAt;
      const remaining = POST_LOAD_HOLD_MS - elapsed;
      if (remaining <= 0) {
        state.preload.status = 'ready';
        return true;
      }
      await new Promise((r) => setTimeout(r, Math.min(remaining + 50, 1000)));
      continue;
    }
    if (s === 'failed' || s === 'idle') {
      // 失敗 or 未開始 → リトライ
      resetPreload();
      await startPreload();
      // startPreload内でstatus更新されたはず
      if (state.preload.status === 'loading') {
        // 進行中：少し待ってチェック
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (performance.now() - startWait > MAX_WAIT_MS) {
      return false;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

// --- メインの動画切替 ---

export async function switchVideo() {
  if (!state.ytApiReady || state.isSwitching) return;
  state.isSwitching = true;

  const $currentLayer = getLayer(state.activeLayer);

  // 前奏グリッチ（playerがある＝動画再生中の場合のみ）
  if (state.currentInfo) {
    await playGlitch($currentLayer, 'up');
  }

  hideOverlaysInstant();
  clearError();

  // preloadが 'ready' なら砂嵐スキップで即swap
  if (state.preload.status === 'ready') {
    performSwap();
    playGlitch(getLayer(state.activeLayer), 'down');
    showOverlaysInstant();
    state.isSwitching = false;
    return;
  }

  // 'ready' でない → 砂嵐表示しながら preloadが ready になるのを待つ
  startNoise();
  const success = await waitForPreloadReady();

  if (!success) {
    // 全リトライ失敗：古い状態に戻す
    console.error('switchVideo: preload not ready after retries');
    clearGlitch($currentLayer);
    showOverlaysInstant();
    stopNoise();
    state.isSwitching = false;
    setTimeout(switchVideo, 5000);
    return;
  }

  performSwap();
  stopNoise();
  showOverlaysInstant();
  playGlitch(getLayer(state.activeLayer), 'down');
  state.isSwitching = false;
}

// --- 初回起動 / resumeVideo: preloadなしから始める ---

// 1動画を直接アクティブレイヤーにロード（preload経由ではない）
async function loadInitial(data) {
  state.isSwitching = true;
  hideOverlaysInstant();
  startNoise();

  const layerId = state.activeLayer;
  const $layer = getLayer(layerId);

  let success = false;
  for (let attempt = 1; attempt <= MAX_INLINE_ATTEMPTS; attempt++) {
    try {
      await createPlayer(layerId, data.videoId);
      success = true;
      break;
    } catch (err) {
      console.warn(`loadInitial attempt ${attempt} failed:`, err?.message || err);
      destroyPlayer(layerId);
      if (attempt < MAX_INLINE_ATTEMPTS) {
        // 別動画で再挑戦
        try { data = await fetchNext(); } catch {}
        await new Promise((r) => setTimeout(r, INLINE_RETRY_DELAY_MS));
      }
    }
  }

  if (!success) {
    state.isSwitching = false;
    setTimeout(switchVideo, 5000);
    return;
  }

  await new Promise((r) => setTimeout(r, POST_LOAD_HOLD_MS));

  state.currentInfo = data;
  $layer.classList.remove('hidden');
  $layer.classList.add('visible');
  stopNoise();
  showOverlaysInstant();
  playGlitch($layer, 'down');

  hideLoading();
  showInfo(data);
  showOverlays();
  updateGlobe(data.location, data.locationName);
  updateCameraTime();
  resetSwitchTimer(switchVideo);

  state.isSwitching = false;

  // 初回ロード成功後、次の動画をpreload
  startPreload();
}

export async function resumeVideo(data) {
  await loadInitial(data);
}

// 初回起動: switchVideo が呼ばれたとき currentInfo === null なら初回扱い
// main.jsから onYouTubeIframeAPIReady で呼ばれる
export async function initialSwitch() {
  let data;
  try {
    data = await fetchNext();
  } catch (err) {
    console.error('Initial fetchNext failed:', err);
    setTimeout(initialSwitch, 5000);
    return;
  }
  await loadInitial(data);
}
