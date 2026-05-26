// YouTube IFrame Player API のラッパー。
// 単一のYT.Playerインスタンスを使い回し、loadVideoByIdで動画を切り替える。
import { state } from './state.js';
import { $videoLayer } from './dom.js';

const PLAYBACK_TIMEOUT = 15000;

export const playerRef = {
  instance: null,
};

// loadVideoById後、PLAYING遷移を待つpromiseのresolver
let loadResolver = null;

// 初回のみ呼ぶ：YT.Playerインスタンスを1つ作る
export function createPlayer(videoId) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Initial playback timeout'));
      }
    }, PLAYBACK_TIMEOUT);

    $videoLayer.innerHTML = `<div id="player"></div>`;

    playerRef.instance = new YT.Player('player', {
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
          if (e.data === 1) {
            if (!settled) {
              settled = true;
              clearTimeout(timeoutId);
              resolve();
            }
            if (loadResolver) {
              const r = loadResolver;
              loadResolver = null;
              r();
            }
          }
          // 自動pauseを検出したら即座に再開
          if (e.data === 2) {
            try { e.target.playVideo(); } catch {}
          }
        },
        onError: (e) => {
          console.warn(`Player error (code ${e.data})`);
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            reject(new Error(`Player error: ${e.data}`));
          }
          if (loadResolver) {
            const r = loadResolver;
            loadResolver = null;
            r(new Error(`Player error: ${e.data}`));
          }
        },
      },
    });
  });
}

// 切替時に呼ぶ：既存playerに新しい動画をロード、PLAYING到達まで待つ
export function loadVideo(videoId) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (loadResolver) {
        loadResolver = null;
        reject(new Error('Load timeout'));
      }
    }, PLAYBACK_TIMEOUT);

    loadResolver = (err) => {
      clearTimeout(timeoutId);
      if (err) reject(err); else resolve();
    };

    try {
      playerRef.instance.loadVideoById(videoId);
    } catch (err) {
      clearTimeout(timeoutId);
      loadResolver = null;
      reject(err);
    }
  });
}
