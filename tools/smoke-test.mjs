#!/usr/bin/env node
/* 元靶科技 MetaTarget bio · 内部知识库 —— 构建后冒烟测试
   用法: node tools/smoke-test.mjs <访问密码>
   解密 assets/js/payload.js → 在 vm 沙箱 eval → 断言页面、数据与 Demo Lab 状态机。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const password = process.argv[2];
if (!password) { console.error('用法: node tools/smoke-test.mjs <访问密码>'); process.exit(1); }

let failures = 0;
function ok(cond, name) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) failures++;
}

/* ---- 解密 ---- */
const src = fs.readFileSync(path.join(root, 'assets/js/payload.js'), 'utf8');
ok(!src.includes(password), 'payload 不含密码明文');
const p = JSON.parse(src.substring(src.indexOf('{'), src.lastIndexOf('}') + 1));
const data = Buffer.from(p.data, 'base64');
const key = crypto.pbkdf2Sync(password, Buffer.from(p.salt, 'base64'), p.iters, 32, 'sha256');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'));
decipher.setAuthTag(data.subarray(data.length - 16));
const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString('utf8');
ok(plain.length > 100000, `解密成功（${plain.length} 字节）`);

/* ---- eval ---- */
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(plain, sandbox);
const W = sandbox.window;

/* ---- 页面清单 ---- */
const EXPECTED = ['home', 'demo', 'verifiable-ai', 'insilico', 'auditor', 'lifecycle', 'pilot',
  'services', 'team', 'archive', 'students', 'input-hub', 'discuss', 'sources', 'decisions', 'redteam',
  'calendar'];
const PAGES = W.SITE_PAGES || [];
const ids = PAGES.map(pg => pg.id);
ok(PAGES.length === EXPECTED.length, `页面数 = ${PAGES.length}（预期 ${EXPECTED.length}）`);
EXPECTED.forEach((id, i) => ok(ids[i] === id, `导航第 ${i + 1} 位 = ${id}`));

/* ---- 每页基本结构 + 搜索索引可构建 ---- */
let secCount = 0, bad = 0;
PAGES.forEach(pg => {
  if (!pg.nav || !pg.title || !Array.isArray(pg.sections) || !pg.sections.length) bad++;
  pg.sections.forEach(s => { secCount++; if (typeof s.html !== 'string' || !s.html.length) bad++; });
});
ok(bad === 0, `全部 ${secCount} 个 section 结构完整`);
ok(typeof W.DEMOS?.mount === 'function', 'DEMOS.mount 存在');
ok(Array.isArray(W.DEMO_PLUGINS) && W.DEMO_PLUGINS.length >= 4, `DEMO_PLUGINS 注册数 = ${(W.DEMO_PLUGINS || []).length}（预期 ≥4）`);

/* ---- 敏感词扫描（红线） ---- */
const banned = ['AAAI', '匿名稿标题', password];
banned.forEach(w => ok(!plain.includes(w), `明文不含敏感词「${w}」`));

/* ---- Demo Lab 状态机（五场景无头走通） ---- */
const L = W.DEMO_LAB;
if (!L) {
  ok(false, 'window.DEMO_LAB 存在');
} else {
  ok(!!L.DATA, 'DEMO_LAB.DATA 存在');
  let s = L.createState();
  ok(s && s.candidateId === 'MT-T2D-B', 'S1: 默认选中 MT-T2D-B');
  let d = L.getDerived(s);
  ok(d.gate === 'review', 'S1: 初始 gate = review（Review required）');

  s = L.setAncestry(s, 'east_asian');
  d = L.getDerived(s);
  ok(d.heads.populationFit.status === 'unknown', 'S2: East Asian 下 populationFit = unknown（非 low）');
  ok(d.gate === 'review', 'S2: gate 保持 review');

  const before = L.getDerived(s).claims.length;
  s = L.applyEvent(s, { type: 'INJECT_CONFLICT' });
  d = L.getDerived(s);
  ok(d.gate === 'pause', 'S3: 注入反证后 gate = pause');
  ok(d.claims.length === before + 1, 'S3: ledger 新增一条');
  ok(d.claims.some(c => (c.type === 'refutes' || c.relation === 'refutes') && !c.invalidated), 'S3: 存在新的 refutes claim');
  ok(d.claims.some(c => (c.type === 'supports' || c.relation === 'supports')), 'S3: 原支持证据保留');
  ok(d.heads.direction.status === 'mixed', 'S3: direction head 显示 mixed（不是 low）');

  s = L.applyEvent(s, { type: 'RETRACT_KEY_SOURCE' });
  d = L.getDerived(s);
  ok(d.claims.some(c => c.invalidated), 'S4: 撤稿后有 claim invalidated');
  ok(Array.isArray(d.reReview) && d.reReview.length > 0, 'S4: 列出需要重审的历史决策');

  const s2 = L.toggleScoreView(s);
  ok(L.getDerived(s2).scoreView === true, 'S5: score-only 视图可切换');

  s = L.applyEvent(s, { type: 'RESET' });
  d = L.getDerived(s);
  ok(d.gate === 'review' && !d.claims.some(c => c.invalidated), 'RESET 还原初始状态');

  /* 快照切换 */
  const snaps = (L.DATA.context && L.DATA.context.availableSnapshots) || L.DATA.snapshots || [];
  ok(snaps.length === 3, `cutoff 快照数 = ${snaps.length}（预期 3）`);
  const s3 = L.setSnapshot(L.createState(), snaps[0]);
  ok(L.getDerived(s3).context.snapshot === snaps[0], '快照可切换到 ' + snaps[0]);
}

/* ---- 档案中心数据 ---- */
const A = W.ARCHIVE_INDEX;
if (!A) {
  ok(false, 'window.ARCHIVE_INDEX 存在');
} else {
  const recs = Array.isArray(A) ? A : (A.records || []);
  ok(recs.some(r => r.recordId === 'MTG-2026-07-24-001'), '档案含 MTG-2026-07-24-001');
  ok(recs.length >= 9, `档案记录数 = ${recs.length}（预期 ≥9）`);
}

console.log('');
if (failures) { console.error(`冒烟测试失败：${failures} 项`); process.exit(1); }
console.log('冒烟测试全部通过。');
