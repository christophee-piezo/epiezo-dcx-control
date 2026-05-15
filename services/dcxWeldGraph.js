const WELD_GRAPH_SAMPLE_WINDOW_MS = 5000;
const WELD_GRAPH_TIME_AXIS_COMMAND = {
  func: 13,
  cmd: 36,
  field: 'time'
};
const WELD_GRAPH_DATASET_COMMANDS = [
  { func: 21, cmd: 38, field: 'current' },
  { func: 21, cmd: 37, field: 'phase' },
  { func: 21, cmd: 39, field: 'amplitude' },
  { func: 21, cmd: 40, field: 'power' },
  { func: 21, cmd: 41, field: 'pwmAmplitude' },
  { func: 21, cmd: 42, field: 'frequency' }
];
const WELD_GRAPH_PRESET_COMMAND = 43;

function parseWeldGraphReadback(raw) {
  const text = stripResponseText(raw);
  if (!text) {
    return null;
  }

  const frameText = text
    .split('@')
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);

  if (!frameText || frameText.includes(':')) {
    return null;
  }

  const values = frameText
    .split(',')
    .map((value) => Number(String(value).trim()));

  if (values.length < 4 || values.slice(0, 4).some((value) => !Number.isFinite(value))) {
    return null;
  }

  return {
    frequency: values[0],
    memory: values[1],
    amplitude: values[2],
    power: values[3],
    raw: frameText
  };
}

function parseWeldGraphStartState(raw) {
  const text = stripResponseText(raw);
  const summary = parseWeldGraphReadback(raw);
  if (!text) {
    return {
      started: false,
      code: '',
      payload: '',
      error: 'Weld graph arm command returned an empty response',
      summary,
      raw: text
    };
  }

  const frameText = text.includes('@') ? text.split('@').at(-1).trim() : text.trim();
  const sectionText = text.split('@')[1] || frameText;
  const separatorIndex = sectionText.indexOf(':');
  const code = String(separatorIndex >= 0 ? sectionText.slice(0, separatorIndex) : sectionText)
    .replace(/\s+/g, '')
    .toUpperCase();
  const payload = separatorIndex >= 0 ? sectionText.slice(separatorIndex + 1).trim() : '';

  if (!code) {
    return {
      started: false,
      code,
      payload,
      error: 'Weld graph arm response did not include a state code',
      summary,
      raw: text
    };
  }

  if (/(BUSY|ERROR|FAULT|FAILED|DENIED|ABORT)/.test(code)) {
    return {
      started: false,
      code,
      payload,
      error: payload || code,
      summary,
      raw: text
    };
  }

  return {
    started: true,
    code,
    payload,
    error: null,
    summary,
    raw: text
  };
}

function mergeWeldGraphStartState(primaryState, fallbackState) {
  return {
    ...(fallbackState || {}),
    ...(primaryState || {}),
    summary: primaryState?.summary || fallbackState?.summary || null
  };
}

function hasMeaningfulWeldGraphCapture(datasets = {}) {
  const frequencySeries = Array.isArray(datasets.frequency) ? datasets.frequency : [];
  const currentSeries = Array.isArray(datasets.current) ? datasets.current : [];
  const amplitudeSeries = Array.isArray(datasets.amplitude) ? datasets.amplitude : [];
  const pwmAmplitudeSeries = Array.isArray(datasets.pwmAmplitude) ? datasets.pwmAmplitude : [];

  if (!frequencySeries.length) {
    return false;
  }

  return [currentSeries, amplitudeSeries, pwmAmplitudeSeries]
    .some((series) => series.some((value) => Number.isFinite(Number(value)) && Number(value) > 0));
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

function stripResponseTextWithLines(raw) {
  return String(raw ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|td|th|section|article|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function looksLikeIndexedSeries(values = []) {
  if (!Array.isArray(values) || values.length < 3) {
    return false;
  }

  return values.every((value, index) => Number.isInteger(value)
    && value >= 0
    && (index === 0 || value >= values[index - 1]))
    && values.slice(1).every((value, index) => {
      const previousValue = values[index];
      return value - previousValue >= 0 && value - previousValue <= 2;
    });
}

function normalizeSeries(values = []) {
  const cleaned = values.filter((value) => Number.isFinite(value));
  if (cleaned.length <= 2) {
    return cleaned;
  }

  const evenValues = cleaned.filter((_, index) => index % 2 === 0);
  const oddValues = cleaned.filter((_, index) => index % 2 === 1);

  if (evenValues.length === oddValues.length) {
    const evenLooksIndexed = looksLikeIndexedSeries(evenValues);
    const oddLooksIndexed = looksLikeIndexedSeries(oddValues);

    if (evenLooksIndexed && !oddLooksIndexed) {
      return oddValues;
    }

    if (oddLooksIndexed && !evenLooksIndexed) {
      return evenValues;
    }
  }

  return cleaned;
}

function looksLikePointIndexes(values = []) {
  if (!Array.isArray(values) || values.length < 4) {
    return false;
  }

  return values.every((value, index) => Number.isInteger(value)
    && value >= 0
    && (index === 0 || value >= values[index - 1]))
    && values.slice(1).every((value, index) => {
      const previousValue = values[index];
      return value - previousValue >= 0 && value - previousValue <= 2;
    });
}

function extractSeries(raw) {
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

      return values.length > 1 ? normalizeSeries(values) : values;
    });

  if (entryValues.length > 1) {
    return normalizeSeries(entryValues);
  }

  return normalizeSeries(
    (text.match(/-?\d+(?:\.\d+)?/g) || [])
      .map(Number)
      .filter((value) => Number.isFinite(value))
  );
}

function extractWeldGraphTimeAxis(raw) {
  const values = extractSeries(raw)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.max(0, value));

  if (values.length < 2 || values.length % 2 !== 0) {
    return values;
  }

  const evenValues = values.filter((_, index) => index % 2 === 0);
  const oddValues = values.filter((_, index) => index % 2 === 1);
  const evenLooksIndexed = looksLikePointIndexes(evenValues);
  const oddLooksIndexed = looksLikePointIndexes(oddValues);

  if (evenLooksIndexed && !oddLooksIndexed) {
    return oddValues;
  }

  if (oddLooksIndexed && !evenLooksIndexed) {
    return evenValues;
  }

  if (evenLooksIndexed && oddLooksIndexed) {
    return oddValues;
  }

  return values;
}

