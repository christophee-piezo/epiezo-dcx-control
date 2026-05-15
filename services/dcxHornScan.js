const HORN_SCAN_POLL_INTERVAL_MS = 500;
const HORN_SCAN_MAX_POLLS = 600;
const HORN_SCAN_INITIAL_POLL_DELAY_MS = 500;
const HORN_SCAN_DATASET_COMMANDS = [
  { cmd: 42, field: 'frequency' },
  { cmd: 38, field: 'current' },
  { cmd: 37, field: 'phase' },
  { cmd: 39, field: 'amplitude' }
];
const HORN_SCAN_PRESET_COMMAND = 43;
const HORN_SCAN_RESONANCE_COMMAND = 44;

function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripResponseText(raw) {
  return String(raw ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNumericValues(raw) {
  return (stripResponseText(raw).match(/-?\d+(?:\.\d+)?/g) || [])
    .map(Number)
    .filter((value) => Number.isFinite(value));
}

function extractLabeledNumericValue(text, labels = []) {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*[,=:]?\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'));
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }

  return null;
}

function parseHornScanPreset(raw) {
  const text = stripResponseText(raw);
  const presetIndexMatch = text.match(/\bPresetData\s*,\s*(-?\d+)/i);
  const presetIndex = presetIndexMatch ? Number(presetIndexMatch[1]) : null;

  return {
    frequencyStart: extractLabeledNumericValue(text, ['Frequency Start \\(Hz\\)']),
    frequencyStop: extractLabeledNumericValue(text, ['Frequency Stop \\(Hz\\)']),
    frequencyStep: extractLabeledNumericValue(text, ['Frequency Step \\(Hz\\)']),
    stepDelayMs: extractLabeledNumericValue(text, ['Step\\s*-\\s*Delay \\(ms\\)']),
    amplitudePercent: extractLabeledNumericValue(text, ['Amplitude\\s*\\(%\\)']),
    currentPercent: extractLabeledNumericValue(text, ['Current\\s*\\(%\\)']),
    seriesResonantPoint1: extractLabeledNumericValue(text, ['Series Resonant Point 1 \\(Hz\\)']),
    parallelResonantPoint1: extractLabeledNumericValue(text, ['Parallel Resonant Point 1 \\(Hz\\)']),
    presetIndex: Number.isFinite(presetIndex) ? presetIndex : null,
    raw: text
  };
}

function parseHornScanResonance(raw) {
  const text = stripResponseText(raw);
  const series = [];
  const parallel = [];

  Array.from(text.matchAll(/\b([SP])\s*[:=]\s*(-?\d+(?:\.\d+)?)/gi)).forEach(([, type, value]) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    if (String(type).toUpperCase() === 'S') {
      series.push(numericValue);
    } else {
      parallel.push(numericValue);
    }
  });

  const firstNonZeroSeries = series.find((value) => value > 0);
  const firstNonZeroParallel = parallel.find((value) => value > 0);

  return {
    series,
    parallel,
    seriesResonantPoint1: firstNonZeroSeries ?? series[0] ?? null,
    parallelResonantPoint1: firstNonZeroParallel ?? parallel[0] ?? null,
    raw: text
  };
}

