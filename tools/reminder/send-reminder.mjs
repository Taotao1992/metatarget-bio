#!/usr/bin/env node
/* 元靶科技 MetaTarget bio · 团队例会自动提醒邮件
   由 GitHub Actions（.github/workflows/meeting-reminder.yml）每天触发一次：
   仅当「布里斯班今天」= 会议前 3 天时发送；每天跑也幂等。

   会议节奏改动：改本文件顶部 MEETING 常量 + 站点侧 content-src/data/meeting-config.js。

   环境变量（全部来自 GitHub Secrets，仓库公开，严禁硬编码敏感值）：
     GMAIL_USER / GMAIL_APP_PASSWORD  Gmail SMTP 凭据（应用专用密码）
     REMINDER_TO                      收件人，逗号分隔
     ZOOM_LINK                        Zoom 会议链接
     MTB_SUPABASE_URL / MTB_SUPABASE_ANON_KEY / MTB_SHARED_SECRET
                                      拉取讨论区议程用；缺失时议程降级但不阻断发送
     FORCE_SEND=1                     无视日期检查直接发送（手动测试用，主题加【测试】）
     TODAY_OVERRIDE=YYYY-MM-DD        调试：冒充布里斯班的「今天」
   参数：
     --dry                            只打印邮件内容，不发送（不加载 nodemailer）
*/
import process from 'node:process';

/* ================= 会议参数（与站点 meeting-config.js 保持一致） ================= */
const MEETING = {
  anchor: '2026-08-16T22:00:00+10:00', // 布里斯班 2026-08-16 周日 22:00
  intervalWeeks: 3,
  durationMin: 90,
  brisbaneTz: 'Australia/Brisbane',
  cambridgeTz: 'Europe/London',
  remindDaysBefore: 3,
  siteUrl: 'https://taotao1992.github.io/metatarget-bio/'
};

/* 上次会议（2026-07-24）留下的未决事项 → 固定议程 */
const STANDING_AGENDA = [
  '首个疾病选择（未决）',
  '首个任务的 label 定义：因果相关 / 临床推进 / 疗效成功 / 被低估（未决）',
  '具体模型选型（未决）',
  'Teams 平台与内部网站的分工落地（未决）',
  '公众号 / 小红书的 owner、审稿流程与保密边界（未决）',
  '香港科创项目：准确项目名、截止日期与团队资格核验（未决）'
];

/* ================= 日期工具 ================= */
const DAY = 86400000;

/* 某时区的「今天」（YYYY-MM-DD） */
function todayInTz(tz, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const g = t => parts.find(p => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/* 下一次会议：锚点起按 3 周滚动到「结束时间在未来」的最近一次 */
function nextMeeting(now = new Date()) {
  const anchor = new Date(MEETING.anchor).getTime();
  const step = MEETING.intervalWeeks * 7 * DAY;
  const dur = MEETING.durationMin * 60000;
  let t = anchor;
  while (t + dur <= now.getTime()) t += step;
  return new Date(t);
}
function fmtDate(d, tz) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  }).format(d);
}
function fmtTime(d, tz, withName = false) {
  const t = new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d);
  if (!withName) return t;
  return `${t} ${tzShortName(d, tz)}`;
}
/* 时区缩写（AEST / BST / GMT…）：zh-CN 的 short 只给 GMT+x，故用 en-GB 取缩写 */
function tzShortName(d, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
  }).formatToParts(d);
  const p = parts.find(x => x.type === 'timeZoneName');
  return p ? p.value : '';
}
function monthDayBne(d) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MEETING.brisbaneTz, month: '2-digit', day: '2-digit'
  }).formatToParts(d);
  const g = t => parts.find(p => p.type === t).value;
  return { m: Number(g('month')), d: Number(g('day')) };
}

