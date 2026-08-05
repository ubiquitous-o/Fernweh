// 世界を網羅的に回るための地域レシピ。
// 各地域: YouTube検索に渡す regionCode / relevanceLanguage、
// 現地語の検索語 terms、代表地名 places、
// プール内の本数を数えるための tz（IANAタイムゾーンのプレフィックス）。
// tz は上から順に前方一致で判定するので、広いプレフィックス（'America/'等）を
// 使う地域は REGIONS の後方に置くこと。
export const REGIONS = [
  {
    id: 'japan', regionCode: 'JP', lang: 'ja',
    tz: ['Asia/Tokyo'],
    terms: ['ライブカメラ', 'ライブカメラ 配信', 'live camera japan'],
    places: ['東京', '渋谷', '大阪', '京都', '北海道', '沖縄', '富士山', '横浜', '神戸', '鎌倉', '長野'],
  },
  {
    id: 'korea', regionCode: 'KR', lang: 'ko',
    tz: ['Asia/Seoul', 'Asia/Pyongyang'],
    terms: ['라이브 캠', '실시간 카메라', 'live camera korea'],
    places: ['서울', '부산', '제주', '한강', 'Seoul', 'Busan', 'Jeju'],
  },
  {
    id: 'greater-china', regionCode: 'TW', lang: 'zh-Hant',
    tz: ['Asia/Taipei', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Macau'],
    terms: ['即時影像', '直播 攝影機', 'live camera taiwan'],
    places: ['台北', '高雄', '香港', 'Taipei', 'Hong Kong', 'Kaohsiung', '阿里山'],
  },
  {
    id: 'southeast-asia', regionCode: 'TH', lang: 'en',
    tz: ['Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Manila', 'Asia/Jakarta', 'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Phnom_Penh', 'Asia/Vientiane', 'Asia/Yangon', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Pontianak', 'Asia/Brunei', 'Asia/Dili'],
    terms: ['live camera', 'webcam live', 'กล้องถ่ายทอดสด'],
    places: ['Bangkok', 'Phuket', 'Bali', 'Singapore', 'Hanoi', 'Manila', 'Kuala Lumpur', 'Boracay', 'Da Nang'],
  },
  {
    id: 'south-asia', regionCode: 'IN', lang: 'en',
    tz: ['Asia/Kolkata', 'Asia/Colombo', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Karachi'],
    terms: ['live camera', 'live darshan', 'webcam live'],
    places: ['India', 'Mumbai', 'Varanasi', 'Himalaya', 'Kathmandu', 'Colombo', 'Ganges'],
  },
  {
    id: 'middle-east', regionCode: 'AE', lang: 'en',
    tz: ['Asia/Dubai', 'Asia/Jerusalem', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Amman', 'Asia/Beirut', 'Asia/Baghdad', 'Europe/Istanbul'],
    terms: ['live camera', 'بث مباشر كاميرا', 'canlı kamera'],
    places: ['Dubai', 'Mecca', 'Jerusalem', 'Istanbul', 'Cappadocia', 'Doha', 'Petra'],
  },
  {
    id: 'russia-central-asia', regionCode: 'KZ', lang: 'ru',
    tz: ['Europe/Moscow', 'Asia/Yekaterinburg', 'Asia/Novosibirsk', 'Asia/Vladivostok', 'Asia/Almaty', 'Asia/Tashkent', 'Asia/Kamchatka', 'Asia/Irkutsk'],
    terms: ['веб камера онлайн', 'прямая трансляция камера', 'live camera'],
    places: ['Москва', 'Санкт-Петербург', 'Байкал', 'Владивосток', 'Almaty', 'Kamchatka'],
  },
  {
    id: 'africa', regionCode: 'ZA', lang: 'en',
    tz: ['Africa/'],
    terms: ['live camera', 'safari live', 'webcam live'],
    places: ['Kenya', 'Kruger', 'Cape Town', 'Serengeti', 'Namibia', 'Botswana', 'Marrakech', 'Cairo', 'Zanzibar', 'Victoria Falls'],
  },
  {
    id: 'oceania', regionCode: 'AU', lang: 'en',
    tz: ['Australia/', 'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Port_Moresby', 'Pacific/Guam', 'Pacific/Tahiti', 'Pacific/Honolulu', 'Pacific/Rarotonga'],
    terms: ['live camera', 'webcam live', 'surf cam'],
    places: ['Sydney', 'Bondi', 'Great Barrier Reef', 'Queenstown', 'Auckland', 'Fiji', 'Tasmania', 'Hawaii', 'Tahiti'],
  },
  {
    id: 'south-america', regionCode: 'BR', lang: 'pt',
    tz: [
      // ブラジル全ゾーン（Belem等がusaに落ちていた穴を塞ぐ）
      'America/Sao_Paulo', 'America/Belem', 'America/Fortaleza', 'America/Recife',
      'America/Bahia', 'America/Maceio', 'America/Araguaina', 'America/Santarem',
      'America/Cuiaba', 'America/Campo_Grande', 'America/Manaus', 'America/Boa_Vista',
      'America/Porto_Velho', 'America/Eirunepe', 'America/Rio_Branco', 'America/Noronha',
      // その他南米
      'America/Argentina', 'America/Santiago', 'America/Punta_Arenas', 'America/Lima',
      'America/Bogota', 'America/Caracas', 'America/Montevideo', 'America/La_Paz',
      'America/Guayaquil', 'America/Asuncion', 'America/Guyana', 'America/Paramaribo',
      'America/Cayenne',
    ],
    terms: ['câmera ao vivo', 'cámara en vivo', 'en vivo webcam'],
    places: ['Rio de Janeiro', 'Buenos Aires', 'Patagonia', 'Cusco', 'Cartagena', 'Santiago', 'Galápagos', 'Iguazú', 'Atacama'],
  },
  {
    id: 'central-america-caribbean', regionCode: 'MX', lang: 'es',
    tz: [
      // メキシコ全ゾーン（Tijuana/Monterrey/Merida等がusaに落ちていた穴を塞ぐ）
      'America/Mexico_City', 'America/Cancun', 'America/Merida', 'America/Monterrey',
      'America/Matamoros', 'America/Chihuahua', 'America/Ciudad_Juarez', 'America/Ojinaga',
      'America/Hermosillo', 'America/Mazatlan', 'America/Bahia_Banderas', 'America/Tijuana',
      // 中米
      'America/Guatemala', 'America/Belize', 'America/El_Salvador', 'America/Tegucigalpa',
      'America/Managua', 'America/Costa_Rica', 'America/Panama',
      // カリブ
      'America/Havana', 'America/Jamaica', 'America/Cayman', 'America/Nassau',
      'America/Port-au-Prince', 'America/Santo_Domingo', 'America/Puerto_Rico',
      'America/Aruba', 'America/Curacao', 'America/Kralendijk', 'America/Lower_Princes',
      'America/Barbados', 'America/Port_of_Spain', 'America/Grand_Turk', 'America/Martinique',
      'America/Guadeloupe', 'America/St_Thomas', 'America/Anguilla', 'America/Antigua',
      'America/Dominica', 'America/Grenada', 'America/Montserrat', 'America/St_Kitts',
      'America/St_Lucia', 'America/St_Vincent', 'America/Tortola', 'America/St_Barthelemy',
      'America/Marigot', 'Atlantic/Bermuda',
    ],
    terms: ['cámara en vivo', 'en vivo playa', 'live camera'],
    places: ['Cancún', 'Mexico City', 'Costa Rica', 'Panama', 'Havana', 'Aruba', 'Jamaica', 'Belize', 'Roatan'],
  },
  {
    id: 'nordic', regionCode: 'NO', lang: 'en',
    tz: ['Europe/Oslo', 'Europe/Stockholm', 'Europe/Helsinki', 'Europe/Copenhagen', 'Atlantic/Reykjavik', 'Atlantic/Faroe', 'America/Godthab', 'America/Nuuk'],
    terms: ['live camera', 'webcam live', 'nordlys kamera'],
    places: ['Lofoten', 'Tromsø', 'Reykjavik', 'Stockholm', 'Lapland', 'Svalbard', 'Faroe Islands', 'Greenland', 'aurora'],
  },
  {
    id: 'western-europe', regionCode: 'DE', lang: 'en',
    tz: ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Zurich', 'Europe/Vienna', 'Europe/Luxembourg'],
    terms: ['live camera', 'webcam live', 'livecam'],
    places: ['Paris', 'Berlin', 'Amsterdam', 'Alps', 'Scotland', 'Ireland', 'Zermatt', 'Rhine', 'Normandy'],
  },
  {
    id: 'southern-europe', regionCode: 'IT', lang: 'en',
    tz: ['Europe/Rome', 'Europe/Madrid', 'Europe/Lisbon', 'Europe/Athens', 'Europe/Zagreb', 'Europe/Malta', 'Europe/Ljubljana', 'Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores'],
    terms: ['webcam in diretta', 'cámara en directo', 'live camera'],
    places: ['Venice', 'Rome', 'Santorini', 'Barcelona', 'Lisbon', 'Dubrovnik', 'Amalfi', 'Canary Islands', 'Sicily'],
  },
  {
    id: 'eastern-europe', regionCode: 'PL', lang: 'en',
    tz: ['Europe/Warsaw', 'Europe/Prague', 'Europe/Budapest', 'Europe/Bucharest', 'Europe/Sofia', 'Europe/Kiev', 'Europe/Kyiv', 'Europe/Riga', 'Europe/Vilnius', 'Europe/Tallinn', 'Europe/Belgrade', 'Europe/Bratislava', 'Europe/Tirane', 'Europe/Sarajevo', 'Europe/Skopje', 'Europe/Minsk'],
    terms: ['kamera na żywo', 'live camera', 'webcam live'],
    places: ['Prague', 'Kraków', 'Budapest', 'Tatra', 'Riga', 'Tallinn', 'Carpathian', 'Kotor'],
  },
  {
    id: 'canada', regionCode: 'CA', lang: 'en',
    tz: ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns', 'America/Whitehorse', 'America/Yellowknife', 'America/Iqaluit', 'America/Regina'],
    terms: ['live camera', 'webcam live', 'caméra en direct'],
    places: ['Banff', 'Vancouver', 'Niagara', 'Quebec', 'Rockies', 'Yukon', 'Nova Scotia', 'Churchill'],
  },
  // 広いプレフィックス 'America/' はカナダ・中南米に一致しなかった残り＝主に米国。
  // 必ず上の地域より後ろに置く
  {
    id: 'usa', regionCode: 'US', lang: 'en',
    tz: ['America/', 'Pacific/Midway'],
    terms: ['live camera', 'webcam live', 'live cam'],
    places: ['Alaska', 'Yellowstone', 'Grand Canyon', 'Florida Keys', 'New Orleans', 'Maine', 'Oregon coast', 'Utah'],
  },
];

// タイムゾーン文字列から地域idを引く（前方一致・REGIONSの順で最初に当たったもの）
export function regionOfTimezone(tz) {
  if (!tz) return null;
  for (const r of REGIONS) {
    if (r.tz.some((prefix) => tz.startsWith(prefix))) return r.id;
  }
  return null;
}
