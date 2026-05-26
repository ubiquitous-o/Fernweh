// Gemini APIで動画タイトル/チャンネル/説明文から地名を抽出（バッチ処理）。
// 環境変数 GEMINI_API_KEY → config.json gemini_api_key の順で探す。
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_PATH = join(__dirname, '..', '..', 'config.json');

function loadGeminiApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    if (config.gemini_api_key) return config.gemini_api_key;
  } catch {}
  return null;
}

export const GEMINI_API_KEY = loadGeminiApiKey();

const BATCH_SIZE = 20;
const MODEL = 'gemini-2.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are a geographic location extractor for live camera video titles.
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
`;

/**
 * 各itemに対応する地名（or null）を返す。
 * @param {Array<{title: string, channel: string, description: string}>} items
 * @returns {Promise<Array<string|null>>}
 */
export async function extractLocationsWithGemini(items) {
  if (!GEMINI_API_KEY || items.length === 0) return items.map(() => null);

  const results = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    console.log(`  Geminiバッチ ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)} (${batch.length}件)`);
    const batchResults = await sendBatch(batch);
    results.push(...batchResults);
  }
  console.log(`Gemini抽出結果: ${JSON.stringify(results)}`);
  return results;
}

async function sendBatch(items) {
  const payload = JSON.stringify(
    items.map(i => ({
      title: i.title,
      channel: i.channel,
      description: (i.description || '').slice(0, 1000),
    })),
  );
  const prompt = SYSTEM_PROMPT + payload;

  try {
    const res = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8192 },
      }),
    });

    if (!res.ok) {
      console.warn(`Gemini API error: ${res.status} ${await res.text()}`);
      return items.map(() => null);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // JSONブロックを抽出（```json ... ``` でラップされる場合に対応）
    let jsonStr = '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    } else {
      // 途中切れ: [ で始まるが ] がない → 補完を試みる
      const bracketStart = text.indexOf('[');
      if (bracketStart >= 0) {
        jsonStr = text.slice(bracketStart).replace(/,\s*$/, '') + ']';
        console.warn('Gemini: 途中切れJSON → 補完を試行');
      } else {
        console.warn('Gemini: JSON配列が見つからない:', text.slice(0, 200));
        return items.map(() => null);
      }
    }

    const locations = JSON.parse(jsonStr).map(v =>
      (v === null || v === 'null' || v === '') ? null : v,
    );
    while (locations.length < items.length) locations.push(null);
    return locations;
  } catch (err) {
    console.warn(`Gemini API request failed: ${err.message}`);
    return items.map(() => null);
  }
}