/* ================= 议程：讨论区近三周活跃话题 ================= */
async function fetchAgenda(sinceIso) {
  const url = process.env.MTB_SUPABASE_URL;
  const key = process.env.MTB_SUPABASE_ANON_KEY;
  const secret = process.env.MTB_SHARED_SECRET;
  if (!url || !key || !secret) return { ok: false, topics: [], reason: '未配置 Supabase 环境变量' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${url}/rest/v1/rpc/mtb_topic_list`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, topics: [], reason: `RPC 返回 HTTP ${res.status}` };
    const rows = await res.json();
    const since = new Date(sinceIso).getTime();
    const topics = (Array.isArray(rows) ? rows : [])
      .filter(t => new Date(t.updated_at || t.created_at).getTime() >= since)
      .slice(0, 8)
      .map(t => ({
        title: t.title,
        author: t.author,
        comments: t.comment_count || 0,
        status: t.status === 'resolved' ? '已解决' : '讨论中'
      }));
    return { ok: true, topics };
  } catch (e) {
    return { ok: false, topics: [], reason: e && e.message ? e.message : String(e) };
  }
}

/* ================= 邮件组装 ================= */
function buildEmail(mtg, agenda) {
  const end = new Date(mtg.getTime() + MEETING.durationMin * 60000);
  const bne = fmtTime(mtg, MEETING.brisbaneTz);
  const bneEnd = fmtTime(end, MEETING.brisbaneTz, true);
  const cam = fmtTime(mtg, MEETING.cambridgeTz);
  const camEnd = fmtTime(end, MEETING.cambridgeTz, true);
  const bneDate = fmtDate(mtg, MEETING.brisbaneTz);
  const camDate = fmtDate(mtg, MEETING.cambridgeTz);
  const zoom = process.env.ZOOM_LINK || '（未配置 ZOOM_LINK）';
  const { m, d } = monthDayBne(mtg);
  const testPrefix = process.env.FORCE_SEND === '1' ? '【测试】' : '';
  const subject = `${testPrefix}【元靶内部站·自动提醒】${m}月${d}日（周日）Zoom 团队例会 · 3 天后`;

  const agendaLines = [];
  if (agenda.ok && agenda.topics.length) {
    agendaLines.push('一、讨论区近三周活跃话题（建议上会过一遍）：');
    agenda.topics.forEach((t, i) => {
      agendaLines.push(`  ${i + 1}. ${t.title} — ${t.author} · ${t.comments} 条评论 · ${t.status}`);
    });
  } else {
    agendaLines.push('一、讨论区近三周活跃话题：' +
      (agenda.ok ? '（暂无新话题，可直接带议题上会）' : `（议程获取失败：${agenda.reason}，请直接查看网站讨论区）`));
  }
  agendaLines.push('', '二、上次会议（2026-07-24）未决事项跟进：');
  STANDING_AGENDA.forEach((s, i) => agendaLines.push(`  ${i + 1}. ${s}`));
  agendaLines.push('', '三、自由议题（会前可在讨论区开帖补充）。');

  const text = [
    '各位好，',
    '',
    `团队 Zoom 例会将在 3 天后（${bneDate}）举行，请提前安排时间。`,
    '',
    `· 布里斯班：${bneDate} ${bne} – ${bneEnd}`,
    `· 英国剑桥：${camDate} ${cam} – ${camEnd}`,
    `· Zoom：${zoom}`,
    '',
    ...agendaLines,
    '',
    `讨论区与例会卡片：${MEETING.siteUrl}`,
    '',
    '本邮件由团队内部网站定时任务自动发送，请勿回复本地址。'
  ].join('\n');

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const li = agenda.ok && agenda.topics.length
    ? agenda.topics.map(t => `<li>${esc(t.title)} <span style="color:#888">— ${esc(t.author)} · ${t.comments} 条评论 · ${t.status}</span></li>`).join('')
    : `<li style="color:#888">${agenda.ok ? '暂无新话题，可直接带议题上会' : '议程获取失败（' + esc(agenda.reason) + '），请直接查看网站讨论区'}</li>`;
  const standing = STANDING_AGENDA.map(s => `<li>${esc(s)}</li>`).join('');
  const html = `<div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:560px;line-height:1.7;color:#222">
  <p>各位好，</p>
  <p>团队 Zoom 例会将在 <b>3 天后（${esc(bneDate)}）</b>举行，请提前安排时间。</p>
  <div style="border:1px solid #d9e2ec;border-radius:10px;padding:14px 18px;background:#f6f9fc">
    <div>🕙 <b>布里斯班</b>：${esc(bneDate)} ${bne} – ${bneEnd}</div>
    <div>🕐 <b>英国剑桥</b>：${esc(camDate)} ${cam} – ${camEnd}</div>
    <div style="margin-top:8px"><a href="${esc(zoom)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;padding:8px 18px;font-weight:600">加入 Zoom 会议</a></div>
  </div>
  <h3 style="margin:18px 0 6px">拟定议程</h3>
  <p style="margin:4px 0"><b>一、讨论区近三周活跃话题</b>（建议上会过一遍）：</p>
  <ul style="margin:4px 0;padding-left:22px">${li}</ul>
  <p style="margin:10px 0 4px"><b>二、上次会议（2026-07-24）未决事项跟进</b>：</p>
  <ul style="margin:4px 0;padding-left:22px">${standing}</ul>
  <p style="margin:10px 0 4px"><b>三、自由议题</b>（会前可在讨论区开帖补充）。</p>
  <p style="margin-top:18px"><a href="${esc(MEETING.siteUrl)}">讨论区与例会卡片入口</a></p>
  <p style="color:#999;font-size:12px;margin-top:24px">本邮件由团队内部网站定时任务自动发送，请勿回复本地址。</p>
</div>`;

  return { subject, text, html };
}

/* ================= 主流程 ================= */
async function main() {
  const dry = process.argv.includes('--dry');
  const now = new Date();
  const mtg = nextMeeting(now);
  const mtgDateBne = todayInTz(MEETING.brisbaneTz, mtg);
  const remindDate = addDays(mtgDateBne, -MEETING.remindDaysBefore);
  const todayBne = process.env.TODAY_OVERRIDE || todayInTz(MEETING.brisbaneTz, now);
  const force = process.env.FORCE_SEND === '1';

  console.log(`[reminder] 布里斯班今天=${todayBne}；下次会议=${mtgDateBne}（${fmtTime(mtg, MEETING.brisbaneTz, true)}）；提醒日=${remindDate}`);
  if (!force && todayBne !== remindDate) {
    console.log('[reminder] 今天不是提醒日，退出（幂等）。');
    return;
  }

  /* 议程取「上次会议之后」的活跃话题：上次会议 = 本次会议 - 3 周 */
  const lastMtg = new Date(mtg.getTime() - MEETING.intervalWeeks * 7 * DAY);
  const agenda = await fetchAgenda(lastMtg.toISOString());
  console.log(`[reminder] 议程：${agenda.ok ? agenda.topics.length + ' 条活跃话题' : '降级（' + agenda.reason + '）'}`);

  const { subject, text, html } = buildEmail(mtg, agenda);
  console.log('[reminder] Subject: ' + subject);
  if (dry) {
    console.log('----- text -----');
    console.log(text);
    console.log('----- (html 已生成，' + html.length + ' 字符) -----');
    return;
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const to = (process.env.REMINDER_TO || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!user || !pass) throw new Error('缺少 GMAIL_USER / GMAIL_APP_PASSWORD');
  if (!to.length) throw new Error('缺少 REMINDER_TO');

  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user, pass }
  });
  const info = await transporter.sendMail({
    from: `元靶内部站提醒 <${user}>`,
    to: to.join(', '),
    subject, text, html
  });
  console.log(`[reminder] 已发送 → ${to.join(', ')}（messageId: ${info.messageId}）`);
}

main().catch(e => { console.error('[reminder] 失败：', e); process.exit(1); });
