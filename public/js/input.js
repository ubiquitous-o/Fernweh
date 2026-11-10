// マウス・キーボード・クリック入力。
import { $btnSkip, $btnFullscreen } from './dom.js';
import { toggleFullscreen, updateFullscreenUI } from './ui.js';
import { switchVideo } from './transitions.js';
import { isSettingsOpen, closeSettings } from './settings.js';

let mouseTimer = null;

function onMouseMove() {
  document.body.classList.add('mouse-active');
  clearTimeout(mouseTimer);
  mouseTimer = setTimeout(() => {
    document.body.classList.remove('mouse-active');
  }, 3000);
}

export function initInput() {
  document.addEventListener('mousemove', onMouseMove);

  $btnSkip.addEventListener('click', (e) => {
    e.stopPropagation();
    switchVideo();
  });

  // 全画面は設定パネルのスイッチ。全画面に入れなかった場合はスイッチを実際の状態へ戻す
  $btnFullscreen.addEventListener('change', () => {
    toggleFullscreen();
    setTimeout(updateFullscreenUI, 400);
  });

  // 画面クリックでスキップ（コントロール・設定パネル・タイトルリンクは除外）。
  // 設定パネルを開いているあいだの外側クリックは、パネルを閉じるだけにする
  document.addEventListener('click', (e) => {
    if (e.target.closest('.controls, .settings-panel, .info-title')) return;
    if (isSettingsOpen()) {
      closeSettings();
      return;
    }
    switchVideo();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSettings();
      return;
    }
    // 設定パネルのスイッチを操作しているキー入力は、ショートカットとして扱わない
    if (e.target.closest?.('.settings-panel')) return;
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'n') {
      switchVideo();
    } else if (e.key === 'f' || e.key === 'F11') {
      e.preventDefault();
      toggleFullscreen();
    }
  });
}
