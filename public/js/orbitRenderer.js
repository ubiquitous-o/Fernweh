// 軌道ビュー（orbit.js）の描画: 星空 + 天の川 + 惑星 + 月 + 本物の見た目の地球 + 光の柱 + 太陽。1枚のWebGLキャンバスに描く。
//   - 空: 星・天の川・月・太陽は、カメラの向きから透視投影で描く。カメラが軌道を回って向きが変わると、
//     空全体が回って見える（星は無限に遠いので、カメラが近づいたり離れたりしても動かない）。
//       星: 宇宙から見た星。瞬かない小さな光の点で、暗い星ほど数が多い。天の川の帯に沿って多く集まる。
//       天の川: 銀河面に沿った淡い光の帯（実際の向き）。銀河の中心の方向ほど明るく太い。
//       惑星: 水星・金星・火星・木星・土星が実際の位置に、星より明るい光の点として出る。
//       月: 実際の位置に、実際の満ち欠けで出る。地球に近いので、カメラが動くと星に対して少しずれて見える。
//       太陽: 実際の位置。地球の縁から出入りするときは、見えているぶんだけまぶしく光る。
//   - 地球: NASAの画像（昼 / 夜の街明かり / 海のマスク / 雲 / 標高）を球に貼る。昼夜の境目は太陽の向きで決まり、
//     海には太陽の反射、縁には大気の青い光が出る。雲は地表に影を落とし、夜側では街明かりを隠す。
//     標高からは山の陰影を作る（太陽に向いた斜面は明るく、背いた斜面は暗い）。
//   - 光の柱: 地球上の場所から宇宙へ伸びる光の筋。近づくと太く見え、最後は視界を覆う。
// カメラや時間の進み方はここでは持たない。orbit.js が毎フレーム scene を渡す。
import { PREVIEWS } from './orbitTexturePreviews.js';

// 星の数（空全体。画面に入るのはこのうち1〜2割）
const STAR_COUNT = 9000;
// 描画解像度: 高精細ディスプレイでは表示の倍率に合わせて細かく描く（星が小さな点になる）。
// 倍率は MAX_DPR まで。長辺が MAX_PIXELS を超える画面では縮小して描き、CSSで拡大表示する
const MAX_DPR = 2;
const MAX_PIXELS = 2400;
// 雲が地表に対して東へ流れる速さ（1秒あたり、地球一周を1として）
const CLOUD_DRIFT = 0.00055;
// 同時に描ける光の柱の数（シェーダーの配列長）
const MAX_BEAMS = 2;
// 太陽と月の見かけの半径(rad。どちらも実際は約0.26度)と、見やすくするための拡大率。
// 実際の大きさだと数ピクセルの点にしかならないので、月は大きめに描く
const BODY_RADIUS = 0.26 * (Math.PI / 180);
const SUN_SCALE = 1.6;
const MOON_SCALE = 3;
// 月までの距離（地球の半径を1として）
const MOON_DISTANCE = 60.3;

