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
        try { sessionStorage.setItem(SESSION_KEY, bytesToB64(new Uint8Array(raw))); } catch (e) { /* 私密模式下忽略 */ }
        boot();
      });
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

  /* 同一会话内已解锁过：直接复用派生密钥 */
  var saved = null;
  try { saved = sessionStorage.getItem(SESSION_KEY); } catch (e) { /* ignore */ }
  if (saved) {
    crypto.subtle.importKey('raw', b64ToBytes(saved), { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
      .then(decryptAndBoot)
      .catch(function () {
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
