// WebGLシェーダーでテレビ砂嵐を描画（GPU処理、CPU負荷ほぼゼロ）。
import { $noiseOverlay, $noiseCanvas } from './dom.js';

const VERTEX_SOURCE = `
  attribute vec2 a_pos;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAGMENT_SOURCE = `
  precision highp float;
  uniform float u_time;
  uniform vec2 u_resolution;

  // Dave Hoskins hash — 全GPU安定、パターンなし
  float hash(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 block = floor(gl_FragCoord.xy / vec2(3.0, 2.0));
    float t = floor(u_time * 24.0);
    float n = hash(vec3(block, t));
    float scanline = 1.0 - 0.15 * step(0.5, fract(gl_FragCoord.y / 4.0));
    float flicker = 0.92 + 0.08 * hash(vec3(t, 0.0, 0.0));
    gl_FragColor = vec4(vec3(n * scanline * flicker), 1.0);
  }
`;

function createNoiseRenderer() {
  const canvas = $noiseCanvas;
  let gl, uTime, uRes, animId = null, wasRunning = false;

  function initGL() {
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return false;

    const compile = (type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      return s;
    };

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX_SOURCE));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAGMENT_SOURCE));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    uTime = gl.getUniformLocation(prog, 'u_time');
    uRes = gl.getUniformLocation(prog, 'u_resolution');
    return true;
  }

  if (!initGL()) return null;

  // WebGLコンテキスト喪失時に自動復元
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    wasRunning = !!animId;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  });
  canvas.addEventListener('webglcontextrestored', () => {
    initGL();
    if (wasRunning) { resize(); render(); }
  });

  function resize() {
    // 親(.noise-overlay)が16:9にクリップされてるので、その実サイズに合わせる
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width));
    canvas.height = Math.max(1, Math.round(rect.height));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', () => { if (animId) resize(); });

  function render() {
    gl.uniform1f(uTime, performance.now() * 0.001);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    animId = requestAnimationFrame(render);
  }

  function clear() {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  return {
    start() { if (!animId) { resize(); render(); } },
    stop() {
      if (animId) { cancelAnimationFrame(animId); animId = null; }
      // 最後のフレームが古いブラウザのcompositor layerに残ると黒帯側に静止画として
      // 浮き出てしまう → 明示的にキャンバスを透明クリアする
      clear();
    },
  };
}

const noiseGL = createNoiseRenderer();

export function startNoise() {
  if (noiseGL) noiseGL.start();
  $noiseOverlay.classList.add('active');
}

export function stopNoise() {
  $noiseOverlay.classList.remove('active');
  if (noiseGL) noiseGL.stop();
}
