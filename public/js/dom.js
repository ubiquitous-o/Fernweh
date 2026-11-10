// DOM参照を1か所にキャッシュ。可変要素（globeCanvas）はオブジェクト経由で更新可能に。
export const $videoFrame = document.getElementById('video-frame');
export const $layerA = document.getElementById('layer-a');
export const $layerB = document.getElementById('layer-b');
export function getLayer(id) { return id === 'a' ? $layerA : $layerB; }
export const $orbitOverlay = document.getElementById('orbit-overlay');
export const $orbitCanvas = document.getElementById('orbit-canvas');

export const $info = document.getElementById('info');
export const $infoTitle = document.getElementById('info-title');
export const $infoChannel = document.getElementById('info-channel');

export const $clock = document.getElementById('clock');
export const $clockTime = document.getElementById('clock-time');
export const $clockDate = document.getElementById('clock-date');

export const $liveBadge = document.getElementById('live-badge');
export const $controls = document.querySelector('.controls');
export const $progress = document.getElementById('progress');
export const $loading = document.getElementById('loading');

export const $error = document.getElementById('error');
export const $errorMsg = document.getElementById('error-msg');

export const $globe = document.getElementById('globe-container');
export const globeRef = { canvas: document.getElementById('globe-canvas') };
export const $globeLabel = document.getElementById('globe-label');
export const $globeTag = document.getElementById('globe-tag');
export const $globeUnknown = document.getElementById('globe-unknown');
export const $globeLeaderLine = document.getElementById('globe-leader-line');
export const $globeLeaderDot = document.getElementById('globe-leader-dot');

export const $cameraTime = document.getElementById('camera-time');
export const $cameraTimeClock = document.getElementById('camera-time-clock');
export const $cameraTimeDiff = document.getElementById('camera-time-diff');

export const $weather = document.getElementById('weather');
export const $weatherLocation = document.getElementById('weather-location');

export const $btnSkip = document.getElementById('btn-skip');
export const $btnSettings = document.getElementById('btn-settings');
export const $settingsPanel = document.getElementById('settings-panel');
export const $btnFullscreen = document.getElementById('btn-fullscreen');
export const $btnInfo = document.getElementById('btn-info');
