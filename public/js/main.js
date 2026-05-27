// エントリーポイント：各モジュールを統合して初期化する。
import { state } from './state.js';
import { startNoise } from './noise.js';
import { switchVideo, resumeVideo, initialSwitch } from './transitions.js';
import { updateClock } from './clock.js';
import { repositionCameraTime } from './clock.js';
import { initWeather } from './weather.js';
import { updateGlobe } from './globe.js';
import { initInput } from './input.js';
import { shiftOverlays } from './burnin.js';

const RESUME_KEY = 'fernweh_resume';

// YouTube IFrame APIがロードされたら呼ばれる。
// ESモジュールはdefer扱いなのでHTML上の<script src="iframe_api">タグを先に置くと
// コールバックが未定義のまま呼ばれてしまう → 先にコールバックを定義してから動的ロードする。
window.onYouTubeIframeAPIReady = () => {
  state.ytApiReady = true;
  const saved = sessionStorage.getItem(RESUME_KEY);
  if (saved) {
    sessionStorage.removeItem(RESUME_KEY);
    try {
      const data = JSON.parse(saved);
      resumeVideo(data);
      return;
    } catch {}
  }
  initialSwitch();
};

// YouTube IFrame APIを動的にロード（onYouTubeIframeAPIReady定義後）
const ytApiScript = document.createElement('script');
ytApiScript.src = 'https://www.youtube.com/iframe_api';
document.head.appendChild(ytApiScript);

// ページ離脱時に現在の動画を保存（ブラウザbackで復元するため）
window.addEventListener('pagehide', () => {
  if (state.currentInfo) {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify(state.currentInfo));
  }
});

// YT IFrame APIロード失敗時のフォールバック
setTimeout(() => {
  if (!state.ytApiReady) {
    console.error('YouTube IFrame API failed to load. Reloading...');
    location.reload();
  }
}, 30000);

// リサイズ時にグローブとカメラ時刻を再配置
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.currentInfo) {
      updateGlobe(state.currentInfo.location, state.currentInfo.locationName);
      repositionCameraTime();
    }
  }, 500);
});

// 初期化
initInput();
updateClock();
setInterval(updateClock, 10000);
initWeather();
setInterval(shiftOverlays, 10 * 60 * 1000);

// 初回ロード時から砂嵐表示（動画ロード中も覆う）
startNoise();
