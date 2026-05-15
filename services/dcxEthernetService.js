const axios = require('axios');

class DcxEthernetService {
  constructor({ userid = '1234' } = {}) {
    this.userid = userid;
    this.baseUrl = '';
    this.connected = false;
    this.session = axios.create({
      timeout: 5000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Connection: 'keep-alive',
        'User-Agent': 'python-requests/2.28.1'
      }
    });
  }

  isConnected() {
    return Boolean(this.connected && this.baseUrl);
  }

  async connect(host) {
    const normalizedHost = String(host || '').trim();
    if (!normalizedHost) {
      throw new Error('Missing DCX host IP');
    }

    const baseUrl = `http://${normalizedHost}`;
    await this.session.post(
      `${baseUrl}/ip-setup.html`,
      `userid1=${this.userid}&lang=0`
    );

    this.baseUrl = baseUrl;
    this.connected = true;

    return {
      success: true,
      host: normalizedHost,
      baseUrl
    };
  }

  disconnect() {
    this.baseUrl = '';
    this.connected = false;
  }

  async post(func, cmd, body = '') {
    if (!this.isConnected()) {
      throw new Error('Ethernet transport is not connected');
    }

    const url = `${this.baseUrl}/func=${func}cmd=${cmd}?param=&lang=0&userid1=${this.userid}`;
    const response = await this.session.post(url, body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      transformRequest: [(data) => data]
    });

    return {
      status: response.status,
      data: response.data
    };
  }

  async postParameterUpdate(body = '') {
    if (!this.isConnected()) {
      throw new Error('Ethernet transport is not connected');
    }

    const url = `${this.baseUrl}/func=11cmd=0?${body}`;
    const response = await this.session.post(url, body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      transformRequest: [(data) => data]
    });

    return {
      status: response.status,
      data: response.data
    };
  }
}

module.exports = DcxEthernetService;
