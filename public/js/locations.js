// 動画タイトル/チャンネル名から場所を推測するためのフォールバック辞書。
// ビルド時にgeocoded済みでない動画用のランタイム補完。
const COORDS = {
  'Tokyo':[35.68,139.69],'New York':[40.71,-74.01],'Paris':[48.86,2.35],
  'London':[51.51,-0.13],'Bangkok':[13.76,100.50],'Dubai':[25.20,55.27],
  'Sydney':[-33.87,151.21],'Rio':[-22.91,-43.17],'Istanbul':[41.01,28.98],
  'Rome':[41.90,12.50],'Barcelona':[41.39,2.17],'Amsterdam':[52.37,4.90],
  'Seoul':[37.57,126.98],'Singapore':[1.35,103.82],'Hong Kong':[22.32,114.17],
  'Mumbai':[19.08,72.88],'Cairo':[30.04,31.24],'Cape Town':[-33.93,18.42],
  'Vancouver':[49.28,-123.12],'Reykjavik':[64.15,-21.94],
  'Oslo':[59.91,10.75],'Helsinki':[60.17,24.94],'Prague':[50.08,14.44],
  'Vienna':[48.21,16.37],'Zurich':[47.38,8.54],'Lisbon':[38.72,-9.14],
  'Athens':[37.98,23.73],'Santorini':[36.39,25.46],'Bali':[-8.34,115.09],
  'Hawaii':[21.31,-157.86],'Alaska':[61.22,-149.90],
  'Venice':[45.44,12.32],'Venice Beach':[33.99,-118.47],
  'San Diego':[32.72,-117.16],'San Francisco':[37.77,-122.42],
  'Los Angeles':[34.05,-118.24],'Chicago':[41.88,-87.63],
  'Miami':[25.76,-80.19],'Seattle':[47.61,-122.33],
  'Berlin':[52.52,13.41],'Stockholm':[59.33,18.07],
  'Copenhagen':[55.68,12.57],'Budapest':[47.50,19.04],
  'Moscow':[55.76,37.62],'Beijing':[39.90,116.40],'Shanghai':[31.23,121.47],
  'Taipei':[25.03,121.57],'Osaka':[34.69,135.50],'Kyoto':[35.01,135.77],
  'Sapporo':[43.06,141.35],'Hokkaido':[43.06,141.35],
  'Fuji':[35.36,138.73],'Mt. Fuji':[35.36,138.73],
  'Kruger':[-24.01,31.49],'Kenya':[-0.02,37.91],
  'South Africa':[-30.56,22.94],'Namibia':[-22.96,18.49],
  'Botswana':[-22.33,24.68],'Florida':[27.99,-81.76],
  'California':[36.78,-119.42],'Texas':[31.97,-99.90],
  'Monterey':[36.60,-121.89],'Galveston':[29.30,-94.80],
  'Gatlinburg':[35.71,-83.51],'Yellowstone':[44.46,-110.83],
  'Curacao':[12.17,-68.98],'Jamaica':[18.11,-77.30],
  'Korea':[37.57,126.98],'Japan':[35.68,139.69],
  'Thailand':[15.87,100.99],'Australia':[-33.87,151.21],
  'Niseko':[42.86,140.69],'Hakone':[35.23,139.11],
  'Maui':[20.80,-156.33],'Oahu':[21.44,-158.00],
  'Anchorage':[61.22,-149.90],'Honolulu':[21.31,-157.86],
  'Islamorada':[24.92,-80.63],'Jacksonville':[30.33,-81.66],
  'Huntington Beach':[33.66,-118.00],'Hollywood Beach':[26.01,-80.15],
  'Finland':[61.92,25.75],'Sweden':[59.33,18.07],'Denmark':[55.68,12.57],
  'Germany':[52.52,13.41],'France':[48.86,2.35],'Spain':[40.42,-3.70],
  'Portugal':[38.72,-9.14],'Greece':[37.98,23.73],'Turkey':[41.01,28.98],
  'Norway':[59.91,10.75],'Iceland':[64.15,-21.94],
  'Russia':[55.76,37.62],'China':[39.90,116.40],'India':[28.61,77.21],
  'Brazil':[-15.83,-47.88],'Mexico':[19.43,-99.13],'Argentina':[-34.60,-58.38],
  'Colombia':[4.71,-74.07],'Chile':[-33.45,-70.67],'Ecuador':[-0.23,-78.52],
  'Costa Rica':[9.93,-84.08],'Panama':[8.98,-79.52],
  'United States':[38.90,-77.04],'United Kingdom':[51.51,-0.13],
  'England':[51.51,-0.13],'Ireland':[53.35,-6.26],'Belgium':[50.85,4.35],
  'Netherlands':[52.37,4.90],'Poland':[52.23,21.01],'Ukraine':[50.45,30.52],
  'Romania':[44.43,26.10],'Hungary':[47.50,19.04],'Serbia':[44.82,20.46],
  'Bulgaria':[42.70,23.32],'Austria':[48.21,16.37],'Slovenia':[46.06,14.51],
  'Cyprus':[35.13,33.43],'Malta':[35.90,14.51],'Georgia':[41.72,44.83],
  'Indonesia':[-6.21,106.85],'Philippines':[14.60,120.98],
  'Malaysia':[3.14,101.69],'Cambodia':[11.56,104.93],'Myanmar':[16.87,96.20],
  'Sri Lanka':[6.93,79.85],'Mongolia':[47.91,106.90],
  'Israel':[31.77,35.21],'Jordan':[31.95,35.93],'Lebanon':[33.89,35.50],
  'Saudi Arabia':[24.71,46.68],'Iran':[35.69,51.39],
  'Egypt':[30.04,31.24],'Ethiopia':[-9.03,38.75],'Ghana':[5.55,-0.20],
  'Nigeria':[9.08,7.40],'Uganda':[0.35,32.58],
  'Fiji':[-18.13,178.06],'Seychelles':[-4.68,55.49],'Mauritius':[-20.16,57.50],
  'Madagascar':[-18.88,47.51],'Greenland':[64.18,-51.69],
  'Dominican Republic':[18.49,-69.93],'Puerto Rico':[18.47,-66.11],
  'Bermuda':[32.32,-64.76],'Tahiti':[-17.53,-149.57],
};

