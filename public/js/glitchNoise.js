// WebGLで毎フレーム高速にフラクタルノイズを生成し、SVG filterのfeImageに供給する。
// SVGのfeTurbulenceがモバイルで重いので、その代替。
// X方向はほぼ一定、Y方向に多数のサイクル → 横バンド優先（per-line水平変位用）。

// 128x128 に縮小（toBlobエンコードコストを大幅削減）
const NOISE_W = 128;
const NOISE_H = 128;

const noiseCanvas = document.createElement('canvas');
noiseCanvas.width = NOISE_W;
noiseCanvas.height = NOISE_H;
noiseCanvas.style.position = 'absolute';
noiseCanvas.style.width = '0';
noiseCanvas.style.height = '0';
noiseCanvas.style.pointerEvents = 'none';
noiseCanvas.style.opacity = '0';
document.body.appendChild(noiseCanvas);

const vsSource = `
  attribute vec2 a_pos;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const fsSource = `
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_seedBig;
  uniform float u_seedFine;
  uniform float u_freqBigY;   // 大きい帯のY方向サイクル数（10-50くらい）
  uniform float u_freqFineY;  // 細い帯のY方向サイクル数（100-300くらい）

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution; // 0-1
    // X方向は seed オフセット + 微小変化のみ → ほぼ横バンド
    // Y方向は freq * uv.y で多数のサイクル → 横帯がたくさんできる
    float big = noise(vec2(u_seedBig + uv.x * 0.4, uv.y * u_freqBigY));
    float fine = noise(vec2(u_seedFine + uv.x * 0.4, uv.y * u_freqFineY));
    // 元の feComposite arithmetic k2=0.75 k3=0.35 相当
    float combined = clamp(big * 0.75 + fine * 0.35, 0.0, 1.0);
    gl_FragColor = vec4(combined, 0.0, 0.0, 1.0);
  }
`;

let gl, uRes, uSeedBig, uSeedFine, uFreqBigY, uFreqFineY;
let initialized = false;

function initGL() {
  gl = noiseCanvas.getContext('webgl') || noiseCanvas.getContext('experimental-webgl');
  if (!gl) return false;

  const compile = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  uRes = gl.getUniformLocation(prog, 'u_resolution');
  uSeedBig = gl.getUniformLocation(prog, 'u_seedBig');
  uSeedFine = gl.getUniformLocation(prog, 'u_seedFine');
  uFreqBigY = gl.getUniformLocation(prog, 'u_freqBigY');
  uFreqFineY = gl.getUniformLocation(prog, 'u_freqFineY');

  gl.viewport(0, 0, NOISE_W, NOISE_H);
  gl.uniform2f(uRes, NOISE_W, NOISE_H);
  initialized = true;
  return true;
}

initGL();

/**
 * ノイズを更新してcanvasに描画する。
 * @param {number} seedBig
 * @param {number} seedFine
 * @param {number} freqBigY  - 大きい帯のY方向サイクル数（推奨 10-50）
 * @param {number} freqFineY - 細い帯のY方向サイクル数（推奨 100-300）
 */
export function renderGlitchNoise(seedBig, seedFine, freqBigY, freqFineY) {
  if (!initialized) return;
  gl.uniform1f(uSeedBig, seedBig);
  gl.uniform1f(uSeedFine, seedFine);
  gl.uniform1f(uFreqBigY, freqBigY);
  gl.uniform1f(uFreqFineY, freqFineY);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export const glitchNoiseCanvas = noiseCanvas;
