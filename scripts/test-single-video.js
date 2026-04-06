#!/usr/bin/env node
// 単一動画のロケーション抽出テスト
// Usage: node scripts/test-single-video.js <videoId>

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_PATH = join(__dirname, '..', 'config.json');

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
const API_KEY = config.youtube_api_key;
const GEMINI_API_KEY = config.gemini_api_key;

const VIDEO_ID = process.argv[2] || '5e4lsEe4Vew';

// --- LOCATION_COORDS / LOCATION_LABELS を fetch-videos.js から流用 ---
// (簡易版: fetch-videos.js を動的importできないのでキー部分だけコピー)
const LOCATION_COORDS = {
  'Alaska': [61.22, -149.90], 'Kenya': [-0.02, 37.91],
  'Minnesota': [44.98, -93.27], // テスト用に追加
  'Tokyo': [35.68, 139.69], 'New York': [40.71, -74.01],
};

function extractLocationFromDict(text) {
  const sorted = Object.keys(LOCATION_COORDS).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      return key;
    }
  }
  return null;
}

// Step 1: videos.list API でフル説明文を取得
console.log(`\n=== 動画 ${VIDEO_ID} のテスト ===\n`);

const params = new URLSearchParams({
  part: 'snippet',
  id: VIDEO_ID,
  key: API_KEY,
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

// Step 2: 辞書マッチ（title → channel のみ）
const dictTitle = extractLocationFromDict(title);
const dictChannel = extractLocationFromDict(channel);
const dictDesc = extractLocationFromDict(description);

console.log(`--- 辞書マッチ結果 ---`);
console.log(`  title match:       ${dictTitle || '(なし)'}`);
console.log(`  channel match:     ${dictChannel || '(なし)'}`);
console.log(`  description match: ${dictDesc || '(なし)'} ← 今回は使わない（Geminiのみ）`);
console.log(`  → 辞書マッチ最終結果: ${dictTitle || dictChannel || '(なし → Gemini送信へ)'}\n`);

// Step 3: Gemini に送信（description付き）
console.log(`--- Gemini送信テスト ---`);
const geminiInput = [{ title, channel, description: description.slice(0, 1000) }];
console.log(`送信データ: ${JSON.stringify(geminiInput, null, 2)}\n`);

const prompt = `You are a geographic location extractor for live camera video titles.
Extract the REAL geographic place name from each video title, channel name, and description.

ALWAYS include the country or state: "City, Country" or "City, State" format.
Examples: "Narvik, Norway", "Galveston, Texas", "Mt. Etna, Italy", "Seoul, South Korea", "Rome, Italy", "London, England".
If only a country is identifiable, return the country alone (e.g. "Austria", "Peru").

Use the description field to find location hints such as "Located in...", "撮影地:...", GPS coordinates, or any geographic references.

IMPORTANT: Return null ONLY when NO real geographic name exists at all. Do NOT guess or infer.
These are NOT place names — return null for these:
- Camera/stream descriptions: "Ski Panorama", "City View", "Beach Cam", "Nature Live"
- Channel names that aren't places: "earthTV", "PixCams", "Birder King"
- Non-geographic content: "ISS", "Aurora Alert", "Volcano Monitoring"

Return ONLY a JSON array of strings (or null for unknown). No markdown, no explanation.
Example: ["Rome, Italy", "Niagara Falls, USA", null, "Austria"]

Input:
${JSON.stringify(geminiInput.map(i => ({ title: i.title, channel: i.channel, description: i.description })))}`;

const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
const geminiRes = await fetch(geminiUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 8192 },
  }),
});

if (!geminiRes.ok) {
  console.error(`Gemini API error: ${geminiRes.status} ${await geminiRes.text()}`);
  process.exit(1);
}

const geminiData = await geminiRes.json();
const geminiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
console.log(`Gemini生レスポンス: ${geminiText}`);
console.log(`\n=== テスト完了 ===`);
