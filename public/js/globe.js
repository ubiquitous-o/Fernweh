// 右下の小さな地球儀。陸地を点の集まりで描く（ライブラリは使わず、このファイルが2Dキャンバスに描く）。
//   - 地球は透明で、陸地だけが灰色の濃淡の点で見える。裏側の陸地も淡く透けて見える。
//     点は大・中・小の3種類。大陸の内側は大きな点で、海岸や島などの細かい地形は小さな点で埋める。
//   - 地球儀はいつも一定の速さで回っている（北が上で、赤道を真横から見る。傾けない。
//     見ている側が東へ回るので、陸地は右から左へ流れる）。
//     映像が切り替わると、その場所が真正面の少し右に来る向きから回り始める。
//   - 場所には、ネオン色に光って明滅する点が付く（見た目は styles.css）。
//     場所が地球の裏にあるあいだも、点は透けて見える（少し淡くなる）。
//   - 札（地名と現地時刻）は地球のすぐ下に出したままで、動かさない（置き場所は styles.css）。
//   - 場所の分からない映像のときは、点も札も無く、地球儀は同じ速さで回り続け、
//     その上に重ねて「Location unknown」とだけ出る。
import {
  $globe, $globeStage, $globeLabel, $globeUnknown, $globePinDot, globeRef,
} from './dom.js';

const rad = (deg) => deg * (Math.PI / 180);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// 地球の半径（枠 .globe-stage の大きさに対する比）。まわりに1割ずつ空きがある（縁の点やにじみが切れないように）。
// styles.css は、その空きを無いものとして枠を並べる
const RADIUS = 0.4;
// 点の半径: 大・中・小（地球の半径を1として）
const DOT_SIZES = [0.02, 0.014, 0.01];
// 同じ大きさの点どうしの間隔（点の半径の何倍か）
const DOT_PITCH = 2.8;
// 大きさの違う点どうしのあいだに空ける幅（小さいほうの点の半径の何倍か）
const DOT_GAP = 0.35;
// 画面に描く点の半径の下限(px)。地球儀が小さい画面でも点が消えないように
const DOT_MIN_PX = 0.6;
// 点の色（灰色の濃淡）。点ごとにどれかになる
const DOT_SHADES = ['#ffffff', '#c8c8c8', '#8e8e8e'];
// 裏側の点の濃さ（表を1として）
const BACK_ALPHA = 0.22;
// 1周するのにかける秒数
const ORBIT_SECONDS = 20;
// 映像が切り替わったとき、その場所が真正面からこの角度(rad)だけ右（東）に見える向きから回り始める
const START_AHEAD = rad(35);
// 映像が切り替わったあと、光る点が現れるのにかける秒数
const PIN_APPEAR = 0.8;
// 場所が地球の裏にあるあいだの、光る点の濃さ（表を1として）。裏でも消さず、少し淡くするだけ
const PIN_BACK = 0.45;
// 濃さは、場所が地球の縁をはさんでこの幅（球の半径を1とした奥行き）を通るあいだに、なだらかに変わる
const PIN_FADE = 0.2;

// --- 点を並べる ---

// 陸か海かを調べる地図。海のマスク画像（海 = 白 / 陸 = 黒）を小さく読み込んで使う
const LAND_W = 720, LAND_H = 360;
let landMap = null;
const isLand = (lat, lon) => {
  const u = (((lon / Math.PI + 1) / 2) % 1 + 1) % 1;
  const x = Math.min(LAND_W - 1, Math.floor(u * LAND_W));
  const y = clamp(Math.floor((0.5 - lat / Math.PI) * LAND_H), 0, LAND_H - 1);
  return landMap[(y * LAND_W + x) * 4] < 90;
};
// 半径 r の点が、まるごと陸の上に収まるか（まわりの8か所も陸か）
function coversLand(lat, lon, r) {
  const stretch = 1 / Math.max(Math.cos(lat), 0.05);
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    if (!isLand(lat + Math.sin(t) * r * 1.15, lon + Math.cos(t) * r * 1.15 * stretch)) return false;
  }
  return true;
}
// 地球の表面に、ほぼ等しい間隔(rad)で並ぶ場所 [緯度, 経度](rad)。緯度の列ごとに半分ずらして並べる
function* lattice(pitch) {
  const rows = Math.round(Math.PI / pitch);
  for (let i = 0; i < rows; i++) {
    const lat = -Math.PI / 2 + ((i + 0.5) / rows) * Math.PI;
    const n = Math.max(1, Math.round((Math.PI * 2 * Math.cos(lat)) / pitch));
    for (let j = 0; j < n; j++) yield [lat, -Math.PI + ((j + (i % 2) * 0.5) / n) * Math.PI * 2];
  }
}

