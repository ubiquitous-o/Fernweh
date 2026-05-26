#!/usr/bin/env node

// fetch-videos.js — YouTube Data API v3 でライブカメラ動画を検索し、public/videos.json に書き出す。
// GitHub Actions (cron) から実行される想定。
//
// Usage: YOUTUBE_API_KEY=xxx [GEMINI_API_KEY=yyy] node scripts/fetch-videos.js

import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { extractLocationFromDict } from './lib/locations.js';
import { integrateGeocacheIntoDict } from './lib/geocode.js';
import { resolveTimezone } from './lib/timezone.js';
import { GEMINI_API_KEY, extractLocationsWithGemini } from './lib/gemini.js';
import {
  searchLiveVideos, fetchVideoDescriptions, filterCameraStreams,
  generateQuery, SORT_ORDERS,
} from './lib/youtube.js';
import { resolveLocation } from './lib/resolveLocation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_PATH = join(__dirname, '..', 'public', 'videos.json');

const SEARCH_COUNT = 8; // 1回のcron実行で行うYouTube検索回数
const MAX_VIDEOS = 200; // videos.jsonに保存する最大件数

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  console.log(`Gemini API: ${GEMINI_API_KEY ? '有効' : '無効（辞書マッチのみ）'}`);

  // geocacheを辞書に統合してから検索を始める
  integrateGeocacheIntoDict();

  // 既存videos.jsonをロード（マージ用）
  let existing = [];
  try {
    existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
  } catch {
    // 初回 or 破損 → 空から始める
  }

  const existingIds = new Set(existing.map((v) => v.videoId));
  const newCandidates = [];

  // --- Phase 1: YouTube検索で新規候補を収集 ---
  for (let i = 0; i < SEARCH_COUNT; i++) {
    const query = generateQuery();
    const order = pick(SORT_ORDERS);
    try {
      const items = await searchLiveVideos(query, order);
      console.log(`[${i + 1}/${SEARCH_COUNT}] "${query}" (${order}) -> ${items.length} results`);
      const filtered = filterCameraStreams(items);
      for (const item of filtered) {
        const videoId = item.id.videoId;
        if (!videoId || existingIds.has(videoId)) continue;
        existingIds.add(videoId);
        newCandidates.push({
          videoId,
          title: item.snippet.title,
          channel: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails?.high?.url || '',
          query,
        });
      }
    } catch (err) {
      console.error(`Search ${i + 1} failed:`, err.message);
    }
  }

  // --- Phase 2: 説明文を新規候補 + 既存未解決まとめて取得 ---
  const unresolved = existing.filter((v) => !v.location);
  const allVideoIds = [
    ...newCandidates.map((c) => c.videoId),
    ...unresolved.map((v) => v.videoId),
  ];
  const descriptions = await fetchVideoDescriptions(allVideoIds);
  console.log(`説明文取得: ${Object.keys(descriptions).length}/${allVideoIds.length}件`);
  for (const c of newCandidates) {
    c.description = descriptions[c.videoId] || '';
  }
  const unresolvedDescs = {};
  for (const v of unresolved) {
    unresolvedDescs[v.videoId] = descriptions[v.videoId] || '';
  }
  if (unresolved.length > 0) {
    console.log(`既存動画の再処理対象: ${unresolved.length}件 (location未設定)`);
  }

  // --- Phase 3: 辞書マッチを先に試し、未解決分だけGeminiに送る（RPD節約） ---
  const newDictResults = newCandidates.map((c) =>
    extractLocationFromDict(c.title) || extractLocationFromDict(c.channel) || null,
  );
  const unresolvedDictResults = unresolved.map((v) =>
    extractLocationFromDict(v.title) || extractLocationFromDict(v.channel || '') || null,
  );

  const geminiNeededNew = newCandidates
    .map((c, i) => newDictResults[i] ? null : {
      idx: i, title: c.title, channel: c.channel, description: c.description,
    })
    .filter(Boolean);
  const geminiNeededUnresolved = unresolved
    .map((v, i) => unresolvedDictResults[i] ? null : {
      idx: i, title: v.title, channel: v.channel || '',
      description: unresolvedDescs[v.videoId] || '',
    })
    .filter(Boolean);
  const geminiItems = [
    ...geminiNeededNew.map((g) => ({ title: g.title, channel: g.channel, description: g.description || '' })),
    ...geminiNeededUnresolved.map((g) => ({ title: g.title, channel: g.channel, description: g.description || '' })),
  ];

  let geminiResults = geminiItems.map(() => null);
  if (geminiItems.length > 0) {
    console.log(
      `Gemini送信: ${geminiItems.length}件 (辞書で解決済み: 新規${newCandidates.length - geminiNeededNew.length}件, 再処理${unresolved.length - geminiNeededUnresolved.length}件)`,
    );
    geminiResults = await extractLocationsWithGemini(geminiItems);
  } else {
    console.log('Geminiスキップ: 全件辞書マッチ済み or 対象なし');
  }

  // Gemini結果を元のインデックスに戻す
  const newGeminiMap = new Map();
  const unresolvedGeminiMap = new Map();
  let gi = 0;
  for (const g of geminiNeededNew) newGeminiMap.set(g.idx, geminiResults[gi++] || null);
  for (const g of geminiNeededUnresolved) unresolvedGeminiMap.set(g.idx, geminiResults[gi++] || null);

  // --- Phase 4: 新規動画のロケーション解決 ---
  const newVideos = [];
  for (let j = 0; j < newCandidates.length; j++) {
    const c = newCandidates[j];
    const result = newDictResults[j] || await resolveLocation(newGeminiMap.get(j) || null, c.title, c.channel);
    const coords = result?.coords || null;
    newVideos.push({
      videoId: c.videoId,
      title: c.title,
      channel: c.channel,
      thumbnail: c.thumbnail,
      query: c.query,
      location: coords,
      locationName: result?.name || null,
      timezone: resolveTimezone(coords),
      fetchedAt: new Date().toISOString(),
    });
  }

  // --- Phase 5: 既存動画の再処理結果を反映 ---
  for (let j = 0; j < unresolved.length; j++) {
    const v = unresolved[j];
    const dictResult = unresolvedDictResults[j];
    if (dictResult) {
      v.location = dictResult.coords;
      v.locationName = dictResult.name;
      v.timezone = resolveTimezone(dictResult.coords);
      continue;
    }
    const geminiName = unresolvedGeminiMap.get(j) || null;
    const result = await resolveLocation(geminiName, v.title, v.channel || '');
    if (result) {
      v.location = result.coords;
      v.locationName = result.name;
      v.timezone = resolveTimezone(result.coords);
    }
  }

  // 既存データの後付け: location はあるが timezone がないものを補完
  for (const v of existing) {
    if (v.location && !v.timezone) {
      v.timezone = resolveTimezone(v.location);
    }
  }

  // 新規を先頭にマージしてMAX_VIDEOS件で切る
  const merged = [...newVideos, ...existing].slice(0, MAX_VIDEOS);
  writeFileSync(OUTPUT_PATH, JSON.stringify(merged, null, 2));
  console.log(`\nDone: ${newVideos.length} new videos added, ${merged.length} total in videos.json`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
