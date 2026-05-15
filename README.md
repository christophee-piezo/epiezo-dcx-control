# E-piezo + Branson DCX Control Panel

A robust Electron-based desktop application for industrial control of **Branson DCX** ultrasonic power supplies and **E-piezo** systems.

## Key Features

- **4-Tab Interface:**
  - **Standard:** Quick manual controls for Amplitude, Start, and Stop.
  - **Sequence:** A visual, "audio-style" timeline editor for pulse/pause test routines.
  - **Workflow:** Text-based custom routine execution for complex scenarios.
  - **System:** Comprehensive connectivity and simulation settings.
- **Visual Pulse/Pause Editor:** Drag and drop "Pulse" (Black) and "Pause" (Gray) blocks onto a timeline. Set individual durations in milliseconds for precise control.
- **Hardware Resilience:** Features a "Safe Simulation" mode to test logic without physical hardware connected.
- **Real-time Telemetry:** Live updates for Power (W), Frequency (Hz), and device status.

## Project Structure

```text
epiezo-dcx-control/
├── main.js             # Electron main process (IPC handlers, window management)
├── preload.js          # Secure IPC bridge
├── renderer.js         # Bundled React renderer output
├── index.html          # Electron HTML shell
├── src/
│   ├── main.jsx        # React entry point
│   ├── App.jsx         # React root component
│   ├── app-shell.html  # Existing UI shell mounted by React
│   ├── styles.css      # Renderer styles
│   └── renderer-core.js# Legacy UI behavior wired after mount
├── services/           
│   └── dcxService.js   # Hardware logic & simulation engine
└── adapters/           # Low-level TCP/Serial communication adapters
```

## Getting Started

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Start the App:**
   ```bash
   npm start
   ```

## Usage

### Building a Pulse/Pause Sequence
1. Navigate to the **Sequence** tab.
2. Drag **PULSE** or **PAUSE** blocks from the toolbox into the dashed timeline area.
3. Edit the duration (in ms) directly on the block.
4. Click **Run Test Sequence** to execute the routine.

### System Configuration
In the **System** tab, you can toggle **Simulation Mode**. When enabled, the app will generate mock power and frequency data, allowing you to dry-run sequences and workflows safely.

## Safety First
All hardware communication is asynchronous and non-blocking. The UI remains responsive during high-speed pulse/pause sequences.

## License
MIT
