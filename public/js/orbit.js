// 起動時・切替時の「幕」: 衛星軌道から地球を眺める演出。
//   - 星空の中に地球が丸ごと浮かんでいる。カメラは傾いた衛星軌道を回っていて、
//     地球が回りながら北半球と南半球をゆっくり行き来して見える（軌道ビュー）。
//     昼夜の境目は実際の時刻どおり。夜側には街明かりが見える。
//   - カメラはいつも地球を向いているので、軌道を回るにつれて後ろの空（星・天の川）が流れていく。
//     太陽・月・惑星（水星・金星・火星・木星・土星）は実際の位置にあり、地球の向こう側に来たときに見える
//     （月は実際の満ち欠け）。
//   - 映像が決まると、軌道を回ったまま、そのライブカメラの場所に光の柱がふわっと立ち上がる。
//     少し間をおいてから、カメラが柱の真上へ向かい、そのまま上から柱の中へ降りる。
//     中に入った瞬間に、呼び出し側がグリッチで映像を出す。
//   - 切替時: 映像がグリッチしながら柱の光の白に溶ける → 柱の方向へまっすぐ引きながら、
//     軌道の動きへなめらかに合流する → 次の場所に柱が立つ → 飛び込む。
// ここはカメラの動きと幕の制御を持つ。描画は orbitRenderer.js。
// 幕の出入りは .orbit-overlay の opacity transition でフェード（styles.css）。
// ページを開いた時点では幕は最初から出ている（index.html で active を付けてある）。
import { $orbitOverlay, $orbitCanvas } from './dom.js';
import { createOrbitRenderer } from './orbitRenderer.js';

