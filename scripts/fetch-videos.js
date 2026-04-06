#!/usr/bin/env node

// fetch-videos.js
// YouTube Data API v3 でライブカメラ動画を検索し、public/videos.json に書き出す。
// GitHub Actions (cron) から実行される想定。
//
// Usage: YOUTUBE_API_KEY=xxx node scripts/fetch-videos.js

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_PATH = join(__dirname, '..', 'public', 'videos.json');
const GEOCACHE_PATH = join(__dirname, 'geocache.json');
const CONFIG_PATH = join(__dirname, '..', 'config.json');

const API_KEY = process.env.YOUTUBE_API_KEY;
if (!API_KEY) {
  console.error('YOUTUBE_API_KEY environment variable is required');
  process.exit(1);
}

// --- Search Queries (from server.js) ---
const BASE_QUERIES = [
  'live camera', 'live webcam', 'live cam', 'live stream camera',
  'live view', '24/7 live cam', 'webcam live',
];

const TOPICS = [
  'city', 'nature', 'street', 'ocean beach', 'mountain',
  'skyline', 'animals wildlife', 'aurora', 'train railway',
  'airport', 'underwater', 'volcano', 'space ISS',
  'safari', 'Northern Lights', 'coral reef', 'river',
  'harbor port', 'sunset', 'countryside', 'temple shrine',
  'bridge', 'lake', 'rainforest', 'desert', 'glacier',
  'waterfall', 'castle', 'market', 'canal',
];

const LOCATIONS = [
  'Tokyo', 'New York', 'Paris', 'London', 'Bangkok', 'Dubai',
  'Sydney', 'Rio de Janeiro', 'Istanbul', 'Rome', 'Barcelona',
  'Amsterdam', 'Seoul', 'Singapore', 'Hong Kong', 'Mumbai',
  'Cairo', 'Cape Town', 'Buenos Aires', 'Mexico City',
  'Vancouver', 'Reykjavik', 'Oslo', 'Helsinki', 'Prague',
  'Vienna', 'Zurich', 'Havana', 'Lisbon', 'Athens',
  'Santorini', 'Bali', 'Maldives', 'Hawaii', 'Alaska',
  'Norway', 'Iceland', 'Tanzania', 'Peru', 'Nepal',
  'New Zealand', 'Scotland', 'Croatia', 'Morocco', 'Vietnam',
  'Japan', 'Italy', 'Switzerland', 'Canada', 'Australia',
];

const SORT_ORDERS = ['viewCount', 'relevance', 'date'];

