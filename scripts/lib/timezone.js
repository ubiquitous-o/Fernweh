// geo-tz: 緯度経度 → IANA timezone ID
import { find as findTimezone } from 'geo-tz';

export function resolveTimezone(coords) {
  if (!coords || !Array.isArray(coords) || coords.length < 2) return null;
  try {
    const zones = findTimezone(coords[0], coords[1]);
    return zones.length > 0 ? zones[0] : null;
  } catch { return null; }
}
