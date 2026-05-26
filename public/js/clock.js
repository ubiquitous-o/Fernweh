// メイン時計とカメラ現地時刻の表示。
import { state } from './state.js';
import {
  $clockTime, $clockDate, $cameraTime, $cameraTimeClock, $cameraTimeDiff,
  $globe, $globeLabel,
} from './dom.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  $clockTime.textContent = `${h}:${m}`;

  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const day = DAYS[now.getDay()];
  $clockDate.textContent = `${y}.${mo}.${d} ${day}`;
  updateCameraTime();
}

function getTimezoneDiffMinutes(now, tz) {
  // リモートTZの「見かけの時刻」をIntlで取得し、ローカルTZと比較
  const fmt = (timeZone) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: 'numeric', minute: 'numeric', hour12: false,
      year: 'numeric', month: 'numeric', day: 'numeric',
    }).formatToParts(now);
    const get = (type) => parseInt(parts.find(p => p.type === type).value, 10);
    return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  };
  const localApparent = fmt(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const remoteApparent = fmt(tz);
  return Math.round((remoteApparent - localApparent) / 60000);
}

function formatTimeDiff(diffMin) {
  if (diffMin === 0) return 'Same time';
  const sign = diffMin > 0 ? '+' : '-';
  const abs = Math.abs(diffMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${sign}${h}h` : `${sign}${h}:${String(m).padStart(2, '0')}`;
}

export function updateCameraTime() {
  if (!state.currentInfo?.timezone) { $cameraTime.classList.remove('show'); return; }
  const tz = state.currentInfo.timezone;
  const now = new Date();
  $cameraTimeClock.textContent = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
  $cameraTimeDiff.textContent = formatTimeDiff(getTimezoneDiffMinutes(now, tz));
  repositionCameraTime();
  $cameraTime.classList.add('show');
}

// グローブ上のラベルにかぶらないようcamera-timeのbottomを調整。
// globe.jsからも呼ばれる。
export function repositionCameraTime() {
  const viewH = window.innerHeight;
  const globeRect = $globe.getBoundingClientRect();
  const baseBottom = viewH - globeRect.top + 10;
  const labelVisible = $globeLabel.classList.contains('show')
    && parseFloat($globeLabel.style.opacity || '0') > 0;
  if (labelVisible) {
    const labelRect = $globeLabel.getBoundingClientRect();
    const needed = viewH - labelRect.top + 4;
    $cameraTime.style.bottom = Math.max(baseBottom, needed) + 'px';
  } else {
    $cameraTime.style.bottom = baseBottom + 'px';
  }
}
