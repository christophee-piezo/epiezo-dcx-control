import { AuthSettingsPanel } from '../auth-settings-panel.jsx';
import { Button } from '../../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card.jsx';
import { Input } from '../../ui/input.jsx';
import { NativeSelect } from '../../ui/native-select.jsx';
import { FormField } from '../form-field.jsx';

const ioDigitalInputs = [
  { id: 'settings-io-input-external-start', pin: 'J3-1', label: 'External Start', key: 'settings.io.externalStart' },
  { id: 'settings-io-input-external-seek', pin: 'J3-2', label: 'External Seek', key: 'settings.io.externalSeek' },
  { id: 'settings-io-input-external-reset', pin: 'J3-3', label: 'External Reset', key: 'settings.io.externalReset' },
  { id: 'settings-io-input-memory-clear', pin: 'J3-4', label: 'Memory Clear', key: 'settings.io.memoryClear' }
];

const ioDigitalOutputs = [
  { id: 'settings-io-output-ready', pin: 'J3-7', label: 'Ready', key: 'settings.io.ready' },
  { id: 'settings-io-output-active', pin: 'J3-8', label: 'SonicsActive', key: 'settings.io.sonicsActive' },
  { id: 'settings-io-output-alarm', pin: 'J3-9', label: 'GeneralAlarm', key: 'settings.io.generalAlarm' },
  { id: 'settings-io-output-seek', pin: 'J3-10', label: 'Seek/Scan Out', key: 'settings.io.seekScanOut' }
];

const ioAnalogInputs = [
  { pin: 'J3-17', label: 'Amplitude In (V)', key: 'settings.io.amplitudeIn', value: '--.--', valueId: 'settings-io-amplitude-in' },
  { pin: 'J3-18', label: 'Frequency Offset (V)', key: 'settings.io.frequencyOffset', value: '--.--', valueId: 'settings-io-frequency-offset' }
];

const ioAnalogOutputs = [
  { id: 'settings-io-power-out', pin: 'J3-24', label: 'Power Out (V)', key: 'settings.io.powerOut', value: '00.00' },
  { id: 'settings-io-amplitude-out', pin: 'J3-25', label: 'Amplitude Out (V)', key: 'settings.io.amplitudeOut', value: '00.00' }
];

const ioConfigurationDigitalInputOptions = [
  { value: 'unassign', label: 'UNASSIGN', key: 'settings.io.unassign' },
  { value: 'externalReset', label: 'External Reset', key: 'settings.io.externalReset' },
  { value: 'externalSeek', label: 'External Seek', key: 'settings.io.externalSeek' },
  { value: 'externalStart', label: 'External Start', key: 'settings.io.externalStart' },
  { value: 'externalTest', label: 'External Test', key: 'settings.io.externalTest' },
  { value: 'memoryClear', label: 'Memory Clear', key: 'settings.io.memoryClear' },
  { value: 'extHornScan', label: 'Ext Horn Scan', key: 'settings.io.extHornScan' },
  { value: 'displayLock', label: 'Display Lock', key: 'settings.io.displayLock' },
  { value: 'cableDetect', label: 'Cable Detect', key: 'settings.io.cableDetect' }
];

const ioConfigurationDigitalOutputOptions = [
  { value: 'unassign', label: 'UNASSIGN', key: 'settings.io.unassign' },
  { value: 'ready', label: 'Ready', key: 'settings.io.ready' },
  { value: 'sonicsActive', label: 'Sonics Active', key: 'settings.io.sonicsActiveLabel' },
  { value: 'generalAlarm', label: 'General Alarm', key: 'settings.io.generalAlarmLabel' },
  { value: 'overloadAlarm', label: 'Overload Alarm', key: 'settings.io.overloadAlarm' },
  { value: 'seekScanOut', label: 'Seek/Scan Out', key: 'settings.io.seekScanOut' }
];

const ioConfigurationAnalogInputOptions = [
  { value: 'unassign', label: 'UNASSIGN', key: 'settings.io.unassign' },
  { value: 'amplitudeIn', label: 'Amplitude In', key: 'settings.io.amplitudeInShort' },
  { value: 'frequencyOffset', label: 'Frequency Offset', key: 'settings.io.frequencyOffsetShort' }
];

const ioConfigurationAnalogOutputOptions = [
  { value: 'unassign', label: 'UNASSIGN', key: 'settings.io.unassign' },
  { value: 'frequencyOut', label: 'Frequency Out', key: 'settings.io.frequencyOut' },
  { value: 'powerOut', label: 'Power Out', key: 'settings.io.powerOutShort' },
  { value: 'amplitudeOut', label: 'Amplitude Out', key: 'settings.io.amplitudeOutShort' }
];

const ioConfigurationDigitalInputs = [
  { pin: 'J3 - 1', checkboxId: 'settings-io-config-input-1-enabled', selectId: 'settings-io-config-input-1-select', voltageName: 'settings-io-config-input-1-voltage', defaultValue: 'externalStart' },
  { pin: 'J3 - 2', checkboxId: 'settings-io-config-input-2-enabled', selectId: 'settings-io-config-input-2-select', voltageName: 'settings-io-config-input-2-voltage', defaultValue: 'externalSeek' },
  { pin: 'J3 - 3', checkboxId: 'settings-io-config-input-3-enabled', selectId: 'settings-io-config-input-3-select', voltageName: 'settings-io-config-input-3-voltage', defaultValue: 'externalReset' },
  { pin: 'J3 - 4', checkboxId: 'settings-io-config-input-4-enabled', selectId: 'settings-io-config-input-4-select', voltageName: 'settings-io-config-input-4-voltage', defaultValue: 'memoryClear' }
];

const ioConfigurationDigitalOutputs = [
  { pin: 'J3 - 7', checkboxId: 'settings-io-config-output-7-enabled', selectId: 'settings-io-config-output-7-select', voltageName: 'settings-io-config-output-7-voltage', defaultValue: 'ready' },
  { pin: 'J3 - 8', checkboxId: 'settings-io-config-output-8-enabled', selectId: 'settings-io-config-output-8-select', voltageName: 'settings-io-config-output-8-voltage', defaultValue: 'sonicsActive' },
  { pin: 'J3 - 9', checkboxId: 'settings-io-config-output-9-enabled', selectId: 'settings-io-config-output-9-select', voltageName: 'settings-io-config-output-9-voltage', defaultValue: 'generalAlarm' },
  { pin: 'J3 - 10', checkboxId: 'settings-io-config-output-10-enabled', selectId: 'settings-io-config-output-10-select', voltageName: 'settings-io-config-output-10-voltage', defaultValue: 'seekScanOut' }
];

const ioConfigurationAnalogInputs = [
  { pin: 'J3 - 17', checkboxId: 'settings-io-config-analog-input-17-enabled', selectId: 'settings-io-config-analog-input-17-select', defaultValue: 'amplitudeIn' },
  { pin: 'J3 - 18', checkboxId: 'settings-io-config-analog-input-18-enabled', selectId: 'settings-io-config-analog-input-18-select', defaultValue: 'frequencyOffset' }
];

const ioConfigurationAnalogOutputs = [
  { pin: 'J3 - 24', checkboxId: 'settings-io-config-analog-output-24-enabled', selectId: 'settings-io-config-analog-output-24-select', defaultValue: 'frequencyOut' },
  { pin: 'J3 - 25', checkboxId: 'settings-io-config-analog-output-25-enabled', selectId: 'settings-io-config-analog-output-25-select', defaultValue: 'amplitudeOut' }
];

const weldSignatureStatusItems = [
  { id: 'settings-signature-status-seek', label: 'Seek', key: 'settings.signature.seek' }
];

const signatureResultItems = [
  { id: 'settings-signature-result-stored', label: 'OK-Memory Stored', key: 'settings.signature.okStored' },
  { id: 'settings-signature-result-overload', label: 'Overload-Cleared', key: 'settings.signature.overloadCleared' }
];

