#include <Adafruit_ADS1X15.h>
#include <Adafruit_MCP4728.h>
#include <Wire.h>

namespace Pins {
const uint8_t GENERAL_ALARM = 0;
const uint8_t SEEKSCAN_OUT = 1;
const uint8_t EXT_START = 7;
const uint8_t EXT_SEEK = 8;
const uint8_t READY = 14;
const uint8_t SONICS_ACTIVE = 15;
const uint8_t EXT_RESET = 20;
const uint8_t EXT_CLEAR = 21;
const uint8_t MEMORY_CLEAR = 22;
const uint8_t RELAY_K6 = 24;
const uint8_t RELAY_K5 = 25;
const uint8_t READY_LED_2 = 26;
const uint8_t READY_LED_1 = 27;
const uint8_t SONICS_ACTIVE_LED_2 = 38;
const uint8_t SONICS_ACTIVE_LED_1 = 39;
const uint8_t PROGRAM_OPTO = 40;
}

const uint32_t SERIAL_BAUD_RATE = 115200;
const uint32_t TELEMETRY_INTERVAL_MS = 100;
const uint16_t DEFAULT_PULSE_MS = 200;
const uint16_t PROGRAM_PULSE_MS = 600;
const uint16_t DAC_MAX = 4095;
const uint16_t ADS_MAX_COUNTS = 2047;
const float ADC_REFERENCE_VOLTS = 4.096f;
const int32_t DEFAULT_FREQUENCY_HZ = 40000;
const int32_t MIN_FREQUENCY_HZ = 39000;
const int32_t MAX_FREQUENCY_HZ = 41000;

Adafruit_MCP4728 dac;
Adafruit_ADS1015 ads;

bool dacReady = false;
bool adcReady = false;
uint32_t lastTelemetryAt = 0;
uint32_t lastCycleUpdateAt = 0;
uint32_t cycles = 0;
uint16_t dacValues[4] = {0, 2048, 0, 0};
int16_t analogInputsMillivolts[4] = {0, 0, 0, 0};
int16_t frequencyOffsetPercent = 0;
uint8_t amplitudePercent = 0;
String serialBuffer;

struct TimedPulse {
  uint8_t pin;
  uint32_t releaseAt;
  bool active;
};

TimedPulse timedPulses[] = {
  { Pins::EXT_SEEK, 0, false },
  { Pins::EXT_RESET, 0, false },
  { Pins::EXT_CLEAR, 0, false },
  { Pins::MEMORY_CLEAR, 0, false },
  { Pins::PROGRAM_OPTO, 0, false }
};

bool isTruthy(const String &value) {
  return value == "1" || value == "ON" || value == "TRUE" || value == "HIGH" || value == "EXTERNAL";
}

int32_t clampInt32(int32_t value, int32_t minimum, int32_t maximum) {
  if (value < minimum) {
    return minimum;
  }

  if (value > maximum) {
    return maximum;
  }

  return value;
}

uint16_t clampDacValue(int32_t value) {
  return static_cast<uint16_t>(clampInt32(value, 0, DAC_MAX));
}

bool readInput(uint8_t pin) {
  return digitalRead(pin) == HIGH;
}

bool hasActiveAlarm() {
  return readInput(Pins::GENERAL_ALARM);
}

void setOutputPin(uint8_t pin, bool high) {
  digitalWrite(pin, high ? HIGH : LOW);
}

void writeStatusMessage(const String &message) {
  Serial.print(F("# "));
  Serial.println(message);
}

void updateStatusLeds() {
  const bool ready = readInput(Pins::READY);
  const bool active = readInput(Pins::SONICS_ACTIVE);

  setOutputPin(Pins::READY_LED_1, ready);
  setOutputPin(Pins::READY_LED_2, !ready);
  setOutputPin(Pins::SONICS_ACTIVE_LED_1, active);
  setOutputPin(Pins::SONICS_ACTIVE_LED_2, !active);
}

void applyDacOutputs() {
  if (!dacReady) {
    return;
  }

  dac.fastWrite(dacValues[0], dacValues[1], dacValues[2], dacValues[3]);
}

void setDacChannelValue(uint8_t channel, uint16_t value) {
  if (channel > 3) {
    return;
  }

  dacValues[channel] = clampDacValue(value);
  applyDacOutputs();
}

