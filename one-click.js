#!/usr/bin/env node
/**
 * 动画放送时间表生成脚本（独立版）
 *
 * 运行环境：Node.js 14+（不需要任何外部 agent / skills 环境）
 *
 * 用法：
 *   node bgm-schedule.js
 *   node bgm-schedule.js --year 2026 --season 秋
 *   node bgm-schedule.js -y 2026 -s 秋 -o ./out
 *   node bgm-schedule.js --no-proxy
 *   node bgm-schedule.js --html-only
 *
 * 环境变量（可选）：
 *   BGM_TOKEN   Bangumi API Token，可提升请求限额
 *
 * 可选依赖：
 *   playwright  用于生成 PNG；未安装时仅输出 HTML，不会报错
 *   安装：npm i playwright
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const readline = require('readline');
const { execSync } = require('child_process');

// ======================== 配置 ========================

const CONFIG_FILE = path.join(__dirname, 'default_path.txt');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8').trim();
      return { defaultOutputDir: content || null };
    }
  } catch (e) {}
  return { defaultOutputDir: null };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, config.defaultOutputDir || '', 'utf-8');
  console.error(`[配置] 已保存到 ${CONFIG_FILE}`);
}

const TOKEN_FILE = path.join(__dirname, 'bgm_token.txt');

function loadToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const content = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
      return content || null;
    }
  } catch (e) {}
  return null;
}

function saveToken(token) {
  if (token) {
    fs.writeFileSync(TOKEN_FILE, token, 'utf-8');
    console.error(`[Token] 已保存到 ${TOKEN_FILE}`);
  } else {
    // 用户拒绝时，写空文件，下次不再问
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
  }
}

// ======================== 参数解析 ========================

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    year: null,
    season: null,
    output: null,
    htmlOnly: false,
    proxy: null,
    noProxy: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--year':
      case '-y':
        params.year = parseInt(args[++i]);
        break;
      case '--season':
      case '-s':
        params.season = args[++i];
        break;
      case '--output':
      case '-o':
        params.output = args[++i];
        break;
      case '--html-only':
        params.htmlOnly = true;
        break;
      case '--proxy':
        params.proxy = args[++i] || 'auto';
        break;
      case '--no-proxy':
        params.noProxy = true;
        break;
    }
  }

  return params;
}

// ======================== 交互 ========================

function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function getSeasonAndYear(params) {
  console.error('\n=== 动画时间表 ===\n');

  const monthToSeason = (m) => {
    if (m >= 3 && m <= 5) return '春';
    if (m >= 6 && m <= 8) return '夏';
    if (m >= 9 && m <= 11) return '秋';
    return '冬';
  };

  if (params.year && params.season) {
    const validSeasons = ['冬', '春', '夏', '秋'];
    if (!validSeasons.includes(params.season)) {
      console.error(`[错误] 无效季节: ${params.season}，可选: 冬/春/夏/秋`);
      process.exit(1);
    }
    console.error(`[参数] ${params.year}年${params.season}季\n`);
    return {
      year: params.year,
      season: params.season,
      htmlOnly: params.htmlOnly,
      output: params.output,
      proxy: params.proxy,
      noProxy: params.noProxy
    };
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const seasonOrder = ['冬', '春', '夏', '秋'];
  const seasonIndex = (s) => seasonOrder.indexOf(s);
  const nextSeason = (s) => seasonOrder[(seasonIndex(s) + 1) % 4];
  const prevSeason = (s) => seasonOrder[(seasonIndex(s) + 3) % 4];

  const currentSeason = monthToSeason(currentMonth);
  const isFirstMonthOfSeason = (currentMonth === 3 || currentMonth === 6 || currentMonth === 9 || currentMonth === 12);
  const recommendSeason = isFirstMonthOfSeason ? currentSeason : nextSeason(currentSeason);
  const recommendYear = (recommendSeason === '冬' && currentMonth <= 2) ? currentYear - 1 : currentYear;

  const altSeason = prevSeason(recommendSeason);
  const altYear = (altSeason === '冬' && currentMonth <= 2) ? currentYear - 1 : currentYear;

  console.error(`推荐: 1) ${recommendYear}年${recommendSeason}季`);
  console.error(`       2) ${altYear}年${altSeason}季`);
  console.error(`       3) 手动输入\n`);

  const choice = await askQuestion('请选择 (1/2/3): ');

  let year, season;
  if (choice === '1') {
    year = recommendYear;
    season = recommendSeason;
  } else if (choice === '2') {
    year = altYear;
    season = altSeason;
  } else if (choice === '3') {
    const answer = await askQuestion('请输入日期（如 2026年10月 或 2026年7月）：');
    const monthMatch = answer.match(/(\d{4})\s*年?\s*(\d{1,2})\s*月?/);
    const seasonMatch = answer.match(/(\d{4})\s*年?\s*(冬|春|夏|秋)/);

    if (seasonMatch) {
      year = parseInt(seasonMatch[1]);
      season = seasonMatch[2];
    } else if (monthMatch) {
      year = parseInt(monthMatch[1]);
      const month = parseInt(monthMatch[2]);
      season = monthToSeason(month);
    } else {
      console.error('[错误] 无法解析输入（示例：2026年10月 或 2026年7月）');
      process.exit(1);
    }
  } else {
    console.error('[错误] 无效选择');
    process.exit(1);
  }

  console.error(`\n[选择] ${year}年${season}季\n`);

  return {
    year,
    season,
    htmlOnly: params.htmlOnly,
    output: params.output,
    proxy: params.proxy,
    noProxy: params.noProxy
  };
}

async function getOutputDir(cliOutput, nonInteractive) {
  const config = loadConfig();

  if (cliOutput) {
    if (!fs.existsSync(cliOutput)) {
      console.error(`[提示] 目录不存在，将创建: ${cliOutput}`);
      fs.mkdirSync(cliOutput, { recursive: true });
    }
    console.error(`[输出] ${cliOutput}\n`);
    return cliOutput;
  }

  if (nonInteractive) {
    if (config.defaultOutputDir && fs.existsSync(config.defaultOutputDir)) {
      console.error(`[输出] ${config.defaultOutputDir}\n`);
      return config.defaultOutputDir;
    } else {
      console.error('[错误] 非交互模式需要指定输出目录（--output 或默认目录）');
      process.exit(1);
    }
  }

  if (config.defaultOutputDir) {
    if (fs.existsSync(config.defaultOutputDir)) {
      console.error(`\n[默认输出目录] ${config.defaultOutputDir}`);
      const useDefault = await askQuestion('是否使用此目录 (Y/n): ');
      if (!useDefault || useDefault.toLowerCase() === 'y' || useDefault.toLowerCase() === 'yes') {
        return config.defaultOutputDir;
      }
    } else {
      console.error(`\n[提示] 默认目录不存在: ${config.defaultOutputDir}`);
    }
  }

  const newPath = await askQuestion('请输入输出目录：');

  if (!newPath) {
    console.error('[错误] 未指定输出目录');
    process.exit(1);
  }

  if (!fs.existsSync(newPath)) {
    console.error(`[提示] 目录不存在，将创建: ${newPath}`);
    fs.mkdirSync(newPath, { recursive: true });
  }

  config.defaultOutputDir = newPath;
  saveConfig(config);

  return newPath;
}

async function getBgmToken() {
  // 环境变量优先，有就直接用
  const envToken = process.env.BGM_TOKEN || '';
  if (envToken) {
    console.error(`[Token] 使用环境变量 BGM_TOKEN\n`);
    return envToken;
  }

  const savedToken = loadToken();

  // 情况 A：有旧 token，问是否沿用
  if (savedToken) {
    const masked = savedToken.length > 12
      ? savedToken.slice(0, 6) + '...' + savedToken.slice(-4)
      : savedToken;
    console.error(`\n[原有 Token] ${masked}`);
    const useOld = await askQuestion('是否使用原有 Token (Y/n): ');
    if (!useOld || useOld.toLowerCase() === 'y' || useOld.toLowerCase() === 'yes') {
      console.error('[Token] 使用原有 Token\n');
      return savedToken;
    }
    // 用户不想用旧的，进入“设置新 token”
  }

  // 情况 B：无旧 token（或用户拒绝旧 token），问是否要设置
  console.error('\n[Token] 未检测到可用的 Token');
  console.error('  Bangumi Token 可提升 API 限额，并可访问受限目录（如含 NSFW 的目录）');
  console.error('  获取地址：https://next.bgm.tv/demo/access-token');

  const wantToken = await askQuestion('是否设置 Token (y/N): ');
  if (!wantToken || wantToken.toLowerCase() === 'n' || wantToken.toLowerCase() === 'no') {
    console.error('[Token] 本次使用匿名请求\n');
    // 不保存任何东西，下次启动时因为文件不存在，会重新询问
    return '';
  }

  const newToken = await askQuestion('请粘贴 Token：');
  if (!newToken) {
    console.error('[Token] 输入为空，本次使用匿名请求\n');
    return '';
  }

  saveToken(newToken);
  console.error('[Token] 使用新的 Token\n');
  return newToken;
}
// ======================== 代理 ========================

let PROXY_HOST = null;
let PROXY_PORT = null;

function detectProxy(cliProxy, noProxy) {
  if (noProxy) {
    console.error('[代理] 已禁用（--no-proxy）');
    return;
  }

  if (cliProxy && cliProxy !== 'auto') {
    const parts = cliProxy.split(':');
    PROXY_HOST = parts[0];
    PROXY_PORT = parseInt(parts[1]) || 7890;
    console.error(`[代理] 使用参数: ${PROXY_HOST}:${PROXY_PORT}`);
    return;
  }

  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy ||
                   process.env.HTTP_PROXY || process.env.http_proxy ||
                   process.env.ALL_PROXY || process.env.all_proxy;
  if (envProxy) {
    try {
      const u = new URL(envProxy);
      PROXY_HOST = u.hostname;
      PROXY_PORT = parseInt(u.port) || 7890;
      console.error(`[代理] 使用环境变量: ${PROXY_HOST}:${PROXY_PORT}`);
      return;
    } catch {}
  }

  if (process.platform === 'win32') {
    try {
      const result = execSync(
        'powershell -Command "Get-ItemProperty -Path \'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\' | Select-Object -ExpandProperty ProxyServer"',
        { timeout: 5000, encoding: 'utf-8' }
      ).trim();
      if (result) {
        const firstPart = result.split(';')[0];
        const match = firstPart.match(/([\d.]+):(\d+)/);
        if (match) {
          PROXY_HOST = match[1];
          PROXY_PORT = parseInt(match[2]);
          console.error(`[代理] 使用系统代理: ${PROXY_HOST}:${PROXY_PORT}`);
          return;
        }
      }
    } catch {}
  }

  console.error('[代理] 未检测到代理，直连');
}

// ======================== HTTP POST JSON ========================

function httpPostJson(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const parsedUrl = new URL(url);
    const bodyStr = JSON.stringify(body);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      ...extraHeaders
    };

    if (!PROXY_HOST || !PROXY_PORT) {
      const lib = isHttps ? https : http;
      const req = lib.request(url, {
        method: 'POST',
        headers: headers,
        timeout: 30000
      }, (response) => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');
          const setCookies = response.headers['set-cookie'] || [];
          let token = null;
          for (const c of setCookies) {
            const match = c.match(/anime_schedule_public_api_token=([^;]+)/);
            if (match) token = match[1];
          }
          resolve({ status: response.statusCode, data, headers: response.headers, token });
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.write(bodyStr);
      req.end();
      return;
    }

    const connectReq = http.request({
      host: PROXY_HOST,
      port: PROXY_PORT,
      method: 'CONNECT',
      path: `${parsedUrl.hostname}:443`,
      timeout: 15000
    });

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Proxy CONNECT failed: ${res.statusCode}`));
        return;
      }
      const tlsSocket = require('tls').connect({
        host: parsedUrl.hostname,
        socket: socket,
        servername: parsedUrl.hostname,
        rejectUnauthorized: true
      }, () => {
        const path = parsedUrl.pathname + parsedUrl.search;
        const httpsReq = https.request({
          host: parsedUrl.hostname,
          port: 443,
          path: path,
          method: 'POST',
          headers: headers,
          socket: tlsSocket,
          createConnection: () => tlsSocket,
          timeout: 30000
        }, (response) => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => {
            const data = Buffer.concat(chunks).toString('utf-8');
            const setCookies = response.headers['set-cookie'] || [];
            let token = null;
            for (const c of setCookies) {
              const match = c.match(/anime_schedule_public_api_token=([^;]+)/);
              if (match) token = match[1];
            }
            resolve({ status: response.statusCode, data, headers: response.headers, token });
          });
        });
        httpsReq.on('error', reject);
        httpsReq.on('timeout', () => { httpsReq.destroy(); reject(new Error('Request timeout')); });
        httpsReq.write(bodyStr);
        httpsReq.end();
      });
      tlsSocket.on('error', reject);
    });

    connectReq.on('error', (err) => {
      const lib = isHttps ? https : http;
      const req = lib.request(url, {
        method: 'POST',
        headers: headers,
        timeout: 30000
      }, (response) => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');
          const setCookies = response.headers['set-cookie'] || [];
          let token = null;
          for (const c of setCookies) {
            const match = c.match(/anime_schedule_public_api_token=([^;]+)/);
            if (match) token = match[1];
          }
          resolve({ status: response.statusCode, data, headers: response.headers, token });
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.write(bodyStr);
      req.end();
    });
    connectReq.on('timeout', () => { connectReq.destroy(); reject(new Error('Proxy timeout')); });
    connectReq.end();
  });
}

// ======================== HTTP GET ========================

function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const parsedUrl = new URL(url);
    const headers = {
      'User-Agent': 'Au-Go/one-click-anime-schedule',
      ...options.headers
    };

    if (!PROXY_HOST || !PROXY_PORT) {
      const lib = isHttps ? https : http;
      const req = lib.get(url, {
        headers: headers,
        timeout: 60000
      }, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');
          resolve({ status: res.statusCode, data, headers: res.headers });
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      return;
    }

    const connectReq = http.request({
      host: PROXY_HOST,
      port: PROXY_PORT,
      method: 'CONNECT',
      path: `${parsedUrl.hostname}:443`,
      timeout: 15000
    });

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Proxy CONNECT failed: ${res.statusCode}`));
        return;
      }
      const tlsSocket = require('tls').connect({
        host: parsedUrl.hostname,
        socket: socket,
        servername: parsedUrl.hostname,
        rejectUnauthorized: true
      }, () => {
        const path = parsedUrl.pathname + parsedUrl.search;
        const httpsReq = https.request({
          host: parsedUrl.hostname,
          port: 443,
          path: path,
          method: 'GET',
          headers: headers,
          socket: tlsSocket,
          createConnection: () => tlsSocket,
          timeout: 60000
        }, (response) => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => {
            const data = Buffer.concat(chunks).toString('utf-8');
            resolve({ status: response.statusCode, data, headers: response.headers });
          });
        });
        httpsReq.on('error', reject);
        httpsReq.on('timeout', () => { httpsReq.destroy(); reject(new Error('Request timeout')); });
        httpsReq.end();
      });
      tlsSocket.on('error', reject);
    });

    connectReq.on('error', (err) => {
      const lib = isHttps ? https : http;
      const req = lib.get(url, {
        headers: headers,
        timeout: 60000
      }, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');
          resolve({ status: res.statusCode, data, headers: res.headers });
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    });
    connectReq.on('timeout', () => { connectReq.destroy(); reject(new Error('Proxy timeout')); });
    connectReq.end();
  });
}

// ======================== Step 1: bgm.tv 目录 ========================
let BGM_TOKEN = '';

async function fetchIndexInfo(indexId) {
  const url = `https://api.bgm.tv/v0/indices/${indexId}`; 
  const headers = {};
  if (BGM_TOKEN) headers['Authorization'] = `Bearer ${BGM_TOKEN}`;

  const res = await httpGet(url, { headers });
  if (res.status !== 200) {
    throw new Error(`获取目录 ${indexId} 失败: HTTP ${res.status}`);
  }
  return JSON.parse(res.data);
}

async function fetchIndexSubjects(indexId, limit = 50, offset = 0) {
  const url = `https://api.bgm.tv/v0/indices/${indexId}/subjects?limit=${limit}&offset=${offset}`;   
  const headers = {};
  if (BGM_TOKEN) headers['Authorization'] = `Bearer ${BGM_TOKEN}`;

  try {
    const res = await httpGet(url, { headers });
    if (res.status === 200) {
      const data = JSON.parse(res.data);
      return Array.isArray(data) ? data : (data.data || []);
    }
  } catch (e) {
    console.error(`  获取目录 ${indexId} 条目失败: ${e.message}`);
  }
  return [];
}

async function fetchAllIndexSubjects(indexId) {
  let allEntries = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const entries = await fetchIndexSubjects(indexId, limit, offset);
    if (!entries.length) break;

    allEntries = allEntries.concat(entries);
    offset += limit;

    if (entries.length < limit) break;
  }

  return allEntries;
}

async function fetchSubjectDetail(subjectId) {
  const url = `https://api.bgm.tv/v0/subjects/${subjectId}`;
  const headers = {};
  if (BGM_TOKEN) headers['Authorization'] = `Bearer ${BGM_TOKEN}`;

  try {
    const res = await httpGet(url, { headers });
    if (res.status === 200) {
      return JSON.parse(res.data);
    }
  } catch (e) {
    console.error(`  获取条目 ${subjectId} 详情失败: ${e.message}`);
  }
  return null;
}

async function fetchProductionFromPersons(subjectId) {
  const url = `https://api.bgm.tv/v0/subjects/${subjectId}/persons`;
  const headers = {};
  if (BGM_TOKEN) headers['Authorization'] = `Bearer ${BGM_TOKEN}`;

  try {
    const res = await httpGet(url, { headers });
    if (res.status === 200) {
      const data = JSON.parse(res.data);
      const producers = data
        .filter(p => p.relation === '动画制作')
        .map(p => p.name || '');
      return producers.filter(Boolean).join(', ');
    }
  } catch (e) {}
  return '';
}

function getSeasonKey(year, season) {
  return `${String(year).slice(-2)}${season}`;
}

function findIndexIdFromDesc(desc, year, season) {
  const key = getSeasonKey(year, season);
  const regex = new RegExp(`${key}\\s*[：:]\\s*(\\d+)`);
  const match = desc.match(regex);

  if (!match) {
    throw new Error(`目录简介中未找到 ${key} 对应的目录 ID`);
  }

  return match[1];
}

function pickValue(item) {
  if (!item) return '';
  const v = item.value;
  if (Array.isArray(v)) {
    return v
      .map(x => (typeof x === 'string' ? x : (x.v || x.value || '')))
      .filter(Boolean)
      .join(', ');
  }
  return String(v || '');
}

function extractEntryInfo(entry, fallbackDate = '') {
  const infobox = entry.infobox || [];
  const tags = entry.tags || [];

  let nameCn = '';
  const cnItem = infobox.find(i => i.key === '中文名');
  if (cnItem) nameCn = pickValue(cnItem);

  let production = '';
  const prodItem = infobox.find(i => i.key === '动画制作');
  if (prodItem) production = pickValue(prodItem);

  let website = '';
  const webItem = infobox.find(i => i.key === '官方网站');
  if (webItem) website = pickValue(webItem);

  const typeTags = ['漫画改', '小说改', '原创', '游戏改'];
  let animType = '';
  let maxCount = 0;

  for (const tag of tags) {
    if (typeTags.includes(tag.name) && (tag.count || 0) > maxCount) {
      maxCount = tag.count || 0;
      animType = tag.name;
    }
  }

  const tagNames = tags.map(t => t.name || '');
  if (!animType || tagNames.some(t => t.includes('泡面') || t.includes('短片'))) {
    animType = '泡面';
  }

  const dateStr = entry.date || '';
  let preciseDate = fallbackDate;

  if (dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      preciseDate = `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
    } else {
      preciseDate = dateStr;
    }
  }

  return {
    bgm_id: entry.id || '',
    name: entry.name || '',
    name_cn: nameCn,
    anim_type: animType,
    production,
    website,
    date: preciseDate
  };
}

async function collectAnimeData(year, season) {
  const rootIndexId = '104044';

  const rootIndex = await fetchIndexInfo(rootIndexId);
  const desc = rootIndex.desc || '';

  const targetIndexId = findIndexIdFromDesc(desc, year, season);
  console.error(`找到 ${year}${season} 对应目录 ID: ${targetIndexId}`);

  const entries = await fetchAllIndexSubjects(targetIndexId);
  console.error(`目录中共 ${entries.length} 个条目，开始获取每个条目的详情...\n`);

  // 先按原始顺序去重，得到确定的处理列表
  const unique = [];
  const seenIds = new Set();
  for (const raw of entries) {
    const bgmId = raw.id || raw.subject_id;
    if (!bgmId) continue;
    if (seenIds.has(bgmId)) continue;
    seenIds.add(bgmId);
    unique.push(raw);
  }

  const total = unique.length;
  const results = new Array(total);   // 按索引回填，保证最终顺序和目录顺序一致
  let completed = 0;
  let cursor = 0;                     // 下一个待处理索引
  const CONCURRENCY = 3;

  // 单个条目的完整处理流程
  async function processOne(index) {
    const raw = unique[index];
    const bgmId = raw.id || raw.subject_id;
    const progress = `[${index + 1}/${total}]`;

    console.error(`${progress} 获取条目 ${bgmId} 详情...`);
    const detail = await fetchSubjectDetail(bgmId);
    const subject = detail || raw;

    if (!subject.id) subject.id = bgmId;
    if (!subject.name) subject.name = raw.name || '';
    if (!subject.infobox) subject.infobox = raw.infobox || [];

    const info = extractEntryInfo(subject, `${year}年${season}`);

    if (!info.production && subject.id) {
      console.error(`${progress}   补全制作公司...`);
      info.production = await fetchProductionFromPersons(subject.id);
    }

    results[index] = info;
    completed++;
    console.error(`${progress} 完成 (${completed}/${total})`);
  }

  // 滑动窗口 worker：谁先空出来谁就取下一个索引
  async function worker() {
    while (true) {
      const myIndex = cursor++;
      if (myIndex >= total) return;

      try {
        await processOne(myIndex);
      } catch (e) {
        console.error(`[错误] 处理第 ${myIndex + 1} 个条目失败: ${e.message}`);
        // 兜底：即使失败也占位，避免 results 里出现空洞
        const raw = unique[myIndex];
        results[myIndex] = extractEntryInfo(raw, `${year}年${season}`);
      }
    }
  }

  const workers = [];
  const workerCount = Math.min(CONCURRENCY, total);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const allEntries = results.filter(Boolean);
  console.error(`\nStep 1 完成，共收集 ${allEntries.length} 个条目\n`);
  return allEntries;
}

function formatAnimeList(entries) {
  const lines = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    lines.push(`${i + 1}. ${entry.name}`);
    lines.push(`   BGM ID: ${entry.bgm_id}`);
    if (entry.name_cn) lines.push(`   中文名: ${entry.name_cn}`);
    if (entry.anim_type) lines.push(`   类型: ${entry.anim_type}`);
    if (entry.production) lines.push(`   动画制作: ${entry.production}`);
    if (entry.website) lines.push(`   官方网站: ${entry.website}`);
    lines.push(`   放送日期: ${entry.date}`);
    lines.push('');
  }

  lines.push('===统计信息===');
  lines.push(`总计: ${entries.length}个条目`);

  const typeCount = {};
  for (const entry of entries) {
    const t = entry.anim_type || '未分类';
    typeCount[t] = (typeCount[t] || 0) + 1;
  }
  lines.push('类型分布:');
  for (const [t, count] of Object.entries(typeCount)) {
    lines.push(`- ${t}: ${count}个`);
  }

  return lines.join('\n');
}

// ======================== Step 2: bgm.wiki 数据 ========================

function getSeasonDateRange(season, year) {
  const ranges = {
    '冬': [`${year - 1}-12-01`, `${year}-03-01`],
    '春': [`${year}-03-01`, `${year}-06-01`],
    '夏': [`${year}-06-01`, `${year}-09-01`],
    '秋': [`${year}-09-01`, `${year}-12-01`]
  };
  return ranges[season] || [null, null];
}

function dateToTimestamp(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getTime();
}

async function fetchBgmWikiToken() {
  console.error('正在获取 bgm.wiki API token...');

  try {
    const refreshRes = await httpPostJson('https://bgm.wiki/api/public/refresh-token', {});

    if (refreshRes.status === 200) {
      const token = refreshRes.token;
      if (token) {
        console.error('bgm.wiki token 获取成功');
        return token;
      }
    }

    console.error('bgm.wiki token 获取失败');
    return null;
  } catch (e) {
    console.error(`获取 token 失败: ${e.message}`);
    return null;
  }
}

async function fetchWeekData(fromTs, toTs, token) {
  const url = `https://bgm.wiki/api/schedule/window?from=${fromTs}&to=${toTs}&lang=zh-CN`;
  const headers = {};
  if (token) headers['x-public-api-token'] = token;

  try {
    const res = await httpGet(url, { headers });
    if (res.status === 200) {
      return { ok: true, data: JSON.parse(res.data) };
    }
    if (res.status === 403) {
      return { ok: false, tokenExpired: true };
    }
    console.error(`  [警告] bgm.wiki 返回 ${res.status}`);
    return { ok: false, tokenExpired: false };
  } catch (e) {
    console.error(`  [错误] 请求失败: ${e.message}`);
    return { ok: false, tokenExpired: false };
  }
}

async function fetchAllSchedule(fromDate, toDate) {
  const allEvents = [];
  const fromTs = dateToTimestamp(fromDate);
  const toTs = dateToTimestamp(toDate);
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  console.error(`正在获取 ${fromDate} 到 ${toDate} 的放送数据...`);

  let token = await fetchBgmWikiToken();
  if (!token) {
    console.error('[错误] 无法获取 bgm.wiki token');
    return allEvents;
  }

  let currentTs = fromTs;
  let weekNum = 0;

  while (currentTs < toTs) {
    const weekEnd = Math.min(currentTs + weekMs, toTs);
    weekNum++;
    console.error(`  获取第 ${weekNum} 周数据...`);

    let result = await fetchWeekData(currentTs, weekEnd, token);

    if (!result.ok && result.tokenExpired) {
      console.error('  [提示] token 过期，正在刷新...');
      token = await fetchBgmWikiToken();
      if (token) {
        result = await fetchWeekData(currentTs, weekEnd, token);
      }
    }

    if (result.ok && result.data && result.data.events) {
      allEvents.push(...result.data.events);
    }

    currentTs = weekEnd;
  }

  console.error(`共获取 ${allEvents.length} 条放送事件`);
  return allEvents;
}

function deduplicateAnime(events) {
  const byWorkId = new Map();

  for (const event of events) {
    const workId = event.workId;
    if (!workId) continue;
    if (!byWorkId.has(workId)) {
      byWorkId.set(workId, []);
    }
    byWorkId.get(workId).push(event);
  }

  const result = [];
  for (const [workId, eventList] of byWorkId) {
    const byPlatform = new Map();

    for (const e of eventList) {
      const platform = (e.platform && e.platform.text) || '';
      if (!byPlatform.has(platform)) {
        byPlatform.set(platform, []);
      }
      byPlatform.get(platform).push(e);
    }

    const platformBest = [];
    for (const [platform, platformEvents] of byPlatform) {
      const timeCount = new Map();
      for (const e of platformEvents) {
        timeCount.set(e.eventAt, (timeCount.get(e.eventAt) || 0) + 1);
      }

      let bestTime = null;
      let bestCount = 0;
      for (const [time, count] of timeCount) {
        if (count > bestCount || (count === bestCount && (!bestTime || time < bestTime))) {
          bestCount = count;
          bestTime = time;
        }
      }

      const bestEvent = platformEvents.find(e => e.eventAt === bestTime);
      if (bestEvent) platformBest.push(bestEvent);
    }

    platformBest.sort((a, b) => new Date(a.eventAt) - new Date(b.eventAt));
    if (platformBest.length > 0) result.push(platformBest[0]);
  }

  console.error(`去重后 ${result.length} 个作品`);
  return result;
}

function parseUserAnimeList(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const animeList = [];
  let current = null;

  for (const line of lines) {
    const m = line.match(/^(\d+)\.\s+(.+)/);
    if (m) {
      if (current) animeList.push(current);
      current = {
        num: parseInt(m[1]),
        jpTitle: m[2].trim(),
        bgmId: null,
        info: []
      };
    } else if (current && line.trim()) {
      current.info.push(line.trim());

      const bgmIdMatch = line.match(/BGM\s*ID[:\s]*(\d+)/i) ||
                        line.match(/bgm\.tv\/subject\/(\d+)/i) ||
                        line.match(/bgmId[:\s]*(\d+)/i) ||
                        line.match(/bangumi[:\s]*(\d+)/i);
      if (bgmIdMatch) current.bgmId = parseInt(bgmIdMatch[1]);
    }
  }

  if (current) animeList.push(current);
  return animeList;
}

function matchScore(userJp, bgmJp, bgmMain) {
  const normalize = (s) => (s || '').replace(/[\s　]/g, '').toLowerCase();
  const u = normalize(userJp);
  const bj = normalize(bgmJp);
  const bm = normalize(bgmMain);

  if (u === bj || u === bm) return 100;
  if (bj.includes(u) || u.includes(bj)) return 90;
  if (bm.includes(u) || u.includes(bm)) return 80;

  const uChars = u.split('');
  let matched = 0;
  for (const c of uChars) {
    if (bj.includes(c) || bm.includes(c)) matched++;
  }
  return Math.floor((matched / uChars.length) * 70);
}

function matchAnime(userList, bgmData) {
  const results = [];

  const bgmIdMap = new Map();
  for (const ba of bgmData) {
    if (ba.bgmId) bgmIdMap.set(ba.bgmId, ba);
  }

  for (const ua of userList) {
    let bestMatch = null;
    let bestScore = 0;
    let matchMethod = '';

    if (ua.bgmId && bgmIdMap.has(ua.bgmId)) {
      bestMatch = bgmIdMap.get(ua.bgmId);
      bestScore = 100;
      matchMethod = 'bgmId精确匹配';
    } else {
      for (const ba of bgmData) {
        const titles = ba.titles || {};
        const score = matchScore(ua.jpTitle, titles.japan, titles.main);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = ba;
          matchMethod = '标题模糊匹配';
        }
      }
    }

    let cnName = '';
    let userDate = '';
    for (const info of ua.info) {
      if (info.startsWith('中文名:')) cnName = info.replace('中文名:', '').trim();
      else if (info.startsWith('放送日期:')) userDate = info.replace('放送日期:', '').trim();
    }

    const result = {
      num: ua.num,
      jpTitle: ua.jpTitle,
      cnName,
      userDate,
      bgmBroadcast: '未找到',
      bgmPlatform: '未找到',
      matchInfo: '未匹配'
    };

    if (bestMatch && bestScore >= 60) {
      const eventDate = new Date(bestMatch.eventAt);
      const jstMs = eventDate.getTime() + 9 * 60 * 60 * 1000;
      const jstDate = new Date(jstMs);

    const weekdays = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
      let weekday = weekdays[jstDate.getUTCDay()];

      let hours = jstDate.getUTCHours();
      const minutes = String(jstDate.getUTCMinutes()).padStart(2, '0');

      if (hours >= 0 && hours < 6) {
        hours += 24;
        const prevDay = new Date(jstMs - 24 * 60 * 60 * 1000);
        weekday = weekdays[prevDay.getUTCDay()];
      }

      result.bgmBroadcast = `${String(hours).padStart(2, '0')}:${minutes} (${weekday})`;
      result.bgmPlatform = (bestMatch.platform && bestMatch.platform.text) || '';
      result.matchInfo = matchMethod;
    } else if (bestScore > 0) {
      result.matchInfo = `低置信匹配 (匹配度:${bestScore}%)`;
    }

    results.push(result);
  }

  return results;
}

function generateMergedOutput(results, fromDate, toDate, originalContent) {
  const matchedLines = [];
  const unmatchedLines = [];

  unmatchedLines.push('未匹配 条目');
  unmatchedLines.push('数据来源: https://bgm.wiki/');
  unmatchedLines.push(`时间范围: ${fromDate} ~ ${toDate}`);
  unmatchedLines.push(`生成日期: ${new Date().toISOString().slice(0, 10)}`);
  unmatchedLines.push('='.repeat(60));
  unmatchedLines.push('');
  unmatchedLines.push('以下为在 bgm.wiki 中未找到的条目：');
  unmatchedLines.push('');

  let foundCount = 0;
  let notFoundCount = 0;

  for (const r of results) {
    if (r.bgmBroadcast !== '未找到') {
      foundCount++;
    } else {
      notFoundCount++;
      unmatchedLines.push(`${r.num}. ${r.jpTitle}`);
      if (r.cnName) unmatchedLines.push(`   中文名: ${r.cnName}`);
      unmatchedLines.push('');
    }
  }

const statsIdx = originalContent.indexOf('===统计信息===');
const contentOnly = statsIdx >= 0 ? originalContent.slice(0, statsIdx) : originalContent;
const originalLines = contentOnly.split('\n');
  let currentNum = 0;
  let currentResult = null;
  let inMatchedEntry = false;

  for (let i = 0; i < originalLines.length; i++) {
    const line = originalLines[i];
    const titleMatch = line.match(/^(\d+)\.\s+(.+)/);

    if (titleMatch) {
      if (inMatchedEntry && currentResult) {
        matchedLines.push(`   放送时间(JST): ${currentResult.bgmBroadcast}`);
        matchedLines.push(`   放送平台: ${currentResult.bgmPlatform}`);
      }

      currentNum = parseInt(titleMatch[1]);
      currentResult = results.find(r => r.num === currentNum);

      if (currentResult && currentResult.bgmBroadcast !== '未找到') {
        inMatchedEntry = true;
        if (matchedLines.length > 0) matchedLines.push('');
        matchedLines.push(line);
      } else {
        inMatchedEntry = false;
      }
      continue;
    }

    if (inMatchedEntry && line.trim() !== '') {
      matchedLines.push(line);
    }
  }

  if (inMatchedEntry && currentResult) {
    matchedLines.push(`   放送时间(JST): ${currentResult.bgmBroadcast}`);
    matchedLines.push(`   放送平台: ${currentResult.bgmPlatform}`);
  }

  unmatchedLines.push('='.repeat(60));
  unmatchedLines.push(`统计: 共${notFoundCount}个条目未找到`);

  return {
    matched: matchedLines.join('\n'),
    unmatched: unmatchedLines.join('\n')
  };
}

// ======================== Step 3: 生成 HTML ========================

const SEASONS = {
  春: {
    label: '春',
    seasonNum: (y) => `${y}年春番组`,
    titleText: (y) => `${y.slice(-2)} 年 春 季 新 番 时 间 表`,
    bodyBg: '#f5e6e8', wrapperBg: '#fdf6f7',
    titleBar: 'linear-gradient(135deg, #c0392b 0%, #e74c3c 40%, #f1948a 100%)',
    titleBarShadow: 'rgba(192,57,43,0.3)',
    headerBg: '#c0392b', headerBorder: '#a93226',
    yomiBg: '#f8bbd0', yomiBorder: '#e91e63', yomiColor: '#880e4f',
    dateBg: '#fce4ec', rowEven: '#fff5f5', rowHover: '#ffebee',
    timeColor: '#c0392b', footerBg: '#c0392b',
  },
  夏: {
    label: '夏',
    seasonNum: (y) => `${y}年夏番组`,
    titleText: (y) => `${y.slice(-2)} 年 夏 季 新 番 时 间 表`,
    bodyBg: '#e0f0f8', wrapperBg: '#f5fafd',
    titleBar: 'linear-gradient(135deg, #1565c0 0%, #1e88e5 40%, #64b5f6 100%)',
    titleBarShadow: 'rgba(21,101,192,0.3)',
    headerBg: '#1565c0', headerBorder: '#0d47a1',
    yomiBg: '#b3e5fc', yomiBorder: '#0288d1', yomiColor: '#01579b',
    dateBg: '#e1f5fe', rowEven: '#f5faff', rowHover: '#e3f2fd',
    timeColor: '#d32f2f', footerBg: '#1565c0',
  },
  秋: {
    label: '秋',
    seasonNum: (y) => `${y}年秋番组`,
    titleText: (y) => `${y.slice(-2)} 年 秋 季 新 番 时 间 表`,
    bodyBg: '#f0e4d4', wrapperBg: '#fdf8f2',
    titleBar: 'linear-gradient(135deg, #bf360c 0%, #e65100 40%, #ff8a65 100%)',
    titleBarShadow: 'rgba(191,54,12,0.3)',
    headerBg: '#bf360c', headerBorder: '#a62b08',
    yomiBg: '#ffcc80', yomiBorder: '#ef6c00', yomiColor: '#e65100',
    dateBg: '#fff3e0', rowEven: '#fdf8f0', rowHover: '#fff3e0',
    timeColor: '#bf360c', footerBg: '#bf360c',
  },
  冬: {
    label: '冬',
    seasonNum: (y) => `${y}年冬番组`,
    titleText: (y) => `${y.slice(-2)} 年 冬 季 新 番 时 间 表`,
    bodyBg: '#dce4ec', wrapperBg: '#f0f4f8',
    titleBar: 'linear-gradient(135deg, #1a237e 0%, #283593 40%, #5c6bc0 100%)',
    titleBarShadow: 'rgba(26,35,126,0.3)',
    headerBg: '#1a237e', headerBorder: '#0d1458',
    yomiBg: '#c5cae9', yomiBorder: '#3949ab', yomiColor: '#1a237e',
    dateBg: '#e8eaf6', rowEven: '#f5f6fa', rowHover: '#e8eaf6',
    timeColor: '#b71c1c', footerBg: '#1a237e',
  },
};

function parseEntries(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const entries = [];
  const blocks = raw.split(/^\d+\.\s/m).filter(b => b.trim());
  const dayMap = { '日曜日': '日', '月曜日': '月', '火曜日': '火', '水曜日': '水', '木曜日': '木', '金曜日': '金', '土曜日': '土' };

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const title = lines[0];
    const get = (key) => {
      const line = lines.find(l => l.startsWith(`${key}:`));
      return line ? line.replace(`${key}:`, '').trim() : '';
    };
    const timeStr = get('放送时间(JST)');
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*\((.+?)\)/);
    if (!timeMatch) continue;

    const hour = parseInt(timeMatch[1]);
    const minute = timeMatch[2];
    const dayJp = timeMatch[3];
    const yomi = dayMap[dayJp] || dayJp;

    const dateStr = get('放送日期');
    const dateMatch = dateStr.match(/(\d+)年(\d+)月(\d+)日/);
    if (!dateMatch) {
      console.error(`  [警告] 无法解析日期: "${dateStr}" (${title})`);
    }
    const month = dateMatch ? parseInt(dateMatch[2]) : 0;
    const day = dateMatch ? parseInt(dateMatch[3]) : 0;

    entries.push({
      title, dateStr,
      chineseName: get('中文名') || '',
      type: get('类型'),
      studio: get('动画制作'),
      month, day,
      time: `${String(hour).padStart(2, '0')}:${minute}`,
      hour, minute: parseInt(minute),
      platform: get('放送平台'),
      yomi,
    });
  }
  return entries;
}

function sortEntries(entries) {
  const yomiOrder = { '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6 };
  entries.sort((a, b) => {
    const ya = yomiOrder[a.yomi] ?? 7, yb = yomiOrder[b.yomi] ?? 7;
    if (ya !== yb) return ya - yb;
    const ha = a.hour < 6 ? a.hour + 24 : a.hour;
    const hb = b.hour < 6 ? b.hour + 24 : b.hour;
    if (ha !== hb) return ha - hb;
    return a.minute - b.minute;
  });
  return entries;
}

function groupByYomi(entries) {
  const groups = {};
  for (const e of entries) { (groups[e.yomi] = groups[e.yomi] || []).push(e); }
  return groups;
}

function generateHTML(entries, seasonKey, year) {
  const S = SEASONS[seasonKey];
  const groups = groupByYomi(entries);
  const yomiOrderList = ['日', '月', '火', '水', '木', '金', '土'];

  for (const e of entries) {
    e._displayTime = `${String(e.hour).padStart(2, '0')}:${e.minute.toString().padStart(2, '0')}`;
    e._dateDisplay = `${e.month}月${e.day}日`;
  }

  let tableRows = '';
  for (const yomi of yomiOrderList) {
    const items = groups[yomi];
    if (!items || items.length === 0) continue;

    const dateMerge = new Array(items.length).fill(0);
    let i = 0;
    while (i < items.length) {
      let j = i + 1;
      while (j < items.length && items[j]._dateDisplay === items[i]._dateDisplay) j++;
      dateMerge[i] = j - i;
      i = j;
    }

    const timeMerge = new Array(items.length).fill(0);
    i = 0;
    while (i < items.length) {
      let j = i + 1;
      while (j < items.length && items[j]._displayTime === items[i]._displayTime) j++;
      timeMerge[i] = j - i;
      i = j;
    }

    for (let idx = 0; idx < items.length; idx++) {
      const e = items[idx];
      tableRows += `<tr>`;
      if (idx === 0) tableRows += `<td class="yomi-cell" rowspan="${items.length}">${yomi}</td>`;
      if (dateMerge[idx] > 0) tableRows += `<td class="date-cell" rowspan="${dateMerge[idx]}">${e._dateDisplay}</td>`;
      if (timeMerge[idx] > 0) tableRows += `<td class="time-cell" rowspan="${timeMerge[idx]}">${e._displayTime}</td>`;
      tableRows += `<td class="title-cell">${e.title}</td>`;
      tableRows += `<td class="chinese-cell">${e.chineseName}</td>`;
      tableRows += `<td class="type-cell">${e.type}</td>`;
      tableRows += `<td class="studio-cell">${e.studio}</td>`;
      tableRows += `<td class="platform-cell">${e.platform}</td>`;
      tableRows += `</tr>\n`;
    }
  }

  const totalCount = entries.length;
  const typeCount = {};
  for (const e of entries) typeCount[e.type] = (typeCount[e.type] || 0) + 1;
  const badgeHTML = Object.entries(typeCount)
    .map(([k, v]) => `<span class="stat-badge type-${k}">${k}: ${v}部</span>`)
    .join('\n      ');

  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${S.titleText(year)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
    background: ${S.bodyBg}; padding: 20px; min-height: 100vh;
  }
  .schedule-wrapper {
    max-width: 1600px; margin: 0 auto; background: ${S.wrapperBg};
    border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  }
  .title-bar {
    background: ${S.titleBar}; color: white; padding: 20px 30px;
    text-align: center; position: relative; box-shadow: 0 4px 12px ${S.titleBarShadow};
  }
  .title-bar h1 { font-size: 2.2em; font-weight: 900; letter-spacing: 4px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
  .title-bar .subtitle { font-size: 0.9em; opacity: 0.85; margin-top: 5px; }
  .title-bar .author { position: absolute; right: 30px; top: 50%; transform: translateY(-50%); font-size: 0.9em; opacity: 0.75; font-weight: 700; }
  .schedule-table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
  .schedule-table thead th {
    background: ${S.headerBg}; color: white; padding: 10px 8px;
    font-weight: 700; text-align: center; border: 1px solid ${S.headerBorder}; white-space: nowrap;
  }
  .schedule-table tbody td {
    padding: 7px 10px; border: 1px solid #d0d0d0; vertical-align: middle;
    word-break: break-all; white-space: normal;
  }
  .schedule-table tbody tr:nth-child(even) { background: ${S.rowEven}; }
  .schedule-table tbody tr:hover { background: ${S.rowHover}; }
  .yomi-cell {
    background: ${S.yomiBg} !important; font-size: 2.4em; font-weight: 900;
    text-align: center; color: ${S.yomiColor}; border: 2px solid ${S.yomiBorder} !important; width: 56px;
  }
  .date-cell {
    text-align: center; font-weight: 700; color: #444; white-space: nowrap;
    background: ${S.dateBg} !important; width: 1.6em;
  }
  .time-cell {
    text-align: center; font-weight: 700; color: ${S.timeColor}; white-space: nowrap;
    font-size: 1.05em; width: 1.6em;
  }
  .title-cell { font-weight: 700; color: #1a1a1a; width: 10em; }
  .chinese-cell { color: #2c3e50; width: 10em; }
  .type-cell { text-align: center; white-space: nowrap; font-weight: 700; width: 1.6em; }
  .studio-cell { color: #555; width: 7em; }
  .platform-cell { text-align: center; white-space: nowrap; color: #1565c0; font-weight: 700; width: 6em; }
  .footer {
    background: ${S.footerBg}; color: white; padding: 25px 30px;
    display: flex; justify-content: space-between; align-items: flex-start; gap: 30px;
  }
  .footer-info { font-size: 0.9em; line-height: 1.8; }
  .footer-info .note { opacity: 0.85; }
  .footer-stats { display: flex; gap: 12px; flex-wrap: wrap; }
  .stat-badge {
    background: white; color: #333; padding: 6px 14px; border-radius: 4px;
    font-size: 0.85em; white-space: nowrap; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }
  .type-漫画改 { color: #0d47a1; }
  .type-小说改 { color: #4a148c; }
  .type-原创  { color: #1b5e20; }
  .type-游戏改 { color: #e65100; }
  .type-泡面  { color: #b71c1c; }
</style>
</head>
<body>
<div class="schedule-wrapper">
  <div class="title-bar">
    <h1>${S.titleText(year)}</h1>
    <div class="subtitle">${S.seasonNum(year)} 共 ${totalCount}部作品  UTC+9 (JST)</div>
    <div class="author">By AttoUmani</div>
  </div>
  <table class="schedule-table">
    <thead>
      <tr>
        <th style="width:56px">曜日</th>
        <th style="width:1.6em">日期</th>
        <th style="width:1.6em">时间</th>
        <th style="width:10em">原名</th>
        <th style="width:10em">中文名</th>
        <th style="width:1.6em">类型</th>
        <th style="width:7em">动画制作公司</th>
        <th style="width:6em">放送平台</th>
      </tr>
    </thead>
    <tbody>
${tableRows}
    </tbody>
  </table>
  <div class="footer">
    <div class="footer-info">
      <div class="note">所有时间均为 UTC+9</div>
      <div class="note">禁止非法转载</div>
      <div class="note">数据来源：bgm.tv / bgm.wiki</div>
      <div class="note">本季共收录 ${totalCount} 部 ${S.label} 季作品</div>
      <div class="note">统计生成于 ${today}</div>
    </div>
    <div class="footer-stats">${badgeHTML}</div>
  </div>
</div>
</body>
</html>`;
}

async function generatePNG(htmlPath, pngPath) {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.log('[跳过PNG] playwright 未安装，仅生成 HTML');
    return false;
  }

  const htmlUrl = 'file:///' + htmlPath.replace(/\\/g, '/');

  // 依次尝试：系统 Edge → 系统 Chrome → Playwright 自带 Chromium
  const channels = ['msedge', 'chrome', null];

  for (const channel of channels) {
    let browser;
    try {
      browser = await chromium.launch(
        channel ? { channel } : {}
      );
    } catch (e) {
      console.error(`[PNG] 无法启动 ${channel || 'Chromium'}：${e.message.split('\n')[0]}`);
      continue;
    }

    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1800, height: 800 });
      await page.goto(htmlUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      const wrapper = await page.$('.schedule-wrapper');
      if (wrapper) {
        await wrapper.screenshot({ path: pngPath, type: 'png' });
      } else {
        await page.screenshot({ path: pngPath, fullPage: true, type: 'png' });
      }

      await page.close();
      await browser.close();
      console.error(`[PNG] 使用 ${channel || 'Chromium'} 截图成功`);
      return true;
    } catch (e) {
      console.error(`[PNG] ${channel || 'Chromium'} 截图失败：${e.message}`);
      await browser.close();
    }
  }

  console.error('[跳过PNG] 未能启动任何浏览器，仅生成 HTML');
  return false;
}

// ======================== 主流程 ========================

async function main() {
  console.error('=== 动画时间表 ===\n');

  const params = parseArgs();

  BGM_TOKEN = await getBgmToken();

  const { year, season, htmlOnly, output, proxy, noProxy } = await getSeasonAndYear(params);

  detectProxy(proxy, noProxy);

  console.error(`\n[信息] 季度：${year}年${season}季`);

  const nonInteractive = !!(params.year && params.season);

  const outputDir = await getOutputDir(output, nonInteractive);
  console.error(`[信息] 输出目录：${outputDir}`);

  try {
    console.error('\n[步骤] Step 1: 从 bgm.tv 目录获取动画...');
    const animeEntries = await collectAnimeData(year, season);

    if (animeEntries.length === 0) {
      console.error(`\n[错误] 目录中没有任何条目，请检查目录 ID 或简介格式`);
      process.exit(1);
    }

    const animeListFile = path.join(outputDir, `anime_list_${year}${season}.txt`);
    const animeListContent = formatAnimeList(animeEntries);
    fs.writeFileSync(animeListFile, animeListContent, 'utf-8');
    console.error(`[写入] 动画列表已保存: ${animeListFile} (${animeEntries.length}条)`);

    console.error('\n[步骤] Step 2: 从 bgm.wiki 获取放送数据...');

    const [fromDate, toDate] = getSeasonDateRange(season, year);
    if (!fromDate) {
      console.error(`[错误] 无效季节: ${season}`);
      process.exit(1);
    }

    const wikiEvents = await fetchAllSchedule(fromDate, toDate);
    const bgmData = deduplicateAnime(wikiEvents);

    const userList = parseUserAnimeList(animeListFile);
    console.error(`动画列表共 ${userList.length} 条`);

    console.error('正在匹配...');
    const results = matchAnime(userList, bgmData);

    const mergedOutput = generateMergedOutput(results, fromDate, toDate, animeListContent);

    const mergedFile = path.join(outputDir, `anime_merged_${year}${season}.txt`);
    const unmatchedFile = path.join(outputDir, `anime_merged_${year}${season}_未匹配.txt`);
    fs.writeFileSync(mergedFile, mergedOutput.matched, 'utf-8');
    fs.writeFileSync(unmatchedFile, mergedOutput.unmatched, 'utf-8');

    const found = results.filter(r => r.bgmBroadcast !== '未找到').length;
    console.error(`[完成] 已匹配: ${found}/${results.length}`);
    console.error(`[完成] 已写入: ${mergedFile}`);

    // ========== 手动补充环节 ==========
    console.error('\n[步骤] 可选：手动补充条目');
    const wantEdit = await askQuestion('是否要手动添加条目？(y/N): ');

    if (wantEdit && (wantEdit.toLowerCase() === 'y' || wantEdit.toLowerCase() === 'yes')) {
      console.error('\n请在任意文本编辑器中打开以下文件，按现有格式在末尾追加条目：');
      console.error(`  ${mergedFile}\n`);
      console.error('每条格式示例：');
      console.error('  99. 动画原名');
      console.error('     BGM ID: 123456');
      console.error('     中文名: 动画中文名');
      console.error('     类型: 原创');
      console.error('     动画制作: XXX动画');
      console.error('     放送日期: 2026年10月5日');
      console.error('     放送时间(JST): 23:00 (周六)');
      console.error('     放送平台: TOKYO MX');
      console.error('\n注意：放送时间(JST,30小时制) 和 放送日期 是必需的，缺少任一项该条目会被跳过。');
      console.error('\n编辑并保存文件后，回到此处按回车继续...');
      await askQuestion('');
      console.error('[继续] 已读取最新文件内容\n');
    } else {
      console.error('[跳过] 不进行手动编辑\n');
    }
    // ========== 手动补充环节结束 ==========

    console.error('[步骤] Step 3: 生成放送时间表...');

    const entries = parseEntries(mergedFile);
    if (entries.length === 0) {
      console.error('[错误] 没有解析到任何条目');
      process.exit(1);
    }

    sortEntries(entries);

    const yy = year.toString().slice(-2);
    const S = SEASONS[season];
    const baseName = `${yy}年${S.label}季放送时间表`;
    const htmlPath = path.join(outputDir, `${baseName}.html`);
    const pngPath = path.join(outputDir, `${baseName}.png`);

    const html = generateHTML(entries, season, year.toString());
    fs.writeFileSync(htmlPath, html, 'utf-8');
    console.log(`[HTML] ${htmlPath}  共 ${entries.length} 部`);

    if (!htmlOnly) {
      const ok = await generatePNG(htmlPath, pngPath);
      if (ok) console.log(`[PNG]  ${pngPath}`);
    }

    console.error('\n=== 完成 ===');
    console.error(`[输出] 所有文件已写入: ${outputDir}`);

  } catch (e) {
    console.error('[错误]', e.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[未捕获错误]', err);
  process.exit(1);
});