const hornSignatureStatusItems = [
  { id: 'settings-signature-status-passed', label: 'Passed', key: 'settings.signature.passed' },
  { id: 'settings-signature-status-failed', label: 'Failed', key: 'settings.signature.failed' },
  { id: 'settings-signature-status-aborted', label: 'Aborted', key: 'settings.signature.aborted' }
];

const signatureMeterItems = [
  { id: 'settings-signature-meter-frequency', label: 'Frequency', key: 'settings.signature.frequency', meterMode: 'marker', valueId: 'settings-signature-frequency', value: '--' },
  { id: 'settings-signature-meter-memory', label: 'Memory', key: 'settings.signature.memory', meterMode: 'marker', valueId: 'settings-signature-memory', value: '0' },
  { id: 'settings-signature-meter-amplitude', label: 'Amplitude', key: 'settings.signature.amplitude', meterMode: 'fill', valueId: 'settings-signature-amplitude', value: '--' },
  { id: 'settings-signature-meter-power', label: 'Power', key: 'settings.signature.power', meterMode: 'fill', valueId: 'settings-signature-power', value: '--' }
];

const signatureSeriesOptions = [
  { id: 'settings-signature-series-amplitude', value: 'amplitude', label: 'Amplitude', key: 'settings.signature.amplitude', defaultChecked: true },
  { id: 'settings-signature-series-power', value: 'power', label: 'Power', key: 'settings.signature.power', defaultChecked: true },
  { id: 'settings-signature-series-phase', value: 'phase', label: 'Phase', key: 'settings.signature.phase', defaultChecked: true },
  { id: 'settings-signature-series-current', value: 'current', label: 'Current', key: 'settings.signature.current', defaultChecked: true },
  { id: 'settings-signature-series-pwm-amplitude', value: 'pwmAmplitude', label: 'PWM Amplitude', key: 'settings.signature.pwmAmplitude', defaultChecked: true },
  { id: 'settings-signature-series-frequency', value: 'frequency', label: 'Frequency', key: 'settings.signature.frequency', defaultChecked: true }
];

const systemInfoRows = [
  { id: 'settings-system-model', field: 'system', label: 'System', key: 'settings.systemInfo.system', value: '--' },
  { id: 'settings-system-display', field: 'display', label: 'Display', key: 'settings.systemInfo.display', value: '--' },
  { id: 'settings-system-software-version', field: 'softwareVersion', label: 'Software Version', key: 'settings.systemInfo.softwareVersion', value: '--' },
  { id: 'settings-system-version', field: 'systemVersion', label: 'System Version', key: 'settings.systemInfo.systemVersion', value: '--' },
  { id: 'settings-system-fpga-version', field: 'fpgaVersion', label: 'FPGA Version', key: 'settings.systemInfo.fpgaVersion', value: '--' },
  { id: 'settings-system-dcx-crc', field: 'dcxCrc', label: 'DCX CRC', key: 'settings.systemInfo.dcxCrc', value: '--' },
  { id: 'settings-system-system-crc', field: 'systemCrc', label: 'System CRC', key: 'settings.systemInfo.systemCrc', value: '--' },
  { id: 'settings-system-serial-number', field: 'serialNumber', label: 'Serial Number', key: 'settings.systemInfo.serialNumber', value: '--' },
  { id: 'settings-system-spec-password', field: 'specPassword', label: 'Spec Password', key: 'settings.systemInfo.specPassword', value: '--' },
  { id: 'settings-system-spec-password-enabled', field: 'specPasswordEnabled', label: 'Spec Password Enabled', key: 'settings.systemInfo.specPasswordEnabled', value: '--' }
];

const powerSupplyRows = [
  { id: 'settings-power-level', field: 'powerLevel', label: 'Power Level', key: 'settings.systemInfo.powerLevel', value: '--' },
  { id: 'settings-power-frequency', field: 'frequency', label: 'Frequency', key: 'settings.systemInfo.frequency', value: '--' },
  { id: 'settings-power-lifetime-cycles', field: 'lifetimeCycles', label: 'Lifetime Cycles', key: 'settings.systemInfo.lifetimeCycles', value: '--' },
  { id: 'settings-power-general-alarms', field: 'generalAlarms', label: 'General Alarms', key: 'settings.systemInfo.generalAlarms', value: '--' },
  { id: 'settings-power-hours-of-sonics', field: 'hoursOfSonics', label: 'Hours of Sonics', key: 'settings.systemInfo.hoursOfSonics', value: '--' },
  { id: 'settings-power-on-hours', field: 'powerOnHours', label: 'Power-On Hours', key: 'settings.systemInfo.powerOnHours', value: '--' }
];

const gettingStartedItems = [
  { title: 'Connect', titleKey: 'settings.docs.start.connectTitle', body: 'Choose Direct HTTP, Teensy Serial, or Simulation in the connection area, then initialize the device.', bodyKey: 'settings.docs.start.connectBody' },
  { title: 'Check Status', titleKey: 'settings.docs.start.statusTitle', body: 'Open the Dashboard to confirm live values, indicators, and connection state before running anything.', bodyKey: 'settings.docs.start.statusBody' },
  { title: 'Run Manually', titleKey: 'settings.docs.start.manualTitle', body: 'Use Start, Stop, Seek, Reset, and the amplitude target for quick manual control.', bodyKey: 'settings.docs.start.manualBody' },
  { title: 'Use Methods', titleKey: 'settings.docs.start.methodsTitle', body: 'Move to Sequence or Workflow when you want repeatable test routines instead of one-off manual actions.', bodyKey: 'settings.docs.start.methodsBody' }
];

const manualControlItems = [
  { title: 'Amplitude Target', titleKey: 'settings.docs.manual.amplitudeTitle', body: 'Set the amplitude target before pressing Start so the next weld begins with the expected output level.', bodyKey: 'settings.docs.manual.amplitudeBody' },
  { title: 'Start / Stop', titleKey: 'settings.docs.manual.startStopTitle', body: 'Use Start to begin sonics and Stop to end the current run immediately.', bodyKey: 'settings.docs.manual.startStopBody' },
  { title: 'Seek', titleKey: 'settings.docs.manual.seekTitle', body: 'Use Seek to run a tuning cycle or begin a horn signature scan.', bodyKey: 'settings.docs.manual.seekBody' },
  { title: 'Reset', titleKey: 'settings.docs.manual.resetTitle', body: 'Use Reset after an alarm or overload condition to clear the controller state before running again.', bodyKey: 'settings.docs.manual.resetBody' }
];

const sequenceWorkflowItems = [
  { title: 'Sequence', titleKey: 'settings.docs.methods.sequenceTitle', body: 'Use the Sequence view to build timed pulse and pause blocks with configurable amplitudes and ramps.', bodyKey: 'settings.docs.methods.sequenceBody' },
  { title: 'Workflow', titleKey: 'settings.docs.methods.workflowTitle', body: 'Use the Workflow view for step-by-step procedures that combine start, stop, seek, reset, waits, and amplitude changes.', bodyKey: 'settings.docs.methods.workflowBody' },
  { title: 'Review', titleKey: 'settings.docs.methods.reviewTitle', body: 'Use Alarm Log and System Output in Settings to review what happened during a run.', bodyKey: 'settings.docs.methods.reviewBody' }
];

const documentationLimitRows = [
  { label: 'The memory wipe button is visible but not available yet.', key: 'settings.docs.limits.clearMemory' },
  { label: 'Some System tab identification fields are placeholders until device readback is connected.', key: 'settings.docs.limits.systemMetadata' },
  { label: 'Some advanced signature traces may stay empty until the controller provides those measurements.', key: 'settings.docs.limits.advancedTelemetry' }
];

