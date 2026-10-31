// Membership request form → Supabase `public.access_requests` (anon INSERT only, RLS; no read-back).
// Validation mirrors the DB check constraints (supabase/migrations/*_motiracq_core.sql).
(function (global) {
  var SUPABASE_URL = 'https://fuqjcjkjlvnzqvpuzvma.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_4qUN2QmgFohnerFeIK8bBA_lbJDo3jP';
  var ENDPOINT = SUPABASE_URL + '/rest/v1/access_requests';
  var SPORTS = ['tennis', 'padel', 'badminton', 'squash', 'pickleball', 'table_tennis'];
  var LEVELS = ['beginner', 'intermediate', 'advanced', 'competitive', 'coach'];
  var MIN_FILL_MS = 1500; // faster than this = bot; silently "succeeds"

  var MSG = {
    tr: {
      full_name: 'Lütfen adınızı ve soyadınızı yazın (3–120 karakter).',
      email: 'Geçerli bir e-posta adresi yazın.',
      phone: 'Geçerli bir telefon numarası yazın (en az 7 rakam).',
      sport: 'Lütfen bir spor seçin.',
      level: 'Geçersiz seviye.',
      city: 'Şehir en fazla 80 karakter olabilir.',
      note: 'Not en fazla 1000 karakter olabilir.',
      kvkk: 'Devam etmek için KVKK Aydınlatma Metni\'ni okuduğunuzu onaylayın.',
      fix: 'Lütfen işaretli alanları düzeltin.',
      sending: 'Gönderiliyor…',
      network: 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
      rate: 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.',
      rejected: 'İsteğiniz kaydedilemedi. Lütfen bilgilerinizi kontrol edip tekrar deneyin.',
      server: 'Sunucu şu anda yanıt vermiyor. Lütfen biraz sonra tekrar deneyin.'
    },
    en: {
      full_name: 'Please enter your full name (3–120 characters).',
      email: 'Enter a valid email address.',
      phone: 'Enter a valid phone number (at least 7 digits).',
      sport: 'Please choose a sport.',
      level: 'Invalid level.',
      city: 'City can be at most 80 characters.',
      note: 'Note can be at most 1000 characters.',
      kvkk: 'Please confirm that you have read the KVKK Privacy Notice.',
      fix: 'Please correct the highlighted fields.',
      sending: 'Sending…',
      network: 'Could not connect. Check your internet connection and try again.',
      rate: 'Too many attempts. Please try again in a few minutes.',
      rejected: 'Your request could not be saved. Please check your details and try again.',
      server: 'The server is not responding right now. Please try again shortly.'
    }
  };

  function clean(v) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; }

  /** values: raw form values. Returns {errors: {field: key}, payload} */
  function validate(values) {
    var errors = {};
    var full_name = clean(values.full_name);
    var email = clean(values.email).toLowerCase();
    var phone = clean(values.phone);
    var sport = clean(values.sport);
    var level = clean(values.level);
    var city = clean(values.city);
    var note = typeof values.note === 'string' ? values.note.trim() : '';
    if (full_name.length < 3 || full_name.length > 120) errors.full_name = 'full_name';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) errors.email = 'email';
    var digits = phone.replace(/\D/g, '');
    if (phone.length < 7 || phone.length > 30 || digits.length < 7 || !/^[+0-9 ()./-]+$/.test(phone)) errors.phone = 'phone';
    if (SPORTS.indexOf(sport) < 0) errors.sport = 'sport';
    if (level && (LEVELS.indexOf(level) < 0 || level.length > 60)) errors.level = 'level';
    if (city.length > 80) errors.city = 'city';
    if (note.length > 1000) errors.note = 'note';
    if (values.kvkk_consent !== true) errors.kvkk_consent = 'kvkk';
    var payload = {
      full_name: full_name,
      email: email,
      phone: phone,
      sport: sport,
      level: level || null,
      city: city || null,
      note: note || null,
      kvkk_consent: true,
      marketing_opt_in: values.marketing_opt_in === true,
      source: 'web'
    };
    return { errors: errors, payload: payload };
  }

  /** POSTs the payload. Resolves {ok:true} or {ok:false, reason}. fetchImpl is injectable for tests. */
  function submitRequest(payload, fetchImpl) {
    var f = fetchImpl || global.fetch;
    return f(ENDPOINT, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (res.status === 201 || res.status === 204 || res.ok) return { ok: true };
      if (res.status === 429) return { ok: false, reason: 'rate' };
      if (res.status >= 500) return { ok: false, reason: 'server' };
      return { ok: false, reason: 'rejected', status: res.status };
    }, function () { return { ok: false, reason: 'network' }; });
  }

  function lang() { return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'tr'; }

  function init() {
    var form = document.getElementById('apply-form');
    if (!form) return;
    var started = Date.now();
    var busy = false;
    var btn = form.querySelector('button[type="submit"]');
    var status = document.getElementById('form-status');
    var lastErrors = null;

    function setFieldError(name, key) {
      var input = form.elements[name];
      var err = document.getElementById('err-' + name);
      if (input) {
        if (key) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
      }
      if (err) err.textContent = key ? MSG[lang()][key] : '';
    }
    function showErrors(errors) {
      ['full_name', 'email', 'phone', 'sport', 'level', 'city', 'note', 'kvkk_consent'].forEach(function (n) { setFieldError(n, errors[n]); });
    }
    function setStatus(kind, key) {
      status.className = 'status' + (kind ? ' ' + kind : '');
      status.textContent = key ? MSG[lang()][key] : '';
      status.setAttribute('data-key', key || '');
    }
    function values() {
      return {
        full_name: form.elements.full_name.value,
        email: form.elements.email.value,
        phone: form.elements.phone.value,
        sport: form.elements.sport.value,
        level: form.elements.level.value,
        city: form.elements.city.value,
        note: form.elements.note.value,
        kvkk_consent: form.elements.kvkk_consent.checked,
        marketing_opt_in: form.elements.marketing_opt_in.checked
      };
    }
    function done() {
      form.hidden = true;
      var ok = document.getElementById('apply-success');
      ok.hidden = false;
      ok.focus();
    }

    // live re-validation after the first failed submit
    form.addEventListener('input', function () { if (lastErrors) { lastErrors = validate(values()).errors; showErrors(lastErrors); } });
    form.addEventListener('change', function () { if (lastErrors) { lastErrors = validate(values()).errors; showErrors(lastErrors); } });
    document.addEventListener('mrq:lang', function () {
      if (lastErrors) showErrors(lastErrors);
      var k = status.getAttribute('data-key');
      if (k) status.textContent = MSG[lang()][k];
    });
    var noteEl = form.elements.note, counter = document.getElementById('note-count');
    if (noteEl && counter) noteEl.addEventListener('input', function () { counter.textContent = noteEl.value.length + ' / 1000'; });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      setStatus('', '');
      // honeypot filled: pretend success, send nothing
      if (form.elements.website.value) { done(); return; }
      var v = validate(values());
      lastErrors = v.errors;
      showErrors(v.errors);
      var first = Object.keys(v.errors)[0];
      if (first) {
        setStatus('error', 'fix');
        var el = form.elements[first];
        if (el && el.focus) el.focus();
        return;
      }
      // a valid form filled in faster than a human could: pretend success, send nothing
      if (Date.now() - started < MIN_FILL_MS) { done(); return; }
      busy = true;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      var spin = btn.querySelector('.spinner');
      if (spin) spin.hidden = false;
      submitRequest(v.payload, global.MRQ_FETCH).then(function (r) {
        busy = false;
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        if (spin) spin.hidden = true;
        if (r.ok) { done(); return; }
        setStatus('error', r.reason);
      });
    });
  }

  var api = { validate: validate, submitRequest: submitRequest, ENDPOINT: ENDPOINT, SPORTS: SPORTS, LEVELS: LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    global.MRQForm = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