function parsePresetEntryValue(rawValue) {
  const text = String(rawValue ?? '').trim();
  if (!text) {
    return null;
  }

  const numericValue = Number(text);
  return Number.isFinite(numericValue) ? numericValue : text;
}

function parsePresetEntries(tokens = []) {
  const entries = [];

  for (let index = 0; index + 1 < tokens.length; index += 2) {
    const label = String(tokens[index] ?? '').trim();
    const value = parsePresetEntryValue(tokens[index + 1]);
    if (label && value != null) {
      entries.push({ label, value });
    }
  }

  return entries;
}

function parseWeldGraphPreset(raw) {
  const text = stripResponseTextWithLines(raw);
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const entries = [];
  let frequencyStart = null;
  let frequencyStop = null;

  lines.forEach((line, index) => {
    const tokens = line.split(',').map((token) => token.trim()).filter(Boolean);
    if (!tokens.length) {
      return;
    }

    if (index === 0 && /^PresetData\b/i.test(tokens[0])) {
      const startValue = Number(tokens[1]);
      const stopValue = Number(tokens[2]);
      frequencyStart = Number.isFinite(startValue) ? startValue : null;
      frequencyStop = Number.isFinite(stopValue) ? stopValue : null;
      entries.push(...parsePresetEntries(tokens.slice(3)));
      return;
    }

    if (tokens.length >= 2) {
      const label = tokens[0];
      const value = parsePresetEntryValue(tokens.slice(1).join(', '));
      if (label && value != null) {
        entries.push({ label, value });
      }
    }
  });

  return {
    frequencyStart,
    frequencyStop,
    entries,
    raw: text
  };
}

function getPresetEntryNumber(preset = {}, labels = []) {
  const entries = Array.isArray(preset?.entries) ? preset.entries : [];
  const normalizedLabels = labels
    .map((label) => String(label).trim().toLowerCase())
    .filter(Boolean);

  if (!normalizedLabels.length) {
    return null;
  }

  const entry = entries.find((candidate) => {
    const candidateLabel = String(candidate?.label ?? '').trim().toLowerCase();
    return normalizedLabels.some((label) => candidateLabel === label || candidateLabel.includes(label) || label.includes(candidateLabel));
  });
  const value = Number(entry?.value);
  return Number.isFinite(value) ? value : null;
}

function normalizeWeldGraphDatasets(datasets = {}) {
  const normalizedDatasets = Object.fromEntries(
    Object.entries(datasets).map(([field, series]) => [field, Array.isArray(series) ? [...series] : []])
  );

  const timeSeries = Array.isArray(normalizedDatasets.time)
    ? normalizedDatasets.time.filter((value) => Number.isFinite(Number(value))).map((value) => Math.max(0, Number(value)))
    : [];
  const pointCount = Math.max(
    timeSeries.length,
    ...Object.entries(normalizedDatasets)
      .filter(([field]) => field !== 'time')
      .map(([, series]) => (Array.isArray(series) ? series.length : 0)),
    0
  );

  if (!pointCount) {
    normalizedDatasets.time = [];
    return normalizedDatasets;
  }

  normalizedDatasets.time = hasUsableWeldGraphTimeSeries(timeSeries, pointCount)
    ? timeSeries.slice(0, pointCount)
    : buildFallbackWeldGraphTimeSeries(pointCount);

  Object.keys(normalizedDatasets).forEach((field) => {
    if (field === 'time') {
      return;
    }

    normalizedDatasets[field] = Array.isArray(normalizedDatasets[field])
      ? normalizedDatasets[field].slice(0, pointCount)
      : [];
  });

  return normalizedDatasets;
}

