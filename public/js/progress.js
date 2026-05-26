// 次の動画切替までのカウントダウン進捗バー + 毎時自動切替タイマー。
import { $progress } from './dom.js';

let switchTimer = null;
let progressTimer = null;

function msUntilNextHour() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return next - now;
}

// switchVideoはtransitions.jsから渡してもらう（循環依存回避）
export function resetSwitchTimer(switchVideoFn) {
  clearTimeout(switchTimer);
  clearInterval(progressTimer);

  switchTimer = setTimeout(switchVideoFn, msUntilNextHour());

  function updateProgress() {
    const now = new Date();
    const pct = (now.getMinutes() * 60 + now.getSeconds()) / 3600 * 100;
    $progress.style.width = `${pct}%`;
  }
  updateProgress();
  progressTimer = setInterval(updateProgress, 1000);
}
