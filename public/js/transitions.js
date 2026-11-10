// 動画切替の中心ロジック（preload方式）：
// 非アクティブレイヤーで次の動画を事前ロードしておき、切替時は軌道ビューの幕（orbit.js）で
// 「今の場所から軌道へ上昇 → 次のカメラの場所へ飛び込む」演出を挟んでswapする。
import { state } from './state.js';
import { getLayer } from './dom.js';
import {
  showOrbit, hideOrbit, ascend, raiseBeam, diveTo, diveBack, DIVE_MS, BEAM_LEAD_MS,
} from './orbit.js';
import { playGlitch, clearGlitch } from './glitch.js';
import { createPlayer, destroyPlayer } from './player.js';
import { fetchNext } from './videoPool.js';
import {
  showInfo, showOverlays, hideLoading, showSearching, showLocked, showCrashing, clearError,
  hideOverlaysInstant, showOverlaysInstant,
} from './ui.js';
import { updateGlobe } from './globe.js';
import { updateCameraTime } from './clock.js';
import { resetSwitchTimer, holdSwitchTimer } from './progress.js';

// YT embedがvideo切替時に必ず出すタイトル/再生ボタン/ロゴオーバーレイを覆い隠す時間。
// PLAYING到達後、この秒数経つとintro UIが消えるので 'ready' とみなす。
const POST_LOAD_HOLD_MS = 3700;
// preload失敗時のリトライ間隔
const PRELOAD_RETRY_MS = 3000;
// switchVideo時にpreload失敗していたら何度試すか
const MAX_INLINE_ATTEMPTS = 3;
const INLINE_RETRY_DELAY_MS = 500;
// 場所の分からない映像のとき、行き先を失った警報（Navigation error）を出してから
// 墜落（System failure）が始まるまでを、ふつうの「柱が立ってから飛び込むまで」よりこれだけ長くする
const ERROR_HOLD_MS = 1000;

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
  // 進捗バーを0に戻し、次の映像が出るまで数えるのを止める（出たら performSwap が数え始める）
  holdSwitchTimer();

  const $currentLayer = getLayer(state.activeLayer);
  const fromInfo = state.currentInfo;

  hideOverlaysInstant();
  clearError();

  // 映像を再生中なら、前奏グリッチの開始と同時に軌道ビューの幕を重ね始める。
  // 映像はグリッチしながら光の柱の白に溶け、そのあとカメラが柱からまっすぐ引いて軌道へ戻る。
  // 映像が無ければ、軌道から地球を眺めるだけ
  let leaving;
  if (fromInfo) {
    const glitching = playGlitch($currentLayer, 'up');
    leaving = ascend();
    // 映像が光に覆われたら、目的地を探している表示を出す
    leaving.covered.then(showSearching);
    // グリッチが終わり幕が覆いきったら解除（幕の裏でフィルタを回し続けない）
    Promise.all([glitching, leaving.covered]).then(() => clearGlitch($currentLayer));
  } else {
    showOrbit();
    showSearching();
    leaving = { done: Promise.resolve() };
  }

  // 軌道へ戻るあいだに preload が ready になるのを待つ（未readyなら軌道を回りながら待つ）
  const [success] = await Promise.all([waitForPreloadReady(), leaving.done]);

  if (!success) {
    // 全リトライ失敗：元の場所へ戻る
    console.error('switchVideo: preload not ready after retries');
    if (fromInfo) {
      await diveBack();
      hideLoading();
      hideOrbit();
      showOverlaysInstant();
      playGlitch($currentLayer, 'down');
    }
    state.isSwitching = false;
    setTimeout(switchVideo, 5000);
    return;
  }

  // 軌道を回ったまま、次のカメラの場所に光の柱が立ち上がる → 少し間をおいて飛び込む
  // → 柱の中に入った瞬間に切替え、グリッチで映像を出す。
  // 場所の分からない映像のときは柱は立たず、きりもみで回りながら、どこかの陸地へ墜落する（orbit.js）
  const spot = raiseBeam(state.preload.data.location);
  showLocked(state.preload.data.locationName, Array.isArray(state.preload.data.location));
  await new Promise((r) => setTimeout(r, BEAM_LEAD_MS + (spot ? 0 : ERROR_HOLD_MS)));
  if (!spot) showCrashing();
  await diveTo(spot);
  performSwap();
  hideOrbit();
  showOverlaysInstant();
  playGlitch(getLayer(state.activeLayer), 'down');
  state.isSwitching = false;
}

// --- 初回起動 / resumeVideo: preloadなしから始める ---

// 1動画を直接アクティブレイヤーにロード（preload経由ではない）
async function loadInitial(data) {
  state.isSwitching = true;
  hideOverlaysInstant();
  showOrbit();
  showSearching();

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

  // 映像が決まった → YTのintro UIが消えるのを待つ。待ち時間の最後を
  // 「軌道を回ったまま光の柱が立ち上がる → 少し間をおく → 飛び込む」に充てる
  await new Promise((r) => setTimeout(r, Math.max(0, POST_LOAD_HOLD_MS - BEAM_LEAD_MS - DIVE_MS)));
  const spot = raiseBeam(data.location);
  showLocked(data.locationName, Array.isArray(data.location));
  await new Promise((r) => setTimeout(r, BEAM_LEAD_MS + (spot ? 0 : ERROR_HOLD_MS)));
  if (!spot) showCrashing();
  await diveTo(spot);

  state.currentInfo = data;
  $layer.classList.remove('hidden');
  $layer.classList.add('visible');
  hideOrbit();
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
