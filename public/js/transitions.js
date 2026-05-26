// 動画切替の中心ロジック（2レイヤーcrossfade）：
// 前奏グリッチ → 砂嵐 → inactive layerに新player → 4秒ホールド（intro UIマスク）→ swap → 後奏グリッチ
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
// playerVarsだけでは完全抑制不能なので、PLAYING到達後にこの長さ砂嵐をホールド。
const POST_LOAD_HOLD_MS = 4000;

export async function switchVideo() {
  if (!state.ytApiReady || state.isSwitching) return;
  state.isSwitching = true;

  const $currentLayer = getLayer(state.activeLayer);

  // 動画グリッチ → 砂嵐と同時にオーバーレイを瞬時に非表示
  if (state.currentInfo) {
    await playGlitch($currentLayer, 'up');
  }

  hideOverlaysInstant();
  startNoise();
  clearError();

  // 動画ロード失敗時は砂嵐を維持したまま次の動画を試す（古い動画には戻さない）
  const MAX_ATTEMPTS = 3; // 諦めを早く（累積砂嵐時間短縮）
  const RETRY_DELAY_MS = 500;
  let nextLayerId = state.activeLayer === 'a' ? 'b' : 'a';
  let $nextLayer = getLayer(nextLayerId);
  let data = null;
  let success = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      data = await fetchNext();
      await createPlayer(nextLayerId, data.videoId);
      success = true;
      break;
    } catch (err) {
      console.warn(`switchVideo attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err?.message || err);
      // 失敗したplayerをクリーンアップして次の動画を試す
      destroyPlayer(nextLayerId);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  if (!success) {
    // 全試行失敗：古い状態に戻す
    console.error('switchVideo: all attempts failed, restoring previous state');
    clearGlitch($currentLayer);
    showOverlaysInstant();
    stopNoise();
    state.isSwitching = false;
    setTimeout(switchVideo, 5000); // しばらく待ってからもう一度
    return;
  }

  // 成功：intro UIを砂嵐で覆い隠す
  await new Promise(r => setTimeout(r, POST_LOAD_HOLD_MS));

  // swap visibility
  state.currentInfo = data;
  $nextLayer.classList.remove('hidden');
  $nextLayer.classList.add('visible');
  $currentLayer.classList.remove('visible');
  $currentLayer.classList.add('hidden');

  const oldLayerId = state.activeLayer;
  destroyPlayer(oldLayerId);
  clearGlitch($currentLayer);

  state.activeLayer = nextLayerId;

  stopNoise();
  showOverlaysInstant();
  playGlitch($nextLayer, 'down');

  hideLoading();
  showInfo(data);
  showOverlays();
  updateGlobe(data.location, data.locationName);
  updateCameraTime();
  resetSwitchTimer(switchVideo);

  state.isSwitching = false;
}

export async function resumeVideo(data) {
  state.isSwitching = true;
  startNoise();
  const layerId = state.activeLayer;
  const $layer = getLayer(layerId);
  try {
    await createPlayer(layerId, data.videoId);
    await new Promise(r => setTimeout(r, POST_LOAD_HOLD_MS));
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
  } catch {
    clearGlitch($layer);
    showOverlaysInstant();
    switchVideo();
  } finally {
    state.isSwitching = false;
  }
}
