// Shadertoy XtK3W3近似のグリッチ演出：
// SVGフィルタでターブレンスベースの水平変位 + RGBチャンネルずれを動的にアニメート。
const GLITCH_DURATION = 600;

const $turbBig = document.querySelector('#video-glitch-filter feTurbulence[result="bigNoise"]');
const $turbFine = document.querySelector('#video-glitch-filter feTurbulence[result="fineNoise"]');
const $disp = document.querySelector('#video-glitch-filter feDisplacementMap');
const $offsetR = document.querySelector('#video-glitch-filter feOffset[result="r2"]');
const $offsetB = document.querySelector('#video-glitch-filter feOffset[result="b2"]');
const $leftCopy = document.querySelector('#video-glitch-filter feOffset[result="leftCopy"]');
const $rightCopy = document.querySelector('#video-glitch-filter feOffset[result="rightCopy"]');

// 変位が画面外に出たとき、左右コピーから絵を引いてくるためにwidthぶんの dx を設定する
function updateExtendDx() {
  const w = window.innerWidth;
  $leftCopy.setAttribute('dx', -w);
  $rightCopy.setAttribute('dx', w);
}
updateExtendDx();
window.addEventListener('resize', updateExtendDx);

let glitchRAF = null;

// direction: 'up' = 0→max（前奏、砂嵐に向けて強くなる）/ 'down' = max→0（後奏、強い状態から弱まる）
function animate(startTime, direction) {
  const now = performance.now();
  const t = (now - startTime) / GLITCH_DURATION;
  if (t >= 1) {
    // 'up'は砂嵐で覆い隠されるのでフィルタ値を据え置きにする
    if (direction === 'down') {
      $disp.setAttribute('scale', 0);
      $offsetR.setAttribute('dx', 0);
      $offsetB.setAttribute('dx', 0);
    }
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

  // 大きい帯: Y freq 0.015–0.06 → 帯高さ ~16–65px
  $turbBig.setAttribute('seed', Math.floor(rand1 * 1000));
  $turbBig.setAttribute('baseFrequency', `${0.0005 + rand2 * 0.002} ${0.015 + rand3 * 0.045}`);
  // 細い帯: Y freq 0.15–0.5 → 帯高さ ~2–7px
  $turbFine.setAttribute('seed', Math.floor(rand2 * 1000));
  $turbFine.setAttribute('baseFrequency', `${0.0005 + rand3 * 0.002} ${0.15 + rand1 * 0.35}`);
  $disp.setAttribute('scale', scale);
  $offsetR.setAttribute('dx', rOff);
  $offsetB.setAttribute('dx', bOff);

  glitchRAF = requestAnimationFrame(() => animate(startTime, direction));
}

export function playGlitch(layer, direction = 'down') {
  return new Promise((resolve) => {
    if (layer) {
      layer.classList.remove('glitch');
      void layer.offsetWidth; // reflowで再アニメ
      layer.classList.add('glitch');
    }
    if (glitchRAF) cancelAnimationFrame(glitchRAF);
    animate(performance.now(), direction);

    setTimeout(() => {
      if (direction === 'down' && layer) layer.classList.remove('glitch');
      resolve();
    }, GLITCH_DURATION);
  });
}

export function clearGlitch(layer) {
  if (glitchRAF) { cancelAnimationFrame(glitchRAF); glitchRAF = null; }
  if (layer) layer.classList.remove('glitch');
  $disp.setAttribute('scale', 0);
  $offsetR.setAttribute('dx', 0);
  $offsetB.setAttribute('dx', 0);
}
