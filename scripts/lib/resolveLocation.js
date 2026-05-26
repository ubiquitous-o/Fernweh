// Gemini結果 → 辞書座標 or Nominatim → タイトル/チャンネル辞書マッチ、の3段階解決。
import { LOCATION_COORDS, extractLocationFromDict } from './locations.js';
import { geocode } from './geocode.js';

/**
 * 動画の地名を解決する。
 * @param {string|null} geminiName - Gemini APIの抽出結果
 * @param {string} title
 * @param {string} channel
 * @returns {Promise<{coords: [number, number], name: string}|null>}
 */
export async function resolveLocation(geminiName, title, channel) {
  // ① Geminiが地名を返した場合
  if (geminiName) {
    // 辞書に一致すればその座標
    if (LOCATION_COORDS[geminiName]) {
      return { coords: LOCATION_COORDS[geminiName], name: geminiName };
    }
    // 辞書にない → Nominatimでジオコーディング
    const coords = await geocode(geminiName);
    if (coords) return { coords, name: geminiName };
  }

  // ② フォールバック: タイトルから辞書マッチ
  const titleDict = extractLocationFromDict(title);
  if (titleDict) return titleDict;

  // ③ フォールバック: チャンネル名から辞書マッチ
  if (channel) {
    const chDict = extractLocationFromDict(channel);
    if (chDict) return chDict;
  }

  return null;
}
