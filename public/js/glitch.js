// Shadertoy XtK3W3近似のグリッチ演出：
// SVGフィルタで水平変位 + RGBチャンネルずれを動的にアニメート。
// feTurbulenceはモバイルで重いので、WebGLで生成したノイズをfeImageで供給する。
import { renderGlitchNoise, glitchNoiseCanvas } from './glitchNoise.js';

const GLITCH_DURATION = 600;

const $disp = document.querySelector('#video-glitch-filter feDisplacementMap');
const $offsetR = document.querySelector('#video-glitch-filter feOffset[result="r2"]');
const $offsetB = document.querySelector('#video-glitch-filter feOffset[result="b2"]');
const $leftCopy = document.querySelector('#video-glitch-filter feOffset[result="leftCopy"]');
const $rightCopy = document.querySelector('#video-glitch-filter feOffset[result="rightCopy"]');
const $feImage = document.querySelector('#video-glitch-filter feImage');
const $videoFrame = document.getElementById('video-frame');

// ノイズ更新スロットル: 50msに1回まで
const NOISE_UPDATE_INTERVAL_MS = 50;

// ハーフタイリング: 半幅シフトで右半分→左側 / 左半分→右側 のラップを作る
function updateExtendDx() {
  const halfW = ($videoFrame.clientWidth || window.innerWidth) / 2;
  $leftCopy.setAttribute('dx', -halfW);
  $rightCopy.setAttribute('dx', halfW);
}
updateExtendDx();
window.addEventListener('resize', updateExtendDx);

// WebGL noise canvas → blob URL → feImage の連携
let pendingBlob = false;
let lastBlobUrl = null;

function pushNoiseToFeImage() {
  if (pendingBlob) return; // エンコーダー詰まりを避ける
  pendingBlob = true;
  glitchNoiseCanvas.toBlob((blob) => {
    pendingBlob = false;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const prev = lastBlobUrl;
    lastBlobUrl = url;
    $feImage.setAttribute('href', url);
    // 古いblob URLを解放
    if (prev) URL.revokeObjectURL(prev);
  });
}

let glitchRAF = null;
let glitchTimeout = null;
let lastNoiseUpdate = 0;

function resetFilterAttrs() {
  $disp.setAttribute('scale', 0);
  $offsetR.setAttribute('dx', 0);
  $offsetB.setAttribute('dx', 0);
}

// direction: 'up' = 0→max（前奏、砂嵐に向けて強くなる）/ 'down' = max→0（後奏、強い状態から弱まる）
function animate(startTime, direction) {
  const now = performance.now();
  const t = (now - startTime) / GLITCH_DURATION;
  if (t >= 1) {
    if (direction === 'down') resetFilterAttrs();
    glitchRAF = null;
    return;
  }
  // 非対称エンベロープ：up = ease-in (t^2)、down = ease-out (1-t)^2
  const env = direction === 'up' ? t * t : (1 - t) * (1 - t);

  // 20msごとに新しい乱数（高速ジッター）
  const step = Math.floor(t * (GLITCH_DURATION / 20));
  const fract = (x) => x - Math.floor(x);
  const rand1 = fract(Math.sin(step * 12.9898) * 43758.5453);
  const rand2 = fract(Math.sin(step * 78.233 + 1.7) * 43758.5453);
  const rand3 = fract(Math.sin(step * 39.346 + 4.1) * 43758.5453);

  const scale = (400 + rand1 * 1800) * env;
  const rOff = (rand2 - 0.5) * 800 * env;
  const bOff = (rand3 - 0.5) * 800 * env;

  // WebGLでノイズを再生成 → feImageへ（50msに1回までスロットル）
  if (now - lastNoiseUpdate >= NOISE_UPDATE_INTERVAL_MS) {
    lastNoiseUpdate = now;
    const freqBigY = 15 + rand3 * 30;
    const freqFineY = 100 + rand1 * 150;
    renderGlitchNoise(rand1 * 1000, rand2 * 1000, freqBigY, freqFineY);
    pushNoiseToFeImage();
  }

  $disp.setAttribute('scale', scale);
  $offsetR.setAttribute('dx', rOff);
  $offsetB.setAttribute('dx', bOff);

  glitchRAF = requestAnimationFrame(() => animate(startTime, direction));
}

export function playGlitch(layer, direction = 'down') {
  return new Promise((resolve) => {
    // 前回のRAF・終了タイマーを必ず止める
    if (glitchRAF) { cancelAnimationFrame(glitchRAF); glitchRAF = null; }
    if (glitchTimeout) { clearTimeout(glitchTimeout); glitchTimeout = null; }

    if (layer) {
      layer.classList.remove('glitch');
      void layer.offsetWidth; // reflowで再アニメ
      layer.classList.add('glitch');
    }
    lastNoiseUpdate = 0; // 新しいglitchは初回からノイズ更新
    animate(performance.now(), direction);

    glitchTimeout = setTimeout(() => {
      glitchTimeout = null;
      if (direction === 'down' && layer) layer.classList.remove('glitch');
      resolve();
    }, GLITCH_DURATION);
  });
}

export function clearGlitch(layer) {
  if (glitchRAF) { cancelAnimationFrame(glitchRAF); glitchRAF = null; }
  if (glitchTimeout) { clearTimeout(glitchTimeout); glitchTimeout = null; }
  if (layer) layer.classList.remove('glitch');
  resetFilterAttrs();
}
