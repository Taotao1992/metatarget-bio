/* 元靶科技 MetaTarget bio · 内部知识库
   gate.js —— 密码门禁与浏览器端解密启动
   内容以 AES-256-GCM 密文存放在 payload.js；密钥由访问密码经 PBKDF2(SHA-256) 派生。
   本仓库不含任何明文内容；解密全部发生在访问者浏览器本地。 */
(function () {
  'use strict';

  var gate = document.getElementById('gate');
  var form = document.getElementById('gateForm');
  var pwInput = document.getElementById('gatePw');
  var btn = document.getElementById('gateBtn');
  var err = document.getElementById('gateErr');
  var SESSION_KEY = 'mtb_unlock';
  var REMEMBER_KEY = 'mtb_unlock_remember';
  var REMEMBER_DAYS = 30;
  var rememberInput = document.getElementById('gateRemember');

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function deriveKey(password, salt, iters) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (km) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: iters, hash: 'SHA-256' },
          km,
          { name: 'AES-GCM', length: 256 },
          true,
          ['decrypt']
        );
      });
  }

  function decryptAndBoot(key) {
    var p = window.__ENC_PAYLOAD;
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(p.iv) }, key, b64ToBytes(p.data))
      .then(function (plain) {
        var code = new TextDecoder().decode(plain);
        (0, eval)(code); // 定义 window.SITE_PAGES 与 window.DEMOS
        return crypto.subtle.exportKey('raw', key);
      })
      .then(function (raw) {
        var b64 = bytesToB64(new Uint8Array(raw));
        try { sessionStorage.setItem(SESSION_KEY, b64); } catch (e) { /* 私密模式下忽略 */ }
        /* 勾选「记住 30 天」：派生密钥（非密码本身）存 localStorage，过期自动失效 */
        try {
          if (rememberInput && rememberInput.checked) {
            localStorage.setItem(REMEMBER_KEY, JSON.stringify({ k: b64, exp: Date.now() + REMEMBER_DAYS * 86400000 }));
          } else {
            localStorage.removeItem(REMEMBER_KEY);
          }
        } catch (e) { /* ignore */ }
        boot();
      });
  }

  /* 尝试用已存密钥直接解锁；失败返回 false 走密码表单 */
  function tryStored(rawB64, clearFn) {
    return crypto.subtle.importKey('raw', b64ToBytes(rawB64), { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
      .then(decryptAndBoot)
      .then(function () { return true; })
      .catch(function () { clearFn(); return false; });
  }

  function boot() {
    gate.classList.add('gate-off');
    document.body.classList.remove('locked');
    setTimeout(function () { gate.remove(); }, 400);
    var s = document.createElement('script');
    s.src = 'assets/js/app.js';
    document.body.appendChild(s);
  }

  function fail() {
    err.hidden = false;
    btn.disabled = false;
    btn.textContent = '进入';
    pwInput.value = '';
    pwInput.focus();
  }

  /* 已解锁过：优先 localStorage（记住 30 天），再 sessionStorage（本会话） */
  var remembered = null;
  try {
    var raw = localStorage.getItem(REMEMBER_KEY);
    if (raw) {
      var rec = JSON.parse(raw);
      if (rec && rec.k && rec.exp > Date.now()) remembered = rec.k;
      else localStorage.removeItem(REMEMBER_KEY);
    }
  } catch (e) { /* ignore */ }
  var sessionSaved = null;
  try { sessionSaved = sessionStorage.getItem(SESSION_KEY); } catch (e) { /* ignore */ }
  if (remembered) {
    tryStored(remembered, function () {
      try { localStorage.removeItem(REMEMBER_KEY); } catch (e) { /* ignore */ }
    }).then(function (okDone) {
      if (!okDone && sessionSaved) {
        tryStored(sessionSaved, function () {
          try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
        });
      }
    });
  } else if (sessionSaved) {
    tryStored(sessionSaved, function () {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = pwInput.value;
    if (!pw) return;
    btn.disabled = true;
    btn.textContent = '解锁中…';
    err.hidden = true;
    var p = window.__ENC_PAYLOAD;
    deriveKey(pw, b64ToBytes(p.salt), p.iters)
      .then(decryptAndBoot)
      .catch(fail);
  });

  pwInput.focus();
})();