function parseHornScanTabStatus(raw) {
  const text = stripResponseText(raw);
  const sections = text.split('@').map((section) => section.trim()).filter(Boolean);
  const psFreqTypeMatch = text.match(/\bPSFreqType\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
  const pollState = parseHornScanPollState(raw);
  const values = Array.isArray(pollState?.values) ? pollState.values : [];
  const seriesResonantPoint1 = Number.isFinite(values[1]) ? values[1] : null;
  const parallelResonantPoint1 = Number.isFinite(values[3]) ? values[3] : null;
  const psFrequencyType = psFreqTypeMatch
    ? {
        start: Number(psFreqTypeMatch[1]),
        stop: Number(psFreqTypeMatch[2])
      }
    : null;

  return {
    ready: sections.includes('READY'),
    psFrequencyType,
    frequencyStart: Number.isFinite(Number(psFrequencyType?.start)) ? Number(psFrequencyType.start) : null,
    frequencyStop: Number.isFinite(Number(psFrequencyType?.stop)) ? Number(psFrequencyType.stop) : null,
    state: pollState,
    seriesResonantPoint1,
    parallelResonantPoint1,
    raw: text
  };
}

function looksLikeHornScanIndexSeries(values = []) {
  if (!Array.isArray(values) || values.length < 4) {
    return false;
  }

  if (!values.every((value) => Number.isFinite(value) && Math.abs(value) < 10000)) {
    return false;
  }

  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  if (!Number.isFinite(firstValue) || !Number.isFinite(lastValue) || Math.abs(firstValue) > 20) {
    return false;
  }

  const deltas = values.slice(1).map((value, index) => value - values[index]);
  const sequentialDeltaCount = deltas.filter((delta) => delta >= 0.5 && delta <= 1.5).length;

  return sequentialDeltaCount >= Math.floor(deltas.length * 0.75)
    && lastValue - firstValue >= values.length * 0.6;
}

function getHornScanExpectedPointCount(preset = {}) {
  const frequencyStart = Number(preset?.frequencyStart);
  const frequencyStop = Number(preset?.frequencyStop);
  const frequencyStep = Number(preset?.frequencyStep);

  if (!Number.isFinite(frequencyStart)
    || !Number.isFinite(frequencyStop)
    || !Number.isFinite(frequencyStep)
    || frequencyStep <= 0
    || frequencyStop < frequencyStart) {
    return null;
  }

  return Math.floor((frequencyStop - frequencyStart) / frequencyStep) + 1;
}

function buildFrequencySeriesFromPreset(preset = {}, pointCount = 0) {
  const frequencyStart = Number(preset?.frequencyStart);
  const frequencyStep = Number(preset?.frequencyStep);

  if (!Number.isFinite(frequencyStart) || !Number.isFinite(frequencyStep) || frequencyStep <= 0 || pointCount <= 0) {
    return [];
  }

  return Array.from({ length: pointCount }, (_, index) => frequencyStart + (index * frequencyStep));
}

function scoreHornScanSeriesCandidate(field, values = [], preset = {}) {
  if (!Array.isArray(values) || !values.length) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;

  if (looksLikeHornScanIndexSeries(values)) {
    score -= 1000;
  }

  if (field === 'frequency') {
    const frequencyStart = Number(preset?.frequencyStart);
    const frequencyStop = Number(preset?.frequencyStop);
    const valuesInRange = Number.isFinite(frequencyStart) && Number.isFinite(frequencyStop)
      ? values.filter((value) => value >= frequencyStart - 5 && value <= frequencyStop + 5).length
      : 0;
    const monotonicCount = values.slice(1).filter((value, index) => value >= values[index]).length;

    score += valuesInRange * 5;
    score += monotonicCount;
  }

  if (field === 'amplitude' || field === 'current') {
    score += values.filter((value) => value >= 0 && value <= 100).length * 2;
  }

  if (field === 'phase') {
    score += values.filter((value) => Math.abs(value) <= 3600).length * 2;
  }

  return score;
}

function normalizeHornScanDatasetWithPreset(field, series = [], preset = {}) {
  const cleaned = Array.isArray(series) ? series.filter((value) => Number.isFinite(value)) : [];
  const expectedPointCount = getHornScanExpectedPointCount(preset);

  if (!cleaned.length || !expectedPointCount) {
    return cleaned;
  }

  if (Math.abs(cleaned.length - expectedPointCount) <= 1) {
    return cleaned.slice(0, expectedPointCount);
  }

  const evenValues = cleaned.filter((_, index) => index % 2 === 0);
  const oddValues = cleaned.filter((_, index) => index % 2 === 1);
  const candidates = [evenValues, oddValues]
    .filter((values) => Math.abs(values.length - expectedPointCount) <= 1)
    .map((values) => ({
      values: values.slice(0, expectedPointCount),
      score: scoreHornScanSeriesCandidate(field, values.slice(0, expectedPointCount), preset)
    }))
    .sort((left, right) => right.score - left.score);

  if (candidates.length && candidates[0].score > Number.NEGATIVE_INFINITY) {
    return candidates[0].values;
  }

  return cleaned.slice(0, expectedPointCount);
}

function normalizeHornScanDatasetsWithPreset(datasets = {}, preset = {}) {
  const normalizedDatasets = Object.fromEntries(
    Object.entries(datasets).map(([field, series]) => [field, normalizeHornScanDatasetWithPreset(field, series, preset)])
  );
  const expectedPointCount = getHornScanExpectedPointCount(preset);

  if ((!Array.isArray(normalizedDatasets.frequency) || !normalizedDatasets.frequency.length) && expectedPointCount) {
    normalizedDatasets.frequency = buildFrequencySeriesFromPreset(preset, expectedPointCount);
  }

  return normalizedDatasets;
}

function normalizeHornScanSeries(values = []) {
  const cleaned = values.filter((value) => Number.isFinite(value));
  if (cleaned.length <= 2) {
    return cleaned;
  }

  const evenValues = cleaned.filter((_, index) => index % 2 === 0);
  const oddValues = cleaned.filter((_, index) => index % 2 === 1);

  if (evenValues.length === oddValues.length) {
    const evenLooksIndexed = looksLikeHornScanIndexSeries(evenValues);
    const oddLooksIndexed = looksLikeHornScanIndexSeries(oddValues);

    if (evenLooksIndexed && !oddLooksIndexed) {
      return oddValues;
    }

    if (oddLooksIndexed && !evenLooksIndexed) {
      return evenValues;
    }
  }

  return cleaned;
}

function extractHornScanSeries(raw) {
  const text = stripResponseText(raw);
  if (!text) {
    return [];
  }

  const entryValues = text
    .split('@')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const separatorIndex = part.indexOf(':');
      const payload = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : part;
      const values = (payload.match(/-?\d+(?:\.\d+)?/g) || [])
        .map(Number)
        .filter((value) => Number.isFinite(value));

      return values.length > 1 ? normalizeHornScanSeries(values) : values;
    });

  if (entryValues.length > 1) {
    return normalizeHornScanSeries(entryValues);
  }

  return normalizeHornScanSeries(
    (text.match(/-?\d+(?:\.\d+)?/g) || [])
      .map(Number)
      .filter((value) => Number.isFinite(value))
  );
}