// 天球上の向きの表し方は地球と同じ: [cos(赤緯)sin(赤経), sin(赤緯), cos(赤緯)cos(赤経)]
const celestial = (raDeg, decDeg) => {
  const ra = raDeg * (Math.PI / 180), dec = decDeg * (Math.PI / 180);
  return [Math.cos(dec) * Math.sin(ra), Math.sin(dec), Math.cos(dec) * Math.cos(ra)];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// 天の川の向き: 銀河の北極 / 銀河の中心 / 銀河面上でそれらに直交する向き
const GAL_NORTH = celestial(192.85948, 27.12825);
const GAL_CENTER = celestial(266.40499, -28.93617);
const GAL_SIDE = cross(GAL_NORTH, GAL_CENTER);
const glslVec3 = (v) => `vec3(${v.map((x) => x.toFixed(6)).join(', ')})`;

const TEXTURES = [
  { key: 'day', url: 'img/earth-day.jpg' },     // 昼の地球（Blue Marble）
  { key: 'night', url: 'img/earth-night.jpg' }, // 夜の街明かり（Black Marble）
  { key: 'water', url: 'img/earth-water.jpg' }, // 海=白 / 陸=黒 のマスク
  { key: 'clouds', url: 'img/earth-clouds.jpg' }, // 雲の濃さ（白いほど厚い雲）
  { key: 'height', url: 'img/earth-height.png' }, // 標高（白いほど高い）
];

const STAR_VERTEX = `
  attribute vec4 a_star;  // xyz: 天球上の向き / w: 明るさ 0..1（等級を直線で写した値。1 がいちばん明るい）
  attribute float a_temp; // 色温度 0 = 橙 .. 1 = 青白
  uniform mat3 u_sky;     // 視線座標 → 天球座標
  uniform vec2 u_proj;    // 焦点距離 / 画面の半分の大きさ（x, y）
  uniform float u_scale;  // 画面サイズに応じた拡大率
  uniform float u_dim;    // 全体の明るさ（光の柱や太陽がまぶしいほど沈める）
  varying vec3 v_color;
  varying float v_alpha;
  varying float v_big;

  vec3 starColor(float t) {
    vec3 warm = vec3(1.0, 0.62, 0.40);
    vec3 mid = vec3(1.0, 0.95, 0.86);
    vec3 cool = vec3(0.66, 0.78, 1.0);
    return t < 0.5 ? mix(warm, mid, t * 2.0) : mix(mid, cool, t * 2.0 - 1.0);
  }

  void main() {
    // 視線座標での向き（x = 画面右 / y = 画面上 / z = 手前）。カメラは -z を向いているので、
    // 見えるのは z が負の星だけ。後ろの星は画面の外へ出す
    vec3 v = a_star.xyz * u_sky;
    if (v.z > -0.1) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 1.0;
      return;
    }
    gl_Position = vec4(v.xy / -v.z * u_proj, 0.0, 1.0);

    // 暗い星は小さく淡い点。明るい星だけ大きく、まわりに淡いにじみを持つ
    float b = a_star.w;
    v_big = b * b * b;
    gl_PointSize = (3.0 + 9.0 * v_big) * u_scale;
    v_alpha = (0.34 + 0.66 * pow(b, 1.1)) * u_dim;
    // 色が分かるのは明るい星だけ。暗い星はほぼ白
    v_color = mix(vec3(1.0), starColor(a_temp), 0.25 + 0.6 * b);
  }
`;

const STAR_FRAGMENT = `
  precision mediump float;
  varying vec3 v_color;
  varying float v_alpha;
  varying float v_big;

  void main() {
    // 丸い光の点: 鋭い芯 + 明るい星だけ淡いにじみ。縁は 0 へなだらかに落とす
    vec2 q = (gl_PointCoord - 0.5) * 2.0;
    float r2 = dot(q, q);
    float core = exp(-r2 * mix(3.2, 14.0, v_big));
    float halo = v_big * 0.22 * exp(-r2 * 2.5);
    gl_FragColor = vec4(v_color, v_alpha * (core + halo) * (1.0 - smoothstep(0.7, 1.0, r2)));
  }
`;

// 画面全体を覆う四角形（空・月・地球・太陽で共通）
const QUAD_VERTEX = `
  attribute vec2 a_pos;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// なめらかな乱数の模様（天の川の濃淡、月の海）
const NOISE_GLSL = `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += amp * noise(p);
      p = p * 2.03 + 11.7;
      amp *= 0.5;
    }
    return sum / 0.9375;
  }