void setAmplitudePercent(uint8_t percent) {
  amplitudePercent = static_cast<uint8_t>(clampInt32(percent, 0, 100));
  setDacChannelValue(0, map(amplitudePercent, 0, 100, 0, DAC_MAX));
}

void setFrequencyOffsetPercent(int16_t percent) {
  frequencyOffsetPercent = static_cast<int16_t>(clampInt32(percent, -100, 100));
  const int32_t scaled = map(frequencyOffsetPercent, -100, 100, 0, DAC_MAX);
  setDacChannelValue(1, clampDacValue(scaled));
}

void pulsePin(uint8_t pin, uint16_t durationMs) {
  setOutputPin(pin, true);

  for (auto &pulse : timedPulses) {
    if (pulse.pin != pin) {
      continue;
    }

    pulse.active = true;
    pulse.releaseAt = millis() + durationMs;
    return;
  }
}

void releasePulsePins() {
  const uint32_t now = millis();

  for (auto &pulse : timedPulses) {
    if (!pulse.active || now < pulse.releaseAt) {
      continue;
    }

    pulse.active = false;
    pulse.releaseAt = 0;
    setOutputPin(pulse.pin, false);
  }
}

void stopSonics() {
  setOutputPin(Pins::EXT_START, false);
}

void startSonics() {
  // Ultrasound start uses the default K5 LOW path with DI_EXT_START asserted.
  setOutputPin(Pins::RELAY_K5, false);
  setOutputPin(Pins::EXT_START, true);
}

void setAmplitudeSourceExternal(bool enabled) {
  setOutputPin(Pins::RELAY_K6, enabled);
}

void clearMemoryPulse() {
  pulsePin(Pins::EXT_CLEAR, DEFAULT_PULSE_MS);
  pulsePin(Pins::MEMORY_CLEAR, DEFAULT_PULSE_MS);
}

void resetFactoryState() {
  stopSonics();
  setOutputPin(Pins::EXT_SEEK, false);
  setOutputPin(Pins::EXT_RESET, false);
  setOutputPin(Pins::EXT_CLEAR, false);
  setOutputPin(Pins::MEMORY_CLEAR, false);
  setOutputPin(Pins::PROGRAM_OPTO, false);
  setOutputPin(Pins::RELAY_K5, false);
  setAmplitudeSourceExternal(false);
  cycles = 0;
  amplitudePercent = 0;
  frequencyOffsetPercent = 0;
  setDacChannelValue(0, 0);
  setDacChannelValue(1, 2048);
  setDacChannelValue(2, 0);
  setDacChannelValue(3, 0);
  lastCycleUpdateAt = millis();
  updateStatusLeds();
}

int16_t readAdsMillivolts(uint8_t channel) {
  if (!adcReady) {
    return 0;
  }

  const int16_t counts = ads.readADC_SingleEnded(channel);
  const float volts = ads.computeVolts(counts);
  return static_cast<int16_t>(volts * 1000.0f);
}

void sampleAnalogInputs() {
  analogInputsMillivolts[0] = readAdsMillivolts(0);
  analogInputsMillivolts[1] = readAdsMillivolts(1);
  analogInputsMillivolts[2] = readAdsMillivolts(2);
  analogInputsMillivolts[3] = readAdsMillivolts(3);
}

int32_t deriveFrequencyHz() {
  const int32_t millivolts = clampInt32(analogInputsMillivolts[0], 0, static_cast<int32_t>(ADC_REFERENCE_VOLTS * 1000.0f));
  return map(millivolts, 0, static_cast<int32_t>(ADC_REFERENCE_VOLTS * 1000.0f), MIN_FREQUENCY_HZ, MAX_FREQUENCY_HZ);
}

int32_t deriveAmplitudePercent() {
  const int32_t millivolts = clampInt32(analogInputsMillivolts[1], 0, static_cast<int32_t>(ADC_REFERENCE_VOLTS * 1000.0f));
  return map(millivolts, 0, static_cast<int32_t>(ADC_REFERENCE_VOLTS * 1000.0f), 0, 100);
}