function parseHornScanStatusFrame(raw) {
  const text = stripResponseText(raw);
  if (!text) {
    return {
      raw: text,
      code: '',
      payload: '',
      values: []
    };
  }

  const frameText = text.includes('@') ? text.split('@').at(-1).trim() : text.trim();
  const separatorIndex = frameText.indexOf(':');
  const code = String(separatorIndex >= 0 ? frameText.slice(0, separatorIndex) : frameText)
    .replace(/\s+/g, '')
    .toUpperCase();
  const payload = separatorIndex >= 0 ? frameText.slice(separatorIndex + 1).trim() : '';
  const values = payload
    .split(',')
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map((value) => Number(String(value).trim()))
    .filter((value) => Number.isFinite(value));

  return {
    raw: text,
    code,
    payload,
    values
  };
}

function parseHornScanStartState(raw) {
  const frame = parseHornScanStatusFrame(raw);

  if (!frame.code) {
    return {
      started: false,
      busy: false,
      error: null,
      ...frame
    };
  }

  if (frame.code === 'SYSTEMBUSY') {
    return {
      started: false,
      busy: true,
      error: 'System is busy and cannot start a horn scan right now',
      ...frame
    };
  }

  if (frame.code === 'CANSTARTED' || frame.code === 'SCANSTARTED') {
    return {
      started: true,
      busy: false,
      error: null,
      ...frame
    };
  }

  if (/(BUSY|ERROR|FAULT|FAILED|DENIED)/.test(frame.code)) {
    return {
      started: false,
      busy: /BUSY/.test(frame.code),
      error: frame.payload || frame.code,
      ...frame
    };
  }

  return {
    started: true,
    busy: false,
    error: null,
    ...frame
  };
}

