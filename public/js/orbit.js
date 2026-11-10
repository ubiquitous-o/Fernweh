// 起動時・切替時の「幕」: 衛星軌道から地球を眺める演出。
//   - 星空の中に地球が丸ごと浮かんでいる。カメラは傾いた衛星軌道を回っていて、
//     地球が回りながら北半球と南半球をゆっくり行き来して見える（軌道ビュー）。
//     昼夜の境目は実際の時刻どおり。夜側には街明かりが見える。
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
// 終盤はここでゆっくり止まるので、画像がぼやけない「地方が見渡せる高さ」にとどめる
const SURFACE_RADIUS = 2.0;
// 飛び込みのカメラと地球の動きのイージング（ease-out の強さ）。最初が速く、最後はゆっくりになる。
// 大きいほど緩急が強い
const EASE_POWER = 3;
// ズーム（高度）だけのイージングの強さ。回転より弱くして、出だしで一気に寄りすぎないようにする。
// 小さいほどズームがゆっくり均一に進む
const ZOOM_EASE_POWER = 2;
// 減速をどこまでやりきってから光に入るか（1 = 完全に止まってから。小さいほど、まだ動いているうちに入る）。
// 1 だと柱の真上でとどまる時間が長くなる
const DIVE_SETTLE = 0.7;
// 飛び込みでは、柱の真上へ回る動きを降下より先に終える。
// 進行がここに達した時点で真上に着く（1 なら降下と同時、小さいほど早い）
const DIVE_TURN_BY = 0.8;
// 引く動きのイージング（ease-out の強さ）。引き始めが速く、地球全体が見えてくるにつれてゆっくりになり、
// 止まるころにはほとんど動いていない。大きいほど出だしが速く、減速が長い
const ASCEND_ZOOM_POWER = 3;
// 引く動きのうち、軌道の動きへ合流し始める時点（進行 0..1）。それまでは柱の方向へまっすぐ引く
const ASCEND_MERGE_FROM = 0.15;
// 光の柱: 長さ(地球の半径に対する比) / 軌道での太さ(半幅px、短辺600px基準) / 降りきるまでに太る倍率
const BEAM_LENGTH = 0.3;
const BEAM_PX = 1.6;
const BEAM_GROW = 1.5;
// 柱へ入る動き: 光は飛び込みの最後の BEAM_ENTER_MS だけで視界を覆う（それまでは小さな光の点のまま）。
// 柱はカメラからの距離に反比例して太く見える（BEAM_RUSH はその詰まり方の指数）。
// BEAM_COVER は視界を覆いきったとみなす太さ（画面対角線比）
const BEAM_ENTER_MS = 1000;
const BEAM_RUSH = 3;
const BEAM_COVER = 0.8;
// 柱の光の色（ほぼ白）と、その光で視界が満ちたときの明るさ（細い柱のときを1として）
const BEAM_COLOR = [1.0, 0.98, 0.95];
const WASH_LEVEL = 0.95;
// 降りるにつれて地表がうっすら霞む度合いの上限（大気の中に入った感じを出す）
const HAZE_MAX = 0.25;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const easeOut = (t, power = EASE_POWER) => 1 - Math.pow(1 - t, power);
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

// ---------- カメラの状態（描画とは独立。WebGLが無くても時間どおり進む） ----------
// lat / lon はカメラが真下に見ている地点（直下点）。
const cam = {
  lat: 0,     // 直下点の緯度(rad)
  lon: 0,     // 直下点の経度(rad)。増えるとカメラが東へ進む
  zoom: 0,    // 0 = 軌道の高さ（地球全体が見える）.. 1 = 降りきった高さ（目的地の上空）
  plunge: 0,  // 0 = 柱は遠くの細い筋 .. 1 = 柱の中に入りきった（光が視界を覆う）
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
  // 柱へ入る: カメラから柱までの距離 dist が 1 → ほぼ0 へ詰まり、柱は 1/dist で太く見える。
  // plunge が 1 のとき、ちょうど視界を覆いきる太さになるように距離の終点を決める
  const cover = BEAM_COVER * diag;
  const distEnd = Math.pow(thin / cover, 1 / BEAM_RUSH);
  const dist = Math.pow(1 - cam.plunge * (1 - distEnd), BEAM_RUSH);
  const entering = thin / dist;
  const covered = clamp01(entering / cover);
  // 柱が太く見えるほど光を WASH_LEVEL まで落として眩しさを抑える
  const bright = lerp(1, WASH_LEVEL, covered);

  // 地球はいつも画面中央。カメラが柱の真上に着くと、柱は先端をこちらへ向けて画面中央に来る
  const cx = w / 2, cy = h / 2;

  const [sunLat, sunLon] = subsolarPoint(new Date());

  return {
    // カメラが軌道を進むと星空も流れる。柱の光に包まれるほど星を沈める
    pan: [cam.lon * 0.15, cam.lat * 0.3],
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
    // 視界の大半が柱の光になったら、残りも光で満たして「中に入った」状態にする
    fill: clamp01((covered - 0.55) / 0.45),
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
//   向き: 柱の真上へ回る動き。ease-out で、降下より先（DIVE_TURN_BY の時点）に終わる
//   高度: ease-out。出だしが速く、目的地の上空へ向けて減速する
//   柱へ入る: 最後の BEAM_ENTER_MS だけで、光が一気に視界を覆う
// 向きも高度も、減速しきる手前（DIVE_SETTLE）で終点に着くように ease-out の前半だけを使う
const settle = (t, power) => easeOut(t * DIVE_SETTLE, power) / easeOut(DIVE_SETTLE, power);
const diveTurn = (u) => settle(clamp01(u / DIVE_TURN_BY), EASE_POWER);
const diveZoom = (u) => settle(u, ZOOM_EASE_POWER);
const divePlunge = (u, ms) => Math.pow(clamp01(1 - ((1 - u) * ms) / BEAM_ENTER_MS), 2);

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
    cam.plunge = lerp(plunge0, 1, divePlunge(u, ms));
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
    cam.plunge = divePlunge(1 - e, ASCEND_MS);
    // 軌道へ合流: はじめはまっすぐ引き、途中から軌道の動き（進む速さと緯度）へなめらかに移る。
    // 始まりも終わりも速さの変化が 0 なので、上がりきった瞬間から軌道の動きそのものになる
    const t = clamp01((e - ASCEND_MERGE_FROM) / (1 - ASCEND_MERGE_FROM));
    const merged = t * t * t * (t * (t * 6 - 15) + 10);
    cam.spin = merged;
    cam.follow = merged;
  }));

  return { covered, done };
}