// ---------- 調整用パラメータ ----------
// 幕のフェード（styles.css の .orbit-overlay と揃える）。グリッチ（glitch.js の GLITCH_DURATION = 0.6秒）に
// 対して、入りと出が鏡映しになるようにしてある。
//   出: 後奏グリッチの最初の0.3秒で幕が消える（グリッチが強いうちに映像が見えてくる）
//   入り: その逆再生。前奏グリッチの最初の0.3秒は幕を出さず、後半の0.3秒で幕が重なる
// FADE_IN_MS は、入りで幕が覆いきるまでの時間（待ち0.3秒 + フェード0.3秒）
const FADE_IN_MS = 600;
const FADE_OUT_MS = 300;
// カメラワークの長さ
export const DIVE_MS = 2000;  // 軌道から目的地の柱へ飛び込む
const ASCEND_MS = 2000;       // 柱の中から軌道へ引く（幕が覆いきってから）
const RETURN_MS = 2000;       // 行き先が無かったとき、元の場所へ戻る
// 光の柱が立ち上がるのにかかる時間と、立ち始めてから突入を始めるまでの間
const BEAM_RISE_MS = 900;
export const BEAM_LEAD_MS = 1000;
// 衛星軌道: 回る速さ(rad/s。1周およそ2分)と傾き(度。直下点が行き来する緯度の幅)
const ORBIT_SPEED = 0.05;
const ORBIT_INCLINATION = 30;
// 軌道ビューの地球の半径。画面の短辺に対する比（地球全体が画面に収まる大きさ）
const ORBIT_RADIUS = 0.36;
// 飛び込みきったときの地球の半径。画面対角線に対する比。
// 終盤はここでゆっくりになるので、画像がぼやけない「地方が見渡せる高さ」にとどめる
const SURFACE_RADIUS = 2.0;
// 飛び込みのカメラの緩急の強さ。カメラはゆっくり動き出し、途中で速くなり、光に近づくとまたゆっくりになる
// （回る動きも降りる動きも同じ形）。1 = 一定の速さ。大きいほど出だしと終わりがゆっくりで、途中が速い
const DIVE_EASE = 2;
// 飛び込みでは、柱の真上へ回る動きを降下より先に終える。
// 進行がここに達した時点で真上に着く（1 なら降下と同時、小さいほど早い）
const DIVE_TURN_BY = 0.8;
// 引く動きのイージング（ease-out の強さ）。引き始めが速く、地球全体が見えてくるにつれてゆっくりになり、
// 止まるころにはほとんど動いていない。大きいほど出だしが速く、減速が長い
const ASCEND_ZOOM_POWER = 3;
// 引く動きのうち、軌道の動きへ合流し始める時点（進行 0..1）。それまでは柱の方向へまっすぐ引く
const ASCEND_MERGE_FROM = 0.15;
// 光の柱: 長さ(地球の半径に対する比) / 軌道での太さ(半幅px、短辺600px基準) / 降りきるまでに太る倍率
const BEAM_LENGTH = 0.45;
const BEAM_PX = 2.4;
const BEAM_GROW = 1.5;
// 柱の光の出入り: 飛び込みの最後（引くときは最初）の BEAM_ENTER_MS をかけて、光が太る（縮む）。
// 太さは「一定の倍率で変わり続ける」形（対数補間）。BEAM_COVER は視界を覆ったとみなす太さ（画面対角線比）。
//
// 入るとき: 丸い光そのものを、画面よりずっと大きく（BEAM_ENTER_FULL、画面対角線比）なるまで太らせる。
//   光は中心がいちばん明るく縁へなだらかに落ちるので、中心から端へ順に白くなっていく。
//   進み方は「ゆっくり始まり、途中で速く、最後はなだらか」（S字）。加速したまま終わると、
//   太さが跳ね上がったところで突然真っ白になって止まり、なめらかに見えない
// 引くとき: BEAM_COVER の太さから縮む。BEAM_RUSH は進み方の偏り（大きいほど最初に一気に縮む）
const BEAM_ENTER_MS = 1000;
const BEAM_ENTER_FULL = 1.3;
const BEAM_RUSH = 2.2;
const BEAM_COVER = 0.8;
// 柱の光の色（ほぼ白）と、その光で視界が満ちたときの明るさ（細い柱のときを1として）
const BEAM_COLOR = [1.0, 0.98, 0.95];
const WASH_LEVEL = 0.95;
// 降りるにつれて地表がうっすら霞む度合いの上限（大気の中に入った感じを出す）
const HAZE_MAX = 0.25;
// 空（星・天の川・月・太陽）を見るカメラの縦の画角(度)。
// カメラは軌道を回りながらいつも地球を向いているので、回るにつれて空全体が流れていく。
// 画角が狭いほど空は大きく写り、速く流れて見える
const SKY_FOV = 60;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
// 両側がゆるやかなカーブ（ゆっくり → 速く → ゆっくり）。power が大きいほど緩急が強い
const easeInOut = (t, power) => {
  const a = Math.pow(t, power);
  return a / (a + Math.pow(1 - t, power));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rad = (deg) => deg * (Math.PI / 180);

// 緯度経度(rad) → 地球座標の単位ベクトル（経度0・緯度0が +z、北極が +y）
const dirFor = (lat, lon) => [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
// 地球座標の向き → 視線座標（x = 画面右 / y = 画面上 / z = 手前）。カメラは (lat, lon) の真上にいる
function viewDir(d, lat, lon) {
  const cl = Math.cos(lat), sl = Math.sin(lat), co = Math.cos(lon), so = Math.sin(lon);
  return [
    d[0] * co - d[2] * so,
    -d[0] * sl * so + d[1] * cl - d[2] * sl * co,
    d[0] * cl * so + d[1] * sl + d[2] * cl * co,
  ];
}
// a から b へ、近い回り方での角度差（-π..π）
function angleDelta(a, b) {
  const d = (b - a) % (Math.PI * 2);
  return d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d;
}

// いま太陽が真上にある地点 [緯度, 経度](rad)。昼夜の境目を実際の時刻に合わせる
function subsolarPoint(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - start) / 86400000;
  const declination = rad(-23.44) * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return [declination, rad(-15 * (utcHours - 12))];
}

// 2000年1月1日正午(UTC)からの日数
const daysSinceJ2000 = (date) => date.getTime() / 86400000 + 2440587.5 - 2451545.0;

// グリニッジ恒星時(rad)。天球（星の座標）が地球に対してどれだけ回っているか。
// 赤経 α の星は、経度 α - 恒星時 の地点の真上にある
function siderealAngle(date) {
  return rad((280.46061837 + 360.98564736629 * daysSinceJ2000(date)) % 360);
}

// 地球の中心から見た月の向き（地球座標の単位ベクトル）。略算式で、誤差は1度以内
function moonDirection(date) {
  const T = daysSinceJ2000(date) / 36525;
  const s = (deg) => Math.sin(rad(deg));
  // 黄経・黄緯(度)
  const lon = 218.32 + 481267.881 * T
    + 6.29 * s(135.0 + 477198.87 * T) - 1.27 * s(259.3 - 413335.36 * T)
    + 0.66 * s(235.7 + 890534.22 * T) + 0.21 * s(269.9 + 954397.74 * T)
    - 0.19 * s(357.5 + 35999.05 * T) - 0.11 * s(186.5 + 966404.03 * T);
  const lat = 5.13 * s(93.3 + 483202.02 * T) + 0.28 * s(228.2 + 960400.89 * T)
    - 0.28 * s(318.3 + 6003.15 * T) - 0.17 * s(217.6 - 407332.21 * T);
  // 黄道座標 → 赤道座標（赤経・赤緯）
  const l = rad(lon), b = rad(lat), tilt = rad(23.439);
  const x = Math.cos(b) * Math.cos(l);
  const y = Math.cos(tilt) * Math.cos(b) * Math.sin(l) - Math.sin(tilt) * Math.sin(b);
  const z = Math.sin(tilt) * Math.cos(b) * Math.sin(l) + Math.cos(tilt) * Math.sin(b);
  return dirFor(Math.asin(z), Math.atan2(y, x) - siderealAngle(date));
}

// 惑星（肉眼で見える5つ）と地球の軌道要素: [軌道の大きさ(au), つぶれ具合, 傾き, 平均黄経, 近日点の黄経, 昇交点の黄経](角度は度)。
// 1行目が2000年の値、2行目が100年あたりの変化（JPLの略算用の要素。1800〜2050年で誤差は1度未満）。
// mag: 太陽と地球からそれぞれ1auの距離にあるとしたときの等級 / temp: 色（0 = 橙 .. 1 = 青白。星と同じ尺度）
const PLANETS = [
  { name: 'Mercury', mag: 1.0, temp: 0.42,
    orbit: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
      [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]] },
  { name: 'Venus', mag: -4.4, temp: 0.47,
    orbit: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
      [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]] },
  { name: 'Mars', mag: -1.52, temp: 0.0,
    orbit: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
      [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]] },
  { name: 'Jupiter', mag: -9.4, temp: 0.4,
    orbit: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
      [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]] },
  { name: 'Saturn', mag: -8.88, temp: 0.32,
    orbit: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
      [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]] },
];
const EARTH_ORBIT = [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
  [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]];

