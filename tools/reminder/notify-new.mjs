#!/usr/bin/env node
/* 元靶科技 MetaTarget bio · 讨论区新动态邮件通知
   由 GitHub Actions（.github/workflows/discuss-notify.yml）每小时运行一次：
   对比 Supabase 里的上次通知游标，把新话题 / 新评论摘要发邮件给团队成员。

   环境变量（GitHub Secrets）：
     GMAIL_USER / GMAIL_APP_PASSWORD   Gmail SMTP
     REMINDER_TO                       收件人，逗号分隔
     MTB_SUPABASE_URL / MTB_SUPABASE_ANON_KEY / MTB_SHARED_SECRET
     FORCE_SEND=1                      无视游标，把最近 24 小时动态发一遍（测试用）
   参数：--dry  只打印不发信（不加载 nodemailer）
*/
import process from 'node:process';

const CFG = {
  url: process.env.MTB_SUPABASE_URL,
  key: process.env.MTB_SUPABASE_ANON_KEY,
  secret: process.env.MTB_SHARED_SECRET
};
const STATE_KEY = 'discuss-notify-cursor';
const SITE = 'https://taotao1992.github.io/metatarget-bio/#/discuss';

async function rpc(name, body) {
  const res = await fetch(`${CFG.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: CFG.key, Authorization: `Bearer ${CFG.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${name} HTTP ${res.status}`);
  return res.json();
}
const getCursor = () => rpc('mtb_notify_get', { secret: CFG.secret, p_key: STATE_KEY });
const setCursor = (iso) => rpc('mtb_notify_set', { secret: CFG.secret, p_key: STATE_KEY, p_value: JSON.stringify(iso) });
const topicList = () => rpc('mtb_topic_list', { secret: CFG.secret });
const commentList = (id) => rpc('mtb_comment_list', { secret: CFG.secret, p_topic_id: id });

function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  const dry = process.argv.includes('--dry');
  const force = process.env.FORCE_SEND === '1';
  if (!CFG.url || !CFG.key || !CFG.secret) throw new Error('缺少 MTB_* 环境变量');

  let cursor;
  if (force) cursor = new Date(Date.now() - 24 * 3600e3).toISOString();
  else {
    try {
      const c = await getCursor();
      cursor = (c && typeof c === 'string') ? c : new Date(Date.now() - 3600e3).toISOString();
    } catch (e) {
      /* 状态表还没建（notify-state.sql 未执行）时降级：看最近 1 小时 */
      console.log('[notify] 游标读取失败（' + e.message + '），降级为最近 1 小时');
      cursor = new Date(Date.now() - 3600e3).toISOString();
    }
  }
  console.log(`[notify] 游标：${cursor}`);

  const topics = await topicList();
  const items = [];
  const titleById = {};
  for (const t of topics) {
    titleById[t.id] = t.title;
    if (t.created_at > cursor) items.push({ kind: '新话题', when: t.created_at, author: t.author, title: t.title, text: stripHtml(t.body).slice(0, 120) });
  }
  for (const t of topics) {
    const comments = await commentList(t.id);
    for (const c of comments) {
      if (c.created_at > cursor) {
        items.push({ kind: '新评论', when: c.created_at, author: c.author, title: titleById[t.id] || '', text: stripHtml(c.body).slice(0, 120) });
      }
    }
  }
  items.sort((a, b) => a.when.localeCompare(b.when));

  if (!items.length) {
    console.log('[notify] 无新动态，退出。');
    if (!force) { try { await setCursor(new Date().toISOString()); } catch (e) { console.log('[notify] 游标写入失败：' + e.message); } }
    return;
  }
  console.log(`[notify] 新动态 ${items.length} 条`);

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const subject = `【元靶讨论区·自动提醒】${items.length} 条新动态（${items[items.length - 1].author} 等）`;
  const text = ['各位好，', '', '团队讨论区有新的内容：', '',
    ...items.map(i => `· [${i.kind}] ${i.author} · ${i.when.slice(0, 16).replace('T', ' ')}\n  话题「${i.title}」\n  ${i.text}`),
    '', `查看与回复：${SITE}`, '', '本邮件由网站定时任务自动发送（每小时检查一次），请勿回复本地址。'
  ].join('\n');
  const html = `<div style="font-family:-apple-system,'PingFang SC',sans-serif;max-width:560px;line-height:1.7;color:#222">
  <p>各位好，</p><p>团队讨论区有 <b>${items.length}</b> 条新动态：</p>
  ${items.map(i => `<div style="border:1px solid #e3ded2;border-left:3px solid #1f5148;border-radius:8px;padding:10px 14px;margin:8px 0">
    <div style="font-size:12px;color:#888">${i.kind} · ${esc(i.author)} · ${i.when.slice(0, 16).replace('T', ' ')}</div>
    <div style="font-weight:600;margin:2px 0">${esc(i.title)}</div>
    <div style="font-size:13.5px;color:#444">${esc(i.text)}</div></div>`).join('')}
  <p><a href="${SITE}">进入讨论区查看与回复</a></p>
  <p style="color:#999;font-size:12px;margin-top:20px">本邮件由网站定时任务自动发送（每小时检查一次），请勿回复本地址。</p></div>`;

  console.log('[notify] Subject: ' + subject);
  if (dry) { console.log('----- text -----\n' + text); return; }

  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  const to = (process.env.REMINDER_TO || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!user || !pass || !to.length) throw new Error('缺少 GMAIL_USER / GMAIL_APP_PASSWORD / REMINDER_TO');
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
  const info = await transporter.sendMail({ from: `元靶内部站提醒 <${user}>`, to: to.join(', '), subject, text, html });
  console.log(`[notify] 已发送 → ${to.length} 人（${info.messageId}）`);
  try { await setCursor(new Date().toISOString()); console.log('[notify] 游标已更新'); }
  catch (e) { console.log('[notify] 游标写入失败（不影响本次发送）：' + e.message); }
}

main().catch(e => { console.error('[notify] 失败：', e); process.exit(1); });
