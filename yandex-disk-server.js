const fs = require('fs');
const path = require('path');
const https = require('https');
const config = require('./config');

class YandexDiskService {
  constructor() {
    this.token = config.yandex.token;
    this.enabled = !!this.token;
  }

  // Получить URL для загрузки
  async getUploadUrl(remotePath) {
    return new Promise((resolve, reject) => {
      const encodedPath = encodeURIComponent(remotePath);
      const options = {
        hostname: 'cloud-api.yandex.net',
        path: `/v1/disk/resources/upload?path=${encodedPath}&overwrite=true`,
        method: 'GET',
        headers: {
          'Authorization': `OAuth ${this.token}`
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.href) resolve(json.href);
            else reject(new Error(json.message || 'No upload URL'));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  // Загрузить файл по URL
  async uploadFile(uploadUrl, fileBuffer) {
    return new Promise((resolve, reject) => {
      const url = new URL(uploadUrl);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'PUT',
        headers: {
          'Content-Length': fileBuffer.length
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 201 || res.statusCode === 200) {
            resolve(true);
          } else {
            reject(new Error(`Upload failed: ${res.statusCode}`));
          }
        });
      });
      req.on('error', reject);
      req.write(fileBuffer);
      req.end();
    });
  }

  // Задержка
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Сделать файл публичным
  async publishFile(remotePath) {
    return new Promise((resolve, reject) => {
      const encodedPath = encodeURIComponent(remotePath);
      const options = {
        hostname: 'cloud-api.yandex.net',
        path: `/v1/disk/resources/publish?path=${encodedPath}`,
        method: 'PUT',
        headers: {
          'Authorization': `OAuth ${this.token}`
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.href) {
              this.delay(2000).then(() => this.getPublicUrlWithRetry(remotePath, 3)).then(resolve).catch(reject);
            } else {
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  // Получить публичную ссылку
  async getPublicUrl(remotePath) {
    return new Promise((resolve, reject) => {
      const encodedPath = encodeURIComponent(remotePath);
      const options = {
        hostname: 'cloud-api.yandex.net',
        path: `/v1/disk/resources?path=${encodedPath}`,
        method: 'GET',
        headers: {
          'Authorization': `OAuth ${this.token}`
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.public_url || null);
          } catch (e) {
            resolve(null);
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  // Получить публичную ссылку с retry
  async getPublicUrlWithRetry(remotePath, retries) {
    for (let i = 0; i < retries; i++) {
      const url = await this.getPublicUrl(remotePath);
      if (url) return url;
      console.log(`Retry ${i + 1}/${retries} getting public URL...`);
      await this.delay(1000);
    }
    console.log('Failed to get public URL after retries');
    return null;
  }

  // Скачать файл из Telegram
  async downloadFromTelegram(fileUrl) {
    return new Promise((resolve, reject) => {
      https.get(fileUrl, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          https.get(res.headers.location, (res2) => {
            const chunks = [];
            res2.on('data', chunk => chunks.push(chunk));
            res2.on('end', () => resolve(Buffer.concat(chunks)));
            res2.on('error', reject);
          }).on('error', reject);
          return;
        }
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  // Создать папку на Яндекс Диске
  async createFolder(remotePath) {
    return new Promise((resolve, reject) => {
      const encodedPath = encodeURIComponent(remotePath);
      const options = {
        hostname: 'cloud-api.yandex.net',
        path: `/v1/disk/resources?path=${encodedPath}`,
        method: 'PUT',
        headers: {
          'Authorization': `OAuth ${this.token}`
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 201 || res.statusCode === 409) {
            resolve(true);
          } else {
            reject(new Error(`Create folder failed: ${res.statusCode} ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  // Upload receipt from Telegram URL (for Telegram bot)
  async uploadReceipt(fileUrl, transactionId, fileName) {
    if (!this.enabled) {
      console.log('Yandex Disk not configured');
      return null;
    }

    try {
      const fileBuffer = await this.downloadFromTelegram(fileUrl);
      console.log('File downloaded from Telegram:', fileBuffer.length, 'bytes');
      return this._uploadBuffer(fileBuffer, transactionId, fileName);
    } catch (error) {
      console.error('Yandex Disk upload error:', error.message);
      return null;
    }
  }

  // Upload receipt from buffer (for webchat)
  async uploadReceiptBuffer(fileBuffer, transactionId, fileName) {
    if (!this.enabled) {
      console.log('Yandex Disk not configured');
      return null;
    }

    try {
      console.log('Buffer received:', fileBuffer.length, 'bytes');
      return this._uploadBuffer(fileBuffer, transactionId, fileName);
    } catch (error) {
      console.error('Yandex Disk upload error:', error.message);
      return null;
    }
  }

  // Shared upload logic
  async _uploadBuffer(fileBuffer, transactionId, fileName) {
    await this.createFolder('/Чеки');

    const remotePath = `/Чеки/${transactionId}_${fileName}`;

    const uploadUrl = await this.getUploadUrl(remotePath);
    console.log('Upload URL received');

    await this.uploadFile(uploadUrl, fileBuffer);
    console.log('File uploaded to Yandex Disk');

    const publicUrl = await this.publishFile(remotePath);
    if (publicUrl) {
      console.log('File published:', publicUrl);
      return publicUrl;
    } else {
      console.log('Retrying public URL...');
      const retryUrl = await this.getPublicUrlWithRetry(remotePath, 3);
      return retryUrl;
    }
  }
}

module.exports = new YandexDiskService();