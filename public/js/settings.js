// 設定: 画面のどのUIを出すかを切り替える。ボタン列の設定ボタンでパネルを開く。
//   clock: 右上の時計と天気 / place: 右下の現地時刻と地球儀 / live: 左上のLIVE / info: 左下の映像の情報
// 選んだ内容はブラウザ（localStorage）に保存され、次に開いたときも引き継がれる。
// 隠すときは body にクラスを付けるだけで、実際に消すのは styles.css。
import { state } from './state.js';
import { $btnSettings, $settingsPanel } from './dom.js';
import { updateGlobe } from './globe.js';
import { updateCameraTime } from './clock.js';
import { refreshMarquees, updateControlsPlacement } from './ui.js';
import { initWeather } from './weather.js';

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

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const key of Object.keys(settings)) {
      if (typeof saved[key] === 'boolean') settings[key] = saved[key];
    }
  } catch {}
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
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
  document.body.classList.remove('settings-open');
}

function toggleSettings() {
  document.body.classList.toggle('settings-open');
}

// 保存してある設定は、読み込まれた時点ですぐ反映する（最初の描画の前に間に合うように）
load();
apply();

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

  $btnSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSettings();
  });
}
