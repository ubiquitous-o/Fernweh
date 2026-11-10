// 右下の小さな地球儀。軌道ビューと同じ「本物の見た目の地球」（orbitRenderer.js）で描く。
// 地球は動かさず、カメラが赤道の真上を東へ回り続ける（北が上。見える向きは経度だけが変わる）:
//   - 昼夜の境目は実際の時刻どおり。カメラが夜側へ回ると、街明かりが見える。
//   - 映像の場所には光の柱が立つ。
//   - 地球の上には札（地名と現地時刻）が出ていて、柱の根元（映像の場所）と細い引き出し線でつながっている。
//     札は動かさず、線だけが場所を追う。場所が地球の裏へ回っているあいだ、線は消えて札だけが残る。
//   - 映像が切り替わると、カメラはその場所の少し手前から回り始める（切り替わってすぐ柱が見える）。
//   - 場所の分からない映像のときは、柱も線も札も無く、地球の上に重ねて「Location unknown」とだけ出る。
import {
  $globe, $globeLabel, $globeTag, $globeUnknown, $globeLeaderLine, $globeLeaderDot, globeRef,
} from './dom.js';
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
// 札と柱の届く範囲とのあいだの空き(px)
const TAG_GAP = 6;
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
// 札の位置と大きさ（枠 .globe-container の左上からのpx）。中身が変わると大きさも変わるので、ときどき測り直す
let tagBox = null;
let tagMeasuredAt = -Infinity;

// 引き出し線: 札の下の辺から、柱の根元（枠の左上からのpx）まで。strength(0..1) は線の濃さ
function drawLeader(now, tipX, tipY, strength) {
  if (now - tagMeasuredAt > 1000) {
    tagMeasuredAt = now;
    tagBox = $globeTag.offsetWidth
      ? { left: $globeTag.offsetLeft, right: $globeTag.offsetLeft + $globeTag.offsetWidth,
        bottom: $globeTag.offsetTop + $globeTag.offsetHeight }
      : null;
  }
  if (!tagBox || strength <= 0.01) {
    $globeLeaderLine.style.opacity = '0';
    $globeLeaderDot.style.opacity = '0';
    return;
  }
  // 札の側の端は、下の辺のうち柱の先にいちばん近いところ（角は避ける）
  const inset = Math.min(10, (tagBox.right - tagBox.left) / 2);
  const startX = Math.max(tagBox.left + inset, Math.min(tagBox.right - inset, tipX));
  $globeLeaderLine.setAttribute('x1', startX);
  $globeLeaderLine.setAttribute('y1', tagBox.bottom);
  $globeLeaderLine.setAttribute('x2', tipX);
  $globeLeaderLine.setAttribute('y2', tipY);
  $globeLeaderDot.setAttribute('cx', tipX);
  $globeLeaderDot.setAttribute('cy', tipY);
  $globeLeaderLine.style.opacity = String(strength);
  $globeLeaderDot.style.opacity = String(strength);
}

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
    // 引き出し線は柱の根元（映像の場所）へ。場所が地球の裏へ回っているあいだは消す
    // （縁を越えるあたりで、なだらかに現れて消える）
    const size = $globe.offsetWidth;
    const reach = RADIUS * size;
    const seen = Math.max(0, Math.min(1, v[2] / 0.12));
    drawLeader(now, size / 2 + v[0] * reach, size / 2 - v[1] * reach, appear * seen);
  } else {
    drawLeader(now, 0, 0, 0);
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

  // 場所の分からない映像のときは、地球の上に重ねて「Location unknown」と出す。
  // そのとき札は現地時刻ごと隠れる（styles.css の .globe-unknown）
  $globeUnknown.classList.toggle('show', !hasLocation);

  // 札の地名。1行目（「,」の前）を大きく、残りは小さく淡く出す。
  // 現地時刻は clock.js が同じ札の中に入れる
  $globeLabel.textContent = '';
  const name = hasLocation ? (locationName || '') : '';
  if (name) {
    const [main, ...rest] = name.split(/,\s*/);
    // 長い名前は字を小さくして、札が広がりすぎないようにする
    const base = main.length > 22 ? 14 : main.length > 18 ? 17 : 20;
    $globeLabel.style.fontSize = (base * (displaySize / 225)) + 'px';
    $globeLabel.append(main);
    if (rest.length) {
      const sub = document.createElement('span');
      sub.className = 'globe-label-sub';
      sub.textContent = rest.join(', ');
      $globeLabel.append(sub);
    }
  }
  // 札の置き場所: 右は地球の右端（＝画面端の余白の線）にそろえ、下は柱が届く範囲のすぐ上。
  // カメラは回り続けるので、札は場所を追わせず、ここに出したままにする
  $globeTag.style.right = (displaySize * (0.5 - RADIUS)) + 'px';
  $globeTag.style.bottom = (displaySize * (0.5 + RADIUS * (1 + PIN_LENGTH)) + TAG_GAP) + 'px';
  tagMeasuredAt = -Infinity;

  if (!running) {
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }
  $globe.classList.add('show');
}
