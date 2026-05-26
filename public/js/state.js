// 全モジュールで共有するミュータブル状態。
// 直接プロパティを書き換える形で同期。
export const state = {
  currentInfo: null,
  isSwitching: false,
  ytApiReady: false,
};
