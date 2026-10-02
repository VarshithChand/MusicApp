/**
 * Audio feature extraction in plain TypeScript (no native libraries beyond ffmpeg for decoding).
 * Works on mono Float32 samples, so it can be tested with synthetic signals.
 */

export interface AudioFeatures {
  /** Seconds of audio that were analysed (not necessarily the whole song). */
  analysedSeconds: number;
  /** Average loudness in dBFS (about -40 very quiet … -8 very loud). */
  rmsDb: number;
  /** Peak minus average loudness, in dB: small = heavily compressed/"flat", large = dynamic. */
  crestDb: number;
  /** Spectral centroid in Hz — higher means brighter, more treble. */
  centroidHz: number;
  /** Centroid as a fraction of the Nyquist frequency (0..1). */
  brightness: number;
  /** Share of the energy below ~250 Hz (bass weight, 0..1). */
  bassRatio: number;
  /** Detected note/drum onsets per second. */
  onsetDensity: number;
  /** Estimated tempo in beats per minute (60–200), or 0 if no steady pulse was found. */
  tempoBpm: number;
  /** How steady the pulse is, 0..1 (a drum machine ≈ high, a free-time ballad ≈ low). */
  beatStrength: number;
}

const FRAME = 1024;
const HOP = 512;

/** In-place radix-2 FFT. `re` and `im` must have a power-of-two length. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

const hann = (() => {
  const w = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  return w;
})();

export function extractFeatures(samples: Float32Array, sampleRate: number): AudioFeatures {
  const frames = Math.floor((samples.length - FRAME) / HOP) + 1;
  const hopSeconds = HOP / sampleRate;
  const empty: AudioFeatures = {
    analysedSeconds: samples.length / sampleRate,
    rmsDb: -90,
    crestDb: 0,
    centroidHz: 0,
    brightness: 0,
    bassRatio: 0,
    onsetDensity: 0,
    tempoBpm: 0,
    beatStrength: 0,
  };
  if (frames < 8) return empty;

  // Overall loudness
  let sumSquares = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    sumSquares += v * v;
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  const rmsDb = rms > 1e-9 ? 20 * Math.log10(rms) : -90;
  const peakDb = peak > 1e-9 ? 20 * Math.log10(peak) : -90;

  // Spectrum per frame: spectral flux (for onsets), centroid and bass share
  const re = new Float32Array(FRAME);
  const im = new Float32Array(FRAME);
  const bins = FRAME / 2;
  const binHz = sampleRate / FRAME;
  const bassBins = Math.floor(250 / binHz);
  let previous = new Float32Array(bins);
  let current = new Float32Array(bins);
  const flux = new Float32Array(frames);
  let centroidSum = 0;
  let centroidWeight = 0;
  let bassEnergy = 0;
  let totalEnergy = 0;

  for (let f = 0; f < frames; f++) {
    const start = f * HOP;
    for (let i = 0; i < FRAME; i++) {
      re[i] = samples[start + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    let frameEnergy = 0;
    let weighted = 0;
    let fluxSum = 0;
    for (let k = 0; k < bins; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      current[k] = mag;
      frameEnergy += mag * mag;
      weighted += mag * k * binHz;
      if (k < bassBins) bassEnergy += mag * mag;
      const diff = mag - previous[k];
      if (diff > 0) fluxSum += diff;
    }
    totalEnergy += frameEnergy;
    const magSum = current.reduce((a, b) => a + b, 0);
    if (magSum > 1e-6) {
      centroidSum += weighted;
      centroidWeight += magSum;
    }
    flux[f] = f === 0 ? 0 : fluxSum;
    [previous, current] = [current, previous];
  }

  const centroidHz = centroidWeight > 0 ? centroidSum / centroidWeight : 0;

  // Onsets: peaks of the flux curve that stand clearly above its local average
  const meanFlux = flux.reduce((a, b) => a + b, 0) / frames;
  const stdFlux = Math.sqrt(flux.reduce((a, b) => a + (b - meanFlux) ** 2, 0) / frames);
  const threshold = meanFlux + 0.8 * stdFlux;
  let onsets = 0;
  for (let f = 2; f < frames - 2; f++) {
    if (flux[f] > threshold && flux[f] >= flux[f - 1] && flux[f] > flux[f + 1] && flux[f] >= flux[f - 2] && flux[f] > flux[f + 2]) onsets++;
  }
  const seconds = samples.length / sampleRate;

  // Tempo: autocorrelation of the (mean-removed) onset curve over lags that correspond to 60–200 BPM
  let tempoBpm = 0;
  let beatStrength = 0;
  const centred = new Float32Array(frames);
  for (let f = 0; f < frames; f++) centred[f] = flux[f] - meanFlux;
  const r0 = centred.reduce((a, b) => a + b * b, 0);
  if (r0 > 1e-9) {
    const minLag = Math.max(2, Math.floor(60 / 200 / hopSeconds));
    const maxLag = Math.min(frames - 2, Math.ceil(60 / 60 / hopSeconds));
    const corr = new Float32Array(maxLag + 2);
    let bestLag = 0;
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      for (let f = 0; f + lag < frames; f++) sum += centred[f] * centred[f + lag];
      corr[lag] = sum / r0;
      if (corr[lag] > best) {
        best = corr[lag];
        bestLag = lag;
      }
    }
    // A pulse only counts when the onsets are distinct (drum hits, plucks). A sustained tone has a nearly flat onset
    // curve, so tiny ripples must not be mistaken for a steady beat: scale by how "spiky" the curve is.
    const spikiness = meanFlux > 1e-9 ? Math.max(0, Math.min(1, stdFlux / meanFlux / 1.2)) : 0;
    best *= spikiness;
    if (bestLag > 0 && best > 0.1) {
      // If a half-length lag (double tempo) is nearly as strong, prefer the lag that gives a natural 70–170 BPM pulse.
      let lag = bestLag;
      const bpmOf = (l: number) => 60 / (l * hopSeconds);
      const half = Math.round(bestLag / 2);
      if (bpmOf(lag) < 70 && half >= minLag && corr[half] > 0.8 * best) lag = half;
      tempoBpm = Math.round(bpmOf(lag) * 10) / 10;
      beatStrength = Math.max(0, Math.min(1, best));
    }
  }

  return {
    analysedSeconds: seconds,
    rmsDb: Math.round(rmsDb * 10) / 10,
    crestDb: Math.round((peakDb - rmsDb) * 10) / 10,
    centroidHz: Math.round(centroidHz),
    brightness: Math.round(Math.min(1, centroidHz / (sampleRate / 2)) * 1000) / 1000,
    bassRatio: totalEnergy > 0 ? Math.round((bassEnergy / totalEnergy) * 1000) / 1000 : 0,
    onsetDensity: Math.round((onsets / seconds) * 100) / 100,
    tempoBpm,
    beatStrength: Math.round(beatStrength * 1000) / 1000,
  };
}
