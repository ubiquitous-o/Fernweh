#!/usr/bin/env node

// audit-videos.js — public/videos.json の全動画を YouTube Data API で再確認し、
// 埋め込み不可 / 非公開 / 配信終了になっているものを報告する。
//
// Usage:
//   YOUTUBE_API_KEY=xxx node scripts/audit-videos.js          # レポートのみ
//   YOUTUBE_API_KEY=xxx node scripts/audit-videos.js --prune  # videos.json を上書き保存
//
// --prune を付けない限り videos.json は変更しない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fetchVideoDetails, isUsableVideo } from './lib/youtube.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VIDEOS_PATH = join(__dirname, '..', 'public', 'videos.json');

const PRUNE = process.argv.includes('--prune');

async function main() {
  const videos = JSON.parse(readFileSync(VIDEOS_PATH, 'utf-8'));
  console.log(`videos.json: ${videos.length}件をチェック`);

  const ids = videos.map((v) => v.videoId);
  const details = await fetchVideoDetails(ids);

  const bad = [];
  const good = [];
  for (const v of videos) {
    const d = details[v.videoId];
    if (isUsableVideo(d)) {
      good.push(v);
    } else {
      bad.push({ v, d });
    }
  }

  console.log(`\n=== 結果 ===`);
  console.log(`OK: ${good.length}件`);
  console.log(`NG: ${bad.length}件\n`);

  if (bad.length > 0) {
    console.log('--- NG 動画一覧 ---');
    for (const { v, d } of bad) {
      const reason = !d
        ? 'API応答なし(削除/private)'
        : `embeddable=${d.embeddable} privacy=${d.privacyStatus} live=${d.isLive}`;
      console.log(`  ${v.videoId}  ${reason}`);
      console.log(`    ${v.title}`);
      console.log(`    channel: ${v.channel}`);
    }
  }

  if (PRUNE && bad.length > 0) {
    writeFileSync(VIDEOS_PATH, JSON.stringify(good, null, 2));
    console.log(`\nvideos.json を ${good.length}件に書き換えました`);
  } else if (PRUNE) {
    console.log('\n削除対象なし');
  } else if (bad.length > 0) {
    console.log('\n--prune を付けて再実行すると videos.json から削除します');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