// --- Location coordinates for globe pin ---
const LOCATION_COORDS = {
  // LOCATIONS array cities
  'Tokyo': [35.68, 139.69], 'New York': [40.71, -74.01], 'Paris': [48.86, 2.35],
  'London': [51.51, -0.13], 'Bangkok': [13.76, 100.50], 'Dubai': [25.20, 55.27],
  'Sydney': [-33.87, 151.21], 'Rio de Janeiro': [-22.91, -43.17], 'Istanbul': [41.01, 28.98],
  'Rome': [41.90, 12.50], 'Barcelona': [41.39, 2.17], 'Amsterdam': [52.37, 4.90],
  'Seoul': [37.57, 126.98], 'Singapore': [1.35, 103.82], 'Hong Kong': [22.32, 114.17],
  'Mumbai': [19.08, 72.88], 'Cairo': [30.04, 31.24], 'Cape Town': [-33.93, 18.42],
  'Buenos Aires': [-34.60, -58.38], 'Mexico City': [19.43, -99.13],
  'Vancouver': [49.28, -123.12], 'Reykjavik': [64.15, -21.94], 'Oslo': [59.91, 10.75],
  'Helsinki': [60.17, 24.94], 'Prague': [50.08, 14.44], 'Vienna': [48.21, 16.37],
  'Zurich': [47.38, 8.54], 'Havana': [23.11, -82.37], 'Lisbon': [38.72, -9.14],
  'Athens': [37.98, 23.73], 'Santorini': [36.39, 25.46], 'Bali': [-8.34, 115.09],
  'Maldives': [3.20, 73.22], 'Hawaii': [21.31, -157.86], 'Alaska': [61.22, -149.90],
  'Norway': [59.91, 10.75], 'Iceland': [64.15, -21.94], 'Finland': [61.92, 25.75],
  'Sweden': [59.33, 18.07], 'Denmark': [55.68, 12.57], 'Germany': [52.52, 13.41],
  'France': [48.86, 2.35], 'Spain': [40.42, -3.70], 'Portugal': [38.72, -9.14],
  'Greece': [37.98, 23.73], 'Turkey': [41.01, 28.98], 'Tanzania': [-6.37, 34.89],
  'Peru': [-12.05, -77.04], 'Nepal': [27.72, 85.32],
  'New Zealand': [-41.29, 174.78], 'Scotland': [55.95, -3.19], 'Croatia': [45.81, 15.98],
  'Morocco': [33.97, -6.85], 'Vietnam': [21.03, 105.85],
  'Japan': [35.68, 139.69], 'Italy': [41.90, 12.50], 'Switzerland': [46.95, 7.45],
  'Canada': [45.42, -75.70], 'Australia': [-33.87, 151.21],
  // Common place names found in titles
  'Venice': [45.44, 12.32], 'Venice Beach': [33.99, -118.47], 'San Diego': [32.72, -117.16],
  'San Francisco': [37.77, -122.42], 'Los Angeles': [34.05, -118.24],
  'Chicago': [41.88, -87.63], 'Miami': [25.76, -80.19], 'Seattle': [47.61, -122.33],
  'Las Vegas': [36.17, -115.14], 'Washington': [38.91, -77.04],
  'Berlin': [52.52, 13.41], 'Munich': [48.14, 11.58], 'Hamburg': [53.55, 9.99],
  'Madrid': [40.42, -3.70], 'Milan': [45.46, 9.19], 'Naples': [40.85, 14.27],
  'Dublin': [53.35, -6.26], 'Edinburgh': [55.95, -3.19], 'Stockholm': [59.33, 18.07],
  'Copenhagen': [55.68, 12.57], 'Warsaw': [52.23, 21.01], 'Budapest': [47.50, 19.04],
  'Moscow': [55.76, 37.62], 'Beijing': [39.90, 116.40], 'Shanghai': [31.23, 121.47],
  'Taipei': [25.03, 121.57], 'Osaka': [34.69, 135.50], 'Kyoto': [35.01, 135.77],
  'Hokkaido': [43.06, 141.35], 'Sapporo': [43.06, 141.35], 'Okinawa': [26.34, 127.77],
  'Nagoya': [35.18, 136.91], 'Yokohama': [35.44, 139.64], 'Kobe': [34.69, 135.20],
  'Busan': [35.18, 129.08], 'Phuket': [7.88, 98.39], 'Kuala Lumpur': [3.14, 101.69],
  'Jakarta': [-6.21, 106.85], 'Manila': [14.60, 120.98], 'Hanoi': [21.03, 105.85],
  'Nairobi': [-1.29, 36.82], 'Johannesburg': [-26.20, 28.05],
  'Kruger': [-24.01, 31.49], 'Serengeti': [-2.33, 34.83],
  'Anchorage': [61.22, -149.90], 'Honolulu': [21.31, -157.86],
  'Yellowstone': [44.46, -110.83], 'Yosemite': [37.75, -119.59],
  'Niagara': [43.09, -79.07], 'Grand Canyon': [36.11, -112.11],
  'Mt. Fuji': [35.36, 138.73], 'Fuji': [35.36, 138.73], 'Fujisan': [35.36, 138.73],
  'Kilimanjaro': [-3.07, 37.35], 'Everest': [27.99, 86.93],
  'Galveston': [29.30, -94.80], 'Gatlinburg': [35.71, -83.51],
  'Monterey': [36.60, -121.89], 'Florida': [27.99, -81.76],
  'Texas': [31.97, -99.90], 'California': [36.78, -119.42],
  'Kenya': [-0.02, 37.91], 'South Africa': [-30.56, 22.94],
  'Botswana': [-22.33, 24.68], 'Namibia': [-22.96, 18.49],
  'Curacao': [12.17, -68.98], 'Jamaica': [18.11, -77.30],
  'Bahamas': [25.03, -77.40], 'Caribbean': [15.41, -61.37],
  'Thailand': [15.87, 100.99], 'Korea': [37.57, 126.98],
  'Brasov': [45.65, 25.61], 'Transylvania': [46.77, 23.60],
  'Niseko': [42.86, 140.69], 'Hakone': [35.23, 139.11],
  'Levi': [67.80, 24.81], 'Etosha': [-18.86, 16.00],
  // 主要国名
  'Russia': [55.76, 37.62], 'China': [39.90, 116.40], 'India': [28.61, 77.21],
  'Brazil': [-15.83, -47.88], 'Mexico': [19.43, -99.13], 'Argentina': [-34.60, -58.38],
  'Colombia': [4.71, -74.07], 'Chile': [-33.45, -70.67], 'Ecuador': [-0.23, -78.52],
  'Costa Rica': [9.93, -84.08], 'Panama': [8.98, -79.52],
  'United States': [38.90, -77.04], 'United Kingdom': [51.51, -0.13],
  'England': [51.51, -0.13], 'Ireland': [53.35, -6.26], 'Belgium': [50.85, 4.35],
  'Netherlands': [52.37, 4.90], 'Poland': [52.23, 21.01], 'Ukraine': [50.45, 30.52],
  'Romania': [44.43, 26.10], 'Hungary': [47.50, 19.04], 'Serbia': [44.82, 20.46],
  'Bulgaria': [42.70, 23.32], 'Austria': [48.21, 16.37], 'Slovenia': [46.06, 14.51],
  'Cyprus': [35.13, 33.43], 'Malta': [35.90, 14.51], 'Georgia': [41.72, 44.83],
  'Indonesia': [-6.21, 106.85], 'Philippines': [14.60, 120.98],
  'Malaysia': [3.14, 101.69], 'Cambodia': [11.56, 104.93], 'Myanmar': [16.87, 96.20],
  'Sri Lanka': [6.93, 79.85], 'Mongolia': [47.91, 106.90],
  'Israel': [31.77, 35.21], 'Jordan': [31.95, 35.93], 'Lebanon': [33.89, 35.50],
  'Saudi Arabia': [24.71, 46.68], 'Iran': [35.69, 51.39],
  'Egypt': [30.04, 31.24], 'Ethiopia': [-9.03, 38.75], 'Ghana': [5.55, -0.20],
  'Nigeria': [9.08, 7.40], 'Uganda': [0.35, 32.58],
  'Fiji': [-18.13, 178.06], 'Seychelles': [-4.68, 55.49], 'Mauritius': [-20.16, 57.50],
  'Madagascar': [-18.88, 47.51], 'Greenland': [64.18, -51.69],
  'Dominican Republic': [18.49, -69.93], 'Puerto Rico': [18.47, -66.11],
  'Bermuda': [32.32, -64.76], 'Tahiti': [-17.53, -149.57],
  // Discovered from live cam data
  'Loch Arkaig': [56.94, -5.14], 'Deerfield Beach': [26.32, -80.10],
  'Sarapiquí': [10.45, -84.01], 'Homosassa Springs': [28.80, -82.58],
  'Turpentine Creek': [36.28, -93.73], 'Utila': [16.10, -86.90],
  'Big Bear': [34.24, -116.91], 'Toronto': [43.65, -79.38],
  'La Grange': [38.41, -85.38], 'St. Augustine': [29.89, -81.31],
  'Burlington': [44.48, -73.21], 'Winter Garden': [28.57, -81.59],
  'Revelstoke': [50.98, -118.20], 'Ashland': [37.76, -77.48],
  'Mt Katahdin': [45.90, -68.91], 'Drammen': [59.74, 10.20],
  'Runde': [62.40, 5.63], 'Posio': [65.99, 28.17], 'Iisalmi': [63.56, 27.19],
  'St. Petersburg': [59.95, 30.34], 'Auckland': [-36.85, 174.76],
  'Rovaniemi': [66.54, 25.85], 'Hoedspruit': [-24.35, 30.97],
  'Borneo': [-1.35, 116.85], 'Grand Cayman': [19.30, -81.38],
  'Ilulissat': [69.22, -51.10], 'Mt. Etna': [37.75, 14.99],
  'Grindavík': [63.84, -22.43], 'Þorbjörn': [63.86, -22.44],
  'Pipeline': [21.66, -158.05], 'Banzai Pipeline': [21.66, -158.05],
  'Frying Pan Tower': [33.49, -77.59], 'Narvik': [68.43, 17.43],
  'Hafjell': [61.24, 10.53], 'Myrkdalen': [60.88, 6.46],
  'Beitostølen': [61.25, 8.92], 'Voss': [60.63, 6.42],
  'Måløy': [61.93, 5.11], 'Skarsvåg': [71.11, 25.84],
  'Helgoland': [54.18, 7.89], 'Sint-Niklaas': [51.16, 4.14],
  'Chengdu': [30.66, 104.06], 'Davao City': [7.07, 125.61],
  'Ocho Rios': [18.41, -77.10], 'May Pen': [17.97, -77.25],
  'Kingston': [18.01, -76.80], 'Jackson Hole': [43.48, -110.76],
  'Baltimore': [39.29, -76.61], 'Funchal': [32.65, -16.91],
  'Madeira': [32.65, -16.91], 'Ottawa': [45.42, -75.70],
  'Monterosso': [44.15, 9.65], 'Lorain': [41.47, -82.18],
  'Ōamaru': [-45.10, 170.97], 'Churchill': [58.77, -94.17],
  'Saint-Félicien': [48.65, -72.44], 'Volcán de Fuego': [14.47, -90.88],
  // 米国の州名
  'Alabama': [33.26, -86.83], 'Alaska': [64.20, -152.49], 'Arizona': [34.05, -111.09],
  'Arkansas': [35.20, -91.83], 'Colorado': [39.55, -105.78], 'Connecticut': [41.60, -72.76],
  'Delaware': [38.91, -75.53], 'Georgia US': [33.75, -84.39], 'Hawaii': [21.31, -157.86],
  'Idaho': [44.07, -114.74], 'Illinois': [40.63, -89.40], 'Indiana': [40.33, -86.17],
  'Iowa': [42.01, -93.21], 'Kansas': [39.01, -98.48], 'Kentucky': [37.84, -84.27],
  'Louisiana': [30.98, -91.96], 'Maine': [45.25, -69.45], 'Maryland': [39.05, -76.64],
  'Massachusetts': [42.41, -71.38], 'Michigan': [44.31, -85.60], 'Minnesota': [46.73, -94.69],
  'Mississippi': [32.35, -89.40], 'Missouri': [38.57, -92.60], 'Montana': [46.88, -110.36],
  'Nebraska': [41.49, -99.90], 'Nevada': [38.80, -116.42], 'New Hampshire': [43.19, -71.57],
  'New Jersey': [40.06, -74.41], 'New Mexico': [35.68, -105.94], 'North Carolina': [35.76, -79.02],
  'North Dakota': [47.55, -101.00], 'Ohio': [40.42, -82.91], 'Oklahoma': [35.47, -97.52],
  'Oregon': [43.80, -120.55], 'Pennsylvania': [41.20, -77.19], 'Rhode Island': [41.58, -71.48],
  'South Carolina': [34.00, -81.03], 'South Dakota': [43.97, -99.90], 'Tennessee': [35.52, -86.58],
  'Utah': [39.32, -111.09], 'Vermont': [44.56, -72.58], 'Virginia': [37.43, -78.66],
  'Washington State': [47.75, -120.74], 'West Virginia': [38.60, -80.45],
  'Wisconsin': [43.78, -88.79], 'Wyoming': [43.08, -107.29],
  'Ozarks': [36.50, -93.00], 'Wales': [52.29, -3.74],
  'Zimbabwe': [-17.83, 31.05], 'Mana Pools': [-15.76, 29.39],
  'Cat Tien': [11.45, 107.32], 'Kilauea': [19.42, -155.29],
  'Reykjavík': [64.15, -21.94], 'Hollywood Beach': [26.01, -80.12],
};