function parseHornScanPollState(raw) {
  const frame = parseHornScanStatusFrame(raw);
  const progressPercent = frame.values.find((value) => value >= 0 && value <= 100) ?? null;

  if (!frame.code) {
    return {
      complete: false,
      running: false,
      indeterminate: true,
      progressPercent: null,
      error: null,
      ...frame
    };
  }

  if (/SCANCOMPLETE(?:D)?|SCANDONE|SCANFINISH(?:ED)?/.test(frame.code)) {
    return {
      complete: true,
      running: false,
      indeterminate: false,
      progressPercent: 100,
      error: null,
      ...frame
    };
  }

  if (frame.code === 'CANSTARTED' || frame.code === 'SCANSTARTED' || /SCANINPRO(?:G|D)RESS|SCANRUNNING|SCANNING/.test(frame.code)) {
    return {
      complete: false,
      running: true,
      indeterminate: progressPercent == null,
      progressPercent,
      error: null,
      ...frame
    };
  }

  if (/(BUSY|ERROR|FAULT|FAILED|ABORT)/.test(frame.code)) {
    if (frame.code === 'SYSTEMBUSY') {
      return {
        complete: false,
        running: true,
        indeterminate: true,
        progressPercent,
        error: null,
        ...frame
      };
    }

    return {
      complete: false,
      running: false,
      indeterminate: false,
      progressPercent,
      error: frame.payload || frame.code,
      ...frame
    };
  }

  return {
    complete: false,
    running: progressPercent != null && progressPercent < 100,
    indeterminate: progressPercent == null,
    progressPercent,
    error: null,
    ...frame
  };
}

function getHornScanSampleValue(series = [], index, { repeatSingle = false } = {}) {
  if (!Array.isArray(series) || !series.length) {
    return null;
  }

  if (index < series.length) {
    return series[index];
  }

  return repeatSingle && series.length === 1 ? series[0] : null;
}

function buildHornScanSamples(datasets = {}) {
  const pointCount = Math.max(
    ...Object.values(datasets).map((series) => (Array.isArray(series) ? series.length : 0)),
    0
  );
  if (!pointCount) {
    return [];
  }

  const timestampBase = Date.now();
  return Array.from({ length: pointCount }, (_, index) => ({
    timestamp: timestampBase + index,
    frequency: getHornScanSampleValue(datasets.frequency, index),
    power: getHornScanSampleValue(datasets.power, index),
    phase: getHornScanSampleValue(datasets.phase, index),
    current: getHornScanSampleValue(datasets.current, index),
    amplitude: getHornScanSampleValue(datasets.amplitude, index, { repeatSingle: true }),
    pwmAmplitude: getHornScanSampleValue(datasets.pwmAmplitude, index, { repeatSingle: true })
  }));
}

function buildSimulatedHornScanSamples(pointCount = 160) {
  const timestampBase = Date.now();

  return Array.from({ length: pointCount }, (_, index) => {
    const ratio = pointCount > 1 ? index / (pointCount - 1) : 0;
    const phase = index / 11;

    return {
      timestamp: timestampBase + index,
      frequency: 39500 + Math.round(ratio * 900),
      power: Math.max(0, Math.round(18 + Math.sin(phase * 0.8) * 12)),
      phase: Math.round(Math.sin(phase) * 65),
      current: Math.max(0, Number((0.6 + Math.cos(phase * 0.7) * 0.18).toFixed(3))),
      amplitude: Math.max(0, Math.round(52 + Math.sin(phase * 0.45) * 9)),
      pwmAmplitude: Math.max(0, Math.round(58 + Math.cos(phase * 0.55) * 7))
    };
  });
}

