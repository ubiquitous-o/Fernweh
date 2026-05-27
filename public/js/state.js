// 全モジュールで共有するミュータブル状態。
// 直接プロパティを書き換える形で同期。
export const state = {
  currentInfo: null,
  isSwitching: false,
  ytApiReady: false,
  activeLayer: 'a', // 'a' | 'b' — 表示中のレイヤーID
  // 非アクティブレイヤーで事前ロードしている次の動画
  preload: {
    layerId: null,         // 'a' | 'b' (= 非アクティブレイヤー) or null
    data: null,            // 動画メタデータ
    status: 'idle',        // 'idle' | 'loading' | 'playing' | 'ready' | 'failed'
    playingAt: 0,          // PLAYING到達時刻 (performance.now())
    readyTimerId: null,    // 'playing' → 'ready' へのsetTimeout ID
  },
};