// 表示ラベル: キー（マッチ用）→ "地名, 国名/州名" フォーマット
// ここに無いキーはそのまま表示される（Tokyo, Paris等の有名都市）
const LOCATION_LABELS = {
  // 米国の都市・州
  'New York': 'New York, USA', 'Los Angeles': 'Los Angeles, USA',
  'San Francisco': 'San Francisco, USA', 'San Diego': 'San Diego, USA',
  'Chicago': 'Chicago, USA', 'Miami': 'Miami, USA', 'Seattle': 'Seattle, USA',
  'Las Vegas': 'Las Vegas, USA', 'Washington': 'Washington, USA',
  'Anchorage': 'Anchorage, Alaska', 'Honolulu': 'Honolulu, Hawaii',
  'Galveston': 'Galveston, Texas', 'Gatlinburg': 'Gatlinburg, Tennessee',
  'Monterey': 'Monterey, California', 'Venice Beach': 'Venice Beach, California',
  'Yellowstone': 'Yellowstone, USA', 'Yosemite': 'Yosemite, USA',
  'Niagara': 'Niagara Falls, USA', 'Grand Canyon': 'Grand Canyon, USA',
  'Deerfield Beach': 'Deerfield Beach, Florida', 'Homosassa Springs': 'Homosassa Springs, Florida',
  'Big Bear': 'Big Bear, California', 'La Grange': 'La Grange, Kentucky',
  'St. Augustine': 'St. Augustine, Florida', 'Burlington': 'Burlington, Vermont',
  'Winter Garden': 'Winter Garden, Florida', 'Ashland': 'Ashland, Virginia',
  'Mt Katahdin': 'Mt Katahdin, Maine', 'Jackson Hole': 'Jackson Hole, Wyoming',
  'Baltimore': 'Baltimore, Maryland', 'Lorain': 'Lorain, Ohio',
  'Turpentine Creek': 'Turpentine Creek, Arkansas',
  'Frying Pan Tower': 'Frying Pan Tower, NC',
  'Pipeline': 'Banzai Pipeline, Hawaii', 'Banzai Pipeline': 'Banzai Pipeline, Hawaii',
  'Hollywood Beach': 'Hollywood Beach, Florida',
  'Alabama': 'Alabama, USA', 'Alaska': 'Alaska, USA', 'Arizona': 'Arizona, USA',
  'Arkansas': 'Arkansas, USA', 'California': 'California, USA', 'Colorado': 'Colorado, USA',
  'Connecticut': 'Connecticut, USA', 'Delaware': 'Delaware, USA',
  'Florida': 'Florida, USA', 'Georgia US': 'Georgia, USA', 'Hawaii': 'Hawaii, USA',
  'Idaho': 'Idaho, USA', 'Illinois': 'Illinois, USA', 'Indiana': 'Indiana, USA',
  'Iowa': 'Iowa, USA', 'Kansas': 'Kansas, USA', 'Kentucky': 'Kentucky, USA',
  'Louisiana': 'Louisiana, USA', 'Maine': 'Maine, USA', 'Maryland': 'Maryland, USA',
  'Massachusetts': 'Massachusetts, USA', 'Michigan': 'Michigan, USA', 'Minnesota': 'Minnesota, USA',
  'Mississippi': 'Mississippi, USA', 'Missouri': 'Missouri, USA', 'Montana': 'Montana, USA',
  'Nebraska': 'Nebraska, USA', 'Nevada': 'Nevada, USA', 'New Hampshire': 'New Hampshire, USA',
  'New Jersey': 'New Jersey, USA', 'New Mexico': 'New Mexico, USA', 'North Carolina': 'North Carolina, USA',
  'North Dakota': 'North Dakota, USA', 'Ohio': 'Ohio, USA', 'Oklahoma': 'Oklahoma, USA',
  'Oregon': 'Oregon, USA', 'Pennsylvania': 'Pennsylvania, USA', 'Rhode Island': 'Rhode Island, USA',
  'South Carolina': 'South Carolina, USA', 'South Dakota': 'South Dakota, USA', 'Tennessee': 'Tennessee, USA',
  'Texas': 'Texas, USA', 'Utah': 'Utah, USA', 'Vermont': 'Vermont, USA', 'Virginia': 'Virginia, USA',
  'Washington State': 'Washington State, USA', 'West Virginia': 'West Virginia, USA',
  'Wisconsin': 'Wisconsin, USA', 'Wyoming': 'Wyoming, USA',
  'Ozarks': 'Ozarks, Missouri',
  // カナダ
  'Vancouver': 'Vancouver, Canada', 'Toronto': 'Toronto, Canada',
  'Ottawa': 'Ottawa, Canada', 'Revelstoke': 'Revelstoke, BC',
  'Churchill': 'Churchill, Manitoba', 'Saint-Félicien': 'Saint-Félicien, Quebec',
  // ヨーロッパ
  'Paris': 'Paris, France', 'London': 'London, England',
  'Istanbul': 'Istanbul, Turkey', 'Rome': 'Rome, Italy', 'Barcelona': 'Barcelona, Spain',
  'Amsterdam': 'Amsterdam, Netherlands', 'Prague': 'Prague, Czech Republic',
  'Vienna': 'Vienna, Austria', 'Zurich': 'Zurich, Switzerland',
  'Lisbon': 'Lisbon, Portugal', 'Athens': 'Athens, Greece',
  'Oslo': 'Oslo, Norway', 'Helsinki': 'Helsinki, Finland',
  'Venice': 'Venice, Italy', 'Milan': 'Milan, Italy', 'Naples': 'Naples, Italy',
  'Monterosso': 'Monterosso, Italy', 'Mt. Etna': 'Mt. Etna, Sicily',
  'Dublin': 'Dublin, Ireland', 'Edinburgh': 'Edinburgh, Scotland',
  'Stockholm': 'Stockholm, Sweden', 'Copenhagen': 'Copenhagen, Denmark',
  'Warsaw': 'Warsaw, Poland', 'Budapest': 'Budapest, Hungary',
  'Moscow': 'Moscow, Russia', 'St. Petersburg': 'St. Petersburg, Russia',
  'Brasov': 'Brașov, Romania', 'Transylvania': 'Transylvania, Romania',
  'Grindavík': 'Grindavík, Iceland', 'Þorbjörn': 'Þorbjörn, Iceland',
  'Reykjavík': 'Reykjavík, Iceland', 'Reykjavik': 'Reykjavik, Iceland',
  'Levi': 'Levi, Finland', 'Rovaniemi': 'Rovaniemi, Finland',
  'Posio': 'Posio, Finland', 'Iisalmi': 'Iisalmi, Finland',
  'Narvik': 'Narvik, Norway', 'Hafjell': 'Hafjell, Norway',
  'Myrkdalen': 'Myrkdalen, Norway', 'Beitostølen': 'Beitostølen, Norway',
  'Voss': 'Voss, Norway', 'Drammen': 'Drammen, Norway',
  'Måløy': 'Måløy, Norway', 'Skarsvåg': 'Skarsvåg, Norway',
  'Runde': 'Runde, Norway', 'Helgoland': 'Helgoland, Germany',
  'Munich': 'Munich, Germany', 'Hamburg': 'Hamburg, Germany', 'Berlin': 'Berlin, Germany',
  'Madrid': 'Madrid, Spain', 'Santorini': 'Santorini, Greece',
  'Sint-Niklaas': 'Sint-Niklaas, Belgium',
  // アジア・オセアニア
  'Tokyo': 'Tokyo, Japan', 'Osaka': 'Osaka, Japan', 'Kyoto': 'Kyoto, Japan', 'Sapporo': 'Sapporo, Japan',
  'Nagoya': 'Nagoya, Japan', 'Yokohama': 'Yokohama, Japan', 'Kobe': 'Kobe, Japan',
  'Okinawa': 'Okinawa, Japan', 'Hokkaido': 'Hokkaido, Japan',
  'Mt. Fuji': 'Mt. Fuji, Japan', 'Fuji': 'Fuji, Japan', 'Fujisan': 'Fujisan, Japan',
  'Niseko': 'Niseko, Japan', 'Hakone': 'Hakone, Japan',
  'Seoul': 'Seoul, South Korea', 'Busan': 'Busan, South Korea', 'Taipei': 'Taipei, Taiwan',
  'Bangkok': 'Bangkok, Thailand', 'Phuket': 'Phuket, Thailand', 'Chengdu': 'Chengdu, China',
  'Beijing': 'Beijing, China', 'Shanghai': 'Shanghai, China',
  'Singapore': 'Singapore', 'Hong Kong': 'Hong Kong, China',
  'Mumbai': 'Mumbai, India', 'Dubai': 'Dubai, UAE',
  'Kuala Lumpur': 'Kuala Lumpur, Malaysia', 'Manila': 'Manila, Philippines',
  'Davao City': 'Davao City, Philippines', 'Hanoi': 'Hanoi, Vietnam',
  'Jakarta': 'Jakarta, Indonesia', 'Bali': 'Bali, Indonesia',
  'Sydney': 'Sydney, Australia',
  'Auckland': 'Auckland, New Zealand', 'Ōamaru': 'Ōamaru, New Zealand',
  'Borneo': 'Borneo, Indonesia',
  // 中南米・カリブ
  'Rio de Janeiro': 'Rio de Janeiro, Brazil', 'Buenos Aires': 'Buenos Aires, Argentina',
  'Mexico City': 'Mexico City, Mexico', 'Havana': 'Havana, Cuba',
  'Ocho Rios': 'Ocho Rios, Jamaica', 'May Pen': 'May Pen, Jamaica',
  'Kingston': 'Kingston, Jamaica', 'Utila': 'Utila, Honduras',
  'Sarapiquí': 'Sarapiquí, Costa Rica', 'Volcán de Fuego': 'Volcán de Fuego, Guatemala',
  'Grand Cayman': 'Grand Cayman, Cayman Islands',
  // アフリカ
  'Cairo': 'Cairo, Egypt', 'Cape Town': 'Cape Town, South Africa',
  'Nairobi': 'Nairobi, Kenya', 'Johannesburg': 'Johannesburg, South Africa',
  'Kruger': 'Kruger, South Africa', 'Hoedspruit': 'Hoedspruit, South Africa',
  'Serengeti': 'Serengeti, Tanzania', 'Etosha': 'Etosha, Namibia',
  'Kilimanjaro': 'Kilimanjaro, Tanzania', 'Mana Pools': 'Mana Pools, Zimbabwe',
  // ランドマーク
  'Loch Arkaig': 'Loch Arkaig, Scotland', 'Kilauea': 'Kīlauea, Hawaii',
  'Everest': 'Everest, Nepal', 'Cat Tien': 'Cat Tien, Vietnam',
  'Funchal': 'Funchal, Madeira', 'Madeira': 'Madeira, Portugal',
  'Ilulissat': 'Ilulissat, Greenland',
};