const documentationMetadataItems = [
  { label: 'Document Type', labelKey: 'settings.docs.meta.docType', value: 'Operator Guide', valueKey: 'settings.docs.meta.docTypeValue' },
  { label: 'Control Policy', labelKey: 'settings.docs.meta.controlPolicy', value: 'Sonics routed through Teensy', valueKey: 'settings.docs.meta.controlPolicyValue' },
  { label: 'Hardware Mode', labelKey: 'settings.docs.meta.hardwareMode', value: 'Branson HTTP + Teensy Serial', valueKey: 'settings.docs.meta.hardwareModeValue' },
  { label: 'Simulation Mode', labelKey: 'settings.docs.meta.simulationMode', value: 'Internal software model', valueKey: 'settings.docs.meta.simulationModeValue' }
];

const documentationNoticeItems = [
  { title: 'Hardware Mode', titleKey: 'settings.docs.notice.hardwareTitle', body: 'Hardware mode initializes the Branson controller and the Teensy interface together before operation.', bodyKey: 'settings.docs.notice.hardwareBody' },
  { title: 'Sonics Control', titleKey: 'settings.docs.notice.sonicsTitle', body: 'Start and Stop sonics are intentionally issued only through Teensy commands START and STOP.', bodyKey: 'settings.docs.notice.sonicsBody' },
  { title: 'Branson Functions', titleKey: 'settings.docs.notice.bransonTitle', body: 'Status readback, seek, reset, and parameter writes remain on the Branson HTTP control path.', bodyKey: 'settings.docs.notice.bransonBody' }
];

const transportModeItems = [
  { title: 'Branson HTTP', titleKey: 'settings.docs.transports.httpTitle', body: 'Handles status readback, seek, reset, and parameter writes through Branson function/cmd endpoints.', bodyKey: 'settings.docs.transports.httpBody', mapping: 'HTTP function/cmd' },
  { title: 'Teensy Serial', titleKey: 'settings.docs.transports.serialTitle', body: 'Handles sonics enable commands in hardware mode by sending START and STOP to the Teensy.', bodyKey: 'settings.docs.transports.serialBody', mapping: 'Serial START / STOP' },
  { title: 'Simulation', titleKey: 'settings.docs.transports.simTitle', body: 'Simulates telemetry and state changes for safe UI validation without live hardware.', bodyKey: 'settings.docs.transports.simBody', mapping: 'Software simulation' }
];

const workflowCommandRows = [
  { command: 'START [0-100]', detail: 'Start sonics with optional amplitude input.', detailKey: 'settings.docs.workflow.start' },
  { command: 'STOP', detail: 'Stop sonics immediately.', detailKey: 'settings.docs.workflow.stop' },
  { command: 'SET_AMP [0-100]', detail: 'Update weld amplitude before the next weld.', detailKey: 'settings.docs.workflow.setAmp' },
  { command: 'SEEK', detail: 'Run a seek cycle / horn scan.', detailKey: 'settings.docs.workflow.seek' },
  { command: 'RESET', detail: 'Clear active alarms.', detailKey: 'settings.docs.workflow.reset' },
  { command: 'WAIT [ms]', detail: 'Pause for a duration in milliseconds.', detailKey: 'settings.docs.workflow.wait' },
  { command: 'FLASH', detail: 'Flash the Teensy with the firmware selected in Settings.', detailKey: 'settings.docs.workflow.flash' }
];

const teensyStatusInputRows = [
  { pin: 'PIN0', signal: 'DO_GENERAL_ALARM', role: 'HIGH indicates an alarm occurred.' },
  { pin: 'PIN1', signal: 'DO_SEEKSCAN_OUT', role: 'HIGH indicates a seek or scan is in progress.' },
  { pin: 'PIN14', signal: 'DO_READY', role: 'HIGH indicates the system is ready.' },
  { pin: 'PIN15', signal: 'DO_SONICS_ACTIVE', role: 'HIGH indicates ultrasonics are active.' }
];

const teensyControlOutputRows = [
  { pin: 'PIN7', signal: 'DI_EXT_START', role: 'HIGH turns ultrasonics on when K5 is in its default LOW state.' },
  { pin: 'PIN8', signal: 'DI_EXT_SEEK', role: 'HIGH performs a seek.' },
  { pin: 'PIN20', signal: 'DI_EXT_RESET', role: 'HIGH resets an alarm.' },
  { pin: 'PIN21', signal: 'DI_EXT_CLEAR', role: 'HIGH clears memory.' },
  { pin: 'PIN22', signal: 'DI_MEMORY_CLEAR', role: 'HIGH clears memory.' },
  { pin: 'PIN40', signal: 'PROGRAM_OPTO', role: 'HIGH requests Teensy reprogramming in hardware.' }
];

const teensyAuxOutputRows = [
  { pin: 'PIN24', signal: 'DI_RELAY_K6', role: 'HIGH switches the amplitude source to external.' },
  { pin: 'PIN25', signal: 'DI_RELAY_K5', role: 'LOW is the default state used to start ultrasonics with DI_EXT_START HIGH.' },
  { pin: 'PIN26', signal: 'READY_LED_2', role: 'LOW when the system is ready.' },
  { pin: 'PIN27', signal: 'READY_LED_1', role: 'HIGH when the system is ready.' },
  { pin: 'PIN38', signal: 'SONICS_ACTIVE_LED_2', role: 'LOW when ultrasonics are active.' },
  { pin: 'PIN39', signal: 'SONICS_ACTIVE_LED_1', role: 'HIGH when ultrasonics are active.' }
];

const teensyI2cRows = [
  { pin: 'PIN16', signal: 'SCL1', role: 'MCP4728 SCL.' },
  { pin: 'PIN17', signal: 'SDA1', role: 'MCP4728 SDA.' },
  { pin: 'PIN18', signal: 'SDA', role: 'ADS1015 SDA.' },
  { pin: 'PIN19', signal: 'SCL', role: 'ADS1015 SCL.' }
];

const teensyDacRows = [
  { pin: 'VOUTA', signal: 'MCP4728', role: 'Amplitude control.' },
  { pin: 'VOUTB', signal: 'MCP4728', role: 'Frequency offset control.' },
  { pin: 'VOUTC', signal: 'MCP4728', role: 'BNC 6.' },
  { pin: 'VOUTD', signal: 'MCP4728', role: 'BNC 8.' }
];

const teensyAdcRows = [
  { pin: 'AIN0', signal: 'ADS1015', role: 'FREQUENCY_OUT.' },
  { pin: 'AIN1', signal: 'ADS1015', role: 'AMPLITUDE_OUT.' },
  { pin: 'AIN2', signal: 'ADS1015', role: 'BNC 1.' },
  { pin: 'AIN3', signal: 'ADS1015', role: 'BNC 5.' }
];

function RoutingField({ id, label }) {
  return (
    <FormField label={label} labelKey={id.replace('route-', 'settings.routing.')}>
      <NativeSelect defaultValue="mode" id={id}>
        <option data-i18n="settings.routing.followMainMode" value="mode">Follow Main Mode</option>
        <option data-i18n="settings.routing.ethernet" value="http">Ethernet (DCX)</option>
        <option data-i18n="settings.routing.serial" value="serial">Teensy (Serial)</option>
      </NativeSelect>
    </FormField>
  );
}

function IoPanel({ title, translationKey, children }) {
  return (
    <section className="io-panel">
      <h3 className="io-panel-title" data-i18n={translationKey}>{title}</h3>
      <div className="io-panel-body">{children}</div>
    </section>
  );
}

function IoDigitalRow({ indicatorId, label, pin, translationKey, type = 'dot' }) {
  return (
    <div className="io-channel io-channel-digital">
      <span aria-hidden="true" className={type === 'checkbox' ? 'io-checkbox' : 'io-pin-indicator'} id={indicatorId} />
      <span className="io-pin">{pin}</span>
      <span className="io-label" data-i18n={translationKey}>{label}</span>
    </div>
  );
}

function IoAnalogRow({ label, pin, translationKey, value, valueId }) {
  return (
    <div className="io-channel io-channel-analog">
      <span className="io-pin">{pin}</span>
      <span className="io-label" data-i18n={translationKey}>{label}</span>
      <span className="io-reading" id={valueId}>{value}</span>
    </div>
  );
}

