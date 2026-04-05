# Fernweh

> **Fernweh** /ˈfɛʁnˌveː/ — German, *noun*
>
> From *fern* ("far, distant") + *Weh* ("pain, ache"). Literally "far-sickness" — an ache for distant places, a longing for somewhere you have never been. The opposite of homesickness.
>
> The term was coined by Prince Hermann von Pückler-Muskau in his 1835 book *The Penultimate Course of the World of Semilasso: Dream and Waking*, during the Romantic period when artists and writers were deeply drawn to exploring the boundaries of human emotion.
>
> While *Wanderlust* describes a joyful desire to travel, *Fernweh* conveys something deeper — a pain, a pull toward the unknown. It is the feeling of being homesick for a place you have never visited.
>
> — [Wiktionary](https://en.wiktionary.org/wiki/Fernweh)

---

A fullscreen web app that automatically cycles through YouTube live cameras every hour. Designed for always-on displays — just open a browser and let the world come to you.

## Features

- Crossfade transitions between live streams
- Clock and weather overlay (today + tomorrow, via Open-Meteo)
- Randomized search queries (topics x locations x sort orders) for maximum discovery
- Auto-retry on failures
- Kiosk-friendly — minimal UI, cursor auto-hides

## Setup

### 1. Get a YouTube Data API v3 Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project
3. Enable **YouTube Data API v3** under APIs & Services > Library
4. Create an API key under APIs & Services > Credentials
5. Copy the key

### 2. Install

```bash
cd fernweh
npm install
```

### 3. Configure

Edit `config.json`:

```json
{
  "youtube_api_key": "YOUR_API_KEY_HERE",
  "port": 3333,
  "weather_location": {
    "latitude": 35.68,
    "longitude": 139.69,
    "name": "Tokyo"
  }
}
```

- `youtube_api_key` — Your YouTube Data API v3 key
- `port` — Server port (default: 3333)
- `weather_location` — Set latitude/longitude for your location. Find yours at [latlong.net](https://www.latlong.net/). The `name` field is for your own reference only.

### 4. Start

```bash
npm start
```

Open `http://localhost:3333` in a browser. Press `F` for fullscreen.

### 5. Auto-start on Ubuntu (Optional)

```bash
chmod +x autostart.sh
sudo cp livecam@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable livecam@$USER
sudo systemctl start livecam@$USER
```

This launches Chromium in kiosk mode on boot.

## Controls

| Key | Action |
|-----|--------|
| `Space` / `→` / `N` | Skip to next camera |
| `F` / `F11` | Toggle fullscreen |
| Mouse move | Show control buttons |

## How It Works

- **Search query generation**: Combines base queries (`live camera`, `live webcam`, ...) with random topics (`city`, `volcano`, `aurora`, ...) and locations (`Tokyo`, `Reykjavik`, `Cape Town`, ...) for thousands of unique combinations
- **Sort order randomization**: Randomly picks between `viewCount`, `relevance`, and `date` to surface both popular and obscure streams
- **Page token exploration**: 50% chance of fetching page 2+ of results to discover buried streams
- **Duplicate avoidance**: Tracks the last 50 shown videos to avoid repeats
- **Auto-retry**: If no embeddable live stream is found, retries with a new query after 15 seconds
- **Weather**: Fetched directly from [Open-Meteo](https://open-meteo.com/) (free, no API key needed), updated every 30 minutes

## YouTube API Quota

- Each search request costs 100 quota units
- At 1 search per hour = 24/day = 2,400 quota
- Free tier allows 10,000 quota/day — plenty of headroom

## Customization

### Switch interval

Edit `SWITCH_INTERVAL_MS` in `public/index.html`:

```js
const SWITCH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
```

### Search queries

Edit `BASE_QUERIES`, `TOPICS`, and `LOCATIONS` arrays in `server.js` to adjust what kinds of live streams appear.

## Project Structure

```
fernweh/
├── server.js             # Express server (YouTube API proxy + weather location endpoint)
├── config.json           # API key, port, weather location
├── package.json
├── public/
│   └── index.html        # Frontend (single-page, inline CSS/JS)
├── autostart.sh          # Kiosk mode launch script
├── livecam@.service      # systemd unit file
└── README.md
```
