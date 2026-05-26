// COBEで3Dグローブを描画。動画切替ごとに位置ピン+ラベルを更新。
import { $globe, $globeLabel, globeRef } from './dom.js';
import { repositionCameraTime } from './clock.js';

const GLOBE_THETA = 0.15; // 固定の微チルト — 北極を上に保つ

let globeInstance = null;
let createGlobeFn = null;

// COBEをESMでプリロード
import('https://esm.sh/cobe@0.6.3')
  .then(m => { createGlobeFn = m.default; })
  .catch(e => console.warn('Globe library failed to load:', e));

function getDisplaySize() {
  return $globe.offsetWidth;
}

export function updateGlobe(location, locationName) {
  if (!createGlobeFn) return;

  // 古いインスタンス破棄 + WebGLコンテキスト明示解放
  if (globeInstance) {
    globeInstance.destroy();
    globeInstance = null;
  }
  const oldGl = globeRef.canvas.getContext('webgl');
  if (oldGl) {
    const ext = oldGl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  }
  const freshCanvas = document.createElement('canvas');
  globeRef.canvas.replaceWith(freshCanvas);
  globeRef.canvas = freshCanvas;

  const hasLocation = location && Array.isArray(location);
  const markers = hasLocation ? [{ location, size: 0.08 }] : [];

  const displaySize = getDisplaySize();
  const radius = displaySize / 2;

  // ラベル表示
  if (hasLocation && locationName) {
    $globeLabel.textContent = locationName.replace(/,\s*/g, '\n');
    const maxLineLen = locationName.split(/,\s*/).reduce((m, s) => Math.max(m, s.length), 0);
    const scale = displaySize / 225;
    const base = maxLineLen > 22 ? 14 : maxLineLen > 18 ? 17 : 20;
    $globeLabel.style.fontSize = (base * scale) + 'px';
    $globeLabel.classList.add('show');
    $globeLabel.style.left = '';
    $globeLabel.style.top = '';
    $globeLabel.style.opacity = '';
    $globeLabel.style.transform = 'translate(-50%, -100%)';
    $globeLabel.style.textAlign = '';
  } else if (!hasLocation) {
    $globeLabel.innerHTML = 'Location<br>unknown';
    $globeLabel.classList.add('show');
    // 地球の中央に固定表示
    $globeLabel.style.left = '50%';
    $globeLabel.style.top = '50%';
    $globeLabel.style.opacity = '1';
    $globeLabel.style.transform = 'translate(-50%, -50%)';
    $globeLabel.style.textAlign = 'center';
  } else {
    $globeLabel.textContent = '';
    $globeLabel.classList.remove('show');
    $globeLabel.style.left = '';
    $globeLabel.style.top = '';
    $globeLabel.style.opacity = '';
  }

  let currentPhi;
  let onRender;

  // ピンの2Dスクリーン座標を計算してラベルを配置
  const labelOffset = displaySize * (16 / 225);
  function updateLabelPosition(phi, theta) {
    if (!hasLocation || !locationName) return;
    const [lat, lon] = location;
    const latRad = lat * (Math.PI / 180);
    const lonRad = lon * (Math.PI / 180);
    // COBE座標系: phi + lon + PI/2 が水平角
    const angle = lonRad + phi + Math.PI / 2;
    const x1 = Math.cos(latRad) * Math.sin(angle);
    const y0 = Math.sin(latRad);
    const z1 = Math.cos(latRad) * Math.cos(angle);
    // theta回転（X軸）
    const y2 = y0 * Math.cos(theta) - z1 * Math.sin(theta);
    const z2 = y0 * Math.sin(theta) + z1 * Math.cos(theta);
    // 可視判定（手前側のみ）
    if (z2 < 0.2) {
      $globeLabel.style.opacity = '0';
      return;
    }
    const sx = radius + x1 * radius;
    const sy = radius - y2 * radius;
    $globeLabel.style.left = sx + 'px';
    if (lat >= 0) {
      // 北半球: ピンの上にラベル
      $globeLabel.style.top = (sy - labelOffset) + 'px';
      $globeLabel.style.transform = 'translate(-50%, -100%)';
    } else {
      // 南半球: ピンの下にラベル
      $globeLabel.style.top = (sy + labelOffset) + 'px';
      $globeLabel.style.transform = 'translate(-50%, 0%)';
    }
    $globeLabel.style.opacity = String(Math.min(1, (z2 - 0.2) * 3));
    repositionCameraTime();
  }

  if (hasLocation) {
    const [, lon] = location;
    const targetPhi = -lon * (Math.PI / 180) - Math.PI / 2;
    currentPhi = targetPhi - 3;
    onRender = (s) => {
      currentPhi += (targetPhi - currentPhi) * 0.04;
      s.phi = currentPhi;
      s.theta = GLOBE_THETA;
      updateLabelPosition(currentPhi, GLOBE_THETA);
    };
  } else {
    currentPhi = 0;
    onRender = (s) => {
      currentPhi += 0.012;
      s.phi = currentPhi;
      s.theta = GLOBE_THETA;
    };
  }

  const size = displaySize * 2;
  freshCanvas.width = size;
  freshCanvas.height = size;

  globeInstance = createGlobeFn(freshCanvas, {
    devicePixelRatio: 2,
    width: size,
    height: size,
    phi: currentPhi,
    theta: GLOBE_THETA,
    dark: 1,
    diffuse: 1.2,
    scale: 1,
    mapSamples: 16000,
    mapBrightness: 6,
    baseColor: [0.3, 0.3, 0.3],
    markerColor: [1, 0.5, 0.2],
    glowColor: [0.1, 0.1, 0.1],
    markers,
    onRender,
  });

  $globe.classList.add('show');
}
