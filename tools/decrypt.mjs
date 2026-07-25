#!/usr/bin/env node
/* 元靶科技 MetaTarget bio · 内部知识库 —— 解密校验
   用法: node tools/decrypt.mjs <访问密码> [输出文件]
   解密 assets/js/payload.js，默认打印到 stdout；给第二个参数则写入该文件。
   用于本地校验 payload 与恢复明文源。不要把输出提交进仓库。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [password, outFile] = process.argv.slice(2);
if (!password) {
  console.error('用法: node tools/decrypt.mjs <访问密码> [输出文件]');
  process.exit(1);
}

const src = fs.readFileSync(path.join(root, 'assets/js/payload.js'), 'utf8');
const p = JSON.parse(src.substring(src.indexOf('{'), src.lastIndexOf('}') + 1));
const salt = Buffer.from(p.salt, 'base64');
const iv = Buffer.from(p.iv, 'base64');
const data = Buffer.from(p.data, 'base64');
const key = crypto.pbkdf2Sync(password, salt, p.iters, 32, 'sha256');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(data.subarray(data.length - 16));
const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);

if (outFile) {
  fs.writeFileSync(outFile, plain);
  console.log(`已解密 ${plain.length} 字节 → ${outFile}`);
} else {
  process.stdout.write(plain);
}
