// キオスクモードでの長時間表示用：オーバーレイを定期的に微妙にずらして焼き付き予防。
export function shiftOverlays() {
  const offsetX = Math.round(Math.random() * 20 - 10); // -10 to +10px
  const offsetY = Math.round(Math.random() * 20 - 10);
  document.documentElement.style.setProperty('--shift-x', offsetX + 'px');
  document.documentElement.style.setProperty('--shift-y', offsetY + 'px');
}