function buildHornScanDatasetsFromSamples(samples = []) {
  return ['frequency', 'power', 'phase', 'current', 'amplitude', 'pwmAmplitude'].reduce((datasets, field) => ({
    ...datasets,
    [field]: samples
      .map((sample) => sample?.[field])
      .filter((value) => Number.isFinite(value))
  }), {});
}

async function fetchHornScanDatasets(post) {
  const rawDatasets = {};
  const datasets = {};

  for (const { cmd, field } of HORN_SCAN_DATASET_COMMANDS) {
    const response = await post(22, cmd);
    rawDatasets[field] = String(response.data ?? '');
    datasets[field] = extractHornScanSeries(response.data);
  }

  return {
    rawDatasets,
    datasets,
    samples: buildHornScanSamples(datasets)
  };
}

async function fetchHornScanPreset(post) {
  const response = await post(22, HORN_SCAN_PRESET_COMMAND);
  return {
    preset: parseHornScanPreset(response.data),
    raw: String(response.data ?? '')
  };
}

async function fetchHornScanResonance(post) {
  const response = await post(22, HORN_SCAN_RESONANCE_COMMAND);
  return {
    resonance: parseHornScanResonance(response.data),
    raw: String(response.data ?? '')
  };
}

async function fetchHornScanMetadata(post) {
  const { preset, raw: rawPreset } = await fetchHornScanPreset(post);
  const { resonance, raw: rawResonance } = await fetchHornScanResonance(post);

  return {
    preset: {
      ...preset,
      seriesResonantPoint1: resonance.seriesResonantPoint1 ?? preset.seriesResonantPoint1,
      parallelResonantPoint1: resonance.parallelResonantPoint1 ?? preset.parallelResonantPoint1
    },
    resonance,
    raw: {
      preset: rawPreset,
      resonance: rawResonance
    }
  };
}