function IoSubTabButton({ active = false, id, label, translationKey }) {
  return (
    <Button
      className={active ? 'active flex-1 sm:flex-none' : 'flex-1 text-muted-foreground sm:flex-none'}
      data-io-subtab={id}
      id={`settings-io-subtab-${id}`}
      size="sm"
      type="button"
      variant="ghost"
    >
      <span data-i18n={translationKey}>{label}</span>
    </Button>
  );
}

function IoConfigurationSection({ children, title, translationKey }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-background/55 p-4 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)]">
      <div className="space-y-4">
        <h3 className="text-[1.6rem] font-semibold uppercase tracking-[0.05em] text-foreground" data-i18n={translationKey}>{title}</h3>
        <div className="grid gap-4">{children}</div>
      </div>
    </section>
  );
}

function IoVoltageOption({ defaultChecked = false, id, label, name, value }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-foreground/88">
      <input className="size-4 accent-primary" defaultChecked={defaultChecked} id={id} name={name} type="radio" value={value} />
      <span>{label}</span>
    </label>
  );
}

function IoConfigurationDigitalRow({ checkboxId, defaultValue, options, pin, selectId, voltageName }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/78 px-4 py-3 shadow-sm">
      <div className="grid grid-cols-[4.75rem_1.25rem_minmax(0,1fr)_auto] items-center gap-3">
        <div className="text-sm font-semibold uppercase tracking-[0.08em] text-foreground">{pin}</div>
        <input className="size-4 accent-primary" defaultChecked id={checkboxId} type="checkbox" />
        <NativeSelect className="h-9 w-full bg-background" defaultValue={defaultValue} id={selectId}>
          {options.map((option) => (
            <option data-i18n={option.key} key={option.value} value={option.value}>{option.label}</option>
          ))}
        </NativeSelect>
        <div className="flex items-center justify-end gap-4 whitespace-nowrap">
          <IoVoltageOption id={`${checkboxId}-0v`} label="0 V" name={voltageName} value="0" />
          <IoVoltageOption defaultChecked id={`${checkboxId}-24v`} label="24 V" name={voltageName} value="24" />
        </div>
      </div>
    </div>
  );
}

