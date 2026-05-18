export function formatExportTimestamp(value = Date.now()) {
  const timestamp = new Date(value);
  const pad = (segment) => String(segment).padStart(2, '0');
  return `${timestamp.getFullYear()}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}-${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}`;
}

export function sanitizeFileNameSegment(value, fallback = 'export-data') {
  const normalizedValue = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalizedValue || fallback;
}

export function toCsvValue(value) {
  if (value == null) {
    return '';
  }

  const normalizedValue = String(value);
  return /[",\n]/.test(normalizedValue)
    ? `"${normalizedValue.replaceAll('"', '""')}"`
    : normalizedValue;
}

export function buildStructuredCsvExport({
  infoTitle = 'Test Information',
  infoRows = [],
  dataTitle = 'Data',
  dataColumns = [],
  dataRows = []
} = {}) {
  const metadataLines = [
    toCsvValue(infoTitle),
    'Field,Value',
    ...infoRows.map(([field, value]) => `${toCsvValue(field)},${toCsvValue(value)}`)
  ];
  const dataLines = [
    toCsvValue(dataTitle),
    dataColumns.map((column) => toCsvValue(column)).join(','),
    ...dataRows.map((row) => dataColumns.map((column) => toCsvValue(row?.[column])).join(','))
  ];

  return [...metadataLines, '', ...dataLines].join('\n');
}

export function buildStructuredJsonExport({ metadata = {}, dataColumns = [], dataRows = [] } = {}) {
  return JSON.stringify({
    metadata,
    data: {
      columns: dataColumns,
      rows: dataRows
    }
  }, null, 2);
}