async function runHardwareHornScan(
  post,
  {
    wait = defaultWait,
    pollIntervalMs = HORN_SCAN_POLL_INTERVAL_MS,
    initialPollDelayMs = HORN_SCAN_INITIAL_POLL_DELAY_MS,
    maxPolls = HORN_SCAN_MAX_POLLS,
    shouldAbort = () => false,
    abort = null,
    onProgress = null
  } = {}
) {
  const startResponse = await post(14, 6);
  console.log('[HORN SCAN] Start response:', String(startResponse.data ?? ''));
  const parsedStartState = parseHornScanStartState(startResponse.data);
  const startState = parsedStartState;
  const pollResponses = [];
  let completed = false;

  if (typeof onProgress === 'function') {
    onProgress({
      stage: 'start',
      started: startState.started,
      busy: startState.busy,
      code: startState.code,
      message: startState.payload || startState.code || startState.raw,
      progressPercent: 0,
      raw: String(startResponse.data ?? '')
    });
  }

  if (!startState.started) {
    console.error('[HORN SCAN] Start failed:', {
      code: startState.code,
      payload: startState.payload,
      error: startState.error,
      raw: String(startResponse.data ?? '')
    });
    return {
      success: false,
      error: startState.error || 'Horn scan could not be started',
      message: startState.payload || startState.code || 'Horn scan could not be started',
      startState,
      raw: {
        start: String(startResponse.data ?? '')
      }
    };
  }

  if (initialPollDelayMs > 0) {
    await wait(initialPollDelayMs);
  }

  const buildAbortedResult = async () => {
    let abortResponse = null;

    if (typeof abort === 'function') {
      try {
        abortResponse = await abort();
      } catch (error) {
        abortResponse = { error: error.message };
      }
    }

    if (typeof onProgress === 'function') {
      onProgress({
        stage: 'aborted',
        code: 'ABORTED',
        message: 'Horn scan aborted',
        progressPercent: null,
        raw: String(startResponse.data ?? '')
      });
    }

    return {
      success: false,
      aborted: true,
      message: 'Horn scan aborted',
      startState,
      pollCount: pollResponses.length,
      datasets: {},
      samples: [],
      preset: null,
      resonance: null,
      raw: {
        start: String(startResponse.data ?? ''),
        poll: pollResponses,
        abort: abortResponse
      }
    };
  };

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (shouldAbort()) {
      return buildAbortedResult();
    }

    if (attempt > 0) {
      await wait(pollIntervalMs);
    }

    if (shouldAbort()) {
      return buildAbortedResult();
    }

    const pollResponse = await post(14, 7);
    const pollState = parseHornScanPollState(pollResponse.data);
    console.log(`[HORN SCAN] Poll ${attempt + 1}:`, String(pollResponse.data ?? ''));

    pollResponses.push({
      attempt: attempt + 1,
      code: pollState.code,
      payload: pollState.payload,
      progressPercent: pollState.progressPercent,
      error: pollState.error,
      raw: String(pollResponse.data ?? ''),
      ...pollState
    });

    if (typeof onProgress === 'function') {
      onProgress({
        stage: pollState.complete ? 'complete' : (pollState.running ? 'running' : 'poll'),
        code: pollState.code,
        message: pollState.payload || pollState.code || pollState.raw,
        progressPercent: pollState.progressPercent,
        complete: pollState.complete,
        running: pollState.running,
        raw: String(pollResponse.data ?? '')
      });
    }

    if (shouldAbort()) {
      return buildAbortedResult();
    }

    if (pollState.error) {
      console.error('[HORN SCAN] Poll error:', {
        code: pollState.code,
        payload: pollState.payload,
        error: pollState.error,
        raw: String(pollResponse.data ?? '')
      });
      return {
        success: false,
        error: pollState.error,
        message: pollState.payload || pollState.code || 'Horn scan failed during polling',
        startState,
        pollCount: pollResponses.length,
        raw: {
          start: String(startResponse.data ?? ''),
          poll: pollResponses
        }
      };
    }

    if (pollState.complete || (!pollState.indeterminate && !pollState.running && attempt > 0)) {
      completed = true;
      break;
    }
  }

  if (shouldAbort()) {
    return buildAbortedResult();
  }

  if (!completed) {
    console.error('[HORN SCAN] Timed out:', {
      polls: pollResponses.length,
      lastPoll: pollResponses.at(-1)?.raw ?? null
    });
    return {
      success: false,
      error: 'Horn scan timed out before the controller reported completion',
      startState,
      raw: {
        start: String(startResponse.data ?? ''),
        poll: pollResponses
      }
    };
  }

  const { rawDatasets, datasets } = await fetchHornScanDatasets(post);
  const { preset, resonance, raw: rawMetadata } = await fetchHornScanMetadata(post);
  const normalizedDatasets = normalizeHornScanDatasetsWithPreset(datasets, preset);
  const samples = buildHornScanSamples(normalizedDatasets);
  console.log('[HORN SCAN] Completed:', {
    pollCount: pollResponses.length,
    datasetSizes: Object.fromEntries(
      Object.entries(normalizedDatasets).map(([field, series]) => [field, Array.isArray(series) ? series.length : 0])
    ),
    sampleCount: samples.length,
    preset: preset ? {
      frequencyStart: preset.frequencyStart,
      frequencyStop: preset.frequencyStop,
      frequencyStep: preset.frequencyStep
    } : null,
    resonance: resonance ? {
      seriesResonantPoint1: resonance.seriesResonantPoint1,
      parallelResonantPoint1: resonance.parallelResonantPoint1
    } : null
  });

  return {
    success: true,
    message: samples.length ? 'Horn scan complete' : 'Horn scan complete but no chart samples were parsed',
    startState,
    pollCount: pollResponses.length,
    datasets: normalizedDatasets,
    samples,
    preset,
    resonance,
    raw: {
      start: String(startResponse.data ?? ''),
      poll: pollResponses,
      datasets: rawDatasets,
      preset: rawMetadata.preset,
      resonance: rawMetadata.resonance
    }
  };
}

module.exports = {
  parseHornScanTabStatus,
  buildHornScanDatasetsFromSamples,
  buildSimulatedHornScanSamples,
  runHardwareHornScan
};