void updateCycleEstimate() {
  const bool active = readInput(Pins::SONICS_ACTIVE);
  const uint32_t now = millis();
  const uint32_t elapsedMs = now - lastCycleUpdateAt;
  lastCycleUpdateAt = now;

  if (!active || elapsedMs == 0) {
    return;
  }

  const uint32_t frequencyHz = static_cast<uint32_t>(max<int32_t>(deriveFrequencyHz(), DEFAULT_FREQUENCY_HZ));
  cycles += static_cast<uint32_t>((frequencyHz * elapsedMs) / 1000UL);
}

void emitTelemetry() {
  sampleAnalogInputs();
  updateCycleEstimate();
  updateStatusLeds();

  const int32_t frequencyHz = deriveFrequencyHz();
  const int32_t liveAmplitudePercent = deriveAmplitudePercent();

  Serial.print(frequencyHz);
  Serial.print('A');
  Serial.print(liveAmplitudePercent);
  Serial.print('B');
  Serial.print(analogInputsMillivolts[2]);
  Serial.print('C');
  Serial.print(analogInputsMillivolts[3]);
  Serial.print('D');
  Serial.print(amplitudePercent);
  Serial.print('E');
  Serial.print(frequencyOffsetPercent);
  Serial.print('F');
  Serial.print(cycles);
  Serial.print('G');
  Serial.print(readInput(Pins::READY) ? 1 : 0);
  Serial.print('H');
  Serial.print(readInput(Pins::SONICS_ACTIVE) ? 1 : 0);
  Serial.print('I');
  Serial.print(readInput(Pins::GENERAL_ALARM) ? 1 : 0);
  Serial.print('J');
  Serial.print(readInput(Pins::SEEKSCAN_OUT) ? 1 : 0);
  Serial.println('K');
}

int32_t parseNumber(const String &text, int32_t fallback = 0) {
  if (text.length() == 0) {
    return fallback;
  }

  return text.toInt();
}

void printHelp() {
  writeStatusMessage(F("Commands: START [0-100], STOP, SEEK, RESET, CLEAR, MEMORY_CLEAR, SET_AMP <0-100>, SET_FREQ_OFFSET <-100..100>, SET_AMPLITUDE_SOURCE <INTERNAL|EXTERNAL>, SET_DAC <A|B|C|D> <0-4095>, PROGRAM, STATUS, FACTORY_RESET, HELP, PING"));
}

void processCommand(String line) {
  line.trim();
  if (line.length() == 0) {
    return;
  }

  const int separatorIndex = line.indexOf(' ');
  String command = separatorIndex >= 0 ? line.substring(0, separatorIndex) : line;
  String arguments = separatorIndex >= 0 ? line.substring(separatorIndex + 1) : "";
  command.trim();
  arguments.trim();
  command.toUpperCase();

  if (command == "PING") {
    Serial.println(F("PONG"));
    return;
  }

  if (command == "HELP") {
    printHelp();
    return;
  }

  if (command == "STATUS") {
    emitTelemetry();
    return;
  }

  if (command == "START") {
    if (hasActiveAlarm()) {
      stopSonics();
      writeStatusMessage(F("ERR START blocked by active alarm"));
      return;
    }

    if (arguments.length() > 0) {
      setAmplitudePercent(static_cast<uint8_t>(clampInt32(parseNumber(arguments), 0, 100)));
      setAmplitudeSourceExternal(true);
    }
    startSonics();
    writeStatusMessage(F("OK START"));
    return;
  }

  if (command == "STOP") {
    stopSonics();
    writeStatusMessage(F("OK STOP"));
    return;
  }

  if (command == "SEEK") {
    pulsePin(Pins::EXT_SEEK, DEFAULT_PULSE_MS);
    writeStatusMessage(F("OK SEEK"));
    return;
  }

  if (command == "RESET") {
    pulsePin(Pins::EXT_RESET, DEFAULT_PULSE_MS);
    writeStatusMessage(F("OK RESET"));
    return;
  }

  if (command == "CLEAR" || command == "MEMORY_CLEAR") {
    clearMemoryPulse();
    writeStatusMessage(F("OK CLEAR"));
    return;
  }

  if (command == "PROGRAM") {
    pulsePin(Pins::PROGRAM_OPTO, PROGRAM_PULSE_MS);
    writeStatusMessage(F("OK PROGRAM"));
    return;
  }

  if (command == "FACTORY_RESET") {
    resetFactoryState();
    writeStatusMessage(F("OK FACTORY_RESET"));
    return;
  }

  if (command == "SET_AMP") {
    setAmplitudePercent(static_cast<uint8_t>(clampInt32(parseNumber(arguments), 0, 100)));
    setAmplitudeSourceExternal(true);
    writeStatusMessage(F("OK SET_AMP"));
    return;
  }

  if (command == "SET_FREQ_OFFSET") {
    setFrequencyOffsetPercent(static_cast<int16_t>(clampInt32(parseNumber(arguments), -100, 100)));
    writeStatusMessage(F("OK SET_FREQ_OFFSET"));
    return;
  }

  if (command == "SET_AMPLITUDE_SOURCE") {
    String value = arguments;
    value.toUpperCase();
    setAmplitudeSourceExternal(isTruthy(value));
    writeStatusMessage(F("OK SET_AMPLITUDE_SOURCE"));
    return;
  }

  if (command == "SET_DAC") {
    const int argumentSeparator = arguments.indexOf(' ');
    if (argumentSeparator < 0) {
      writeStatusMessage(F("ERR SET_DAC expects channel and value"));
      return;
    }

    String channelName = arguments.substring(0, argumentSeparator);
    String valueText = arguments.substring(argumentSeparator + 1);
    channelName.trim();
    channelName.toUpperCase();
    valueText.trim();

    uint8_t channel = 0;
    if (channelName == "A") {
      channel = 0;
    } else if (channelName == "B") {
      channel = 1;
    } else if (channelName == "C") {
      channel = 2;
    } else if (channelName == "D") {
      channel = 3;
    } else {
      writeStatusMessage(F("ERR Unknown DAC channel"));
      return;
    }

    setDacChannelValue(channel, clampDacValue(parseNumber(valueText)));
    writeStatusMessage(F("OK SET_DAC"));
    return;
  }

  writeStatusMessage(String(F("ERR Unknown command: ")) + command);
}

