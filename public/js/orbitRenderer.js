// 軌道ビュー（orbit.js）の描画: 瞬く星空 + 本物の見た目の地球 + 光の柱。1枚のWebGLキャンバスに描く。
//   - 星: 色温度・等級・瞬きが星ごとに違う。位置や色は頂点シェーダーが seed から計算する。
//   - 地球: NASAの画像（昼 / 夜の街明かり / 海のマスク / 雲）を球に貼る。昼夜の境目は太陽の向きで決まり、
//     海には太陽の反射、縁には大気の青い光が出る。雲は地表に影を落とし、夜側では街明かりを隠す。
//   - 光の柱: 地球上の場所から宇宙へ伸びる光の筋。近づくと太く見え、最後は視界を覆う。
// カメラや時間の進み方はここでは持たない。orbit.js が毎フレーム scene を渡す。
import { PREVIEWS } from './orbitTexturePreviews.js';

const STAR_COUNT = 600;
// 描画解像度の上限（長辺px）。これより大きい画面では縮小して描き、CSSで拡大表示する
const MAX_PIXELS = 1600;
// 雲が地表に対して東へ流れる速さ（1秒あたり、地球一周を1として）
const CLOUD_DRIFT = 0.00055;
// 同時に描ける光の柱の数（シェーダーの配列長）
const MAX_BEAMS = 2;

const TEXTURES = [
  { key: 'day', url: 'img/earth-day.jpg' },     // 昼の地球（Blue Marble）
  { key: 'night', url: 'img/earth-night.jpg' }, // 夜の街明かり（Black Marble）
  { key: 'water', url: 'img/earth-water.jpg' }, // 海=白 / 陸=黒 のマスク
  { key: 'clouds', url: 'img/earth-clouds.jpg' }, // 雲の濃さ（白いほど厚い雲）
];

const STAR_VERTEX = `
  attribute vec4 a_seed; // xy: 位置(-1..1) / z: 奥行き（視差の強さ）/ w: 等級の乱数
  attribute vec4 a_look; // x: 色温度 / y: 瞬きの深さ / z: 瞬きの位相 / w: 瞬きの速さ(rad/s)
  uniform vec2 u_pan;    // カメラの向き。変わると星空が流れる
  uniform float u_scale; // 画面サイズに応じた拡大率
  uniform float u_time;
  uniform float u_dim;   // 全体の明るさ（地表に近づくほど沈める）
  varying float v_alpha;
  varying float v_spark;
  varying vec3 v_color;

  vec3 starColor(float t) {
    vec3 warm = vec3(1.0, 0.60, 0.42);
    vec3 mid = vec3(1.0, 0.93, 0.80);
    vec3 cool = vec3(0.66, 0.79, 1.0);
    return t < 0.5 ? mix(warm, mid, t * 2.0) : mix(mid, cool, t * 2.0 - 1.0);
  }

  void main() {
    // 奥行きで流れる速さを変える（視差）。端で折り返して無限に続く
    float depth = mix(0.5, 1.0, a_seed.z);
    vec2 xy = fract(a_seed.xy * 0.5 + 0.5 - u_pan * 0.5 * depth) * 2.0 - 1.0;
    gl_Position = vec4(xy, 0.0, 1.0);

    // 等級: 3乗で偏らせ、明るい星は少数に。特に明るい星は十字のきらめきを持つ
    float mag = pow(a_seed.w, 3.0);
    v_spark = smoothstep(0.45, 0.85, mag);
    gl_PointSize = (1.2 + 1.3 * depth) * (1.0 + 0.6 * mag) * (1.0 + 1.2 * v_spark) * u_scale;

    // 瞬き: 星ごとに深さ・速さ・位相が違う
    float twinkle = 1.0 - a_look.y * (0.5 + 0.5 * sin(u_time * a_look.w + a_look.z));
    v_alpha = mix(0.55, 1.0, depth) * mix(0.35, 1.0, mag) * twinkle * u_dim;
    v_color = starColor(a_look.x);
  }
`;

const STAR_FRAGMENT = `
  precision mediump float;
  varying float v_alpha;
  varying float v_spark;
  varying vec3 v_color;

  void main() {
    // 普通の星は四角いピクセル。明るい星は「芯 + 十字の腕」のピクセルきらめき
    vec2 q = abs(gl_PointCoord - 0.5) * 2.0;
    float far = max(q.x, q.y);
    float core = step(far, mix(1.0, 0.34, v_spark));
    float arm = step(min(q.x, q.y), 0.17) * (1.0 - far);
    gl_FragColor = vec4(v_color, v_alpha * max(core, v_spark * arm));
  }
`;

