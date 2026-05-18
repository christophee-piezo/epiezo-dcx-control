const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const EventEmitter = require('events');

class SerialAdapter extends EventEmitter {
    constructor() {
        super();
        this.port = null;
        this.parser = null;
        this.connected = false;
    }

    async listPorts() {
        try {
            const ports = await SerialPort.list();
            // Try to identify Teensy by manufacturer/pnpId
            return ports.map(p => ({
                path: p.path,
                manufacturer: p.manufacturer || 'Unknown',
                friendly: p.friendlyName || p.path,
                isTeensy: (p.manufacturer || '').toLowerCase().includes('teensy') || 
                           (p.pnpId || '').toLowerCase().includes('vid_16c0&pid_0483') // Teensy 4.1 USB Serial
            }));
        } catch (err) {
            console.error('Error listing ports:', err);
            return [];
        }
    }

    connect(path, baudRate = 115200) {
        return new Promise((resolve, reject) => {
            try {
                this.port = new SerialPort({ path, baudRate, autoOpen: false });
                this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

                this.port.open((err) => {
                    if (err) return reject(err);
                    this.connected = true;
                    console.log(`[SERIAL] Connected to ${path} at ${baudRate}`);
                    
                    this.parser.on('data', (data) => {
                        const line = String(data || '').trim();

                        if (!line) {
                            return;
                        }

                        if (line.startsWith('#')) {
                            console.log(`[SERIAL DEBUG] ${line}`);
                            return;
                        }

                        this.emit('data', this._parseTeensyData(line));
                    });

                    this.port.on('close', () => {
                        this.connected = false;
                        this.emit('disconnect');
                    });

                    resolve({ success: true });
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    disconnect() {
        if (this.port && this.port.isOpen) {
            this.port.close();
        }
    }

    sendCommand(cmd) {
        if (!this.connected) return;
        this.port.write(cmd + '\n');
    }

    /**
     * Parses the Teensy custom format:
     * (int)freqA(int)ampBana1Cana2Dana3Eana4FcyclesGreadyHactiveIalarmJseekK\n
     */
    _parseTeensyData(line) {
        const data = {};
        const matches = {
            frequency: /(-?\d+)A/,
            amplitude: /(-?\d+)B/,
            analog1: /(-?\d+)C/,
            analog2: /(-?\d+)D/,
            analog3: /(-?\d+)E/,
            analog4: /(-?\d+)F/,
            cycles: /(-?\d+)G/,
            ready: /([01])H/,
            active: /([01])I/,
            alarm: /([01])J/,
            seek: /([01])K/
        };

        for (const [key, regex] of Object.entries(matches)) {
            const match = line.match(regex);
            if (match) {
                data[key] = parseInt(match[1]);
            }
        }
        return data;
    }
}

module.exports = new SerialAdapter();