function getSampleValue(series = [], index, fallback = null) {
  if (!Array.isArray(series) || index >= series.length) {
    return fallback;
  }

  return series[index];
}

function hasUsableWeldGraphTimeSeries(values = [], pointCount = 0) {
  if (!Array.isArray(values) || values.length < pointCount || pointCount <= 0) {
    return false;
  }

  if (pointCount === 1) {
    return Number.isFinite(Number(values[0]));
  }

  const candidate = values.slice(0, pointCount);
  const monotonicCount = candidate.slice(1).filter((value, index) => value >= candidate[index]).length;

  return monotonicCount >= Math.floor((pointCount - 1) * 0.8)
    && candidate[pointCount - 1] > candidate[0];
}

function buildFallbackWeldGraphTimeSeries(pointCount = 0) {
  if (pointCount <= 0) {
    return [];
  }

  if (pointCount === 1) {
    return [0];
  }

  return Array.from({ length: pointCount }, (_, index) => Math.round((index / (pointCount - 1)) * WELD_GRAPH_SAMPLE_WINDOW_MS));
}

function buildWeldGraphSamples(datasets = {}) {
  const timeSeries = Array.isArray(datasets.time)
    ? datasets.time.filter((value) => Number.isFinite(Number(value))).map((value) => Math.max(0, Number(value)))
    : [];
  const pointCount = Math.max(
    timeSeries.length,
    ...Object.entries(datasets)
      .filter(([field]) => field !== 'time')
      .map(([, series]) => (Array.isArray(series) ? series.length : 0)),
    0
  );

  if (!pointCount) {
    return [];
  }

  const resolvedTimeSeries = hasUsableWeldGraphTimeSeries(timeSeries, pointCount)
    ? timeSeries.slice(0, pointCount)
    : buildFallbackWeldGraphTimeSeries(pointCount);
  const timestampBase = Date.now();
  return Array.from({ length: pointCount }, (_, index) => {
    const normalizedTimeMs = resolvedTimeSeries[index] ?? 0;

    return {
      timestamp: timestampBase + normalizedTimeMs,
      frequency: getSampleValue(datasets.frequency, index),
      power: getSampleValue(datasets.power, index),
      phase: getSampleValue(datasets.phase, index),
      current: getSampleValue(datasets.current, index),
      amplitude: getSampleValue(datasets.amplitude, index),
      pwmAmplitude: getSampleValue(datasets.pwmAmplitude, index)
    };
  });
}

function buildSimulatedWeldGraphSamples(pointCount = 180) {
  const timestampBase = Date.now();

  return Array.from({ length: pointCount }, (_, index) => {
    const ratio = pointCount > 1 ? index / (pointCount - 1) : 0;
    const phaseSeed = index / 8;
    const timeMs = Math.round(ratio * WELD_GRAPH_SAMPLE_WINDOW_MS);

    return {
      timestamp: timestampBase + timeMs,
      frequency: 39980 + Math.round(Math.sin(phaseSeed * 0.45) * 42),
      power: Math.max(0, Math.round(18 + Math.sin(phaseSeed * 0.7) * 24)),
      phase: Math.round(-820 + Math.sin(phaseSeed) * 210),
      current: Math.max(0, Math.round(8 + Math.cos(phaseSeed * 0.6) * 3)),
      amplitude: Math.max(0, Math.round(10 + Math.sin(phaseSeed * 0.33) * 3)),
      pwmAmplitude: Math.max(0, Math.round(ratio * 22 + Math.max(0, Math.sin(phaseSeed * 0.4) * 2)))
    };
  });
}

function buildWeldGraphDatasetsFromSamples(samples = []) {
  const firstTimestamp = Number(samples[0]?.timestamp) || Date.now();

  return ['time', 'frequency', 'power', 'phase', 'current', 'amplitude', 'pwmAmplitude'].reduce((datasets, field) => {
    if (field === 'time') {
      return {
        ...datasets,
        time: samples
          .map((sample) => Number(sample?.timestamp))
          .filter((value) => Number.isFinite(value))
          .map((value) => Math.max(0, Math.round(value - firstTimestamp)))
      };
    }

    return {
      ...datasets,
      [field]: samples
        .map((sample) => sample?.[field])
        .filter((value) => Number.isFinite(value))
    };
  }, {});
}

