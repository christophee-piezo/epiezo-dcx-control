function parseRawStatusEntries(raw) {
  return String(raw || '')
    .split('@')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((entries, part) => {
      const separatorIndex = part.indexOf(':');
      if (separatorIndex < 0) {
        return entries;
      }

      const key = part.slice(0, separatorIndex).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const rest = part.slice(separatorIndex + 1).trim();
      if (!key || !rest) {
        return entries;
      }

      const valueSeparatorIndex = rest.indexOf(',');
      entries[key] = valueSeparatorIndex >= 0
        ? rest.slice(valueSeparatorIndex + 1).trim()
        : rest;
      return entries;
    }, {});
}

function findRawEntry(entries, aliases = []) {
  for (const alias of aliases) {
    const normalizedAlias = alias.toUpperCase();
    const exactMatch = Object.entries(entries).find(([key]) => key === normalizedAlias);
    if (exactMatch) {
      return exactMatch;
    }
  }

  for (const alias of aliases) {
    const normalizedAlias = alias.toUpperCase();
    const partialMatch = Object.entries(entries).find(([key]) => key.includes(normalizedAlias));
    if (partialMatch) {
      return partialMatch;
    }
  }

  return null;
}

function extractNumericRawValue(entries, aliases = []) {
  const match = findRawEntry(entries, aliases);
  if (!match) {
    return null;
  }

  const numericMatch = String(match[1]).match(/-?\d+(?:\.\d+)?/);
  return numericMatch ? Number(numericMatch[0]) : null;
}