function extractLocationFromDict(text) {
  // Check longer names first to avoid partial matches
  const sorted = Object.keys(LOCATION_COORDS).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      return { coords: LOCATION_COORDS[key], name: LOCATION_LABELS[key] || key };
    }
  }
  return null;
}

// --- Gemini API: バッチ地名抽出 ---
function loadGeminiApiKey() {
  // 環境変数優先（GitHub Actions用）
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  // config.json フォールバック（ローカル用）
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    if (config.gemini_api_key) return config.gemini_api_key;
  } catch { /* ignore */ }
  return null;
}

const GEMINI_API_KEY = loadGeminiApiKey();

/**
 * Gemini APIにバッチでタイトル+チャンネル名+説明文を送り、地名を抽出する。
 * @param {Array<{title: string, channel: string, description: string}>} items
 * @returns {Promise<Array<string|null>>} 各アイテムに対応する地名 or null
 */
async function extractLocationsWithGemini(items) {
  if (!GEMINI_API_KEY || items.length === 0) return items.map(() => null);

  // 20件ずつバッチ分割して送信（途中切れJSON防止）
  const BATCH_SIZE = 20;
  const allResults = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    console.log(`  Geminiバッチ ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)} (${batch.length}件)`);
    const batchResults = await _extractLocationsWithGeminiBatch(batch);
    allResults.push(...batchResults);
  }
  console.log(`Gemini抽出結果: ${JSON.stringify(allResults)}`);
  return allResults;
}

