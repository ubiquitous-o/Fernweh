#!/usr/bin/env node
// 単一動画のロケーション抽出テスト（本番と同じパスを通す）
// Usage: node scripts/test-single-video.js <videoId>

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { extractLocationFromDict } from './lib/locations.js';
import { integrateGeocacheIntoDict } from './lib/geocode.js';
import { GEMINI_API_KEY, extractLocationsWithGemini } from './lib/gemini.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_PATH = join(__dirname, '..', 'config.json');

// YouTube API キーは fetch-videos.js が環境変数を必須にしているので、テストでは config.json から拾う
let YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
if (!YOUTUBE_API_KEY) {
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    YOUTUBE_API_KEY = config.youtube_api_key;
  } catch {}
}
if (!YOUTUBE_API_KEY) {
  console.error('YOUTUBE_API_KEY が必要 (env か config.json)');
  process.exit(1);
}

integrateGeocacheIntoDict();

const VIDEO_ID = process.argv[2] || '5e4lsEe4Vew';
console.log(`\n=== 動画 ${VIDEO_ID} のテスト ===\n`);

const params = new URLSearchParams({
  part: 'snippet',
  id: VIDEO_ID,
  key: YOUTUBE_API_KEY,
});
const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
const data = await res.json();
const snippet = data.items?.[0]?.snippet;

if (!snippet) {
  console.error('動画が見つからない');
  process.exit(1);
}

const title = snippet.title;
const channel = snippet.channelTitle;
const description = snippet.description || '';

console.log(`Title:   ${title}`);
console.log(`Channel: ${channel}`);
console.log(`Description (先頭300文字):\n${description.slice(0, 300)}\n`);
console.log(`Description 全文文字数: ${description.length}\n`);

const dictTitle = extractLocationFromDict(title);
const dictChannel = extractLocationFromDict(channel);
const dictDesc = extractLocationFromDict(description);

console.log(`--- 辞書マッチ結果 ---`);
console.log(`  title match:       ${dictTitle?.name || '(なし)'}`);
console.log(`  channel match:     ${dictChannel?.name || '(なし)'}`);
console.log(`  description match: ${dictDesc?.name || '(なし)'} ← 今回は使わない（Geminiのみ）`);
console.log(`  → 辞書マッチ最終結果: ${(dictTitle || dictChannel)?.name || '(なし → Gemini送信へ)'}\n`);

if (!GEMINI_API_KEY) {
  console.log('GEMINI_API_KEY 未設定 → Geminiテストはスキップ');
  process.exit(0);
}

console.log(`--- Gemini送信テスト ---`);
const result = await extractLocationsWithGemini([{
  title, channel, description: description.slice(0, 1000),
}]);
console.log(`Gemini結果: ${JSON.stringify(result)}`);
console.log(`\n=== テスト完了 ===`);