async function fetchWeldGraphDatasets(post) {
  const rawDatasets = {};
  const datasets = {};

  const timeResponse = await post(WELD_GRAPH_TIME_AXIS_COMMAND.func, WELD_GRAPH_TIME_AXIS_COMMAND.cmd);
  rawDatasets[WELD_GRAPH_TIME_AXIS_COMMAND.field] = String(timeResponse.data ?? '');
  datasets[WELD_GRAPH_TIME_AXIS_COMMAND.field] = extractWeldGraphTimeAxis(timeResponse.data);

  for (const { func, cmd, field } of WELD_GRAPH_DATASET_COMMANDS) {
    const response = await post(func, cmd);
    rawDatasets[field] = String(response.data ?? '');
    datasets[field] = extractSeries(response.data);
  }

  return {
    rawDatasets,
    datasets
  };
}

async function fetchWeldGraphPreset(post) {
  const response = await post(21, WELD_GRAPH_PRESET_COMMAND);
  const preset = parseWeldGraphPreset(response.data);

  return {
    preset,
    raw: String(response.data ?? '')
  };
}

async function armHardwareWeldGraph(
  post,
  {
    onArm = null
  } = {}
) {
  const seekResponse = await post(13, 9);
  const startResponse = await post(13, 10);
  console.log('[WELD GRAPH] Arm response:', String(startResponse.data ?? ''));
  const startState = parseWeldGraphStartState(startResponse.data);

  if (!startState.started) {
    console.error('[WELD GRAPH] Arm failed:', {
      code: startState.code,
      payload: startState.payload,
      error: startState.error,
      raw: String(startResponse.data ?? '')
    });
    return {
      success: false,
      error: startState.error || 'Weld graph could not be armed',
      message: startState.payload || startState.code || 'Weld graph could not be armed',
      startState,
      raw: {
        seek: String(seekResponse.data ?? ''),
        start: String(startResponse.data ?? '')
      }
    };
  }

  const confirmResponse = await post(13, 10);
  const confirmState = parseWeldGraphStartState(confirmResponse.data);
  const effectiveStartState = mergeWeldGraphStartState(
    confirmState.started ? confirmState : { summary: confirmState.summary || null },
    startState
  );

  if (!confirmState.started) {
    console.warn('[WELD GRAPH] Arm confirmation was not parseable, using initial arm state:', {
      code: confirmState.code,
      payload: confirmState.payload,
      error: confirmState.error,
      raw: String(confirmResponse.data ?? '')
    });
  }

  if (typeof onArm === 'function') {
    onArm({
      seek: String(seekResponse.data ?? ''),
      start: String(startResponse.data ?? ''),
      confirm: String(confirmResponse.data ?? '')
    });
  }

  return {
    success: true,
    startState: effectiveStartState,
    raw: {
      seek: String(seekResponse.data ?? ''),
      start: String(startResponse.data ?? ''),
      confirm: String(confirmResponse.data ?? '')
    }
  };
}

async function runHardwareWeldGraph(
  post,
  {
    onArm = null
  } = {}
) {
  const armed = await armHardwareWeldGraph(post, { onArm });
  if (!armed.success) {
    return armed;
  }

  const { rawDatasets, datasets } = await fetchWeldGraphDatasets(post);
  const { preset, raw: rawPreset } = await fetchWeldGraphPreset(post);
  const normalizedDatasets = normalizeWeldGraphDatasets(datasets);

  if (!normalizedDatasets.time.length) {
    return {
      success: false,
      error: 'Weld graph outputs could not be parsed into chart samples',
      message: 'Weld graph load failed because no graph outputs could be parsed',
      startState: armed.startState,
      summary: armed.startState?.summary || null,
      preset,
      raw: {
        ...armed.raw,
        datasets: rawDatasets,
        preset: rawPreset
      }
    };
  }

  const samples = buildWeldGraphSamples(normalizedDatasets);
  const meaningfulCapture = hasMeaningfulWeldGraphCapture(normalizedDatasets);
  console.log('[WELD GRAPH] Completed:', {
    datasetSizes: Object.fromEntries(
      Object.entries(normalizedDatasets).map(([field, series]) => [field, Array.isArray(series) ? series.length : 0])
    ),
    sampleCount: samples.length,
    meaningfulCapture,
    preset: preset ? {
      frequencyStart: preset.frequencyStart,
      frequencyStop: preset.frequencyStop
    } : null
  });

  return {
    success: true,
    message: samples.length
      ? 'Weld graph loaded'
      : 'Weld graph loaded but no chart samples were parsed',
    startState: armed.startState,
    summary: armed.startState?.summary || null,
    datasets: normalizedDatasets,
    samples,
    preset,
    raw: {
      ...armed.raw,
      datasets: rawDatasets,
      preset: rawPreset
    }
  };
}

module.exports = {
  buildSimulatedWeldGraphSamples,
  buildWeldGraphDatasetsFromSamples,
  runHardwareWeldGraph
};
