// 次の動画切替までのカウントダウン進捗バー + 自動切替タイマー。
// 映像が出てから「切り替えの間隔」が経つと、次の映像へ切り替える
// （手動で切り替えたときも、新しい映像が出たところから数え直す）。
// 切り替えが始まるとバーは0に戻り、次の映像が出るまでそのまま待つ。
// 間隔は設定パネルで変えられる（パネルを閉じたときに settings.js が setSwitchInterval を呼ぶ）。
import { $progress } from './dom.js';

// 切り替えの間隔(分): 既定 / 設定できる範囲
export const DEFAULT_INTERVAL_MIN = 1;
export const MIN_INTERVAL_MIN = 1;
export const MAX_INTERVAL_MIN = 24 * 60;
let intervalMs = DEFAULT_INTERVAL_MIN * 60 * 1000;
let switchTimer = null;
let progressTimer = null;
// 切り替えの関数（transitions.js から渡してもらう）と、いまの映像が出た時刻(ms)
let switchFn = null;
let shownAt = 0;
// 数えている最中か（映像が出ているあいだだけ true。切り替えの途中や最初の読み込み中は false）
let counting = false;
// バーのいまの長さ(%)
let barPct = 0;

// バーの長さを変える。伸びるときはなめらかに（styles.css の transition）、
// 戻るとき（切り替えが始まった、間隔を長くした）はぱっと戻す
function setBar(pct) {
  if (pct < barPct) {
    $progress.style.transition = 'none';
    $progress.style.width = `${pct}%`;
    void $progress.offsetWidth; // ここで一度反映させてから、動きを元に戻す
    $progress.style.transition = '';
  } else {
    $progress.style.width = `${pct}%`;
  }
  barPct = pct;
}

function schedule() {
  clearTimeout(switchTimer);
  clearInterval(progressTimer);

  // 間隔を短くして、いまの映像がもうその間隔より長く出ているときは、すぐ切り替える
  switchTimer = setTimeout(switchFn, Math.max(0, shownAt + intervalMs - Date.now()));

  // バーは、映像が出てからの時間を間隔に対する割合で表す（左端 = 映像が出た、右端 = 切り替え）
  const updateProgress = () => setBar(Math.min(1, (Date.now() - shownAt) / intervalMs) * 100);
  updateProgress();
  progressTimer = setInterval(updateProgress, 1000);
}

// 映像が出たときに呼ぶ。ここから間隔を数え始める。
// switchVideoはtransitions.jsから渡してもらう（循環依存回避）
export function resetSwitchTimer(switchVideoFn) {
  switchFn = switchVideoFn;
  shownAt = Date.now();
  counting = true;
  schedule();
}

// 切り替えが始まったときに呼ぶ（自動でも手動でも）。数えるのをやめて、バーを0に戻す。
// 次の映像が出て resetSwitchTimer が呼ばれるまで、そのまま待つ
export function holdSwitchTimer() {
  clearTimeout(switchTimer);
  clearInterval(progressTimer);
  counting = false;
  setBar(0);
}

// 切り替えの間隔(分)を変える。いまの映像が出た時刻はそのままに、新しい間隔でタイマーを組み直す
// （映像が出ていないあいだなら、出たときの resetSwitchTimer が新しい間隔を使う）
export function setSwitchInterval(minutes) {
  intervalMs = minutes * 60 * 1000;
  if (counting) schedule();
}