const EARTH_VERTEX = `
  attribute vec2 a_pos;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// 画面の各ピクセルから球面上の点を求め（正射影）、緯度経度で画像を引く。
// その上に光の柱を重ねる。
// DERIVATIVES は OES_standard_derivatives が使えるときだけ定義される。
const EARTH_FRAGMENT = `
  #ifdef DERIVATIVES
  #extension GL_OES_standard_derivatives : enable
  #endif
  precision highp float;

  uniform vec2 u_center;   // 地球の中心(px、左下原点)
  uniform float u_radius;  // 地球の半径(px)
  uniform mat3 u_rot;      // 視線座標 → 地球座標（列 = 東 / 北 / 正面）
  uniform vec3 u_sun;      // 太陽の向き（地球座標）
  uniform float u_haze;    // 0..1 降りるほど地表が霞む
  uniform sampler2D u_day;
  uniform sampler2D u_night;
  uniform sampler2D u_water;
  uniform sampler2D u_clouds;
  uniform float u_cloudShift; // 雲が地表に対して東へ流れた量（画像座標）
  // 光の柱: 根元(A)と先端(B)の画面位置(px) / 太さ(px) / 根元と先端の奥行き(地球半径単位) / 濃さ
  uniform vec2 u_beamA[${MAX_BEAMS}];
  uniform vec2 u_beamB[${MAX_BEAMS}];
  uniform float u_beamW[${MAX_BEAMS}];
  uniform vec2 u_beamZ[${MAX_BEAMS}];
  uniform float u_beamAlpha[${MAX_BEAMS}];
  uniform vec3 u_beamColor;
  uniform float u_beamCover; // 0..1 柱が視界を覆っている度合い（覆うほど柱を上下に伸ばす）
  uniform float u_fill;      // 0..1 柱の中に入りきった = 画面全体が光

  const vec3 ATMO = vec3(0.30, 0.56, 1.0);   // 大気の散乱光（青）
  const float CLOUD_GAMMA = 0.5;             // 雲の濃淡の持ち上げ（小さいほど薄い雲まで見える）
  const vec3 SUNSET = vec3(0.85, 0.48, 0.30); // 昼夜の境目の散乱光（夕焼け色）

  void main() {
    vec2 p = (gl_FragCoord.xy - u_center) / u_radius;
    float r = length(p);

    // 光の柱: 根元から先端への線分までの距離で、芯とにじみを作る
    float beam = 0.0;
    for (int i = 0; i < ${MAX_BEAMS}; i++) {
      if (u_beamAlpha[i] > 0.0) {
        vec2 ab = u_beamB[i] - u_beamA[i];
        float along = dot(gl_FragCoord.xy - u_beamA[i], ab) / max(dot(ab, ab), 0.0001);
        // 柱へ入るときは上下に伸ばす（端の丸みを見せず、縦の光の帯のまま視界を覆う）
        float reach = 1.0 + 8.0 * u_beamCover;
        float t = clamp(along, -3.0 * u_beamCover, reach);
        vec2 nearest = u_beamA[i] + ab * t;
        float w = u_beamW[i];
        // 芯は中心がいちばん明るく、縁へなだらかに落ちる。その外に淡いにじみ
        float x = distance(gl_FragCoord.xy, nearest) / w;
        float core = pow(clamp(1.0 - x, 0.0, 1.0), 1.4);
        float glow = 0.2 * exp(-1.6 * max(x - 0.6, 0.0));
        // 根元には小さな光だまり
        float foot = 0.5 * exp(-distance(gl_FragCoord.xy, u_beamA[i]) / (w * 1.6 + 1.5));
        // 先端は端を見せずに宇宙へ溶けていく。ただし柱を真上から見ているとき（画面上の長さが
        // 太さより短い）は丸い光として見えるので、溶かさない
        float endOn = 1.0 - smoothstep(1.0, 3.0, length(ab) / w);
        float tip = mix(1.0 - smoothstep(0.25, 0.95, along / reach), 1.0, endOn);
        // 柱は地表より外にあるので、隠れるのは地球の真裏に回った部分だけ
        // （奥行きが負で、かつ地球の円の内側に重なるところ）
        float zb = mix(u_beamZ[i].x, u_beamZ[i].y, t);
        float rb = length(nearest - u_center) / u_radius;
        float visible = max(smoothstep(-0.02, 0.02, zb), smoothstep(0.985, 1.0, rb));
        beam = max(beam, clamp((core + glow) * tip + foot, 0.0, 1.0) * visible * u_beamAlpha[i]);
      }
    }

    vec3 col;
    float alpha;

    if (r < 1.0) {
      vec3 n = vec3(p, sqrt(1.0 - r * r));
      vec3 e = u_rot * n;

      // 緯度経度 → 画像座標（正距円筒図法。左端が西経180度、上端が北極）
      float lat = asin(clamp(e.y, -1.0, 1.0));
      float u1 = atan(e.x, e.z) / 6.2831853 + 0.5;
      #ifdef DERIVATIVES
      // 経度の継ぎ目（±180度）ではミップマップが破綻して線が出る。
      // 継ぎ目の位置が違うもう一つの座標を用意し、変化のなだらかなほうを使う
      float u2 = fract(u1 + 0.5) - 0.5;
      float u = fwidth(u1) <= fwidth(u2) + 0.000001 ? u1 : u2;
      #else
      float u = u1;
      #endif
      vec2 uv = vec2(u, 0.5 - lat / 3.14159265);

      vec3 day = texture2D(u_day, uv).rgb;
      vec3 night = texture2D(u_night, uv).rgb;
      float water = texture2D(u_water, uv).r;

      float sunDot = dot(e, u_sun);
      vec3 view = u_rot[2];
      // 視線と地表のなす角の余弦。真上から見ると 1、縁へ近づくほど 0（大気を斜めに長く通って見える）
      float mu = n.z;

      // --- 昼の地表 ---
      // 太陽光の当たり具合。昼夜の境目はなだらかに落ちる
      float sun = smoothstep(-0.06, 0.32, sunDot);
      // 低い太陽の光は大気を長く通って赤みを帯びる（境目の近くは夕焼け色）
      vec3 sunColor = mix(vec3(1.0, 0.55, 0.28), vec3(1.0, 0.98, 0.94), smoothstep(0.0, 0.35, sunDot));
      // 元の画像は彩度が強い。宇宙から見た落ち着いた色へ少し寄せる
      vec3 ground = mix(vec3(dot(day, vec3(0.299, 0.587, 0.114))), day, 0.86);
      vec3 lit = ground * sunColor * sun * 1.08;

      // 海: 斜めから見るほど空を映して明るくなる（フレネル）
      lit += water * pow(1.0 - mu, 4.0) * vec3(0.20, 0.34, 0.55) * sun * 0.55;
      // 海面の太陽の反射: 鋭い芯 + まわりの広いにじみ
      float ndh = max(dot(e, normalize(u_sun + view)), 0.0);
      float glint = pow(ndh, 140.0) * 0.5 + pow(ndh, 24.0) * 0.14;
      lit += sunColor * glint * water * sun;

      // --- 夜の地表 ---
      // 画像は「暗い青の地表 + 街明かり」。明かり（赤み・黄みが青より強い部分）を取り出して暖色で光らせる
      float lights = max(night.r - night.b, 0.0);
      vec3 dark = night * 0.5 + vec3(1.0, 0.78, 0.48) * lights * 3.4;
      // --- 雲 ---
      // 雲は地表の上を少しずつ東へ流れる
      vec2 cloudUv = vec2(uv.x + u_cloudShift, uv.y);
      // 元の画像は薄い雲がとても暗い値で入っている。暗い側を持ち上げて、薄い雲の筋まで見せる
      float cloud = clamp(pow(texture2D(u_clouds, cloudUv).r, CLOUD_GAMMA) * 1.1, 0.0, 1.0);
      // 雲の影: 太陽の側へ少しずらした位置にある雲が、地表を暗くする。
      // 太陽へ向かう地表上の向きを、東西・南北の成分に分けて画像座標のずれに直す
      vec3 toSun = u_sun - e * sunDot;
      vec3 east = normalize(vec3(e.z, 0.0, -e.x) + vec3(0.00001, 0.0, 0.0));
      vec3 north = cross(e, east);
      vec2 shadowOffset = vec2(dot(toSun, east) / 6.2831853, -dot(toSun, north) / 3.14159265) * 0.012;
      float shadow = clamp(pow(texture2D(u_clouds, cloudUv + shadowOffset).r, CLOUD_GAMMA) * 1.1, 0.0, 1.0);
      lit *= 1.0 - 0.4 * shadow;
      // 雲そのもの: 太陽の光で白く光る。高い位置にあるので、地表より少し先まで日が当たる
      vec3 cloudLit = vec3(0.95, 0.97, 1.0) * sunColor * smoothstep(-0.12, 0.28, sunDot);
      lit = mix(lit, cloudLit, cloud * 0.9);
      // 夜側では、雲が街明かりを隠す
      dark *= 1.0 - 0.75 * cloud;

      // 街明かりは日が差すと見えなくなる
      col = lit + dark * (1.0 - smoothstep(-0.15, 0.1, sunDot));

      // --- 大気 ---
      // 大気を通る道のり。真上から見ると短く、縁へ近づくと長い
      float path = 1.0 / (mu + 0.12);
      float scatter = 1.0 - exp(-0.11 * path);
      // 太陽に照らされた大気の散乱光。昼側は青く、昼夜の境目では夕焼け色に寄る
      float airLight = smoothstep(-0.15, 0.3, sunDot);
      vec3 airColor = mix(SUNSET, ATMO, smoothstep(-0.05, 0.3, sunDot));
      // 地表の色は大気で少し弱まり、そのぶん散乱光が乗る（中央は淡い霞、縁は青い帯になる）
      col = col * (1.0 - 0.55 * scatter) + airColor * scatter * airLight * 0.95;
      // 降りるにつれ、地表が青白くうっすら霞む
      col = mix(col, mix(vec3(0.02, 0.03, 0.06), vec3(0.42, 0.58, 0.85), sun), u_haze);

      // 縁を1.5pxでなめらかに
      alpha = smoothstep(1.0, 1.0 - 1.5 / u_radius, r);
      col *= alpha;
    } else {
      // 地球の外側: 縁に沿った薄く明るい大気の層 + その外へ広がる淡い光。
      // 太陽の当たる側だけ光り、昼夜の境目では夕焼け色に寄る
      vec3 e = u_rot * vec3(p / r, 0.0);
      float sunDot = dot(e, u_sun);
      float airLight = smoothstep(-0.15, 0.3, sunDot);
      vec3 airColor = mix(SUNSET, ATMO, smoothstep(-0.05, 0.3, sunDot));
      float h = r - 1.0;
      float glow = (exp(-h / 0.010) * 0.7 + exp(-h / 0.045) * 0.2) * airLight;
      col = airColor * glow;
      alpha = glow * 0.6;
    }

    // 光の柱は、光の量に応じて柱の色へ寄せる（足し込むと昼の地表の上で白飛びする）。
    // 柱の中に入りきったら画面全体を同じ光にする。
    // 乗算済みアルファで出力（縁の光は加算ぎみ、地球本体は不透明に重なる）
    vec4 outColor = vec4(mix(col, u_beamColor, beam), max(alpha, beam));
    gl_FragColor = mix(outColor, vec4(u_beamColor, 1.0), u_fill);
  }
