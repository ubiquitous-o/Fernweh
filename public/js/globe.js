// 右下の小さな地球儀。軌道ビューと同じ「本物の見た目の地球」（orbitRenderer.js）で描く。
// 地球は動かさず、カメラが赤道の真上を東へ回り続ける（北が上。見える向きは経度だけが変わる）:
//   - 昼夜の境目は実際の時刻どおり。カメラが夜側へ回ると、街明かりが見える。
//   - 映像の場所には光の柱が立つ。地名のラベルは地球の上に出したまま動かさない。
//   - 映像が切り替わると、カメラはその場所の少し手前から回り始める（切り替わってすぐ柱が見える）。
//   - 場所の分からない映像のときは、柱が無く、中央に「Location unknown」と出る。
import { $globe, $globeLabel, globeRef } from './dom.js';
import { repositionCameraTime } from './clock.js';
import { createOrbitRenderer } from './orbitRenderer.js';
import { sunDirection } from './orbit.js';

const rad = (deg) => deg * (Math.PI / 180);

// カメラが地球を1周するのにかける秒数
const ORBIT_SECONDS = 20;
// 映像が切り替わったとき、カメラはその場所の経度よりこの角度だけ手前（西）から回り始める
const START_BEHIND = rad(35);
// 地球の半径（枠 .globe-container の大きさに対する比）。styles.css は、まわりの空き（1割ずつ）の
// ぶんだけ枠を画面の隅へ寄せてある
const RADIUS = 0.4;
// キャンバスは枠より一回り大きい（styles.css の .globe-container canvas と揃える）。
// 地球の外へ伸びる光の柱が切れないようにするため
const CANVAS_SCALE = 1.3;
// 光の柱: 長さ（地球の半径に対する比）/ 太さ（地球の半径に対する比）/ 色 / 現れるのにかける秒数
const PIN_LENGTH = 0.55;
const PIN_WIDTH = 0.035;
const PIN_COLOR = [1.0, 0.98, 0.95];
const PIN_APPEAR = 0.8;
// 表示は小さいので、画像は小さくして使う（幅px）
const TEXTURE_WIDTH = 1024;

// 緯度経度(rad) → 地球座標の向き（経度0・緯度0が +z、北極が +y）
const dirFor = (lat, lon) => [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];

// 描画器は最初に必要になったときに1度だけ作る（WebGLが使えなければ null のまま = 地球儀なし）
let renderer;
// いま印を付けている場所（地球座標の向き。場所の分からない映像なら null）と、柱の現れ具合(0..1)
let pin = null;
let appear = 0;
// カメラの位置: 真下の地点の経度(rad)。緯度はいつも 0（赤道の真上）
let camLon = 0;
// 描画ループが回っているか
let running = false;
let lastFrame = 0;

function frame() {
  // 設定で隠されたら止める（出し直したときは updateGlobe がもう一度始める）
  if (document.body.classList.contains('hide-place')) {
    running = false;
    return;
  }
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (pin) appear = Math.min(1, appear + dt / PIN_APPEAR);

  // カメラが赤道の真上を、一定の速さで東へ進む
  camLon += ((Math.PI * 2) / ORBIT_SECONDS) * dt;

  const [w, h] = renderer.size();
  const cx = w / 2, cy = h / 2;
  const radius = (RADIUS / CANVAS_SCALE) * Math.min(w, h);

  const beams = [];
  if (pin) {
    // 場所が画面のどこに見えるか（x = 右 / y = 上 / z = 手前。地球の半径を1として）
    const co = Math.cos(camLon), so = Math.sin(camLon);
    const v = [pin[0] * co - pin[2] * so, pin[1], pin[0] * so + pin[2] * co];
    const tip = 1 + PIN_LENGTH;
    beams.push({
      ax: cx + v[0] * radius, ay: cy + v[1] * radius,
      bx: cx + v[0] * tip * radius, by: cy + v[1] * tip * radius,
      z0: v[2], z1: v[2] * tip,
      width: PIN_WIDTH * radius,
      alpha: appear,
    });
  }

  renderer.draw(now, {
    earth: { cx, cy, radius, lat: 0, lon: camLon, roll: 0 },
    sun: sunDirection(),
    haze: 0,
    beams,
    beamColor: PIN_COLOR,
    beamCover: 0,
    fill: 0,
  });
  requestAnimationFrame(frame);
}

export function updateGlobe(location, locationName) {
  // 設定で右下の地球儀を隠しているあいだは、何もしない。
  // 設定で出し直したときは settings.js がもう一度ここを呼ぶ
  if (document.body.classList.contains('hide-place')) return;

  if (renderer === undefined) {
    renderer = createOrbitRenderer(globeRef.canvas, { sky: false, maxTexture: TEXTURE_WIDTH });
  }
  if (!renderer) return;
  // 隠していた直後や画面サイズが変わった直後は、表示の大きさが変わっている
  renderer.invalidateSize();

  const hasLocation = Array.isArray(location);
  const displaySize = $globe.offsetWidth;

  // 印を付ける場所を替える。柱は現れ直す
  pin = hasLocation ? dirFor(rad(location[0]), rad(location[1])) : null;
  appear = 0;
  // カメラをその場所の経度の少し手前へ移す。
  // 切り替えのあいだ地球儀は隠れているので、飛んだことは見えない
  if (hasLocation) camLon = rad(location[1]) - START_BEHIND;

  // ラベル。カメラは回り続けるので、ラベルは場所を追わせず、決まった位置に出したままにする
  $globeLabel.style.opacity = '1';
  if (hasLocation && locationName) {
    $globeLabel.textContent = locationName.replace(/,\s*/g, '\n');
    const maxLineLen = locationName.split(/,\s*/).reduce((m, s) => Math.max(m, s.length), 0);
    const scale = displaySize / 225;
    const base = maxLineLen > 22 ? 14 : maxLineLen > 18 ? 17 : 20;
    $globeLabel.style.fontSize = (base * scale) + 'px';
    $globeLabel.style.textAlign = '';
    $globeLabel.classList.add('show');
    // 地球のすぐ上、左右は地球の中央。ただし右端は、地球の右端（＝画面端の余白の線）より外へ出さない
    const rightLimit = displaySize * (0.5 + RADIUS);
    const halfWidth = $globeLabel.offsetWidth / 2;
    $globeLabel.style.left = Math.min(displaySize / 2, rightLimit - halfWidth) + 'px';
    $globeLabel.style.top = (displaySize * (0.5 - RADIUS) - displaySize * (6 / 225)) + 'px';
    $globeLabel.style.transform = 'translate(-50%, -100%)';
  } else if (!hasLocation) {
    $globeLabel.innerHTML = 'Location<br>unknown';
    $globeLabel.classList.add('show');
    // 地球の中央に固定表示
    $globeLabel.style.left = '50%';
    $globeLabel.style.top = '50%';
    $globeLabel.style.transform = 'translate(-50%, -50%)';
    $globeLabel.style.textAlign = 'center';
  } else {
    $globeLabel.textContent = '';
    $globeLabel.classList.remove('show');
    $globeLabel.style.left = '';
    $globeLabel.style.top = '';
    $globeLabel.style.opacity = '';
  }
  repositionCameraTime();

  if (!running) {
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }
  $globe.classList.add('show');
}