`;

// 天の川: 画面の各ピクセルの視線の向きを天球座標に直し、銀河面からの離れ具合で光の帯を作る
const SKY_FRAGMENT = `
  precision highp float;
  uniform vec2 u_center;   // 画面の中心(px) = 地球の中心
  uniform float u_focal;   // 焦点距離(px)
  uniform mat3 u_sky;      // 視線座標 → 天球座標
  uniform float u_radius;  // 地球の半径(px)。地球に隠れるところは計算しない
  uniform float u_dim;

  const vec3 GAL_NORTH = ${glslVec3(GAL_NORTH)};
  const vec3 GAL_CENTER = ${glslVec3(GAL_CENTER)};
  const vec3 GAL_SIDE = ${glslVec3(GAL_SIDE)};
  ${NOISE_GLSL}

  void main() {
    vec2 p = gl_FragCoord.xy - u_center;
    if (u_dim <= 0.0 || length(p) < u_radius * 0.98) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    vec3 d = u_sky * normalize(vec3(p, -u_focal));

    // 銀河面からの離れ具合（緯度の正弦）と、銀河の中心への近さ（0 = 反対側 .. 1 = 中心の方向）
    float sb = dot(d, GAL_NORTH);
    float cx = dot(d, GAL_CENTER);
    float cy = dot(d, GAL_SIDE);
    float toward = 0.5 + 0.5 * cx / max(length(vec2(cx, cy)), 0.0001);

    // 帯は中心の方向ほど太く明るい。濃淡のむらと、銀河面に沿った暗い筋（星間のちり）を入れる
    float width = mix(0.10, 0.21, toward * toward);
    float band = exp(-sb * sb / (width * width));
    float clouds = fbm(d * 7.0);
    float dust = smoothstep(0.42, 0.72, fbm(d * 8.0 + 3.7)) * exp(-sb * sb / 0.006);
    float bulge = exp(-(sb * sb * 22.0 + (1.0 - cx) * 7.0));
    float glow = band * (0.30 + 0.70 * toward) * (0.50 + 0.7 * clouds) + bulge * 0.7;
    glow *= 1.0 - 0.75 * dust;

    // 色はほぼ白。外側はわずかに青く、銀河の中心の方向だけ少し暖かい
    vec3 col = mix(vec3(0.72, 0.78, 0.95), vec3(1.0, 0.92, 0.80), clamp(bulge * 1.5 + toward * 0.2, 0.0, 1.0));
    col *= glow * 0.16 * u_dim;
    // 淡いグラデーションに縞が出ないよう、1階調ぶんの細かな乱れを足す
    col += (hash(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 255.0;
    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
`;

// 月: 太陽の向きで満ち欠けする球。表面には暗い「海」の模様。影の側は地球の照り返しでごく淡く見える
const MOON_FRAGMENT = `
  precision highp float;
  uniform vec2 u_pos;      // 月の中心(px)
  uniform float u_radius;  // 月の半径(px)
  uniform vec3 u_sun;      // 太陽の向き（視線座標）
  uniform float u_dim;
  ${NOISE_GLSL}

  void main() {
    vec2 p = (gl_FragCoord.xy - u_pos) / u_radius;
    float r = length(p);
    if (r > 1.0) discard;
    vec3 n = vec3(p, sqrt(1.0 - r * r));
    // 月の表面は光をあまり丸く拡散しない（満月は縁まで明るい）ので、明暗の境目だけなだらかにする
    float light = smoothstep(-0.02, 0.22, dot(n, u_sun));
    float seas = smoothstep(0.38, 0.62, fbm(n * 2.2 + 5.3));
    float albedo = mix(0.68, 1.0, seas) * (0.94 + 0.12 * noise(n * 9.0));
    vec3 col = vec3(0.95, 0.93, 0.88) * albedo * (light + 0.035);
    float a = smoothstep(1.0, 1.0 - 1.5 / u_radius, r);
    gl_FragColor = vec4(col * a * u_dim, a);
  }
`;

// 太陽: 小さく強い円盤 + まわりのにじみ。地球より後に、加算で描く。
// 円盤は地球に隠れるところを描かない。にじみはカメラ側で生じる光なので地球の上にもかかるが、
// 太陽が地球に隠れるほど弱くなる（u_vis = 見えている割合）
const SUN_FRAGMENT = `
  precision highp float;
  uniform vec2 u_pos;      // 太陽の中心(px)
  uniform float u_radius;  // 太陽の半径(px)
  uniform float u_vis;     // 0..1 地球に隠れていない割合
  uniform float u_low;     // 0..1 地球の縁に近い（大気を通って赤みを帯びる）
  uniform float u_gain;    // 全体の明るさ
  uniform vec2 u_center;   // 地球の中心(px)
  uniform float u_earth;   // 地球の半径(px)

  void main() {
    float d = distance(gl_FragCoord.xy, u_pos) / u_radius;
    float open = smoothstep(u_earth - 1.0, u_earth + 1.0, distance(gl_FragCoord.xy, u_center));
    float disc = (1.0 - smoothstep(0.85, 1.15, d)) * open;
    vec3 tint = mix(vec3(1.0, 0.96, 0.88), vec3(1.0, 0.62, 0.34), u_low);
    vec3 col = vec3(1.0, 0.98, 0.94) * disc * mix(1.0, 0.8, u_low);
    col += tint * (1.1 * exp(-d * 0.45) + 0.30 * exp(-d * 0.085) + 0.07 * exp(-d * 0.022)) * u_vis;
    gl_FragColor = vec4(col * u_gain, 0.0);
  }
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
  uniform sampler2D u_height;
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
  const vec3 CITY_CORE = vec3(1.0, 0.92, 0.74); // 夜の街明かり: 明るい中心の色
  const vec3 CITY_GLOW = vec3(1.0, 0.62, 0.30); // 夜の街明かり: 周辺とにじみの色
  const float RELIEF = 5.5;                  // 山の陰影の強さ
  const vec2 HEIGHT_STEP = vec2(1.5 / 2048.0, 1.5 / 1024.0); // 標高の傾きを測る間隔（画像の約1.5画素）
  const vec3 SUNSET = vec3(0.85, 0.48, 0.30); // 昼夜の境目の散乱光（夕焼け色）

  void main() {
    vec2 p = (gl_FragCoord.xy - u_center) / u_radius;
    float r = length(p);

    // 光の柱: 根元から先端への線分までの距離で、芯とにじみを作る
    float beam = 0.0;
    for (int i = 0; i < ${MAX_BEAMS}; i++) {
      if (u_beamAlpha[i] > 0.0) {
        vec2 ab = u_beamB[i] - u_beamA[i];
        // 画面上の柱の長さと向き。真上から見ると長さはほぼ 0 になるので、0 で割らないよう下限を置く
        float len = max(length(ab), 0.001);
        vec2 dir = ab / max(length(ab), 0.000001);
        vec2 rel = gl_FragCoord.xy - u_beamA[i];
        // 柱に沿った位置（根元 0 → 先端 1）
        float along = dot(rel, dir) / len;
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
        // 先端は端を見せずに宇宙へ溶けていく。
        // ただし視線が柱を斜めに貫くと、このピクセルには柱のいろいろな高さの部分が重なって見える。
        // 太さの数倍ぶん（柱の長さを 1 とした span）だけ根元寄りの明るさを使う。
        // 横から見ると span は小さく、従来どおり先端が溶ける。真上から見ると画面上の長さが 0 に近づいて
        // span が大きくなり、全体が根元の明るさ = 丸い光になる。その間は連続して変わるので、
        // 近づくときに描き方が切り替わって見えることがない
        float span = 2.5 * w / len;
        float tip = 1.0 - smoothstep(0.25, 0.95, max(along - span, 0.0) / reach);
        // 柱は地表より外にあるので、隠れるのは地球の真裏に回った部分だけ
        // （奥行きが負で、かつ地球の円の内側に重なるところ）。
        // 判定は本来の柱の範囲（根元 0 .. 先端 1）で行う。柱へ入るときは描画上 t を根元より下や
        // 先端より先へ伸ばしているが、その値のまま奥行きを外挿すると、根元より下が「地球の裏」と
        // 誤判定されて、光の半分が消えてしまう
        float tOnBeam = clamp(t, 0.0, 1.0);
        float zb = mix(u_beamZ[i].x, u_beamZ[i].y, tOnBeam);
        float rb = length(u_beamA[i] + ab * tOnBeam - u_center) / u_radius;
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

      // 地表上の東・北の向きと、太陽へ向かう向き（雲の影と山の陰影で使う）
      vec3 east = normalize(vec3(e.z, 0.0, -e.x) + vec3(0.00001, 0.0, 0.0));
      vec3 north = cross(e, east);
      vec3 toSun = u_sun - e * sunDot;
      vec2 sunOnGround = vec2(dot(toSun, east), dot(toSun, north));

      // 山の陰影: 標高が東・北へどれだけ上がっているか（傾き）を測る。
      // 太陽の側へ上っていく斜面は太陽に背を向けているので暗く、下っていく斜面は明るい。
      // 太陽が低いほど sunOnGround が長くなり、陰影が強く出る
      float h0 = texture2D(u_height, uv).r;
      vec2 slope = vec2(
        texture2D(u_height, uv + vec2(HEIGHT_STEP.x, 0.0)).r - h0,
        texture2D(u_height, uv - vec2(0.0, HEIGHT_STEP.y)).r - h0
      );
      lit *= clamp(1.0 - RELIEF * dot(slope, sunOnGround), 0.45, 1.6);

      // 海: 斜めから見るほど空を映して明るくなる（フレネル）
      lit += water * pow(1.0 - mu, 4.0) * vec3(0.20, 0.34, 0.55) * sun * 0.55;
      // 海面の太陽の反射: 鋭い芯 + まわりの広いにじみ
      float ndh = max(dot(e, normalize(u_sun + view)), 0.0);
      float glint = pow(ndh, 140.0) * 0.5 + pow(ndh, 24.0) * 0.14;
      lit += sunColor * glint * water * sun;

      // --- 夜の地表 ---
      // 画像は「暗い青の地表 + 街明かり」。地表と海は赤がほぼ 0 で、明かりだけ赤が高い（明かり自体は
      // 灰色に近い）。そこで赤の値を明かりの強さとして取り出し、色はこちらで暖色に付ける。
      //   芯: 画像そのままの鋭い明かり。明るい都市の中心ほど白っぽく、周辺は橙
      //   にじみ: 同じ画像をぼかして重ねる（粗いミップマップを引く）。都市のまわりに光がにじみ、
      //           大都市圏は面で光って見える
      float lights = clamp((night.r - 0.07) * 3.4, 0.0, 1.0);
      float glowNear = clamp((texture2D(u_night, uv, 2.0).r - 0.05) * 3.4, 0.0, 1.0);
      float glowWide = clamp((texture2D(u_night, uv, 4.0).r - 0.04) * 3.4, 0.0, 1.0);
      vec3 cityCore = mix(CITY_GLOW, CITY_CORE, lights) * lights * 1.7;
      vec3 cityGlow = CITY_GLOW * (glowNear * 0.6 + glowWide * 0.5);
      vec3 dark = night * 0.4 + cityCore + cityGlow;
      // --- 雲 ---
      // 雲は地表の上を少しずつ東へ流れる
      vec2 cloudUv = vec2(uv.x + u_cloudShift, uv.y);
      // 元の画像は薄い雲がとても暗い値で入っている。暗い側を持ち上げて、薄い雲の筋まで見せる
      float cloud = clamp(pow(texture2D(u_clouds, cloudUv).r, CLOUD_GAMMA) * 1.1, 0.0, 1.0);
      // 雲の影: 太陽の側へ少しずらした位置にある雲が、地表を暗くする。
      // 太陽へ向かう地表上の向きを、画像座標のずれに直す
      vec2 shadowOffset = vec2(sunOnGround.x / 6.2831853, -sunOnGround.y / 3.14159265) * 0.012;
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
//   sky: { focal(空の透視投影の焦点距離 px), siderealAngle(恒星時 rad) }, starDim,
//   moon: [x, y, z](地球の中心から見た月の向き。地球座標),
//   planets: [{ dir: [x, y, z](天球座標), mag(等級), temp(色温度 0..1) }],
//   earth: { cx, cy(左下原点), radius, lat, lon(rad) }, sun: [x, y, z], haze,
//   beams: [{ ax, ay, bx, by(px、左下原点), width(px), z0, z1(地球半径単位の奥行き), alpha }],
//   beamColor: [r, g, b], beamCover(0..1), fill(0..1),
// }
export function createOrbitRenderer(canvas) {
  // 星ごとの乱数（コンテキスト復元時も同じ星空を使う）
  // 1つの星 = 天球上の向き(x, y, z) / 明るさ / 色温度
  const STAR_FLOATS = 5;
  const starData = new Float32Array(STAR_COUNT * STAR_FLOATS);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  // 等級の範囲（小さいほど明るい）。肉眼で見える限界より少し暗い星まで
  const MAG_BRIGHT = -1.2, MAG_FAINT = 7.0;
  // 暗い星ほど数が多い: 1等級暗くなるごとに約2.4倍に増える（実際の空に近い増え方）
  const MAG_GROWTH = 0.38;
  const nBright = Math.pow(10, MAG_GROWTH * MAG_BRIGHT), nFaint = Math.pow(10, MAG_GROWTH * MAG_FAINT);
  for (let i = 0; i < STAR_COUNT; i++) {
    const o = i * STAR_FLOATS;
    let dir;
    if (Math.random() < 0.4) {
      // 天の川の星: 銀河面の近くに集まる。半分は銀河の中心の方向に寄せる
      const l = Math.random() < 0.5 ? gauss() * 0.9 : Math.random() * Math.PI * 2;
      const b = gauss() * 0.16;
      const cb = Math.cos(b), sb = Math.sin(b), cosL = Math.cos(l), sinL = Math.sin(l);
      dir = [0, 1, 2].map((k) => cb * (cosL * GAL_CENTER[k] + sinL * GAL_SIDE[k]) + sb * GAL_NORTH[k]);
    } else {
      // それ以外は空全体に一様
      const y = Math.random() * 2 - 1, phi = Math.random() * Math.PI * 2, s = Math.sqrt(1 - y * y);
      dir = [s * Math.sin(phi), y, s * Math.cos(phi)];
    }
    starData[o] = dir[0];
    starData[o + 1] = dir[1];
    starData[o + 2] = dir[2];
    const mag = Math.log10(nBright + Math.random() * (nFaint - nBright)) / MAG_GROWTH;
    starData[o + 3] = (MAG_FAINT - mag) / (MAG_FAINT - MAG_BRIGHT);
    // 色温度: 白(0.5)付近を多く、橙・青白は少なめに
    const r = Math.random() * 2 - 1;
    starData[o + 4] = 0.5 + 0.5 * Math.sign(r) * Math.pow(Math.abs(r), 1.5);
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

  let gl, star, sky, moon, sun, earth, starBuf, planetBuf, quadBuf, anisoExt, maxAniso;
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

    const s = buildProgram(STAR_VERTEX, STAR_FRAGMENT, ['a_star', 'a_temp']);
    star = {
      prog: s.prog,
      uSky: s.u('u_sky'), uProj: s.u('u_proj'), uScale: s.u('u_scale'), uDim: s.u('u_dim'),
    };
    const k = buildProgram(QUAD_VERTEX, SKY_FRAGMENT, ['a_pos']);
    sky = {
      prog: k.prog,
      uCenter: k.u('u_center'), uFocal: k.u('u_focal'), uSky: k.u('u_sky'), uRadius: k.u('u_radius'),
      uDim: k.u('u_dim'),
    };
    const m = buildProgram(QUAD_VERTEX, MOON_FRAGMENT, ['a_pos']);
    moon = { prog: m.prog, uPos: m.u('u_pos'), uRadius: m.u('u_radius'), uSun: m.u('u_sun'), uDim: m.u('u_dim') };
    const n = buildProgram(QUAD_VERTEX, SUN_FRAGMENT, ['a_pos']);
    sun = {
      prog: n.prog,
      uPos: n.u('u_pos'), uRadius: n.u('u_radius'), uVis: n.u('u_vis'), uLow: n.u('u_low'), uGain: n.u('u_gain'),
      uCenter: n.u('u_center'), uEarth: n.u('u_earth'),
    };

    const derivatives = !!gl.getExtension('OES_standard_derivatives');
    const e = buildProgram(QUAD_VERTEX, (derivatives ? '#define DERIVATIVES\n' : '') + EARTH_FRAGMENT, ['a_pos']);
    earth = {
      prog: e.prog,
      uCenter: e.u('u_center'), uRadius: e.u('u_radius'), uRot: e.u('u_rot'), uSun: e.u('u_sun'),
      uHaze: e.u('u_haze'),
      uDay: e.u('u_day'), uNight: e.u('u_night'), uWater: e.u('u_water'),
      uClouds: e.u('u_clouds'), uCloudShift: e.u('u_cloudShift'), uHeight: e.u('u_height'),
      uBeamA: e.u('u_beamA'), uBeamB: e.u('u_beamB'), uBeamW: e.u('u_beamW'), uBeamZ: e.u('u_beamZ'),
      uBeamAlpha: e.u('u_beamAlpha'), uBeamColor: e.u('u_beamColor'),
      uBeamCover: e.u('u_beamCover'), uFill: e.u('u_fill'),
    };

    starBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
    gl.bufferData(gl.ARRAY_BUFFER, starData, gl.STATIC_DRAW);
    planetBuf = gl.createBuffer();
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
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const k = Math.min(dpr, MAX_PIXELS / Math.max(rect.width, rect.height, 1));
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
  const skyRot = new Float32Array(9);
  // 惑星は星と同じ形式（向き / 明るさ / 色温度）で、毎フレーム詰め直す
  const MAX_PLANETS = 8;
  const planetData = new Float32Array(MAX_PLANETS * STAR_FLOATS);

  // カメラが (lat, lon) の真上にいるときの、視線座標 → 球の座標の回転。
  // 列は「画面右 = 東 / 画面上 = 北 / 手前 = カメラのいる向き」
  function viewMatrix(out, lat, lon) {
    const cl = Math.cos(lat), sl = Math.sin(lat), co = Math.cos(lon), so = Math.sin(lon);
    out[0] = co;       out[1] = 0;  out[2] = -so;
    out[3] = -sl * so; out[4] = cl; out[5] = -sl * co;
    out[6] = cl * so;  out[7] = sl; out[8] = cl * co;
  }
  // 球の座標の向き → 視線座標（x = 画面右 / y = 画面上 / z = 手前）
  const toView = (m, d) => [
    d[0] * m[0] + d[1] * m[1] + d[2] * m[2],
    d[0] * m[3] + d[1] * m[4] + d[2] * m[5],
    d[0] * m[6] + d[1] * m[7] + d[2] * m[8],
  ];

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

      const ea = scene.earth;
      const cx = ea.cx, cy = ea.cy;
      const focal = scene.sky.focal;
      // 視線座標 → 地球座標。天球は地球に対して恒星時のぶんだけ回っている（赤経 = 経度 + 恒星時）ので、
      // 視線座標 → 天球座標は、経度に恒星時を足した同じ形の回転になる
      viewMatrix(rot, ea.lat, ea.lon);
      viewMatrix(skyRot, ea.lat, ea.lon + scene.sky.siderealAngle);

      // 太陽の画面上の位置と、地球に隠れていない割合。太陽は無限に遠いので、向きだけで決まる
      const sunView = toView(rot, scene.sun);
      const sunRadius = focal * Math.tan(BODY_RADIUS * SUN_SCALE);
      let sunSpot = null;
      if (sunView[2] < -0.05) {
        const x = cx + (sunView[0] / -sunView[2]) * focal, y = cy + (sunView[1] / -sunView[2]) * focal;
        const fromEarth = Math.hypot(x - cx, y - cy);
        const vis = Math.min(1, Math.max(0, (fromEarth - (ea.radius - sunRadius)) / (2 * sunRadius)));
        // 画面の外へ遠ざかるほど、まぶしさは届かなくなる
        const off = Math.max(Math.abs(x - cx) / (w / 2), Math.abs(y - cy) / (h / 2));
        const inFrame = Math.min(1, Math.max(0, (2.2 - off) / 1.2));
        // 地球の縁のすぐ外にあるときは、大気を通った赤みがかった光になる
        const low = Math.min(1, Math.max(0, 1 - (fromEarth - ea.radius) / (ea.radius * 0.06 + sunRadius * 2)));
        if (vis * inFrame > 0.001) sunSpot = { x, y, vis, glare: vis * inFrame, low };
      }
      // 太陽が視界にあるあいだは、まぶしさで星や天の川が見えにくくなる
      const skyDim = scene.starDim * (1 - 0.55 * (sunSpot ? sunSpot.glare : 0));

      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      // 天の川（不透明に下地として描く）
      gl.useProgram(sky.prog);
      gl.blendFunc(gl.ONE, gl.ZERO);
      gl.uniform2f(sky.uCenter, cx, cy);
      gl.uniform1f(sky.uFocal, focal);
      gl.uniformMatrix3fv(sky.uSky, false, skyRot);
      gl.uniform1f(sky.uRadius, ea.radius);
      gl.uniform1f(sky.uDim, skyDim);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 星（加算合成）
      gl.useProgram(star.prog);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, STAR_FLOATS * 4, 0);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, STAR_FLOATS * 4, 16);
      gl.uniformMatrix3fv(star.uSky, false, skyRot);
      gl.uniform2f(star.uProj, focal / (w / 2), focal / (h / 2));
      // 星は小さな点のまま。画面が大きいときだけ、短辺900pxを基準に少し大きくする
      gl.uniform1f(star.uScale, Math.max(1, Math.min(w, h) / 900));
      gl.uniform1f(star.uDim, skyDim);
      gl.drawArrays(gl.POINTS, 0, STAR_COUNT);

      // 惑星: 星と同じ描き方の光の点。いちばん明るい星より明るいものは、そのぶん大きくにじむ
      const planetCount = Math.min(scene.planets.length, MAX_PLANETS);
      if (planetCount > 0) {
        scene.planets.slice(0, planetCount).forEach((p, i) => {
          const o = i * STAR_FLOATS;
          planetData[o] = p.dir[0];
          planetData[o + 1] = p.dir[1];
          planetData[o + 2] = p.dir[2];
          planetData[o + 3] = Math.min(1.3, Math.max(0, (MAG_FAINT - p.mag) / (MAG_FAINT - MAG_BRIGHT)));
          planetData[o + 4] = p.temp;
        });
        gl.bindBuffer(gl.ARRAY_BUFFER, planetBuf);
        gl.bufferData(gl.ARRAY_BUFFER, planetData, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, STAR_FLOATS * 4, 0);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, STAR_FLOATS * 4, 16);
        gl.drawArrays(gl.POINTS, 0, planetCount);
      }
      gl.disableVertexAttribArray(1);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      // 月（後ろの星を隠して重ねる）。月は近いので、カメラの位置のぶんだけ見える向きがずれる。
      // カメラは地球の中心から「地球がいまの大きさに見える距離」だけ手前（視線座標の +z）にいる
      const camDistance = Math.hypot(ea.radius, focal) / ea.radius;
      const moonView = toView(rot, scene.moon).map((x) => x * MOON_DISTANCE);
      moonView[2] -= camDistance;
      if (moonView[2] < -1 && scene.starDim > 0.01) {
        const mx = cx + (moonView[0] / -moonView[2]) * focal, my = cy + (moonView[1] / -moonView[2]) * focal;
        const mr = focal * Math.tan(BODY_RADIUS * MOON_SCALE);
        if (mx > -mr && mx < w + mr && my > -mr && my < h + mr) {
          gl.useProgram(moon.prog);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          gl.uniform2f(moon.uPos, mx, my);
          gl.uniform1f(moon.uRadius, mr);
          gl.uniform3f(moon.uSun, sunView[0], sunView[1], sunView[2]);
          gl.uniform1f(moon.uDim, scene.starDim);
          // 月のまわりだけ描く
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(Math.floor(mx - mr - 2), Math.floor(my - mr - 2), Math.ceil(mr * 2 + 4), Math.ceil(mr * 2 + 4));
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.disable(gl.SCISSOR_TEST);
        }
      }

      // 地球（昼の画像が仮のものでも使えるようになり次第、すぐ描く）
      if (!images[0].source) return;

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
      gl.uniform1i(earth.uHeight, 4);
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

      // 太陽（地球の上から加算で重ねる。光の柱の中に入りきったら描かない）
      const sunGain = (1 - scene.fill) * (0.25 + 0.75 * scene.starDim);
      if (sunSpot && sunGain > 0.001) {
        gl.useProgram(sun.prog);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.uniform2f(sun.uPos, sunSpot.x, sunSpot.y);
        gl.uniform1f(sun.uRadius, sunRadius);
        gl.uniform1f(sun.uVis, sunSpot.vis);
        gl.uniform1f(sun.uLow, sunSpot.low);
        gl.uniform1f(sun.uGain, sunGain);
        gl.uniform2f(sun.uCenter, cx, cy);
        gl.uniform1f(sun.uEarth, ea.radius);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    },

    clear() {
      if (lost) return;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
  };
}
