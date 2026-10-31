// Language (TR default, EN) + theme toggle + mobile menu. No dependencies.
(function () {
  var root = document.documentElement;
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  function applyI18nAttrs(lang) {
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var names = el.getAttribute('data-i18n').split(',');
      for (var j = 0; j < names.length; j++) {
        var name = names[j].trim();
        var v = el.getAttribute('data-' + lang + '-' + name);
        if (v == null) continue;
        if (name === 'text') el.textContent = v; else el.setAttribute(name, v);
      }
    }
  }

  window.mrqSetLang = function (lang) {
    if (lang !== 'en') lang = 'tr';
    root.setAttribute('data-lang', lang);
    root.setAttribute('lang', lang);
    var t = root.getAttribute('data-title-' + lang);
    if (t) document.title = t;
    var d = root.getAttribute('data-desc-' + lang);
    var meta = document.querySelector('meta[name="description"]');
    if (d && meta) meta.setAttribute('content', d);
    applyI18nAttrs(lang);
    var btn = document.getElementById('lang-toggle');
    if (btn) {
      btn.textContent = lang === 'tr' ? 'EN' : 'TR';
      btn.setAttribute('aria-label', lang === 'tr' ? 'Switch to English' : 'Türkçeye geç');
    }
    store('mrq-lang', lang);
    document.dispatchEvent(new CustomEvent('mrq:lang', { detail: lang }));
  };

  function currentTheme() {
    var t = root.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function syncThemeBtn() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    var dark = currentTheme() === 'dark';
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    var lang = root.getAttribute('data-lang');
    btn.setAttribute('aria-label', lang === 'en' ? (dark ? 'Switch to light theme' : 'Switch to dark theme') : (dark ? 'Açık temaya geç' : 'Koyu temaya geç'));
  }

  document.addEventListener('DOMContentLoaded', function () {
    window.mrqSetLang(root.getAttribute('data-lang'));
    var lb = document.getElementById('lang-toggle');
    if (lb) lb.addEventListener('click', function () { window.mrqSetLang(root.getAttribute('data-lang') === 'tr' ? 'en' : 'tr'); syncThemeBtn(); });
    var tb = document.getElementById('theme-toggle');
    if (tb) tb.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store('mrq-theme', next);
      syncThemeBtn();
    });
    syncThemeBtn();
    var mb = document.getElementById('menu-toggle');
    var links = document.getElementById('nav-links');
    if (mb && links) {
      mb.addEventListener('click', function () {
        var open = links.classList.toggle('open');
        mb.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      links.addEventListener('click', function (e) {
        if (e.target.closest('a')) { links.classList.remove('open'); mb.setAttribute('aria-expanded', 'false'); }
      });
    }
    var y = document.getElementById('year');
    if (y) y.textContent = String(new Date().getFullYear());
  });
})();
