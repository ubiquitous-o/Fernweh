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

  try {
    clearError();
    const data = await fetchNext();

    const nextLayerId = state.activeLayer === 'a' ? 'b' : 'a';
    const $nextLayer = getLayer(nextLayerId);

    // inactive layer に新規 YT.Player を作る（visibility:hiddenでiframeは生きてる）
    await createPlayer(nextLayerId, data.videoId);

    // intro UIを砂嵐で覆い隠す
    await new Promise(r => setTimeout(r, POST_LOAD_HOLD_MS));

    // swap visibility
    state.currentInfo = data;
    $nextLayer.classList.remove('hidden');
    $nextLayer.classList.add('visible');
    $currentLayer.classList.remove('visible');
    $currentLayer.classList.add('hidden');

    // 旧playerを破棄してdivを戻す
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

  } catch (err) {
    console.error('switchVideo error:', err);
    clearGlitch($currentLayer);
    // 消えっぱなし防止
    showOverlaysInstant();
    stopNoise();
    const delay = err.retryAfter > 0 ? err.retryAfter * 1000 : 3000;
    setTimeout(switchVideo, delay);
  } finally {
    state.isSwitching = false;
  }
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
