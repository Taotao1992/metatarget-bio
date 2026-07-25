#!/usr/bin/env node
/* 元靶科技 MetaTarget bio · 内部知识库 —— 加密构建
   用法: node tools/encrypt.mjs <访问密码>
   把 content-src/ 下的明文源（pages → data → demos 顺序）打包为单个 JS，
   用 PBKDF2(SHA-256, 250000 次) 派生密钥、AES-256-GCM 加密，
   输出 assets/js/payload.js。密码只经命令行传入，不写入任何文件。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const password = process.argv[2];
if (!password) {
  console.error('用法: node tools/encrypt.mjs <访问密码>');
  process.exit(1);
}

const SRC_DIR = path.join(root, 'content-src');
const OUT = path.join(root, 'assets/js/payload.js');
const ITERS = 250000;

function listJs(sub) {
  const dir = path.join(SRC_DIR, sub);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort().map(f => path.join(dir, f));
}

const files = [...listJs('pages'), ...listJs('data'), ...listJs('demos')];
if (!files.length) {
  console.error('content-src/ 下没有找到任何 .js 源文件');
  process.exit(1);
}

const header = '/* 元靶科技 MetaTarget bio · 内部知识库 —— 站点内容（明文源见私有 content-src/，本文件由 tools/encrypt.mjs 生成） */\n';
const bundle = header + files.map(f => fs.readFileSync(f, 'utf8').trimEnd()).join('\n\n') + '\n';

const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(password, salt, ITERS, 32, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const enc = Buffer.concat([cipher.update(bundle, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();

const payload = {
  v: 1,
  iters: ITERS,
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  data: Buffer.concat([enc, tag]).toString('base64')
};

const out = '/* 加密内容载荷（密文）。明文不在本仓库中；由 gate.js 在浏览器端输入密码后解密。 */\n' +
  'window.__ENC_PAYLOAD = ' + JSON.stringify(payload) + ';\n';
fs.writeFileSync(OUT, out);

console.log(`已加密 ${files.length} 个源文件（明文 ${Buffer.byteLength(bundle, 'utf8')} 字节）→ ${path.relative(root, OUT)}`);
files.forEach(f => console.log('  -', path.relative(SRC_DIR, f)));
