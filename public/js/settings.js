// 設定: 画面のどのUIを出すかと、映像を何分ごとに切り替えるか。ボタン列の設定ボタンでパネルを開く。
//   clock: 右上の時計と天気 / place: 右下の現地時刻と地球儀 / live: 左上のLIVE / info: 左下の映像の情報
//   interval: 映像を切り替える間隔(分)。＋/−ボタンで選び、パネルを閉じたときに効く。
//             切り替えのタイマーそのものは progress.js
// 選んだ内容はブラウザ（localStorage）に保存され、次に開いたときも引き継がれる。
// 隠すときは body にクラスを付けるだけで、実際に消すのは styles.css。
import { state } from './state.js';
import { $btnSettings, $settingsPanel } from './dom.js';
import { updateGlobe } from './globe.js';
import { updateCameraTime } from './clock.js';
import { refreshMarquees, updateControlsPlacement } from './ui.js';
import { initWeather } from './weather.js';
import {
  setSwitchInterval, DEFAULT_INTERVAL_MIN, MIN_INTERVAL_MIN, MAX_INTERVAL_MIN,
} from './progress.js';

const STORAGE_KEY = 'fernweh_settings';
// 設定の項目 → 隠すときに body へ付けるクラス
const HIDE_CLASS = {
  clock: 'hide-clock',
  place: 'hide-place',
  live: 'hide-live',
  info: 'hide-info',
};
// 既定は「時計と天気」だけ隠し、ほかは表示。
// 天気には現在地が要るので、位置の取得は「時計と天気」を出したときに初めて行う
const settings = { clock: false, place: true, live: true, info: true };
// 映像を切り替える間隔(分)。interval はいま効いている値、pending はパネルに出している値。
// ＋/−ボタンで変わるのは pending だけで、パネルを閉じたときに interval へ移して効かせる
let interval = DEFAULT_INTERVAL_MIN;
let pending = interval;
const $interval = document.getElementById('setting-interval');
// ＋/−ボタンのきざみ: [この分数より下では, きざみ(分)]。間隔が長いほど大きく進む
const INTERVAL_STEPS = [[5, 1], [60, 5], [240, 30], [Infinity, 60]];
// ＋/−ボタンを押し続けたとき: 連続して進み始めるまでの時間(ms) / 進む間隔(ms)
const HOLD_DELAY_MS = 400;
const HOLD_REPEAT_MS = 90;

// 値を、設定できる間隔（整数の分、範囲内）に直す。数として読めなければ null
function toInterval(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, n));
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const key of Object.keys(settings)) {
      if (typeof saved[key] === 'boolean') settings[key] = saved[key];
    }
    if (typeof saved.interval === 'number') interval = toInterval(saved.interval) ?? interval;
  } catch {}
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, interval })); } catch {}
}

function apply() {
  for (const [key, cls] of Object.entries(HIDE_CLASS)) {
    document.body.classList.toggle(cls, !settings[key]);
  }
  // LIVEや時計を隠すと上端が空くので、ボタン列の置き場所も決め直す
  updateControlsPlacement();
}

// 表示を切り替えたあと、隠れているあいだは止めていた描画や、隠れていて測れなかった幅をやり直す
function refresh(key) {
  if (key === 'clock' && settings.clock) initWeather();
  if (key === 'place' && state.currentInfo) {
    // 隠すときは地球儀の描画を止め、出すときは作り直す（どちらも updateGlobe が面倒を見る）
    updateGlobe(state.currentInfo.location, state.currentInfo.locationName);
    updateCameraTime();
  }
  if (key === 'info' && settings.info) refreshMarquees();
}

export function isSettingsOpen() {
  return document.body.classList.contains('settings-open');
}

export function closeSettings() {
  if (!isSettingsOpen()) return;
  document.body.classList.remove('settings-open');
  stopHold();
  // 切り替えの間隔は、パネルを閉じたここで効かせる
  if (pending !== interval) {
    interval = pending;
    save();
    setSwitchInterval(interval);
  }
}

function toggleSettings() {
  if (isSettingsOpen()) {
    closeSettings();
    return;
  }
  pending = interval;
  $interval.textContent = pending;
  document.body.classList.add('settings-open');
}

// ＋/−ボタンで進む先。きざみの倍数にそろえながら進む
function stepInterval(from, direction) {
  if (direction > 0) {
    const [, step] = INTERVAL_STEPS.find(([limit]) => from < limit);
    return (Math.floor(from / step) + 1) * step;
  }
  const [, step] = INTERVAL_STEPS.find(([limit]) => from <= limit);
  return (Math.ceil(from / step) - 1) * step;
}

// パネルに出している間隔を1きざみ進める（効かせるのはパネルを閉じたとき）
function stepPending(direction) {
  pending = toInterval(stepInterval(pending, direction));
  $interval.textContent = pending;
}

// ＋/−ボタンの押し続け
let holdDelay = null;
let holdRepeat = null;
// 押し続けで進んだあと、指を離したときのクリックでもう1つ進まないようにする印
let held = false;
function stopHold() {
  clearTimeout(holdDelay);
  clearInterval(holdRepeat);
}

// 保存してある設定は、読み込まれた時点ですぐ反映する（最初の描画の前に間に合うように）
load();
pending = interval;
apply();
setSwitchInterval(interval);

export function initSettings() {
  // 前回から「時計と天気」を出したままなら、起動時に位置と天気を取りに行く
  if (settings.clock) initWeather();

  for (const input of $settingsPanel.querySelectorAll('input[data-setting]')) {
    const key = input.dataset.setting;
    input.checked = settings[key];
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      save();
      apply();
      refresh(key);
    });
  }

  // 切り替えの間隔は＋/−ボタンだけで変える。1回押すと1きざみ、押し続けると連続して進む
  $interval.textContent = pending;
  for (const button of $settingsPanel.querySelectorAll('[data-step]')) {
    const direction = Number(button.dataset.step);
    button.addEventListener('click', () => {
      if (held) {
        held = false;
        return;
      }
      stepPending(direction);
    });
    button.addEventListener('pointerdown', () => {
      stopHold();
      held = false;
      holdDelay = setTimeout(() => {
        held = true;
        stepPending(direction);
        holdRepeat = setInterval(() => stepPending(direction), HOLD_REPEAT_MS);
      }, HOLD_DELAY_MS);
    });
    button.addEventListener('pointerup', stopHold);
    // ボタンの外で離したときはクリックが来ないので、印も戻す
    for (const type of ['pointerleave', 'pointercancel']) {
      button.addEventListener(type, () => {
        stopHold();
        held = false;
      });
    }
  }

  $btnSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSettings();
  });
}
