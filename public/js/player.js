// YouTube IFrame Player API のラッパー（2レイヤーcrossfade版）。
// 切替時に inactive layer に新規 YT.Player を作成し、PLAYING になったら swap する。
// 単一player + loadVideoById方式はbot検知に引っかかりやすいため避ける。
import { getLayer } from './dom.js';

const PLAYBACK_TIMEOUT = 15000;

// レイヤーIDごとのYT.Playerインスタンス
export const players = { a: null, b: null };

// 指定レイヤーに新規 YT.Player を作る。PLAYING に遷移したら resolve。
export function createPlayer(layerId, videoId) {
  return new Promise((resolve, reject) => {
    const elementId = `player-${layerId}`;
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.warn(`Playback timeout: ${videoId}`);
        reject(new Error('Playback timeout'));
      }
    }, PLAYBACK_TIMEOUT);

    // 既存playerがあれば破棄
    if (players[layerId]) {
      try { players[layerId].destroy(); } catch {}
      players[layerId] = null;
    }

    // プレーヤー用div再生成
    const $layer = getLayer(layerId);
    $layer.innerHTML = `<div id="${elementId}"></div>`;

    players[layerId] = new YT.Player(elementId, {
      videoId,
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: 1,
        mute: 1,
        controls: 0,
        showinfo: 0,
        rel: 0,
        modestbranding: 1,
        iv_load_policy: 3,
        loop: 1,
        playlist: videoId,
        enablejsapi: 1,
        origin: location.origin,
        playsinline: 1,
        disablekb: 1,
        cc_load_policy: 0,
        fs: 0,
      },
      events: {
        onReady: (e) => {
          e.target.mute();
          e.target.playVideo();
        },
        onStateChange: (e) => {
          // UNSTARTED=-1, ENDED=0, PLAYING=1, PAUSED=2, BUFFERING=3, CUED=5
          if (e.data === 1 && !settled) {
            settled = true;
            clearTimeout(timeoutId);
            resolve();
          }
          // 隠しiframeでの謎の自動pauseを検出したら即座に再開
          if (e.data === 2) {
            try { e.target.playVideo(); } catch {}
          }
        },
        onError: (e) => {
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            console.warn(`Player error (code ${e.data}): ${videoId}`);
            reject(new Error(`Player error: ${e.data}`));
          }
        },
      },
    });
  });
}

// 指定レイヤーのplayerを破棄してdivを差し戻す。
export function destroyPlayer(layerId) {
  if (players[layerId]) {
    try { players[layerId].destroy(); } catch {}
    players[layerId] = null;
  }
  const $layer = getLayer(layerId);
  $layer.innerHTML = `<div id="player-${layerId}"></div>`;
}