// 地球儀の点: 色ごとに分けた [x, y, z, 半径, ...] の並び（x, y, z は地球儀に固定した向き。半径1の球の上）。
// 大きい点から順に置く。大・中の点は、まるごと陸に収まるところにだけ置き、
// 残った陸（海岸や島、大きい点のすきま）を小さい点が埋める
let dots = null;
function buildDots() {
  const placed = [];
  for (const [level, r] of DOT_SIZES.entries()) {
    const bigger = placed.length;
    const smallest = level === DOT_SIZES.length - 1;
    for (const [lat, lon] of lattice(r * DOT_PITCH)) {
      if (!isLand(lat, lon)) continue;
      if (!smallest && !coversLand(lat, lon, r)) continue;
      const x = Math.cos(lat) * Math.sin(lon + Math.PI / 2);
      const y = Math.sin(lat);
      const z = Math.cos(lat) * Math.cos(lon + Math.PI / 2);
      // 先に置いた、より大きい点と重ならないこと
      let free = true;
      for (let k = 0; k < bigger; k++) {
        const p = placed[k];
        const limit = p[3] + r * (1 + DOT_GAP);
        if (2 - 2 * (p[0] * x + p[1] * y + p[2] * z) < limit * limit) {
          free = false;
          break;
        }
      }
      if (free) placed.push([x, y, z, r]);
    }
  }
  // 色は点ごとにばらばらに（ただし毎回同じ並びになるよう、乱数ではなく番号から決める）
  const groups = DOT_SHADES.map(() => []);
  placed.forEach((p, i) => groups[(i * 7 + (i >> 3) * 3) % DOT_SHADES.length].push(...p));
  dots = groups.map((g) => Float32Array.from(g));
}
{
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = LAND_W;
      c.height = LAND_H;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, LAND_W, LAND_H);
      landMap = ctx.getImageData(0, 0, LAND_W, LAND_H).data;
      buildDots();
    } catch (e) {
      console.warn('Globe dots failed to build:', e);
    }
  };
  img.onerror = () => console.warn('Globe land map failed to load');
  img.src = 'img/earth-water.jpg';
}

// --- 向きと描画 ---

// いま出している地球儀: { ctx, size(枠の大きさpx), scale(キャンバスの画素/px), located, lat, lon, appear }。
// located は場所の分かる映像か。appear は光る点の現れ具合(0..1)。隠しているあいだは null
let view = null;
let frameId = 0;
let lastFrame = 0;
// いまの向き: 回転(rad)。減るほど、見ている側が東へ回る
let currentPhi = 0;

// 地球儀の向き(phi)のとき、場所(lat, lon)が見える位置（x = 右 / y = 上 / z = 手前。地球の半径を1として）
function project(lat, lon, phi) {
  const angle = lon + phi + Math.PI / 2;
  return {
    x: Math.cos(lat) * Math.sin(angle),
    y: Math.sin(lat),
    z: Math.cos(lat) * Math.cos(angle),
  };
}

// 映像の場所の光る点を (x, y)（枠の左上からのpx）へ置く。strength(0..1) は濃さ
function drawSpot(x, y, strength) {
  $globePinDot.style.opacity = strength <= 0.01 ? '0' : String(strength);
  $globePinDot.setAttribute('transform', `translate(${x} ${y})`);
}

// いまの向きで、陸地の点と、映像の場所の光る点を描く
function draw() {
  const { ctx, size, scale } = view;
  const phi = currentPhi;
  const center = size / 2;
  const reach = RADIUS * size;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, size, size);

  if (dots) {
    const cp = Math.cos(phi), sp = Math.sin(phi);
    // 裏側を先に淡く描き、その上に表側を描く
    for (const front of [false, true]) {
      ctx.globalAlpha = front ? 1 : BACK_ALPHA;
      dots.forEach((group, shade) => {
        ctx.fillStyle = DOT_SHADES[shade];
        ctx.beginPath();
        for (let i = 0; i < group.length; i += 4) {
          const z = group[i + 2] * cp - group[i] * sp;
          if ((z >= 0) !== front) continue;
          const x = center + (group[i] * cp + group[i + 2] * sp) * reach;
          const y = center - group[i + 1] * reach;
          // 縁に近い点は斜めから見ることになるので、少し小さく描く
          const r = Math.max(DOT_MIN_PX, group[i + 3] * reach * (0.6 + 0.4 * Math.abs(z)));
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      });
    }
  }

  if (view.located) {
    // 場所が地球の裏にあるあいだは、少し淡くする（縁を越えるあたりで、なだらかに変わる）
    const p = project(view.lat, view.lon, phi);
    const front = clamp(p.z / PIN_FADE + 0.5, 0, 1);
    drawSpot(center + p.x * reach, center - p.y * reach,
      view.appear * (PIN_BACK + (1 - PIN_BACK) * front));
  }
}

// 1コマ進める。一定の速さで回す
function frame(now) {
  const dt = clamp((now - lastFrame) / 1000, 0, 0.1);
  lastFrame = now;
  currentPhi -= ((Math.PI * 2) / ORBIT_SECONDS) * dt;
  view.appear = Math.min(1, view.appear + dt / PIN_APPEAR);
  draw();
  frameId = requestAnimationFrame(frame);
}

export function updateGlobe(location, locationName) {
  cancelAnimationFrame(frameId);
  frameId = 0;
  view = null;
  const canvas = globeRef.canvas;

  // 設定で右下の地球儀を隠しているあいだは、描かない。
  // 設定で出し直したときは settings.js がもう一度ここを呼ぶ
  if (document.body.classList.contains('hide-place')) {
    canvas.width = canvas.height = 0;
    return;
  }

  const hasLocation = Array.isArray(location);
  const displaySize = $globeStage.offsetWidth;

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
  drawSpot(0, 0, 0);

  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.height = Math.round(displaySize * scale);
  view = {
    ctx: canvas.getContext('2d'), size: displaySize, scale, located: hasLocation, appear: 0,
  };

  if (hasLocation) {
    view.lat = rad(location[0]);
    view.lon = rad(location[1]);
    // その場所が真正面の少し右に見える向きへ飛ぶ。
    // 切り替えのあいだ地球儀は隠れているので、飛んだことは見えない
    currentPhi = START_AHEAD - view.lon - Math.PI / 2;
  }

  lastFrame = performance.now();
  frame(lastFrame);
  $globe.classList.add('show');
}
