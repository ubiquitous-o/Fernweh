// 情報オーバーレイ・ローディング・エラー・全画面 等のUI制御。
import { state } from './state.js';
import {
  $info, $infoTitle, $infoChannel, $clock, $liveBadge, $cameraTime,
  $loading, $error, $errorMsg, $btnInfo, $globe,
} from './dom.js';

// 砂嵐期間中にぱっと隠す対象オーバーレイ
// （時計＋天気の clock-overlay は常時表示のままにする）
const $hideableOverlays = [$liveBadge, $info, $globe, $cameraTime];

// 砂嵐開始タイミングで瞬時に非表示
export function hideOverlaysInstant() {
  $hideableOverlays.forEach((el) => el?.classList.add('noise-hidden'));
}

// 砂嵐停止タイミングで瞬時に再表示
export function showOverlaysInstant() {
  $hideableOverlays.forEach((el) => el?.classList.remove('noise-hidden'));
}

export function showInfo(data) {
  $infoChannel.textContent = data.channel || '';
  $infoTitle.textContent = data.title || '';
  $infoTitle.href = `https://www.youtube.com/watch?v=${data.videoId}`;
  $info.classList.add('show');
}

export function showOverlays() {
  $clock.classList.add('show');
  $liveBadge.classList.add('show');
  if (state.currentInfo?.timezone) $cameraTime.classList.add('show');
}

export function hideLoading() {
  $loading.classList.add('fade-out');
}

export function showError(msg) {
  $errorMsg.textContent = msg || 'Connection error';
  $error.classList.add('show');
}

export function clearError() {
  $error.classList.remove('show');
}

export function toggleFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
}

function updateFullscreenUI() {
  const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
  $btnInfo.style.display = isFS ? 'none' : '';
  $infoTitle.style.pointerEvents = isFS ? 'none' : '';
  $infoTitle.style.textDecoration = isFS ? 'none' : '';
}

document.addEventListener('fullscreenchange', updateFullscreenUI);
document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
