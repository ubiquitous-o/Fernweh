// 情報オーバーレイ・ローディング・エラー・全画面 等のUI制御。
import { state } from './state.js';
import {
  $info, $infoTitle, $infoChannel, $clock, $liveBadge, $cameraTime,
  $loading, $error, $errorMsg, $btnInfo, $btnFullscreen, $globe, $controls,
} from './dom.js';

// 軌道ビューの幕が出ているあいだ、ぱっと隠す対象オーバーレイ
// （時計＋天気の clock-overlay は常時表示のままにする）
const $hideableOverlays = [$liveBadge, $info, $globe, $cameraTime];

// 幕が出るタイミングで瞬時に非表示
export function hideOverlaysInstant() {
  $hideableOverlays.forEach((el) => el?.classList.add('hide-during-orbit'));
}

// 幕が消えるタイミングで瞬時に再表示
export function showOverlaysInstant() {
  $hideableOverlays.forEach((el) => el?.classList.remove('hide-during-orbit'));
}

// 流れる文字の速さ(px/秒)
const MARQUEE_SPEED = 36;

// el に文字を入れる。枠に収まらないときだけ、横に流す（見た目は styles.css の .marquee）。
// 収まるときは文字を1つ置くだけ。収まらないときは同じ文字を2つ並べ、1つぶん流して継ぎ目なく繰り返す
function setMarquee(el, text) {
  el.dataset.text = text;
  el.classList.remove('scrolling');
  el.textContent = '';
  const track = document.createElement('span');
  track.className = 'marquee-track';
  const item = document.createElement('span');
  item.className = 'marquee-item';
  item.textContent = text;
  track.appendChild(item);
  el.appendChild(track);

  if (item.offsetWidth > el.clientWidth + 1) {
    const copy = item.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    track.appendChild(copy);
    el.classList.add('scrolling');
    // 1周 = 文字1つぶん（繰り返しのあいだの空きを含む幅）
    el.style.setProperty('--marquee-duration', `${item.offsetWidth / MARQUEE_SPEED}s`);
  }
}

// 枠の幅や文字の幅が変わったとき（画面サイズの変更、フォントの読み込み完了、
// 隠していた情報を出し直したとき）に、流すかどうかを測り直す
export function refreshMarquees() {
  for (const el of [$infoChannel, $infoTitle]) setMarquee(el, el.dataset.text || '');
}
document.fonts?.ready.then(refreshMarquees);

// ボタン列の置き場所を決める。ふだんは上端の中央。
// 縦長の画面で、上端の中央に置くと左上のLIVEや右上の時計に近すぎる（画面端の余白ぶんの空きが取れない）
// ときだけ、右端の中央に移す（見た目は styles.css の body.controls-side）。
// 設定でLIVEや時計を隠していれば、そのぶん上端が空くので上に置ける
export function updateControlsPlacement() {
  // 配置に使う幅と高さ（スマホでは window.innerWidth が配置の幅と食い違うことがあるので使わない）
  const vw = document.documentElement.clientWidth;
  let side = false;
  if (document.documentElement.clientHeight > vw) {
    const buttons = [...$controls.children];
    const gap = parseFloat(getComputedStyle($controls).columnGap) || 0;
    const rowWidth = buttons.reduce((w, b) => w + b.offsetWidth, 0) + gap * (buttons.length - 1);
    const margin = parseFloat(getComputedStyle($liveBadge).left) || 0; // 画面端の余白（--edge）と同じ幅
    // 隠している要素は幅0。そのときは画面の端までが空き
    const liveRight = $liveBadge.offsetWidth ? $liveBadge.getBoundingClientRect().right : 0;
    const clockLeft = $clock.offsetWidth ? $clock.getBoundingClientRect().left : vw;
    const rowLeft = (vw - rowWidth) / 2;
    side = rowLeft - liveRight < margin || clockLeft - (rowLeft + rowWidth) < margin;
  }
  document.body.classList.toggle('controls-side', side);
}
// 画面サイズのほか、時計パネルの幅（天気の読み込み）でも変わるので見張る。
// 設定での表示切替のときは settings.js が直接呼ぶ
window.addEventListener('resize', updateControlsPlacement);
if (window.ResizeObserver) {
  const watcher = new ResizeObserver(updateControlsPlacement);
  watcher.observe($clock);
  watcher.observe($liveBadge);
}
updateControlsPlacement();

export function showInfo(data) {
  setMarquee($infoChannel, data.channel || '');
  setMarquee($infoTitle, data.title || '');
  $infoTitle.href = `https://www.youtube.com/watch?v=${data.videoId}`;
  $info.classList.add('show');
}

export function showOverlays() {
  $clock.classList.add('show');
  $liveBadge.classList.add('show');
  if (state.currentInfo?.timezone) $cameraTime.classList.add('show');
}

// --- 宇宙船の計器ふうの表示（軌道ビューのあいだ、地球の下に出す） ---
const $loadingStatus = document.getElementById('loading-status');
const $loadingPlace = document.getElementById('loading-place');

// 目的地を探しているあいだ（起動時、切替えで軌道へ戻ったあと）
export function showSearching() {
  $loadingStatus.textContent = 'Scanning for destination...';
  $loadingPlace.textContent = '';
  $loading.classList.remove('locked', 'alarm', 'crashing', 'fade-out');
}

// 行き先が決まった（光の柱が立ち上がるのと同時に呼ぶ）。地名が分かっていれば下に出す。
// 場所の分からない映像（known = false）のときは柱が立たない。行き先を失ったエラーとして警報を出す
// （赤い点滅。見た目は styles.css の .alarm）。このあと墜落が始まったら showCrashing を呼ぶ
export function showLocked(locationName, known = true) {
  $loadingStatus.textContent = known ? 'Destination locked' : '!! Navigation error !!';
  $loadingPlace.textContent = known ? (locationName || '') : 'Destination not found';
  $loading.classList.remove('fade-out', 'crashing');
  $loading.classList.add('locked');
  $loading.classList.toggle('alarm', !known);
}

// 墜落が始まった（警報の続き）。表示が揺れ出し、高度を失っていることを告げる
export function showCrashing() {
  $loadingStatus.textContent = '!! System failure !!';
  $loadingPlace.textContent = 'Losing altitude';
  $loading.classList.add('crashing');
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

// 全画面の状態を、設定パネルのスイッチやリンクに反映する。
// 全画面に入れなかったとき（ブラウザに拒否された等）にスイッチを戻すためにも呼ぶ
export function updateFullscreenUI() {
  const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
  $btnFullscreen.checked = isFS;
  $btnInfo.style.display = isFS ? 'none' : '';
  $infoTitle.style.pointerEvents = isFS ? 'none' : '';
  $infoTitle.style.textDecoration = isFS ? 'none' : '';
}

document.addEventListener('fullscreenchange', updateFullscreenUI);
document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
