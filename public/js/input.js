// マウス・キーボード・クリック入力。
import { $btnSkip, $btnFullscreen } from './dom.js';
import { toggleFullscreen } from './ui.js';
import { switchVideo } from './transitions.js';

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

  $btnFullscreen.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFullscreen();
  });

  // 画面クリックでスキップ（コントロール・タイトルリンクは除外）
  document.addEventListener('click', (e) => {
    if (e.target.closest('.controls, .info-title')) return;
    switchVideo();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'n') {
      switchVideo();
    } else if (e.key === 'f' || e.key === 'F11') {
      e.preventDefault();
      toggleFullscreen();
    }
  });
}
