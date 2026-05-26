// 動画切替の中心ロジック：前奏グリッチ → 砂嵐 → loadVideo → ホールド → 後奏グリッチ。
import { state } from './state.js';
import { $videoLayer } from './dom.js';
import { startNoise, stopNoise } from './noise.js';
import { playGlitch, clearGlitch } from './glitch.js';
import { createPlayer, loadVideo, playerRef } from './player.js';
import { fetchNext } from './videoPool.js';
import { showInfo, showOverlays, hideLoading, clearError } from './ui.js';
import { updateGlobe } from './globe.js';
import { updateCameraTime } from './clock.js';
import { resetSwitchTimer } from './progress.js';

// YT embedがvideo切替時に必ず出すタイトル/再生ボタン/ロゴオーバーレイを覆い隠す時間。
// playerVarsだけでは完全抑制不能なので、PLAYING到達後にこの長さ砂嵐をホールド。
const POST_LOAD_HOLD_MS = 4000;

export async function switchVideo() {
  if (!state.ytApiReady || state.isSwitching) return;
  state.isSwitching = true;

  // 前奏グリッチ（既に動画再生中の場合のみ）
  if (state.currentInfo && playerRef.instance) {
    await playGlitch($videoLayer, 'up');
  }

  startNoise();

  try {
    clearError();
    const data = await fetchNext();

    if (!playerRef.instance) {
      await createPlayer(data.videoId);
    } else {
      await loadVideo(data.videoId);
    }

    await new Promise(r => setTimeout(r, POST_LOAD_HOLD_MS));

    state.currentInfo = data;
    clearGlitch($videoLayer);

    stopNoise();
    playGlitch($videoLayer, 'down');

    hideLoading();
    showInfo(data);
    showOverlays();
    updateGlobe(data.location, data.locationName);
    updateCameraTime();
    resetSwitchTimer(switchVideo);

  } catch (err) {
    console.error('switchVideo error:', err);
    // 前奏グリッチが残ったままにならないよう必ずクリーンアップ
    clearGlitch($videoLayer);
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
  try {
    await createPlayer(data.videoId);
    await new Promise(r => setTimeout(r, POST_LOAD_HOLD_MS));
    state.currentInfo = data;
    stopNoise();
    playGlitch($videoLayer, 'down');
    hideLoading();
    showInfo(data);
    showOverlays();
    updateGlobe(data.location, data.locationName);
    updateCameraTime();
    resetSwitchTimer(switchVideo);
  } catch {
    clearGlitch($videoLayer);
    switchVideo();
  } finally {
    state.isSwitching = false;
  }
}
