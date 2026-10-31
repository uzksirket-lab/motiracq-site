// /sifre-yenile/ — Supabase password recovery landing page.
// The reset email links here with either
//   #access_token=…&refresh_token=…&type=recovery     (implicit flow)
//   ?token_hash=…&type=recovery                        (email template using {{ .TokenHash }})
//   ?code=…                                            (PKCE; only works in the browser that requested the reset)
// or with #error=…&error_code=otp_expired&error_description=… when the link is expired/invalid.
(function (global) {
  var SUPABASE_URL = 'https://fuqjcjkjlvnzqvpuzvma.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_4qUN2QmgFohnerFeIK8bBA_lbJDo3jP';
  var MIN_LEN = 8;

  function parseParams(str) {
    var out = {};
    (str || '').replace(/^[#?]/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k = decodeURIComponent((i < 0 ? kv : kv.slice(0, i)).replace(/\+/g, ' '));
      out[k] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    });
    return out;
  }

  /** What the link contains: {kind: 'error'|'tokens'|'token_hash'|'code'|'none', ...} */
  function readLink(search, hash) {
    var q = parseParams(search), h = parseParams(hash);
    var err = h.error || h.error_code || q.error || q.error_code;
    if (err) return { kind: 'error', code: h.error_code || q.error_code || err, description: h.error_description || q.error_description || '' };
    if (h.access_token && h.refresh_token) return { kind: 'tokens', access_token: h.access_token, refresh_token: h.refresh_token, type: h.type || '' };
    if (q.token_hash) return { kind: 'token_hash', token_hash: q.token_hash, type: q.type || 'recovery' };
    if (q.code) return { kind: 'code', code: q.code };
    return { kind: 'none' };
  }

  /** Returns an error key or null. */
  function checkPasswords(pw, pw2) {
    if (!pw || pw.length < MIN_LEN) return 'short';
    if (pw.length > 72) return 'long';
    if (pw !== pw2) return 'mismatch';
    return null;
  }

  /** Establishes the recovery session. Resolves {ok:true} or {ok:false, reason:'expired'|'invalid'|'network'}. */
  function establishSession(client, link) {
    var p;
    if (link.kind === 'error') return Promise.resolve({ ok: false, reason: /expired/i.test(link.code + ' ' + link.description) ? 'expired' : 'invalid' });
    if (link.kind === 'tokens') p = client.auth.setSession({ access_token: link.access_token, refresh_token: link.refresh_token });
    else if (link.kind === 'token_hash') p = client.auth.verifyOtp({ token_hash: link.token_hash, type: 'recovery' });
    else if (link.kind === 'code') p = client.auth.exchangeCodeForSession(link.code);
    else return Promise.resolve({ ok: false, reason: 'invalid' });
    return p.then(function (r) {
      if (r && r.error) return { ok: false, reason: errorReason(r.error, 'invalid') };
      if (!r || !r.data || !r.data.session) return { ok: false, reason: 'invalid' };
      return { ok: true, user: r.data.session.user || r.data.user };
    }, function (e) { return { ok: false, reason: errorReason(e, 'network') }; });
  }

  function errorReason(e, fallback) {
    var s = ((e && (e.code || '')) + ' ' + (e && (e.message || '')) + ' ' + (e && e.status || '')).toLowerCase();
    if (/same_password|should be different|different from the old/.test(s)) return 'same';
    if (/weak_password|weak|pwned/.test(s)) return 'weak';
    if (/expired|otp_expired/.test(s)) return 'expired';
    if (/invalid|not found|session_not_found|bad_jwt|refresh_token|flow_state|code verifier|code_verifier|401|403/.test(s)) return 'invalid';
    if (/fetch|network|failed to fetch|load failed/.test(s)) return 'network';
    return fallback;
  }

  /** Sets the new password, clears must_change_password, signs out. Resolves {ok:true} or {ok:false, reason}. */
  function updatePassword(client, password) {
    return client.auth.updateUser({ password: password }).then(function (r) {
      if (r && r.error) return { ok: false, reason: errorReason(r.error, 'failed') };
      var user = r && r.data && r.data.user;
      var profile = user
        ? Promise.resolve(client.from('profiles').update({ must_change_password: false }).eq('id', user.id)).catch(function () {})
        : Promise.resolve();
      return profile.then(function () {
        return Promise.resolve(client.auth.signOut({ scope: 'local' })).catch(function () {});
      }).then(function () { return { ok: true }; });
    }, function (e) { return { ok: false, reason: errorReason(e, 'network') }; });
  }

  var MSG = {
    tr: {
      short: 'Şifre en az 8 karakter olmalı.',
      long: 'Şifre en fazla 72 karakter olabilir.',
      mismatch: 'Şifreler eşleşmiyor.',
      same: 'Yeni şifren eskisinden farklı olmalı.',
      weak: 'Bu şifre çok zayıf. Daha uzun ve tahmin edilmesi zor bir şifre seç.',
      network: 'Bağlantı kurulamadı. İnternet bağlantını kontrol edip tekrar dene.',
      failed: 'Şifre güncellenemedi. Lütfen tekrar dene.',
      invalid: 'Bu bağlantı geçersiz ya da daha önce kullanılmış.',
      expired: 'Bu bağlantının süresi dolmuş.'
    },
    en: {
      short: 'Password must be at least 8 characters.',
      long: 'Password can be at most 72 characters.',
      mismatch: 'Passwords do not match.',
      same: 'Your new password must be different from the old one.',
      weak: 'This password is too weak. Choose a longer, harder to guess password.',
      network: 'Could not connect. Check your internet connection and try again.',
      failed: 'Could not update the password. Please try again.',
      invalid: 'This link is invalid or has already been used.',
      expired: 'This link has expired.'
    }
  };
  function lang() { return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'tr'; }

  function show(id) {
    ['reset-loading', 'reset-form-wrap', 'reset-success', 'reset-error'].forEach(function (s) {
      var el = document.getElementById(s);
      if (el) el.hidden = s !== id;
    });
    var el = document.getElementById(id);
    if (el && id !== 'reset-loading') { el.setAttribute('tabindex', '-1'); el.focus(); }
  }

  function init() {
    var root = document.getElementById('reset');
    if (!root) return;
    var link = readLink(location.search, location.hash);
    // never leave tokens in the address bar / history
    if (location.hash || location.search) { try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ } }

    var factory = global.MRQ_SUPABASE_FACTORY || function () {
      if (!global.supabase || !global.supabase.createClient) return null;
      return global.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    };
    var errorKey = null;
    function showError(reason) {
      errorKey = reason === 'expired' ? 'expired' : reason === 'network' ? 'network' : 'invalid';
      document.getElementById('reset-error-text').textContent = MSG[lang()][errorKey];
      show('reset-error');
    }
    var client = factory();
    if (!client) { showError('network'); return; }

    var form = document.getElementById('reset-form');
    var status = document.getElementById('reset-status');
    var btn = form.querySelector('button[type="submit"]');
    var statusKey = null, fieldKey = null;
    function setStatus(key) { statusKey = key; status.textContent = key ? MSG[lang()][key] : ''; status.className = 'status' + (key ? ' error' : ''); }
    function setFieldError(key) {
      fieldKey = key;
      var e = document.getElementById('err-password');
      e.textContent = key ? MSG[lang()][key] : '';
      var bad = key === 'mismatch' ? form.elements.password2 : form.elements.password;
      form.elements.password.removeAttribute('aria-invalid');
      form.elements.password2.removeAttribute('aria-invalid');
      if (key) bad.setAttribute('aria-invalid', 'true');
    }
    document.addEventListener('mrq:lang', function () {
      if (statusKey) setStatus(statusKey);
      if (fieldKey) setFieldError(fieldKey);
      if (errorKey) document.getElementById('reset-error-text').textContent = MSG[lang()][errorKey];
    });

    establishSession(client, link).then(function (r) {
      if (!r.ok) { showError(r.reason); return; }
      var email = r.user && r.user.email;
      if (email) document.getElementById('reset-email').textContent = email;
      show('reset-form-wrap');
      form.elements.password.focus();
    });

    var busy = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      setStatus(null);
      var k = checkPasswords(form.elements.password.value, form.elements.password2.value);
      setFieldError(k);
      if (k) { (k === 'mismatch' ? form.elements.password2 : form.elements.password).focus(); return; }
      busy = true; btn.disabled = true; btn.setAttribute('aria-busy', 'true');
      var spin = btn.querySelector('.spinner'); if (spin) spin.hidden = false;
      updatePassword(client, form.elements.password.value).then(function (r) {
        busy = false; btn.disabled = false; btn.removeAttribute('aria-busy'); if (spin) spin.hidden = true;
        if (r.ok) { form.reset(); show('reset-success'); return; }
        if (r.reason === 'expired' || r.reason === 'invalid') { showError(r.reason); return; }
        if (r.reason === 'same' || r.reason === 'weak') { setFieldError(r.reason); form.elements.password.focus(); return; }
        setStatus(r.reason === 'network' ? 'network' : 'failed');
      });
    });
    var toggle = document.getElementById('reset-show');
    if (toggle) toggle.addEventListener('change', function () {
      var type = toggle.checked ? 'text' : 'password';
      form.elements.password.type = type; form.elements.password2.type = type;
    });
  }

  var api = { readLink: readLink, checkPasswords: checkPasswords, establishSession: establishSession, updatePassword: updatePassword, errorReason: errorReason };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    global.MRQReset = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