const LABELS = {
  'New York':'New York, USA','Los Angeles':'Los Angeles, USA',
  'San Francisco':'San Francisco, USA','San Diego':'San Diego, USA',
  'Chicago':'Chicago, USA','Miami':'Miami, USA','Seattle':'Seattle, USA',
  'Las Vegas':'Las Vegas, USA','Anchorage':'Anchorage, Alaska',
  'Honolulu':'Honolulu, Hawaii','Galveston':'Galveston, Texas',
  'Gatlinburg':'Gatlinburg, Tennessee','Monterey':'Monterey, California',
  'Venice Beach':'Venice Beach, California','Yellowstone':'Yellowstone, USA',
  'Jacksonville':'Jacksonville, Florida','Huntington Beach':'Huntington Beach, California',
  'Hollywood Beach':'Hollywood Beach, Florida','Islamorada':'Islamorada, Florida',
  'Venice':'Venice, Italy','Santorini':'Santorini, Greece',
  'Berlin':'Berlin, Germany','Stockholm':'Stockholm, Sweden',
  'Copenhagen':'Copenhagen, Denmark','Budapest':'Budapest, Hungary',
  'Moscow':'Moscow, Russia','Beijing':'Beijing, China','Shanghai':'Shanghai, China',
  'Taipei':'Taipei, Taiwan','Osaka':'Osaka, Japan','Kyoto':'Kyoto, Japan',
  'Sapporo':'Sapporo, Japan','Hokkaido':'Hokkaido, Japan',
  'Fuji':'Fuji, Japan','Mt. Fuji':'Mt. Fuji, Japan',
  'Niseko':'Niseko, Japan','Hakone':'Hakone, Japan',
  'Kruger':'Kruger, South Africa','Reykjavik':'Reykjavik, Iceland',
  'Maui':'Maui, Hawaii','Oahu':'Oahu, Hawaii',
  'Vancouver':'Vancouver, Canada','Florida':'Florida, USA',
  'California':'California, USA','Texas':'Texas, USA',
};

// 部分一致は長いキーから優先（"Venice Beach"が"Venice"より先にマッチするように）
const NAMES_SORTED = Object.keys(COORDS).sort((a, b) => b.length - a.length);

// 各キーをコンパイル済み正規表現にキャッシュ（毎呼び出しでnew RegExpするのを避ける）
const PATTERNS = NAMES_SORTED.map((key) => ({
  key,
  re: new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
}));

export function guessLocation(title, channel) {
  for (const { key, re } of PATTERNS) {
    if (re.test(title)) return { coords: COORDS[key], name: LABELS[key] || key };
  }
  if (channel) {
    for (const { key, re } of PATTERNS) {
      if (re.test(channel)) return { coords: COORDS[key], name: LABELS[key] || key };
    }
  }
  return null;
}
