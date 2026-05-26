// 天気予報：位置取得（Geolocation API → IP fallback → Tokyo）→ Open-Meteo → 7日間表示。
import { $weather, $weatherLocation } from './dom.js';

const WEATHER_EMOJI = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  56: '🌧️', 57: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  66: '🌧️', 67: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '❄️', 77: '🌨️',
  80: '🌦️', 81: '🌧️', 82: '🌧️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

const LOCATION_CACHE_KEY = 'fernweh_location';
const LOCATION_CACHE_TTL = 24 * 60 * 60 * 1000;

let weatherLocation = null;

function getCachedLocation() {
  try {
    const cached = JSON.parse(localStorage.getItem(LOCATION_CACHE_KEY));
    if (cached && Date.now() - cached.ts < LOCATION_CACHE_TTL) {
      return { latitude: cached.lat, longitude: cached.lon, city: cached.city || null };
    }
  } catch {}
  return null;
}

function cacheLocation(lat, lon, city) {
  localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify({
    lat, lon, city: city || null, ts: Date.now(),
  }));
}

async function getLocationByIP() {
  const res = await fetch('https://ipapi.co/json/');
  if (!res.ok) throw new Error(`IP geolocation failed: ${res.status}`);
  const data = await res.json();
  return { latitude: data.latitude, longitude: data.longitude, city: data.city || null };
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.city || data.locality || null;
  } catch { return null; }
}

function getLocationByGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => reject(err),
      { timeout: 10000, maximumAge: 600000 },
    );
  });
}

function displayLocationName(city) {
  if ($weatherLocation && city) $weatherLocation.textContent = city;
}

async function resolveLocation() {
  // 1. ブラウザGeolocation
  try {
    weatherLocation = await getLocationByGeolocation();
    const city = await reverseGeocode(weatherLocation.latitude, weatherLocation.longitude);
    weatherLocation.city = city;
    cacheLocation(weatherLocation.latitude, weatherLocation.longitude, city);
    displayLocationName(city);
    return;
  } catch (e) {
    console.warn('Geolocation denied/failed:', e.message);
  }
  // 2. IPベース
  try {
    weatherLocation = await getLocationByIP();
    cacheLocation(weatherLocation.latitude, weatherLocation.longitude, weatherLocation.city);
    displayLocationName(weatherLocation.city);
    return;
  } catch (e) {
    console.warn('IP geolocation failed:', e.message);
  }
  // 3. 東京フォールバック
  weatherLocation = { latitude: 35.6762, longitude: 139.6503, city: 'Tokyo' };
  displayLocationName('Tokyo');
}

async function updateWeather() {
  if (!weatherLocation) return;
  try {
    const { latitude, longitude } = weatherLocation;
    const params = new URLSearchParams({
      latitude,
      longitude,
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      forecast_days: '7',
      timezone: 'auto',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`Weather API: ${res.status}`);
    const data = await res.json();
    const days = data.daily.time.length;
    // 行が足りなければ生成
    if ($weather.children.length < days) {
      $weather.innerHTML = '';
      for (let i = 0; i < days; i++) {
        $weather.innerHTML += `<div class="weather-day">
          <span class="weather-label" id="weather-date-${i}"></span>
          <span class="weather-icon" id="weather-icon-${i}"></span>
          <span class="weather-temp" id="weather-temp-${i}"></span>
          <span class="weather-precip" id="weather-precip-${i}"></span>
        </div>`;
      }
    }
    for (let i = 0; i < days; i++) {
      renderDay(data.daily, i);
    }
  } catch (e) {
    console.warn('Weather update failed:', e);
  }
}

function renderDay(daily, dayIndex) {
  const code = daily.weather_code[dayIndex];
  const tMax = Math.round(daily.temperature_2m_max[dayIndex]);
  const tMin = Math.round(daily.temperature_2m_min[dayIndex]);
  const precip = daily.precipitation_probability_max[dayIndex];
  const d = new Date(daily.time[dayIndex]);
  document.getElementById(`weather-date-${dayIndex}`).textContent =
    `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  document.getElementById(`weather-icon-${dayIndex}`).textContent = WEATHER_EMOJI[code] || '🌡️';
  document.getElementById(`weather-temp-${dayIndex}`).textContent =
    `${String(tMax).padStart(2, '0')}° / ${String(tMin).padStart(2, '0')}°`;
  document.getElementById(`weather-precip-${dayIndex}`).textContent = `💧${String(precip).padStart(3, '0')}%`;
}

export async function initWeather() {
  const cached = getCachedLocation();
  if (cached) {
    weatherLocation = cached;
    displayLocationName(cached.city);
    updateWeather();
    setInterval(updateWeather, 30 * 60 * 1000);
    // バックグラウンドで再解決して最新化
    resolveLocation().catch(() => {});
    return;
  }
  await resolveLocation();
  updateWeather();
  setInterval(updateWeather, 30 * 60 * 1000);
}