// 軌道要素から、太陽を中心とした位置（黄道座標、au）を求める。T は2000年からの経過（100年単位）
function orbitPosition(orbit, T) {
  const [a, e, tilt, meanLon, periLon, nodeLon] = orbit[0].map((v, i) => v + orbit[1][i] * T);
  // 軌道上の位置: 平均近点角からケプラー方程式を解く
  const M = rad((((meanLon - periLon) % 360) + 540) % 360 - 180);
  let E = M;
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  // 軌道面 → 黄道座標
  const w = rad(periLon - nodeLon), node = rad(nodeLon), inc = rad(tilt);
  const cw = Math.cos(w), sw = Math.sin(w), cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(inc), si = Math.sin(inc);
  return [
    (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}

// 地球から見た惑星の向き（天球座標の単位ベクトル。星と同じ座標）と、見かけの等級。
// 惑星は星のあいだをゆっくりとしか動かないので、1分ごとに計算し直せば十分
let planetCache = { at: -Infinity, list: [] };
function planets(date) {
  if (Math.abs(date.getTime() - planetCache.at) < 60000) return planetCache.list;
  const T = daysSinceJ2000(date) / 36525;
  const earth = orbitPosition(EARTH_ORBIT, T);
  const tilt = rad(23.439);
  const list = PLANETS.map((p) => {
    const pos = orbitPosition(p.orbit, T);
    const x = pos[0] - earth[0], y = pos[1] - earth[1], z = pos[2] - earth[2];
    const fromEarth = Math.hypot(x, y, z), fromSun = Math.hypot(pos[0], pos[1], pos[2]);
    const sunToEarth = Math.hypot(earth[0], earth[1], earth[2]);
    const lit = 0.5 + (fromSun * fromSun + fromEarth * fromEarth - sunToEarth * sunToEarth) / (4 * fromSun * fromEarth);
    // 黄道座標 → 赤道座標 → 天球上の向き（dirFor と同じ並び: 赤経90度 / 北 / 赤経0度）
    const yq = Math.cos(tilt) * y - Math.sin(tilt) * z, zq = Math.sin(tilt) * y + Math.cos(tilt) * z;
    return {
      dir: [yq / fromEarth, zq / fromEarth, x / fromEarth],
      // 遠いほど暗い。内側の惑星は、地球から見て欠けているぶんも暗くなる（lit = 照らされて見える割合）
      mag: p.mag + 5 * Math.log10(fromSun * fromEarth) - 2.5 * Math.log10(Math.max(lit, 0.02)),
      temp: p.temp,
    };
  });
  planetCache = { at: date.getTime(), list };
  return list;
}

// ---------- カメラの状態（描画とは独立。WebGLが無くても時間どおり進む） ----------
// lat / lon はカメラが真下に見ている地点（直下点）。
const cam = {
  lat: 0,     // 直下点の緯度(rad)
  lon: 0,     // 直下点の経度(rad)。増えるとカメラが東へ進む
  zoom: 0,    // 0 = 軌道の高さ（地球全体が見える）.. 1 = 降りきった高さ（目的地の上空）
  plunge: 0,  // 0 = 柱は遠くの細い筋 .. 1 = 柱の中に入りきった（光が視界を覆う）
  entering: false, // 柱へ入っていく途中か（光の広がり方が、引くときと違う）
  spin: 1,    // 軌道を進む速さの係数（飛び込み中は 0）
  follow: 1,  // 緯度を軌道に従わせる度合い。0 = lat を直接動かす（飛び込み中）.. 1 = 軌道どおり
  latHold: 0, // follow が 0 のとき基準にする緯度（上昇を始めたときの緯度）
};
// 軌道上の位置（位相）。直下点の緯度は 傾き × sin(位相) で南北に行き来する
let orbitPhase = 0.6;
const orbitLat = () => rad(ORBIT_INCLINATION) * Math.sin(orbitPhase);
// 最初は昼の側から眺め始める
cam.lon = subsolarPoint(new Date())[1];
cam.lat = orbitLat();

// 光の柱: { location:[緯度, 経度](度), dir(地球座標), appear(0..1 明るさ), rise(0..1 伸び具合),
//           target(いま向かっている/入っている柱か) }
let beams = [];
// いま入っている場所（次に上昇するとき、そこから離れる）
let lastLocation = null;

const makeBeam = (location, appear, rise = appear) => ({
  location,
  dir: dirFor(rad(location[0]), rad(location[1])),
  appear,
  rise,
  target: true,
});

// tween: 描画ループが毎フレーム値を更新し、終了は setTimeout で確定する。
// rAFが止まる状況（タブ非表示）でも Promise は必ず解決する。
const tweens = new Set();
let generation = 0;

function tween(ms, apply) {
  return new Promise((resolve) => {
    const tw = { t0: performance.now(), ms, apply };
    const gen = generation;
    tweens.add(tw);
    setTimeout(() => {
      tweens.delete(tw);
      if (gen === generation) apply(1);
      resolve();
    }, ms);
  });
}

function cancelTweens() {
  generation++;
  tweens.clear();
}

// 軌道ビューの状態に戻す（軌道上の位置と地球の向きは引き継ぐ）
function resetToOrbit() {
  cancelTweens();
  cam.zoom = 0;
  cam.plunge = 0;
  cam.entering = false;
  cam.spin = 1;
  cam.follow = 1;
  beams = [];
}

// 位置情報が無い映像の行き先: 適当な場所（カメラの多い緯度帯）
function randomLocation() {
  return [-35 + Math.random() * 90, -180 + Math.random() * 360];
}

// ---------- 描画 ----------
const renderer = createOrbitRenderer($orbitCanvas);
let animId = null;
let lastT = 0;

// カメラの状態を、描画器に渡す scene（画面上の位置や大きさ）へ変換する
function buildScene() {
  const [w, h] = renderer.size();
  const diag = Math.hypot(w, h);
  const unit = Math.max(1, Math.min(w, h) / 600);
  // 半径は対数補間: 地球全体が収まる大きさ → 降りきった大きさ
  const rOrbit = ORBIT_RADIUS * Math.min(w, h);
  const radius = rOrbit * Math.pow((SURFACE_RADIUS * diag) / rOrbit, cam.zoom);

  // 柱の太さ。遠くでは細い筋で、降りるにつれ少し太る
  const thin = BEAM_PX * unit * (1 + BEAM_GROW * cam.zoom);
  // 柱の光の太さ: 細い筋から、対数補間で太る（毎瞬おなじ倍率で変わっていく）。
  // 入るときは画面よりずっと大きくなるまで太らせ、丸い光が中心から端へ順に画面を白くしていく。
  // 引くときは、視界を覆う太さ（cover）から縮む
  const cover = BEAM_COVER * diag;
  const full = cam.entering ? BEAM_ENTER_FULL * diag : cover;
  const entering = thin * Math.pow(full / thin, cam.plunge);
  const covered = clamp01(entering / cover);
  // 柱が太く見えるほど光を WASH_LEVEL まで落として眩しさを抑える
  const bright = lerp(1, WASH_LEVEL, covered);

  // 地球はいつも画面中央。カメラが柱の真上に着くと、柱は先端をこちらへ向けて画面中央に来る
  const cx = w / 2, cy = h / 2;

  const date = new Date();
  const [sunLat, sunLon] = subsolarPoint(date);

  return {
    // 空はカメラの向きから透視投影で描く（カメラが軌道を進むと空全体が流れる）。
    // 柱の光に包まれるほど星を沈める
    sky: { focal: (h / 2) / Math.tan(rad(SKY_FOV / 2)), siderealAngle: siderealAngle(date) },
    moon: moonDirection(date),
    planets: planets(date),
    starDim: 1 - 0.8 * covered,
    earth: { cx, cy, radius, lat: cam.lat, lon: cam.lon },
    sun: dirFor(sunLat, sunLon),
    haze: HAZE_MAX * clamp01((cam.zoom - 0.5) / 0.5),
    beams: beams.map((b) => {
      // 根元は地表、先端は地表から BEAM_LENGTH だけ外（立ち上がる途中は、その伸び具合ぶん）。
      // 画面上の位置と奥行きに直す
      const v = viewDir(b.dir, cam.lat, cam.lon);
      const tip = 1 + BEAM_LENGTH * b.rise;
      return {
        ax: cx + v[0] * radius, ay: cy + v[1] * radius,
        bx: cx + v[0] * tip * radius, by: cy + v[1] * tip * radius,
        z0: v[2], z1: v[2] * tip,
        width: b.target ? entering : thin,
        alpha: b.appear,
      };
    }),
    beamColor: [BEAM_COLOR[0] * bright, BEAM_COLOR[1] * bright, BEAM_COLOR[2] * bright],
    beamCover: covered,
    // 残りを光で満たして「中に入った」状態にする。
    // 入るときは丸い光がほぼ画面を白くしきってからの、最後の仕上げだけ。
    // 引くときは、視界の大半が光のあいだ
    fill: cam.entering ? clamp01((cam.plunge - 0.96) / 0.04) : clamp01((covered - 0.55) / 0.45),
  };
}

function frame() {
  const now = performance.now();
  // タブ復帰などで dt が跳ねても地球が飛ばないよう上限をかける
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  for (const tw of tweens) tw.apply(clamp01((now - tw.t0) / tw.ms));
  // 軌道を進む: 経度は一定の速さで東へ、緯度は軌道の傾きぶん南北に行き来する
  const step = ORBIT_SPEED * cam.spin * dt;
  orbitPhase += step;
  cam.lon += step;
  if (cam.follow > 0) cam.lat = lerp(cam.latHold, orbitLat(), cam.follow);
  renderer.draw(now, buildScene());
  animId = requestAnimationFrame(frame);
}

function startRendering() {
  if (renderer && !animId) { lastT = performance.now(); frame(); }
}

function stopRendering() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  // 最後のフレームがcompositor layerに静止画として残らないよう、透明クリアする
  if (renderer) renderer.clear();
}

// ---------- 幕の表示制御 ----------
// フェードアウト（CSS側 .orbit-overlay の transition）が終わるまで描画を続け、
// 終わってから止める。途中で再表示されたら停止予約を取り消す。
let stopTimerId = null;

function showVeil() {
  if (stopTimerId) { clearTimeout(stopTimerId); stopTimerId = null; }
  startRendering();
  $orbitOverlay.classList.add('active');
}

// 幕を出して軌道ビューにする（起動時・行き先がまだ無いとき）。
// 既に出ていれば（ページを開いた直後を含む）描画を始めるだけ
export function showOrbit() {
  if (!$orbitOverlay.classList.contains('active')) resetToOrbit();
  showVeil();
}

// 幕をフェードアウトして止める
export function hideOrbit() {
  $orbitOverlay.classList.remove('active');
  if (stopTimerId) clearTimeout(stopTimerId);
  stopTimerId = setTimeout(() => {
    stopTimerId = null;
    stopRendering();
    cancelTweens();
  }, FADE_OUT_MS + 50);
}

// ---------- カメラワーク ----------

// 飛び込みの進行 u(0..1) に対する、各要素の進み具合。
//   向き: 柱の真上へ回る動き。降下より先（DIVE_TURN_BY の時点）に終わる
//   高度: 目的地の上空へ降りる動き
//   どちらも、ゆっくり動き出して途中で速くなり、終わりはまたゆっくりになる（DIVE_EASE）
//   柱へ入る: 最後の BEAM_ENTER_MS をかけて、光が太って視界を覆う（diveEnter）。
//             引くときは、同じ時間をかけて縮む（leaveLight。最初に一気に縮む）
const diveTurn = (u) => easeInOut(clamp01(u / DIVE_TURN_BY), DIVE_EASE);
const diveZoom = (u) => easeInOut(u, DIVE_EASE);
const diveEnter = (u, ms) => {
  const t = clamp01(1 - ((1 - u) * ms) / BEAM_ENTER_MS);
  return t * t * (3 - 2 * t);
};
const leaveLight = (e, ms) => Math.pow(clamp01(1 - (e * ms) / BEAM_ENTER_MS), BEAM_RUSH);

// location（[緯度, 経度]。不明なら null）に、光の柱をふわっと立ち上げる。
// 根元から伸びながら明るくなる。カメラは軌道を回ったまま動かさない。
// 柱を立てた場所を返す（不明だった場合は、ここで決めた場所）→ そのまま diveTo に渡す
export function raiseBeam(location) {
  showVeil();
  const loc = Array.isArray(location) ? location : randomLocation();
  if (!beams.some((b) => b.location === loc)) {
    const beam = makeBeam(loc, 0);
    // まだ向かってはいない（突入を始めた時点で行き先になる）
    beam.target = false;
    beams.push(beam);
    tween(BEAM_RISE_MS, (e) => {
      const p = 1 - Math.pow(1 - e, 2);
      beam.appear = p;
      beam.rise = p;
    });
  }
  return loc;
}

// location（[緯度, 経度]。不明なら null）に立つ光の柱へ飛び込む。
// カメラは柱の真上へ回り、そのまま柱をまっすぐ見下ろしながら上から中へ降りる。
// 柱は先に raiseBeam で立てておく（立っていなければ、飛び込みながら立てる）。
// 解決した時点でカメラは柱の中にいる（視界は光で満ちている）→ 呼び出し側がグリッチで映像を出す
export async function diveTo(location, ms = DIVE_MS) {
  cancelTweens();
  showVeil();
  const loc = Array.isArray(location) ? location : randomLocation();

  // それまでの柱（離れてきた場所）は、飛び込みの序盤で消えていく
  let beam = beams.find((b) => b.location === loc);
  const fading = beams.filter((b) => b !== beam).map((b) => ({ b, appear: b.appear }));
  for (const f of fading) f.b.target = false;
  if (!beam) {
    beam = makeBeam(loc, 0);
    beams.push(beam);
  }
  beam.target = true;
  const appear0 = beam.appear, rise0 = beam.rise;

  const lon0 = cam.lon, lat0 = cam.lat, zoom0 = cam.zoom, plunge0 = cam.plunge;
  cam.entering = true;
  // 軌道を進む動きは急に止めず、惰性で少し流れてから目的地へ向かう
  const drift = ORBIT_SPEED * cam.spin;
  const DRIFT_TAU = 0.5;
  const driftAt = (sec) => drift * DRIFT_TAU * (1 - Math.exp(-sec / DRIFT_TAU));
  cam.spin = 0;
  cam.follow = 0;
  const lat1 = rad(loc[0]), lon1 = rad(loc[1]);
  const turn = angleDelta(lon0 + driftAt(ms / 1000), lon1);

  await tween(ms, (u) => {
    const turned = diveTurn(u);
    cam.lon = lon0 + driftAt(u * ms / 1000) + turn * turned;
    cam.lat = lerp(lat0, lat1, turned);
    cam.zoom = lerp(zoom0, 1, diveZoom(u));
    cam.plunge = lerp(plunge0, 1, diveEnter(u, ms));
    // 柱がまだ立ちきっていなければ、序盤のうちに立ちきる
    const grown = clamp01(u * 6);
    beam.appear = lerp(appear0, 1, grown);
    beam.rise = lerp(rise0, 1, grown);
    for (const f of fading) f.b.appear = f.appear * (1 - clamp01(u * 3));
  });

  beams = [beam];
  lastLocation = loc;
}

// 行き先が見つからなかったとき、離れてきた場所へ戻る
export function diveBack() {
  return diveTo(lastLocation, RETURN_MS);
}

// いま入っている柱から軌道へ戻る。前奏グリッチと同時に呼ぶ。流れは:
//   1. 光で満ちたまま幕が重なっていく（= 映像がグリッチしながら、柱の光の白に溶ける）
//   2. 幕が覆いきったら、柱の方向へまっすぐ引く。カメラは場所の真上のまま回らず、
//      光が縮んで柱に戻る。引き始めが速く、地球全体が見えてくるにつれてゆっくりになる
//   3. 引きながら、軌道の動きへなめらかに合流する。軌道の進む向きへ少しずつ動き出し、
//      上がりきった時点で速さも向きも軌道の動きと一致する（寄せ直しや向きの切り返しは無い）
//   covered: 幕が画面を覆いきった時点（裏で映像を触ってよい）
//   done:    軌道まで上がりきった時点（続けて raiseBeam / diveTo / diveBack できる）
export function ascend() {
  cancelTweens();
  // 柱の中（= 映像のなか。光が視界を覆っている）、場所の真上から始める
  const loc = lastLocation || randomLocation();
  lastLocation = loc;
  const lat0 = rad(loc[0]);
  cam.lon = rad(loc[1]);
  cam.lat = lat0;
  cam.latHold = lat0;
  cam.zoom = 1;
  cam.plunge = 1;
  cam.entering = false;
  cam.spin = 0;
  cam.follow = 0;
  // 軌道には、いまの緯度にいちばん近い位置から合流する（緯度の動きがいちばん小さくて済む）
  orbitPhase = Math.asin(Math.max(-1, Math.min(1, lat0 / rad(ORBIT_INCLINATION))));
  beams = [makeBeam(loc, 1)];
  showVeil();

  const covered = sleep(FADE_IN_MS);
  const done = covered.then(() => tween(ASCEND_MS, (e) => {
    // 引く: 引き始めが速く、軌道の高さへ向けて長くなだらかに減速する
    cam.zoom = Math.pow(1 - e, ASCEND_ZOOM_POWER);
    // 光: 突入で光に入る動きを逆向きにたどる（引き始めに縮んで柱に戻る）
    cam.plunge = leaveLight(e, ASCEND_MS);
    // 軌道へ合流: はじめはまっすぐ引き、途中から軌道の動き（進む速さと緯度）へなめらかに移る。
    // 始まりも終わりも速さの変化が 0 なので、上がりきった瞬間から軌道の動きそのものになる
    const t = clamp01((e - ASCEND_MERGE_FROM) / (1 - ASCEND_MERGE_FROM));
    const merged = t * t * t * (t * (t * 6 - 15) + 10);
    cam.spin = merged;
    cam.follow = merged;
  }));

  return { covered, done };
}