`;

// canvas に描画器を作る。WebGLが使えなければ null。
//   size():           描画バッファの大きさ [w, h]（scene のpx値はこの座標系で渡す）
//   draw(now, scene): 1フレーム描く（描画ループは呼び出し側が持つ）
//   clear():          透明にクリアする
// scene = {
//   pan: [x, y], starDim,
//   earth: { cx, cy(左下原点), radius, lat, lon(rad) }, sun: [x, y, z], haze,
//   beams: [{ ax, ay, bx, by(px、左下原点), width(px), z0, z1(地球半径単位の奥行き), alpha }],
//   beamColor: [r, g, b], beamCover(0..1), fill(0..1),
// }
export function createOrbitRenderer(canvas) {
  // 星ごとの乱数（コンテキスト復元時も同じ星空を使う）
  const starData = new Float32Array(STAR_COUNT * 8);
  for (let i = 0; i < STAR_COUNT; i++) {
    const o = i * 8;
    starData[o] = Math.random() * 2 - 1;
    starData[o + 1] = Math.random() * 2 - 1;
    starData[o + 2] = Math.random();
    starData[o + 3] = Math.random();
    // 色温度: 白(0.5)付近を多く、橙・青白は少なめに
    const r = Math.random() * 2 - 1;
    starData[o + 4] = 0.5 + 0.5 * Math.sign(r) * Math.pow(Math.abs(r), 1.5);
    starData[o + 5] = 0.15 + 0.6 * Math.random();  // 瞬きの深さ
    starData[o + 6] = Math.random() * Math.PI * 2;  // 瞬きの位相
    starData[o + 7] = 0.8 + 3.2 * Math.random();    // 瞬きの速さ(rad/s)
  }

  // 画像はコンテキストとは独立に読み込んで保持する（復元時に再アップロードできるように）。
  // 各画像には埋め込みの「仮の画像」があり、ページを開いた直後から地球を描ける。
  // 本物（img）が届いたら差し替える。source はいまGPUに渡すべき画像（本物優先）
  const images = TEXTURES.map((t) => {
    const entry = { ...t, img: new Image(), preview: new Image(), source: null, tex: null };
    entry.preview.onload = () => { if (!entry.source) { entry.source = entry.preview; uploadTexture(entry); } };
    entry.preview.src = PREVIEWS[t.key];
    entry.img.onload = () => { entry.source = entry.img; uploadTexture(entry); };
    entry.img.onerror = () => console.warn('Earth texture failed to load:', t.url);
    entry.img.src = t.url;
    return entry;
  });

  let gl, star, earth, starBuf, quadBuf, anisoExt, maxAniso;
  let sizeDirty = true;
  let lost = false;

  function buildProgram(vsSource, fsSource, attribs) {
    const compile = (type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('Orbit shader compile failed:', gl.getShaderInfoLog(s));
      }
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
    attribs.forEach((name, i) => gl.bindAttribLocation(prog, i, name));
    gl.linkProgram(prog);
    const u = (name) => gl.getUniformLocation(prog, name);
    return { prog, u };
  }

  function uploadTexture(entry) {
    if (!gl || lost || !entry.source) return;
    if (!entry.tex) entry.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, entry.tex);
    // GPUの上限より大きい画像は縮小してから渡す
    let source = entry.source;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (source.width > max) {
      const c = document.createElement('canvas');
      c.width = max;
      c.height = Math.round(source.height * max / source.width);
      c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
      source = c;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    // 経度方向はぐるっと繰り返す。縁の浅い角度でもぼやけにくいよう異方性フィルタを使う
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (anisoExt) gl.texParameterf(gl.TEXTURE_2D, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, maxAniso));
  }

  function initGL() {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false })
      || canvas.getContext('experimental-webgl');
    if (!gl) return false;

    const s = buildProgram(STAR_VERTEX, STAR_FRAGMENT, ['a_seed', 'a_look']);
    star = {
      prog: s.prog,
      uPan: s.u('u_pan'), uScale: s.u('u_scale'), uTime: s.u('u_time'), uDim: s.u('u_dim'),
    };

    const derivatives = !!gl.getExtension('OES_standard_derivatives');
    const e = buildProgram(EARTH_VERTEX, (derivatives ? '#define DERIVATIVES\n' : '') + EARTH_FRAGMENT, ['a_pos']);
    earth = {
      prog: e.prog,
      uCenter: e.u('u_center'), uRadius: e.u('u_radius'), uRot: e.u('u_rot'), uSun: e.u('u_sun'),
      uHaze: e.u('u_haze'),
      uDay: e.u('u_day'), uNight: e.u('u_night'), uWater: e.u('u_water'),
      uClouds: e.u('u_clouds'), uCloudShift: e.u('u_cloudShift'),
      uBeamA: e.u('u_beamA'), uBeamB: e.u('u_beamB'), uBeamW: e.u('u_beamW'), uBeamZ: e.u('u_beamZ'),
      uBeamAlpha: e.u('u_beamAlpha'), uBeamColor: e.u('u_beamColor'),
      uBeamCover: e.u('u_beamCover'), uFill: e.u('u_fill'),
    };

    starBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
    gl.bufferData(gl.ARRAY_BUFFER, starData, gl.STATIC_DRAW);
    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    anisoExt = gl.getExtension('EXT_texture_filter_anisotropic');
    maxAniso = anisoExt ? gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;

    // 画像は1x1の黒で仮置きし、読み込めたものから本物に差し替える
    for (const entry of images) {
      entry.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, entry.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));
      uploadTexture(entry);
    }

    gl.enable(gl.BLEND);
    gl.enableVertexAttribArray(0);
    sizeDirty = true;
    return true;
  }

  if (!initGL()) return null;

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; initGL(); });
  window.addEventListener('resize', () => { sizeDirty = true; });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const k = Math.min(1, MAX_PIXELS / Math.max(rect.width, rect.height, 1));
    canvas.width = Math.max(1, Math.round(rect.width * k));
    canvas.height = Math.max(1, Math.round(rect.height * k));
    gl.viewport(0, 0, canvas.width, canvas.height);
    sizeDirty = false;
  }

  const beamA = new Float32Array(MAX_BEAMS * 2);
  const beamB = new Float32Array(MAX_BEAMS * 2);
  const beamZ = new Float32Array(MAX_BEAMS * 2);
  const beamW = new Float32Array(MAX_BEAMS);
  const beamAlpha = new Float32Array(MAX_BEAMS);
  const rot = new Float32Array(9);

  return {
    size() {
      if (sizeDirty && !lost) resize();
      return [canvas.width, canvas.height];
    },

    draw(now, scene) {
      if (lost) return;
      if (sizeDirty) resize();
      const w = canvas.width, h = canvas.height;

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // 星空（加算合成）
      gl.useProgram(star.prog);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
      gl.uniform2f(star.uPan, scene.pan[0], scene.pan[1]);
      // 大画面でも星が点になりすぎないよう、短辺600pxを基準に拡大
      gl.uniform1f(star.uScale, Math.max(1, Math.min(w, h) / 600));
      gl.uniform1f(star.uTime, now * 0.001);
      gl.uniform1f(star.uDim, scene.starDim);
      gl.drawArrays(gl.POINTS, 0, STAR_COUNT);
      gl.disableVertexAttribArray(1);

      // 地球（昼の画像が仮のものでも使えるようになり次第、すぐ描く）
      if (!images[0].source) return;
      const ea = scene.earth;

      // 視線座標 → 地球座標の回転。列は「画面右=東 / 画面上=北 / 正面=視線の中心」
      const cl = Math.cos(ea.lat), sl = Math.sin(ea.lat), co = Math.cos(ea.lon), so = Math.sin(ea.lon);
      rot[0] = co;       rot[1] = 0;  rot[2] = -so;
      rot[3] = -sl * so; rot[4] = cl; rot[5] = -sl * co;
      rot[6] = cl * so;  rot[7] = sl; rot[8] = cl * co;

      beamAlpha.fill(0);
      scene.beams.slice(0, MAX_BEAMS).forEach((b, i) => {
        beamA[i * 2] = b.ax;
        beamA[i * 2 + 1] = b.ay;
        beamB[i * 2] = b.bx;
        beamB[i * 2 + 1] = b.by;
        beamZ[i * 2] = b.z0;
        beamZ[i * 2 + 1] = b.z1;
        beamW[i] = b.width;
        beamAlpha[i] = b.alpha > 0.001 ? b.alpha : 0;
      });

      gl.useProgram(earth.prog);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      images.forEach((entry, i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, entry.tex);
      });
      gl.uniform1i(earth.uDay, 0);
      gl.uniform1i(earth.uNight, 1);
      gl.uniform1i(earth.uWater, 2);
      gl.uniform1i(earth.uClouds, 3);
      // 雲の流れ: 約30分で地球を一周する速さ（幕が出ているあいだは、ほぼ止まって見える）
      gl.uniform1f(earth.uCloudShift, (now * 0.001 * CLOUD_DRIFT) % 1);
      gl.uniform2f(earth.uCenter, ea.cx, ea.cy);
      gl.uniform1f(earth.uRadius, ea.radius);
      gl.uniformMatrix3fv(earth.uRot, false, rot);
      gl.uniform3f(earth.uSun, scene.sun[0], scene.sun[1], scene.sun[2]);
      gl.uniform1f(earth.uHaze, scene.haze);
      gl.uniform2fv(earth.uBeamA, beamA);
      gl.uniform2fv(earth.uBeamB, beamB);
      gl.uniform1fv(earth.uBeamW, beamW);
      gl.uniform2fv(earth.uBeamZ, beamZ);
      gl.uniform1fv(earth.uBeamAlpha, beamAlpha);
      gl.uniform3f(earth.uBeamColor, scene.beamColor[0], scene.beamColor[1], scene.beamColor[2]);
      gl.uniform1f(earth.uBeamCover, scene.beamCover);
      gl.uniform1f(earth.uFill, scene.fill);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },

    clear() {
      if (lost) return;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
  };
}
