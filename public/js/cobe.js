// COBE（3D地球儀ライブラリ）の共有ローダー。
// 右下の地球儀（globe.js）が使う。
// 読み込みに失敗した場合は null で解決する（呼び出し側は地球儀なしで動き続ける）。
export const cobeReady = import('https://esm.sh/cobe@0.6.3')
  .then((m) => m.default)
  .catch((e) => {
    console.warn('Globe library failed to load:', e);
    return null;
  });