function IoConfigurationAnalogRow({ checkboxId, defaultValue, options, pin, selectId }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/78 px-4 py-3 shadow-sm">
      <div className="grid grid-cols-[4.75rem_1.25rem_minmax(0,1fr)] items-center gap-3">
        <div className="text-sm font-semibold uppercase tracking-[0.08em] text-foreground">{pin}</div>
        <input className="size-4 accent-primary" defaultChecked id={checkboxId} type="checkbox" />
        <NativeSelect className="h-9 w-full bg-background" defaultValue={defaultValue} id={selectId}>
          {options.map((option) => (
            <option data-i18n={option.key} key={option.value} value={option.value}>{option.label}</option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}

function SignatureIndicatorRow({ indicatorId, label, translationKey }) {
  return (
    <div className="signature-indicator-row">
      <span aria-hidden="true" className="signature-indicator-dot" id={indicatorId} />
      <span className="signature-indicator-label" data-i18n={translationKey}>{label}</span>
    </div>
  );
}

function SignatureMeterRow({ labelId, meterId, meterMode = 'fill', label, translationKey, valueId, value }) {
  return (
    <div className={`signature-meter-row signature-meter-row-${meterMode}`}>
      <span className="signature-meter-label" data-i18n={translationKey} id={labelId}>{label}</span>
      <div className="signature-meter-track">
        <div className="signature-meter-fill" data-meter-mode={meterMode} id={meterId} />
      </div>
      <span className="signature-meter-value" id={valueId}>{value}</span>
    </div>
  );
}

function SignatureSeriesToggle({ defaultChecked, id, label, translationKey, value }) {
  return (
    <label className="signature-series-toggle" data-signature-series-option={value}>
      <input data-signature-series={value} defaultChecked={defaultChecked} id={id} type="checkbox" />
      <span data-i18n={translationKey}>{label}</span>
    </label>
  );
}

function SystemInfoPanel({ rows, title, translationKey }) {
  return (
    <section className="system-info-panel">
      <h3 className="system-info-title" data-i18n={translationKey}>{title}</h3>
      <div className="system-info-body">
        {rows.map((row) => (
            <div className="system-info-row" key={row.id}>
              <span className="system-info-label" data-i18n={row.key}>{row.label}</span>
              <span className="system-info-value" data-default-value={row.value} data-system-info-field={row.field} id={row.id}>{row.value}</span>
            </div>
          ))}
        </div>
    </section>
  );
}

function DocumentationCard({ children, description, descriptionKey, title, translationKey }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)]">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground" data-i18n={translationKey}>{title}</h3>
        {description ? <p className="text-sm text-muted-foreground" data-i18n={descriptionKey}>{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DocumentationMetaItem({ label, labelKey, value, valueKey }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/72 px-3 py-2">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground" data-i18n={labelKey}>{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground" data-i18n={valueKey}>{value}</div>
    </div>
  );
}

function DocumentationProcedureStep({ body, bodyKey, index, title, titleKey }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl border border-border/60 bg-background/72 p-3">
      <div className="flex size-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-sm font-semibold text-primary">
        {index}
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground" data-i18n={titleKey}>{title}</div>
        <p className="mt-1 text-sm text-muted-foreground" data-i18n={bodyKey}>{body}</p>
      </div>
    </div>
  );
}

function PinoutSection({ rows, title, translationKey }) {
  return (
    <section className="rounded-xl border border-border/60 bg-background/72 p-3">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground" data-i18n={translationKey}>{title}</div>
      <div className="mt-3 data-table-shell overflow-x-auto rounded-lg border border-border/50 bg-background/70">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-28" data-i18n="settings.docs.columns.pin">Pin / Channel</th>
              <th className="w-48" data-i18n="settings.docs.columns.signal">Signal</th>
              <th data-i18n="settings.docs.columns.role">Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${title}-${row.pin}-${row.signal}`}>
                <td><code>{row.pin}</code></td>
                <td><code>{row.signal}</code></td>
                <td className="text-muted-foreground">{row.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SettingsTabButton({ id, label, translationKey, active = false }) {
  return (
    <Button
      className={active ? 'active flex-1 sm:flex-none' : 'flex-1 text-muted-foreground sm:flex-none'}
      data-settings-tab={id}
      id={`settings-tab-${id}`}
      size="sm"
      type="button"
      variant="ghost"
    >
      <span data-i18n={translationKey}>{label}</span>
    </Button>
  );
}

function SetupSection({ children, className = '', title, translationKey }) {
  return (
    <section className={`rounded-xl border border-border/70 bg-background/55 p-4 ${className}`.trim()}>
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-foreground" data-i18n={translationKey}>{title}</h3>
        {children}
      </div>
    </section>
  );
}

function SetupToggle({ defaultChecked = false, id, label, name = undefined, translationKey, type = 'checkbox' }) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/72 px-3 py-2 text-sm text-foreground">
      <input
        className="size-4 border-input bg-background accent-primary"
        defaultChecked={defaultChecked}
        id={id}
        name={name}
        type={type}
      />
      <span data-i18n={translationKey}>{label}</span>
    </label>
  );
}

function SetupNumericField({ defaultValue, id, indicatorId, label, labelKey, ...props }) {
  return (
    <FormField label={label} labelKey={labelKey}>
      <div className="space-y-2">
        <Input defaultValue={defaultValue} id={id} {...props} />
        <p className="text-xs text-muted-foreground" id={indicatorId} />
      </div>
    </FormField>
  );
}

export function SettingsView(authProps) {
  return (
    <main className="content px-3 py-3 pb-4 lg:px-4 lg:py-4 lg:pb-6" id="settings">
      <div className="grid min-w-0 gap-4">
        <Card className="min-w-0 overflow-hidden border-border/70 bg-background/80">
          <CardHeader className="border-b border-border/70">
            <CardTitle data-i18n="views.settings">Settings</CardTitle>
            <CardDescription data-i18n="settings.description">Organize system preferences, I/O routing and monitoring, signature plots, and alarm history in one workspace.</CardDescription>
          </CardHeader>

          <CardContent className="min-w-0 space-y-4 p-4 lg:p-5">
            <div className="settings-tab-switch flex flex-wrap gap-1 rounded-xl border border-border/70 bg-background/70 p-1">
              <SettingsTabButton active id="system" label="System" translationKey="settings.tabs.system" />
              <SettingsTabButton id="setup" label="Setup" translationKey="settings.tabs.setup" />
              <SettingsTabButton id="io" label="I/O Configuration" translationKey="settings.tabs.io" />
              <SettingsTabButton id="signature" label="Seek & Horn Signature" translationKey="settings.tabs.signature" />
              <SettingsTabButton id="alarms" label="Alarm Log" translationKey="settings.tabs.alarms" />
              <SettingsTabButton id="docs" label="Help & Docs" translationKey="settings.tabs.docs" />
            </div>

            <section className="grid gap-4" data-settings-panel="system" id="settings-panel-system">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle data-i18n="settings.preferences.title">Preferences</CardTitle>
                  <CardDescription data-i18n="settings.preferences.description">Choose the application language and visual theme.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Language" labelKey="settings.language">
                    <NativeSelect defaultValue="en" id="ui-language">
                      <option data-i18n="settings.language.english" value="en">English</option>
                      <option data-i18n="settings.language.french" value="fr">French</option>
                    </NativeSelect>
                  </FormField>
                  <FormField label="Theme Mode" labelKey="settings.theme">
                    <NativeSelect defaultValue="dark" id="ui-theme-mode">
                      <option data-i18n="settings.theme.dark" value="dark">Dark</option>
                      <option data-i18n="settings.theme.light" value="light">Light</option>
                      <option data-i18n="settings.theme.system" value="system">System</option>
                    </NativeSelect>
                  </FormField>
                </CardContent>
              </Card>

              <AuthSettingsPanel {...authProps} />

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle data-i18n="settings.system.title">System Maintenance</CardTitle>
                  <CardDescription data-i18n="settings.system.description">Run operator-side maintenance actions for the connected controller.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
                    <FormField label="Teensy Loader CLI" labelKey="settings.teensyFlash.loader">
                      <div className="grid gap-2">
                        <Input data-i18n-placeholder="settings.teensyFlash.loaderPlaceholder" id="settings-teensy-loader-path" placeholder="Use teensy_loader_cli.exe from PATH or select an executable" readOnly type="text" />
                        <Button className="w-full sm:w-auto" data-i18n="settings.teensyFlash.selectLoader" id="settings-teensy-loader-btn" size="sm" type="button" variant="outline">
                          Select CLI...
                        </Button>
                      </div>
                    </FormField>

                    <FormField label="Firmware (.hex)" labelKey="settings.teensyFlash.firmware">
                      <div className="grid gap-2">
                        <Input data-i18n-placeholder="settings.teensyFlash.firmwarePlaceholder" id="settings-teensy-firmware-path" placeholder="Select a Teensy firmware .hex file" readOnly type="text" />
                        <Button className="w-full sm:w-auto" data-i18n="settings.teensyFlash.selectFirmware" id="settings-teensy-firmware-btn" size="sm" type="button" variant="outline">
                          Select Firmware...
                        </Button>
                      </div>
                    </FormField>

                    <div className="flex flex-col gap-2 xl:items-end">
                      <Button className="w-full sm:w-auto" data-i18n="settings.teensyFlash.flash" id="settings-teensy-flash-btn" type="button">
                        Flash Teensy
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-sm font-medium text-primary" id="settings-teensy-flash-status">Select a .hex firmware file to enable Teensy flashing.</div>
                    <div className="text-xs text-muted-foreground" data-i18n="settings.teensyFlash.hint" id="settings-teensy-flash-hint">The sequence flash-before-run option and workflow FLASH command use the firmware selected here.</div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
                    <Button className="w-full sm:w-auto" data-i18n="settings.buttons.restoreFactorySettings" id="restore-factory-settings-btn" variant="outline">
                      Restore Factory Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle data-i18n="settings.systemInfo.title">System Information</CardTitle>
                  <CardDescription data-i18n="settings.systemInfo.description">Review controller and power-supply identification details at a glance.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-5 xl:grid-cols-2">
                    <SystemInfoPanel rows={systemInfoRows} title="System" translationKey="settings.systemInfo.systemPanel" />
                    <SystemInfoPanel rows={powerSupplyRows} title="Power Supply" translationKey="settings.systemInfo.powerSupplyPanel" />
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="hidden grid gap-4" data-settings-panel="setup" id="settings-panel-setup">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle data-i18n="settings.setup.title">Generator Setup</CardTitle>
                  <CardDescription data-i18n="settings.setup.description">Adjust amplitude, frequency, seek, and power-on defaults from one setup workspace.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <SetupSection title="Amplitude" translationKey="settings.setup.sections.amplitude">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SetupNumericField defaultValue="80" id="settings-setup-amplitude-ramp" indicatorId="settings-setup-amplitude-ramp-range" label="Amplitude Ramp (ms)" labelKey="settings.setup.amplitudeRamp" min="0" step="1" type="number" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <SetupToggle id="settings-setup-amplitude-external" label="External" translationKey="settings.setup.external" />
                      </div>
                    </SetupSection>

                    <SetupSection title="MISC SETUP" translationKey="settings.setup.sections.misc">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <SetupToggle defaultChecked id="settings-setup-alarms-reset-required" label="Alarms - Reset Required" translationKey="settings.setup.alarmsResetRequired" />
                      </div>
                    </SetupSection>

                    <SetupSection className="xl:col-span-2" title="Frequency" translationKey="settings.setup.sections.frequency">
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        <SetupNumericField defaultValue="39900" id="settings-setup-digital-tune" indicatorId="settings-setup-digital-tune-range" label="Digital Tune (Hz)" labelKey="settings.setup.digitalTune" step="1" type="number" />
                        <SetupNumericField defaultValue="0" id="settings-setup-internal-offset" indicatorId="settings-setup-internal-offset-range" label="Internal Offset (Hz)" labelKey="settings.setup.internalOffset" step="1" type="number" />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <SetupToggle id="settings-setup-external-offset" label="External Offset" translationKey="settings.setup.externalOffset" />
                        <SetupToggle defaultChecked id="settings-setup-end-of-weld-store" label="End of Weld Store" translationKey="settings.setup.endOfWeldStore" />
                        <SetupToggle id="settings-setup-clear-memory-reset" label="Clear memory with Reset" translationKey="settings.setup.clearMemoryWithReset" />
                        <SetupToggle defaultChecked id="settings-setup-clear-memory-seek" label="Clear memory before Seek" translationKey="settings.setup.clearMemoryBeforeSeek" />
                        <SetupToggle id="settings-setup-set-with-horn-scan" label="Set with Horn Scan" translationKey="settings.setup.setWithHornScan" />
                      </div>
                    </SetupSection>

                    <SetupSection title="SEEK" translationKey="settings.setup.sections.seek">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SetupNumericField defaultValue="80" id="settings-setup-seek-ramp" indicatorId="settings-setup-seek-ramp-range" label="Seek Ramp (ms)" labelKey="settings.setup.seekRamp" min="0" step="1" type="number" />
                        <SetupNumericField defaultValue="500" id="settings-setup-seek-time" indicatorId="settings-setup-seek-time-range" label="Seek Time (ms)" labelKey="settings.setup.seekTime" min="0" step="1" type="number" />
                        <SetupNumericField defaultValue="0" id="settings-setup-seek-frequency-offset" indicatorId="settings-setup-seek-frequency-offset-range" label="Frequency Offset (Hz)" labelKey="settings.setup.frequencyOffset" step="1" type="number" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <SetupToggle id="settings-setup-timed-seek" label="Timed Seek" translationKey="settings.setup.timedSeek" />
                      </div>
                    </SetupSection>

                    <SetupSection title="POWER ON" translationKey="settings.setup.sections.powerOn">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <SetupToggle defaultChecked id="settings-setup-power-on-off" label="Off" name="settings-setup-power-on" translationKey="settings.setup.off" type="radio" />
                        <SetupToggle id="settings-setup-power-on-seek" label="Seek" name="settings-setup-power-on" translationKey="settings.setup.seek" type="radio" />
                        <SetupToggle id="settings-setup-power-on-scan" label="Scan" name="settings-setup-power-on" translationKey="settings.setup.scan" type="radio" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <SetupToggle defaultChecked id="settings-setup-power-on-clear-memory" label="Clear Memory" translationKey="settings.setup.clearMemory" />
                      </div>
                    </SetupSection>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-border/70 pt-4">
                    <Button data-i18n="settings.setup.restoreDefaults" id="settings-setup-restore-defaults-btn" size="sm" type="button" variant="outline">
                      Restore to Defaults
                    </Button>
                    <Button data-i18n="settings.setup.cancel" id="settings-setup-cancel-btn" size="sm" type="button" variant="outline">
                      Cancel
                    </Button>
                    <Button data-i18n="settings.setup.save" id="settings-setup-save-btn" size="sm" type="button">
                      Save
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="hidden grid gap-4" data-settings-panel="io" id="settings-panel-io">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle data-i18n="settings.io.title">I/O Configuration</CardTitle>
                  <CardDescription data-i18n="settings.io.description">Keep routing controls and live DCX I/O in one view.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6">
                  <div className="settings-tab-switch flex flex-wrap gap-1 rounded-xl border border-border/70 bg-background/70 p-1">
                    <IoSubTabButton active id="diagnostic" label="Diagnostic" translationKey="settings.io.diagnostic" />
                    <IoSubTabButton id="configuration" label="Configuration" translationKey="settings.io.configuration" />
                  </div>

                  <div className="grid gap-6" data-io-subtab-panel="diagnostic">
                    <section className="grid gap-4 rounded-xl border border-border/70 bg-background/55 p-4">
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold text-foreground" data-i18n="settings.routing.title">Control Routing</h3>
                        <p className="text-sm text-muted-foreground" data-i18n="settings.routing.description">Delegate each command family to Ethernet, serial, or the main mode.</p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        <RoutingField id="route-amplitude" label="Amplitude Control" />
                        <RoutingField id="route-seek" label="Seek / Tune" />
                        <RoutingField id="route-reset" label="Alarm Reset" />
                      </div>
                    </section>

                    <div className="io-grid">
                      <IoPanel title="Digital Inputs" translationKey="settings.io.digitalInputs">
                        {ioDigitalInputs.map((channel) => (
                          <IoDigitalRow indicatorId={channel.id} key={channel.pin} label={channel.label} pin={channel.pin} translationKey={channel.key} type="checkbox" />
                        ))}
                      </IoPanel>

                      <IoPanel title="Digital Outputs" translationKey="settings.io.digitalOutputs">
                        {ioDigitalOutputs.map((channel) => (
                          <IoDigitalRow indicatorId={channel.id} key={channel.pin} label={channel.label} pin={channel.pin} translationKey={channel.key} type="checkbox" />
                        ))}
                      </IoPanel>

                      <IoPanel title="Analog Inputs" translationKey="settings.io.analogInputs">
                        {ioAnalogInputs.map((channel) => (
                          <IoAnalogRow key={channel.pin} label={channel.label} pin={channel.pin} translationKey={channel.key} value={channel.value} valueId={channel.valueId} />
                        ))}
                      </IoPanel>

                      <IoPanel title="Analog Outputs" translationKey="settings.io.analogOutputs">
                        {ioAnalogOutputs.map((channel) => (
                          <IoAnalogRow key={channel.pin} label={channel.label} pin={channel.pin} translationKey={channel.key} value={channel.value} valueId={channel.id} />
                        ))}
                      </IoPanel>
                    </div>
                  </div>

                  <div className="hidden grid gap-6" data-io-subtab-panel="configuration">
                    <div className="grid gap-6 lg:grid-cols-2">
                      <IoConfigurationSection title="Digital Inputs" translationKey="settings.io.digitalInputs">
                        {ioConfigurationDigitalInputs.map((channel) => (
                          <IoConfigurationDigitalRow
                            checkboxId={channel.checkboxId}
                            defaultValue={channel.defaultValue}
                            key={channel.pin}
                            options={ioConfigurationDigitalInputOptions}
                            pin={channel.pin}
                            selectId={channel.selectId}
                            voltageName={channel.voltageName}
                          />
                        ))}
                      </IoConfigurationSection>

                      <IoConfigurationSection title="Digital Outputs" translationKey="settings.io.digitalOutputs">
                        {ioConfigurationDigitalOutputs.map((channel) => (
                          <IoConfigurationDigitalRow
                            checkboxId={channel.checkboxId}
                            defaultValue={channel.defaultValue}
                            key={channel.pin}
                            options={ioConfigurationDigitalOutputOptions}
                            pin={channel.pin}
                            selectId={channel.selectId}
                            voltageName={channel.voltageName}
                          />
                        ))}
                      </IoConfigurationSection>

                      <IoConfigurationSection title="Analog Inputs" translationKey="settings.io.analogInputs">
                        {ioConfigurationAnalogInputs.map((channel) => (
                          <IoConfigurationAnalogRow
                            checkboxId={channel.checkboxId}
                            defaultValue={channel.defaultValue}
                            key={channel.pin}
                            options={ioConfigurationAnalogInputOptions}
                            pin={channel.pin}
                            selectId={channel.selectId}
                          />
                        ))}
                      </IoConfigurationSection>

                      <IoConfigurationSection title="Analog Outputs" translationKey="settings.io.analogOutputs">
                        {ioConfigurationAnalogOutputs.map((channel) => (
                          <IoConfigurationAnalogRow
                            checkboxId={channel.checkboxId}
                            defaultValue={channel.defaultValue}
                            key={channel.pin}
                            options={ioConfigurationAnalogOutputOptions}
                            pin={channel.pin}
                            selectId={channel.selectId}
                          />
                        ))}
                      </IoConfigurationSection>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2 border-t border-border/70 pt-4">
                      <Button data-i18n="settings.setup.save" id="settings-io-config-save-btn" size="sm" type="button">
                        Save
                      </Button>
                      <Button data-i18n="settings.setup.cancel" id="settings-io-config-cancel-btn" size="sm" type="button" variant="outline">
                        Cancel
                      </Button>
                      <Button data-i18n="settings.setup.restoreDefaults" id="settings-io-config-restore-defaults-btn" size="sm" type="button" variant="outline">
                        Restore to Defaults
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="hidden grid gap-4" data-settings-panel="signature" id="settings-panel-signature">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle data-i18n="settings.signature.title">Seek & Horn Signature Graph</CardTitle>
                  <CardDescription data-i18n="settings.signature.description">Switch between 5-second weld data capture and horn signature scanning in one workspace.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5">
                  <div className="signature-mode-switch flex flex-wrap gap-2 rounded-xl border border-border/70 bg-background/65 p-1">
                    <Button className="active flex-1 sm:flex-none" data-signature-mode="weldData" id="settings-signature-mode-weld" size="sm" type="button" variant="ghost">
                      <span data-i18n="settings.signature.weldDataGraph">Weld Data Graph</span>
                    </Button>
                    <Button className="flex-1 text-muted-foreground sm:flex-none" data-signature-mode="hornSignature" id="settings-signature-mode-horn" size="sm" type="button" variant="ghost">
                      <span data-i18n="settings.signature.hornSignatureGraph">Horn Signature Graph</span>
                    </Button>
                  </div>

                  <div className="signature-mode-copy rounded-xl border border-border/60 bg-muted/18 px-4 py-3">
                    <p className="text-sm text-muted-foreground" id="settings-signature-mode-description">Capture 5 seconds of welding data and view or export the selected parameters.</p>
                  </div>

                  <section className="signature-panel grid gap-5">
                    <div className="grid gap-4">
                      <div className="flex flex-wrap gap-3">
                        <Button className="min-w-36" id="settings-signature-start-btn" size="sm">
                          Start 5s Weld Capture
                        </Button>
                        <Button className="min-w-36" data-i18n="settings.signature.resetOverload" id="settings-signature-reset-btn" size="sm" variant="outline">
                          Reset Overload
                        </Button>
                      </div>

                      <div className="hidden grid gap-4" data-signature-horn-only>
                        <div className="signature-progress-shell">
                          <div aria-valuemax="100" aria-valuemin="0" aria-valuenow="0" className="signature-progress-track" id="settings-signature-progress-track" role="progressbar">
                            <div className="signature-progress-fill" id="settings-signature-progress-fill" />
                            <span className="signature-progress-label" id="settings-signature-progress-label">Idle</span>
                          </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                          <section className="signature-subpanel">
                            <h3 className="signature-subpanel-title" data-i18n="settings.signature.status">Status</h3>
                            <div className="grid gap-3">
                              {hornSignatureStatusItems.map((item) => (
                                <SignatureIndicatorRow indicatorId={item.id} key={item.id} label={item.label} translationKey={item.key} />
                              ))}
                            </div>
                          </section>

                          <section className="signature-subpanel">
                            <h3 className="signature-subpanel-title" data-i18n="settings.signature.resonance">Resonance</h3>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                              <FormField label="Series Resonant Point 1 (Hz)" labelKey="settings.signature.seriesResonantPoint1">
                                <Input defaultValue="--" id="settings-signature-series-resonant-point-1" readOnly />
                              </FormField>
                              <FormField label="Parallel Resonant Point 1 (Hz)" labelKey="settings.signature.parallelResonantPoint1">
                                <Input defaultValue="--" id="settings-signature-parallel-resonant-point-1" readOnly />
                              </FormField>
                            </div>
                          </section>
                        </div>
                      </div>

                      <div className="weld-signature-layout" data-signature-weld-only>
                        <div className="weld-signature-sidebar">
                          <section className="signature-subpanel weld-signature-subpanel">
                            <h3 className="signature-subpanel-title" data-i18n="settings.signature.status">Status</h3>
                            <div className="grid gap-3">
                              {weldSignatureStatusItems.map((item) => (
                                <SignatureIndicatorRow indicatorId={item.id} key={item.id} label={item.label} translationKey={item.key} />
                              ))}
                            </div>
                          </section>

                          <section className="signature-subpanel weld-signature-subpanel">
                            <h3 className="signature-subpanel-title" data-i18n="settings.signature.result">Result</h3>
                            <div className="grid gap-3">
                              {signatureResultItems.map((item) => (
                                <SignatureIndicatorRow indicatorId={item.id} key={item.id} label={item.label} translationKey={item.key} />
                              ))}
                            </div>
                          </section>
                        </div>

                        <section className="weld-signature-meter-shell">
                          <div className="signature-meter-list signature-meter-list-weld">
                            {signatureMeterItems.map((item) => (
                              <SignatureMeterRow key={item.id} label={item.label} labelId={item.id === 'settings-signature-meter-power' ? 'settings-signature-power-label' : undefined} meterId={item.id} meterMode={item.meterMode} translationKey={item.key} value={item.value} valueId={item.valueId} />
                            ))}
                          </div>
                        </section>
                      </div>
                    </div>
                  </section>

                  <section className="signature-panel grid gap-5">
                    <div className="signature-chart-toolbar">
                      <div className="signature-series-grid">
                        {signatureSeriesOptions.map((item) => (
                          <SignatureSeriesToggle defaultChecked={item.defaultChecked} id={item.id} key={item.id} label={item.label} translationKey={item.key} value={item.value} />
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2 justify-start xl:justify-end">
                        <Button data-i18n="settings.signature.updateGraph" id="settings-signature-update-graph-btn" size="sm" variant="outline">
                          Update Graph
                        </Button>
                        <Button data-i18n="settings.signature.exportGraph" id="settings-signature-export-btn" size="sm" variant="outline">
                          Export Graph Data
                        </Button>
                        <Button data-i18n="settings.signature.clear" id="clear-settings-signature-chart-btn" size="sm" variant="outline">
                          Clear Graph
                        </Button>
                      </div>
                    </div>

                    <div id="settings-signature-chart-container">
                      <canvas className="h-full w-full" id="settings-signature-chart" />
                    </div>

                    <div className="signature-control-grid">
                      <FormField label="Draw From (ms)" labelId="settings-signature-draw-from-label" labelKey="settings.signature.drawFrom">
                        <Input defaultValue="0" id="settings-signature-draw-from" min="0" step="100" type="number" />
                      </FormField>
                      <FormField label="To (ms)" labelId="settings-signature-draw-to-label" labelKey="settings.signature.drawTo">
                        <Input defaultValue="5000" id="settings-signature-draw-to" min="0" step="100" type="number" />
                      </FormField>
                      <FormField label="Graph Selection" labelKey="settings.signature.graphSelection">
                        <NativeSelect defaultValue="frequency" id="settings-signature-graph-selection">
                          <option data-i18n="settings.signature.amplitude" data-signature-graph-option="amplitude" value="amplitude">Amplitude</option>
                          <option data-i18n="settings.signature.power" data-signature-graph-option="power" value="power">Power</option>
                          <option data-i18n="settings.signature.phase" data-signature-graph-option="phase" value="phase">Phase</option>
                          <option data-i18n="settings.signature.current" data-signature-graph-option="current" value="current">Current</option>
                          <option data-i18n="settings.signature.pwmAmplitude" data-signature-graph-option="pwmAmplitude" value="pwmAmplitude">PWM Amplitude</option>
                          <option data-i18n="settings.signature.frequency" data-signature-graph-option="frequency" value="frequency">Frequency</option>
                        </NativeSelect>
                      </FormField>
                      <FormField label="X Value" labelId="settings-signature-x-value-label" labelKey="settings.signature.xValue">
                        <Input defaultValue="0" id="settings-signature-x-value" readOnly />
                      </FormField>
                      <FormField label="Y Value" labelKey="settings.signature.yValue">
                        <Input defaultValue="0" id="settings-signature-y-value" readOnly />
                      </FormField>
                      <div className="flex flex-wrap gap-2 items-end">
                        <Button data-i18n="settings.signature.setDefault" id="settings-signature-default-btn" size="sm" variant="outline">
                          Set Default
                        </Button>
                        <Button data-i18n="settings.signature.updateValue" id="settings-signature-update-value-btn" size="sm" variant="outline">
                          Update Value
                        </Button>
                      </div>
                    </div>

                  </section>
                </CardContent>
              </Card>
            </section>

            <section className="hidden grid gap-4" data-settings-panel="alarms" id="settings-panel-alarms">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle data-i18n="settings.alarms.title">Alarm Log</CardTitle>
                  <CardDescription data-i18n="settings.alarms.description">Track alarm transitions detected from live telemetry.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="data-table-shell min-h-[16rem] max-h-[24rem] overflow-y-auto rounded-xl border border-border/60 bg-background/80" id="alarm-log-table-shell">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="w-36" data-i18n="settings.alarms.time">Time</th>
                          <th className="w-36" data-i18n="settings.alarms.state">State</th>
                          <th data-i18n="settings.alarms.detail">Detail</th>
                        </tr>
                      </thead>
                      <tbody id="alarm-log-body">
                        <tr>
                          <td className="data-table-empty" colSpan="3" data-i18n="settings.alarms.empty">No alarm events recorded yet.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle data-i18n="settings.output.title">System Output</CardTitle>
                  <CardDescription data-i18n="settings.output.description">Review raw operator and controller output entries.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="data-table-shell min-h-[18rem] max-h-[26rem] overflow-y-auto rounded-xl border border-border/60 bg-background/80" id="output">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="w-36" data-i18n="settings.diagnostics.time">Time</th>
                          <th data-i18n="settings.diagnostics.data">Data</th>
                        </tr>
                      </thead>
                      <tbody id="output-body" />
                    </table>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="hidden grid gap-4" data-settings-panel="docs" id="settings-panel-docs">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle data-i18n="settings.docs.title">Help & Documentation</CardTitle>
                  <CardDescription data-i18n="settings.docs.description">Use this page as a quick guide for operating the app day to day.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <section className="rounded-2xl border border-primary/20 bg-primary/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                      <div className="space-y-2">
                        <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-primary/80" data-i18n="settings.docs.referenceEyebrow">Operator Reference</div>
                        <h3 className="text-lg font-semibold text-foreground" data-i18n="settings.docs.referenceTitle">DCX / Teensy Operating Reference</h3>
                        <p className="text-sm text-muted-foreground" data-i18n="settings.docs.referenceBody">Use this controlled reference for daily operation, commissioning checks, and training.</p>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {documentationMetadataItems.map((item) => (
                          <DocumentationMetaItem key={item.labelKey} label={item.label} labelKey={item.labelKey} value={item.value} valueKey={item.valueKey} />
                        ))}
                      </div>
                    </div>
                  </section>

                  <DocumentationCard description="Review these control-path rules before operating hardware." descriptionKey="settings.docs.notice.description" title="Safety & Routing Notice" translationKey="settings.docs.notice.title">
                    <div className="grid gap-3 xl:grid-cols-3">
                      {documentationNoticeItems.map((item) => (
                        <div className="rounded-xl border border-border/60 bg-background/72 p-3" key={item.titleKey}>
                          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground" data-i18n={item.titleKey}>{item.title}</div>
                          <p className="mt-2 text-sm text-foreground/86" data-i18n={item.bodyKey}>{item.body}</p>
                        </div>
                      ))}
                    </div>
                  </DocumentationCard>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                    <DocumentationCard description="Follow this standard procedure before any manual or automated run." descriptionKey="settings.docs.start.description" title="Standard Operating Procedure" translationKey="settings.docs.start.title">
                      <div className="grid gap-3">
                        {gettingStartedItems.map((item, index) => (
                          <DocumentationProcedureStep body={item.body} bodyKey={item.bodyKey} index={index + 1} key={item.titleKey} title={item.title} titleKey={item.titleKey} />
                        ))}
                      </div>
                    </DocumentationCard>

                    <DocumentationCard description="Hardware mode combines Branson HTTP control with Teensy-managed sonics commands; simulation keeps the UI live without hardware." descriptionKey="settings.docs.transports.description" title="Transport Architecture" translationKey="settings.docs.transports.title">
                      <div className="grid gap-3">
                        {transportModeItems.map((item) => (
                          <div className="rounded-xl border border-border/60 bg-background/72 p-3" key={item.titleKey}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-foreground" data-i18n={item.titleKey}>{item.title}</div>
                              <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.mapping}</span>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground" data-i18n={item.bodyKey}>{item.body}</p>
                          </div>
                        ))}
                      </div>
                    </DocumentationCard>
                  </div>

                  <DocumentationCard description="Reference mapping for the Teensy GPIO, relay, DAC, and ADC channels used by the fixture." descriptionKey="settings.docs.pinout.description" title="Teensy 4.1 Pinout Reference" translationKey="settings.docs.pinout.title">
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-sm text-muted-foreground" data-i18n="settings.docs.pinout.note">
                      The live I/O panel reads DCX Ethernet snapshots. Use this pinout card as the Teensy-side hardware reference.
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <PinoutSection rows={teensyStatusInputRows} title="Status Inputs" translationKey="settings.docs.pinout.statusInputs" />
                      <PinoutSection rows={teensyControlOutputRows} title="Control Outputs" translationKey="settings.docs.pinout.controlOutputs" />
                      <PinoutSection rows={teensyAuxOutputRows} title="Aux Outputs" translationKey="settings.docs.pinout.auxOutputs" />
                      <PinoutSection rows={teensyI2cRows} title="I2C Buses" translationKey="settings.docs.pinout.i2cBuses" />
                      <PinoutSection rows={teensyDacRows} title="MCP4728 Outputs" translationKey="settings.docs.pinout.dacOutputs" />
                      <PinoutSection rows={teensyAdcRows} title="ADS1015 Inputs" translationKey="settings.docs.pinout.adcInputs" />
                    </div>
                  </DocumentationCard>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                    <DocumentationCard description="These are the fastest controls for direct operator actions." descriptionKey="settings.docs.manual.description" title="Manual Controls" translationKey="settings.docs.manual.title">
                      <div className="grid gap-3">
                        {manualControlItems.map((item) => (
                          <div className="rounded-xl border border-border/60 bg-background/72 p-3" key={item.titleKey}>
                            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground" data-i18n={item.titleKey}>{item.title}</div>
                            <p className="mt-2 text-sm text-foreground/86" data-i18n={item.bodyKey}>{item.body}</p>
                          </div>
                        ))}
                      </div>
                    </DocumentationCard>

                    <DocumentationCard description="These workflow and sequence operations are already translated into controller actions." descriptionKey="settings.docs.workflow.description" title="Workflow Command Reference" translationKey="settings.docs.workflow.title">
                      <div className="data-table-shell rounded-xl border border-border/60 bg-background/80 overflow-x-auto">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th className="w-48" data-i18n="settings.docs.columns.command">Command</th>
                              <th data-i18n="settings.docs.columns.detail">Detail</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workflowCommandRows.map((row) => (
                              <tr key={row.command}>
                                <td><code>{row.command}</code></td>
                                <td className="text-muted-foreground" data-i18n={row.detailKey}>{row.detail}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </DocumentationCard>

                    <DocumentationCard description="Use these tools when you need repeatable multi-step runs instead of quick manual actions." descriptionKey="settings.docs.methods.description" title="Sequences & Workflows" translationKey="settings.docs.methods.title">
                      <div className="grid gap-3">
                        {sequenceWorkflowItems.map((item) => (
                          <div className="rounded-xl border border-border/60 bg-background/72 p-3" key={item.titleKey}>
                            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground" data-i18n={item.titleKey}>{item.title}</div>
                            <p className="mt-2 text-sm text-foreground/86" data-i18n={item.bodyKey}>{item.body}</p>
                          </div>
                        ))}
                      </div>
                    </DocumentationCard>

                    <DocumentationCard description="Select the appropriate acquisition mode, review the captured traces, and export the data set when required." descriptionKey="settings.docs.signature.description" title="Signature Acquisition Reference" translationKey="settings.docs.signature.title">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-border/60 bg-background/72 p-3">
                          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground" data-i18n="settings.docs.signature.weldTitle">Weld Data Graph</div>
                          <p className="mt-2 text-sm text-foreground/86" data-i18n="settings.docs.signature.weldBody">Use this mode to capture 5 seconds of weld data, choose the traces you want to display, and export the result when needed.</p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/72 p-3">
                          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground" data-i18n="settings.docs.signature.hornTitle">Horn Signature Graph</div>
                          <p className="mt-2 text-sm text-foreground/86" data-i18n="settings.docs.signature.hornBody">Use this mode during seek to compare horn resonance behavior and export the scan after it completes.</p>
                        </div>
                      </div>
                    </DocumentationCard>
                  </div>

                  <DocumentationCard description="These notes help explain why a feature may appear in the UI but not behave fully yet." descriptionKey="settings.docs.limits.description" title="Known Limits & Commissioning Notes" translationKey="settings.docs.limits.title">
                    <div className="grid gap-2">
                      {documentationLimitRows.map((row) => (
                        <div className="rounded-lg border border-border/60 bg-background/72 px-3 py-2 text-sm text-foreground/86" data-i18n={row.key} key={row.key}>{row.label}</div>
                      ))}
                    </div>
                  </DocumentationCard>
                </CardContent>
              </Card>
            </section>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