void readSerialCommands() {
  while (Serial.available() > 0) {
    const char nextChar = static_cast<char>(Serial.read());

    if (nextChar == '\r') {
      continue;
    }

    if (nextChar == '\n') {
      processCommand(serialBuffer);
      serialBuffer = "";
      continue;
    }

    serialBuffer += nextChar;
  }
}

void setupOutputs() {
  pinMode(Pins::EXT_START, OUTPUT);
  pinMode(Pins::EXT_SEEK, OUTPUT);
  pinMode(Pins::EXT_RESET, OUTPUT);
  pinMode(Pins::EXT_CLEAR, OUTPUT);
  pinMode(Pins::MEMORY_CLEAR, OUTPUT);
  pinMode(Pins::RELAY_K6, OUTPUT);
  pinMode(Pins::RELAY_K5, OUTPUT);
  pinMode(Pins::READY_LED_1, OUTPUT);
  pinMode(Pins::READY_LED_2, OUTPUT);
  pinMode(Pins::SONICS_ACTIVE_LED_1, OUTPUT);
  pinMode(Pins::SONICS_ACTIVE_LED_2, OUTPUT);
  pinMode(Pins::PROGRAM_OPTO, OUTPUT);
}

void setupInputs() {
  pinMode(Pins::GENERAL_ALARM, INPUT_PULLDOWN);
  pinMode(Pins::SEEKSCAN_OUT, INPUT_PULLDOWN);
  pinMode(Pins::READY, INPUT_PULLDOWN);
  pinMode(Pins::SONICS_ACTIVE, INPUT_PULLDOWN);
}

void setupDevices() {
  Wire.begin();
  Wire1.begin();

  adcReady = ads.begin(ADS1X15_ADDRESS, &Wire);
  if (adcReady) {
    ads.setGain(GAIN_ONE);
    ads.setDataRate(RATE_ADS1015_1600SPS);
  }

  dacReady = dac.begin(MCP4728_I2CADDR_DEFAULT, &Wire1);
}

void setup() {
  Serial.begin(SERIAL_BAUD_RATE);
  setupInputs();
  setupOutputs();
  setupDevices();
  resetFactoryState();
  writeStatusMessage(F("ePiezo Teensy factory firmware ready"));
  printHelp();
}

void loop() {
  readSerialCommands();
  releasePulsePins();

  const uint32_t now = millis();
  if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = now;
    emitTelemetry();
  }
}