function extractStringRawValue(entries, aliases = []) {
  const match = findRawEntry(entries, aliases);
  if (!match) {
    return null;
  }

  const value = String(match[1]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return value || null;
}

function extractBooleanRawValue(entries, aliases = []) {
  const match = findRawEntry(entries, aliases);
  if (!match) {
    return null;
  }

  const rawValue = String(match[1]).trim().toUpperCase();
  if (['1', 'ON', 'TRUE', 'READY', 'ACTIVE', 'SEEK'].includes(rawValue)) {
    return 1;
  }

  if (['0', 'OFF', 'FALSE', 'IDLE', 'INACTIVE'].includes(rawValue)) {
    return 0;
  }

  const numericValue = extractNumericRawValue(entries, aliases);
  if (numericValue == null) {
    return null;
  }

  return numericValue ? 1 : 0;
}

function extractTelemetryFromRaw(raw) {
  const entries = parseRawStatusEntries(raw);
  if (!Object.keys(entries).length) {
    return {};
  }

  const telemetry = {};
  const numericFields = [
    ['frequency', ['FREQUENCY', 'FREQ']],
    ['amplitude', ['AMPLITUDE', 'WELDAMP', 'AMP']],
    ['power', ['POWER', 'PWR']],
    ['cycles', ['CYCLES', 'CYCLE']]
  ];
  const booleanFields = [
    ['ready', ['READY']],
    ['active', ['ACTIVE', 'SONICS']],
    ['alarm', ['ALARM', 'FAULT']],
    ['seek', ['SEEK']]
  ];

  numericFields.forEach(([field, aliases]) => {
    const value = extractNumericRawValue(entries, aliases);
    if (value != null) {
      telemetry[field] = value;
    }
  });

  booleanFields.forEach(([field, aliases]) => {
    const value = extractBooleanRawValue(entries, aliases);
    if (value != null) {
      telemetry[field] = value;
    }
  });

  return telemetry;
}

function formatSystemInfoValue(field, value) {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const numericValue = Number(text);

  switch (field) {
    case 'powerLevel':
      if (Number.isFinite(numericValue) && !/w(?:att)?s?/i.test(text)) {
        return `${numericValue} W`;
      }
      return text;
    case 'frequency':
      if (Number.isFinite(numericValue)) {
        if (/hz/i.test(text)) {
          return text;
        }

        if (numericValue >= 1000) {
          return `${Math.round((numericValue / 1000) * 100) / 100} kHz`;
        }

        return `${numericValue} Hz`;
      }

      return text;
    case 'specPasswordEnabled':
      if (['1', 'ON', 'TRUE', 'ENABLED'].includes(text.toUpperCase())) {
        return 'Enabled';
      }

      if (['0', 'OFF', 'FALSE', 'DISABLED'].includes(text.toUpperCase())) {
        return 'Disabled';
      }

      return text;
    default:
      return text;
  }
}

function extractSystemInfoFromRaw(raw, { frequencyFallback = null } = {}) {
  const entries = parseRawStatusEntries(raw);
  if (!Object.keys(entries).length) {
    return {};
  }

  const fieldAliases = {
    system: ['CURRSYS', 'SYSTEM', 'MODEL', 'DEVICE', 'GENERATORMODEL', 'SYSTEMMODEL'],
    display: ['DISPLAY', 'LCDDISPLAY', 'DISPLAYTYPE', 'LCDTYPE'],
    softwareVersion: ['SWVERSION', 'LCDSOFTWAREVERSION', 'LCDVERSION', 'LCDSWVERSION', 'LCDVER'],
    systemVersion: ['SYSVERSION', 'WEBSITEVERSION', 'WEBVERSION', 'WEBSITEVER', 'PSVERSION', 'POWERSUPPLYVERSION', 'POWERSUPPLYVER', 'PSVER'],
    fpgaVersion: ['FPGAVERSION'],
    dcxCrc: ['DCXCRC', 'LCDCRC'],
    systemCrc: ['SYSCRC', 'PSCRC', 'POWERSUPPLYCRC'],
    serialNumber: ['SNUMBER', 'SERIALNUMBER', 'SERIALNO', 'SERIAL'],
    powerLevel: ['PSPWR', 'POWERLEVEL', 'POWERRATING', 'WATTAGE'],
    frequency: ['PSFRQ', 'FREQUENCY', 'NOMINALFREQUENCY', 'FREQ'],
    lifetimeCycles: ['LIFETIMECYCLES'],
    generalAlarms: ['GENERALALARMS'],
    hoursOfSonics: ['HOURSOFSONICS'],
    powerOnHours: ['POWERONHOURS'],
    specPassword: ['SPECPWD'],
    specPasswordEnabled: ['SPECPWDENABLE']
  };

  const systemInfo = Object.entries(fieldAliases).reduce((nextSystemInfo, [field, aliases]) => {
    const stringValue = extractStringRawValue(entries, aliases);
    const numericValue = extractNumericRawValue(entries, aliases);
    const value = stringValue ?? numericValue;
    const formattedValue = formatSystemInfoValue(field, value);

    if (formattedValue == null) {
      return nextSystemInfo;
    }

    return {
      ...nextSystemInfo,
      [field]: formattedValue
    };
  }, {});

  if (!systemInfo.frequency) {
    const formattedFrequency = formatSystemInfoValue('frequency', frequencyFallback);
    if (formattedFrequency) {
      systemInfo.frequency = formattedFrequency;
    }
  }

  return systemInfo;
}

function parseSetupPayload(raw) {
  return String(raw || '')
    .split('@')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((nextState, part) => {
      const separatorIndex = part.indexOf(':');
      if (separatorIndex < 0) {
        return nextState;
      }

      const key = part.slice(0, separatorIndex).trim();
      const descriptor = part.slice(separatorIndex + 1).trim();
      if (!key || !descriptor) {
        return nextState;
      }

      const segments = descriptor
        .split(',')
        .map((segment) => segment.trim())
        .filter((segment) => segment !== '');

      if (segments.length < 2) {
        return nextState;
      }

      const type = segments[0] || '';
      const value = segments[1] ?? null;
      const min = segments[2] ?? null;
      const max = segments[3] ?? null;

      return {
        settings: {
          ...nextState.settings,
          [key]: value
        },
        metadata: {
          ...nextState.metadata,
          [key]: {
            type,
            value,
            min,
            max
          }
        }
      };
    }, {
      settings: {},
      metadata: {}
    });
}

function normalizeIoSignalGroup(signalType = '') {
  const normalizedSignalType = String(signalType || '').trim().toUpperCase();

  if (normalizedSignalType === 'DI') {
    return 'digitalInputs';
  }

  if (normalizedSignalType === 'DO') {
    return 'digitalOutputs';
  }

  if (normalizedSignalType === 'AI') {
    return 'analogInputs';
  }

  if (normalizedSignalType === 'AO') {
    return 'analogOutputs';
  }

  return null;
}

function parseIoPayload(raw) {
  const snapshot = {
    raw: String(raw || ''),
    entries: {},
    digitalInputs: {},
    digitalOutputs: {},
    analogInputs: {},
    analogOutputs: {}
  };

  if (!snapshot.raw) {
    return snapshot;
  }

  snapshot.raw
    .split('@')
    .map((part) => part.trim())
    .filter((part) => /^PIN\d+:/i.test(part))
    .forEach((part) => {
      const separatorIndex = part.indexOf(':');
      if (separatorIndex < 0) {
        return;
      }

      const pin = part.slice(0, separatorIndex).trim().toUpperCase();
      const segments = part.slice(separatorIndex + 1)
        .split(',')
        .map((segment) => segment.trim())
        .filter((segment) => segment !== '');

      if (segments.length < 3) {
        return;
      }

      const signalType = String(segments[1] || '').trim().toUpperCase();
      const group = normalizeIoSignalGroup(signalType);
      if (!group) {
        return;
      }

      const rawValue = segments[segments.length - 1];
      const numericValue = Number(rawValue);
      const entry = {
        pin,
        source: segments[0] || '',
        signalType,
        label: segments.slice(2, -1).join(', ') || pin,
        rawValue,
        numericValue: Number.isFinite(numericValue) ? numericValue : null
      };

      snapshot.entries[pin] = entry;
      snapshot[group][pin] = entry;
    });

  return snapshot;
}

function mergeIoSnapshots(...snapshots) {
  return snapshots.reduce((nextSnapshot, snapshot) => {
    if (!snapshot) {
      return nextSnapshot;
    }

    return {
      raw: [nextSnapshot.raw, snapshot.raw].filter(Boolean).join('\n'),
      entries: {
        ...nextSnapshot.entries,
        ...snapshot.entries
      },
      digitalInputs: {
        ...nextSnapshot.digitalInputs,
        ...snapshot.digitalInputs
      },
      digitalOutputs: {
        ...nextSnapshot.digitalOutputs,
        ...snapshot.digitalOutputs
      },
      analogInputs: {
        ...nextSnapshot.analogInputs,
        ...snapshot.analogInputs
      },
      analogOutputs: {
        ...nextSnapshot.analogOutputs,
        ...snapshot.analogOutputs
      }
    };
  }, {
    raw: '',
    entries: {},
    digitalInputs: {},
    digitalOutputs: {},
    analogInputs: {},
    analogOutputs: {}
  });
}

function getIoDigitalState(entry) {
  if (!entry) {
    return null;
  }

  const rawValue = String(entry.rawValue ?? '').trim().toUpperCase();
  if (['1', 'ON', 'TRUE', 'READY', 'ACTIVE', 'HIGH'].includes(rawValue)) {
    return true;
  }

  if (['0', 'OFF', 'FALSE', 'IDLE', 'INACTIVE', 'LOW'].includes(rawValue)) {
    return false;
  }

  if (entry.numericValue == null) {
    return null;
  }

  return Boolean(entry.numericValue);
}

module.exports = {
  extractTelemetryFromRaw,
  extractSystemInfoFromRaw,
  parseSetupPayload,
  parseIoPayload,
  mergeIoSnapshots,
  getIoDigitalState
};