async function _extractLocationsWithGeminiBatch(items) {
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
${JSON.stringify(items.map(i => ({ title: i.title, channel: i.channel, description: (i.description || '').slice(0, 1000) })))}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const res = await fetch(url, {
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
      // レスポンスが途中で切れた場合: [ で始まるが ] がない → 補完を試みる
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
      (v === null || v === 'null' || v === '') ? null : v
    );
    // 長さが一致しない場合はnullで埋める
    while (locations.length < items.length) locations.push(null);
    return locations;
  } catch (err) {
    console.warn(`Gemini API request failed: ${err.message}`);
    return items.map(() => null);
  }
}

// --- YouTube videos.list: フル説明文を一括取得 ---
async function fetchVideoDescriptions(videoIds) {
  const descriptions = {};
  // 50件ずつバッチ（videos.list の上限）
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: 'snippet',
      id: batch.join(','),
      key: API_KEY,
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
    if (!res.ok) {
      console.warn(`videos.list error: ${res.status}`);
      continue;
    }
    const data = await res.json();
    for (const item of (data.items || [])) {
      descriptions[item.id] = item.snippet.description || '';
    }
  }
  return descriptions;
}

// --- Geocoding: geocache.json + Nominatim ---
let geocache = {};
try {
  if (existsSync(GEOCACHE_PATH)) {
    geocache = JSON.parse(readFileSync(GEOCACHE_PATH, 'utf-8'));
  }
} catch {
  geocache = {};
}

function saveGeocache() {
  writeFileSync(GEOCACHE_PATH, JSON.stringify(geocache, null, 2) + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geocode(placeName) {
  // キャッシュチェック
  if (geocache[placeName] !== undefined) {
    return geocache[placeName]; // null もキャッシュ（見つからなかった場所）
  }
  // Nominatim REST
  const params = new URLSearchParams({
    q: placeName,
    format: 'json',
    limit: '1',
  });
  try {
    await sleep(1100); // レート制限: 1req/秒
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'Fernweh-LiveCam-Globe/1.0 (https://github.com/fernweh)' },
    });
    if (!res.ok) {
      console.warn(`Nominatim error: ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (data.length > 0) {
      const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      geocache[placeName] = coords;
      saveGeocache();
      return coords;
    }
    // 見つからなかった場所もキャッシュ
    geocache[placeName] = null;
    saveGeocache();
    return null;
  } catch (err) {
    console.warn(`Nominatim request failed: ${err.message}`);
    return null;
  }
}

// --- 統合: Gemini → 辞書座標 or Nominatim → 辞書マッチ（フォールバック） ---
// Returns { coords: [lat, lon], name: string } or null
async function resolveLocation(geminiName, title, channel) {
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

const EXCLUDE_PATTERNS = /\b(gaming|gameplay|fortnite|minecraft|gta|valorant|apex|cod|warzone|pubg|roblox|music|song|playlist|dj set|radio|podcast|talk show|news|reaction|asmr|cooking|tutorial|how to|unbox|review|trailer|anime|cartoon|movie|film|episode|series|drama|vlog|mukbang|karaoke|concert|remix|GDP|population|アニメ|disney|ディズニー)\b/i;
const INCLUDE_PATTERNS = /\b(cam|webcam|live cam|camera|view|skyline|beach|city|nature|street|traffic|weather|airport|harbor|port|landscape|panorama|scenic|earth|world|ocean|sea|mountain|river|lake|volcano|aurora|wildlife|animal|bird|nest|reef|ISS|space station|observatory)\b/i;

// --- Helpers ---
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateQuery() {
  const base = pick(BASE_QUERIES);
  if (Math.random() < 0.7) {
    const location = pick(LOCATIONS);
    if (Math.random() < 0.5) {
      const topic = pick(TOPICS);
      return `${base} ${topic} ${location}`;
    }
    return `${base} ${location}`;
  }
  const topic = pick(TOPICS);
  return `${base} ${topic}`;
}

// --- YouTube API ---
async function searchLiveVideos(query, order) {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    eventType: 'live',
    videoEmbeddable: 'true',
    maxResults: '25',
    order,
    key: API_KEY,
  });

  const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube API error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  return data.items || [];
}

// --- Filter ---
function filterCameraStreams(items) {
  const cameraLike = items.filter(item => {
    const title = item.snippet.title;
    if (EXCLUDE_PATTERNS.test(title)) return false;
    if (INCLUDE_PATTERNS.test(title)) return true;
    return true;
  });
  return cameraLike.length > 0 ? cameraLike : items;
}

// --- Main ---
async function main() {
  console.log(`Gemini API: ${GEMINI_API_KEY ? '有効' : '無効（辞書マッチのみ）'}`);

  // Load existing videos to merge
  let existing = [];
  try {
    existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
  } catch {
    // First run or corrupted file
  }

  const existingIds = new Set(existing.map(v => v.videoId));
  const newVideos = [];
  const SEARCH_COUNT = 4; // 4 searches per cron run

  // --- Phase 1: YouTube検索で全候補を収集 ---
  const allCandidates = [];
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
        allCandidates.push({
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

  // --- Phase 1.5: フル説明文を一括取得（新規 + 既存未解決） ---
  const unresolved = existing.filter(v => !v.location);
  const allVideoIds = [
    ...allCandidates.map(c => c.videoId),
    ...unresolved.map(v => v.videoId),
  ];
  const descriptions = await fetchVideoDescriptions(allVideoIds);
  for (const c of allCandidates) {
    c.description = descriptions[c.videoId] || '';
  }
  const unresolvedDescs = {};
  for (const v of unresolved) {
    unresolvedDescs[v.videoId] = descriptions[v.videoId] || '';
  }
  console.log(`説明文取得: ${Object.keys(descriptions).length}/${allVideoIds.length}件`);

  // --- Phase 2: 既存動画のうち location 未設定のものも収集 ---
  if (unresolved.length > 0) {
    console.log(`既存動画の再処理対象: ${unresolved.length}件 (location未設定)`);
  }

  // --- Phase 3: 辞書マッチを先に試し、未解決分だけGeminiに送る（RPD節約） ---
  // 新規候補: 辞書マッチを先に試す（title → channel のみ、descriptionはGeminiに委ねる）
  const newDictResults = allCandidates.map(c =>
    extractLocationFromDict(c.title) || extractLocationFromDict(c.channel) || null
  );
  // 既存未解決: 辞書マッチを先に試す
  const unresolvedDictResults = unresolved.map(v =>
    extractLocationFromDict(v.title) || extractLocationFromDict(v.channel || '') || null
  );

  // 辞書で解決できなかったものだけGeminiに送る
  const geminiNeededNew = allCandidates
    .map((c, i) => newDictResults[i] ? null : { idx: i, title: c.title, channel: c.channel, description: c.description })
    .filter(Boolean);
  const geminiNeededUnresolved = unresolved
    .map((v, i) => unresolvedDictResults[i] ? null : { idx: i, title: v.title, channel: v.channel || '', description: unresolvedDescs[v.videoId] || '' })
    .filter(Boolean);
  const geminiItems = [
    ...geminiNeededNew.map(g => ({ title: g.title, channel: g.channel, description: g.description || '' })),
    ...geminiNeededUnresolved.map(g => ({ title: g.title, channel: g.channel, description: g.description || '' })),
  ];

  // Gemini不要ならスキップ（RPD節約）
  let geminiResults = geminiItems.map(() => null);
  if (geminiItems.length > 0) {
    console.log(`Gemini送信: ${geminiItems.length}件（辞書で解決済み: 新規${allCandidates.length - geminiNeededNew.length}件, 再処理${unresolved.length - geminiNeededUnresolved.length}件）`);
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
  for (let j = 0; j < allCandidates.length; j++) {
    const c = allCandidates[j];
    // 辞書マッチ済みならそのまま使う、なければGemini結果で解決
    const dictResult = newDictResults[j];
    const result = dictResult || await resolveLocation(newGeminiMap.get(j) || null, c.title, c.channel);
    newVideos.push({
      videoId: c.videoId,
      title: c.title,
      channel: c.channel,
      thumbnail: c.thumbnail,
      query: c.query,
      location: result?.coords || null,
      locationName: result?.name || null,
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
      continue;
    }
    const geminiName = unresolvedGeminiMap.get(j) || null;
    const result = await resolveLocation(geminiName, v.title, v.channel || '');
    if (result) {
      v.location = result.coords;
      v.locationName = result.name;
    }
  }

  // Merge: new videos first, then existing (cap at 200 to keep file manageable)
  const merged = [...newVideos, ...existing].slice(0, 200);

  writeFileSync(OUTPUT_PATH, JSON.stringify(merged, null, 2));
  console.log(`\nDone: ${newVideos.length} new videos added, ${merged.length} total in videos.json`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
