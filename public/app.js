'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   app.js — النواة: البيانات · التواريخ · النوافذ · الملف الشخصي · البحث · التثبيت
   ═══════════════════════════════════════════════════════════════════════════ */

window.DB = {};
const CFG = () => window.APP_CONFIG || {};

/* ═══════════════════════════════════════════════════════════════════════════
   0) ACCESS GATE — بوابة الدخول
   لا تُطلب أي بيانات من الـ API ولا تُعرض أي صفحة قبل اجتياز هذه البوابة.
   الرمز: من config.js (GATE.PASSPHRASE) أو يختاره المستخدم على جهازه (وضع محلي).
   ═══════════════════════════════════════════════════════════════════════════ */

window.Gate = (function () {
  const SESSION_KEY = 'imtiaz_gate_session_v1';
  const LOCAL_KEY = 'imtiaz_gate_local_pass_v1';
  const ATTEMPTS_KEY = 'imtiaz_gate_attempts_v1';
  const CACHE_DATA_KEY = 'imtiaz_data_cache_v2';        // كاش بيانات اللوحة (يُمسح عند القفل)
  let unlocked = false, idleTimer = null;

  const cfg = () => Object.assign({ ENABLED: true, PASSPHRASE: '', REMEMBER_HOURS: 12, AUTO_LOCK_MINUTES: 0, MAX_ATTEMPTS: 5, LOCKOUT_SECONDS: 30 }, CFG().GATE || {});
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  const $ = (id) => document.getElementById(id);
  const sha256 = async function (txt) {
    try {
      if (window.crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* ignore */ }
    let h = 5381; for (let i = 0; i < txt.length; i++) { h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0; }
    return 'f' + h.toString(16);
  };

  function sessionValid() {
    try {
      const raw = ls.get(SESSION_KEY); if (!raw) return false;
      const s = JSON.parse(raw);
      return !!(s && s.exp > Date.now());
    } catch (e) { return false; }
  }
  function lockoutLeft() {
    try {
      const a = JSON.parse(ls.get(ATTEMPTS_KEY) || '{"n":0,"until":0}');
      const left = Math.ceil((a.until - Date.now()) / 1000);
      return left > 0 ? left : 0;
    } catch (e) { return 0; }
  }
  function bumpAttempts() {
    const c = cfg();
    let a = { n: 0, until: 0 };
    try { a = JSON.parse(ls.get(ATTEMPTS_KEY) || '{"n":0,"until":0}'); } catch (e) { /* ignore */ }
    a.n = (a.n || 0) + 1;
    if (a.n >= c.MAX_ATTEMPTS) { a.until = Date.now() + c.LOCKOUT_SECONDS * 1000; a.n = 0; }
    ls.set(ATTEMPTS_KEY, JSON.stringify(a));
    return a;
  }
  function resetAttempts() { ls.del(ATTEMPTS_KEY); }

  /* ── وضع الجدول: قراءة تبويب Accounts (Username | Password) من نفس Apps Script ── */
  const USERS_LS_KEY = 'imtiaz_gate_users_v1';           // نسخة احتياطية للعمل بدون اتصال
  let usersCache = null;                                  // [{u,p}] في الذاكرة
  let currentRole = '';                                   // لو أضفت عمود Role في التبويب

  // تطبيع اسم المستخدم فقط — كلمة المرور تُقارَن كما كُتبت في الجدول تماماً
  function normUser(v) { return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' '); }

  /* ── hash خفيف لكلمات المرور داخل الجدول (FNV-1a مزدوج — لا يُخزَّن نص كلمة المرور) ── */
  function passHash(s) {
    const str = String(s || '');
    let h1 = 0x811c9dc5 >>> 0, h2 = 0x01000193 >>> 0;
    for (let i = 0; i < str.length; i++) {
      const cc = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ cc, 16777619) >>> 0;
      h2 = Math.imul(h2 + cc + i, 2246822519) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  /* يقرأ أي ترتيب للأعمدة: Username|Password أو user|pass أو «اسم المستخدم»|«كلمة المرور» */
  function pickPair(r) {
    const keys = Object.keys(r || {});
    if (!keys.length) return null;
    const nk = keys.map((k) => normKey(k));
    const byName = (list) => { for (let i = 0; i < nk.length; i++) { if (list.indexOf(nk[i]) > -1) return i; } return -1; };
    let ui = byName(['username', 'user', 'login', 'email', 'id', 'المستخدم', 'اسم_المستخدم', 'اسم_المستخدم']);
    let pi = byName(['password', 'pass', 'pwd', 'secret', 'الرمز', 'كلمة_المرور', 'كلمة_السر']);
    if (ui === -1) ui = 0;
    if (pi === -1) pi = keys.length > 1 ? 1 : -1;
    if (ui === pi || pi === -1) return null;
    const u = r[keys[ui]], p = r[keys[pi]];
    if (!String(u == null ? '' : u).trim() || !String(p == null ? '' : p).trim()) return null;
    return { u: normUser(u), p: String(p).trim(), role: String(r[nk.indexOf('role') > -1 ? keys[nk.indexOf('role')] : ''] || '').trim() };
  }

  function saveUsersLocal(list) { try { ls.set(USERS_LS_KEY, JSON.stringify({ ts: Date.now(), list: list })); } catch (e) {} }
  function loadUsersLocal() {
    try {
      const o = JSON.parse(ls.get(USERS_LS_KEY) || 'null');
      if (o && Array.isArray(o.list)) { usersCache = o.list; return o.list; }
    } catch (e) {}
    return null;
  }

  async function fetchAccounts(force) {
    const c = cfg();
    const ttl = Math.max(1, Number(c.USERS_TTL_MINUTES) || 60) * 60 * 1000;
    if (!force && usersCache) return usersCache;
    if (!force) {
      try {
        const o = JSON.parse(ls.get(USERS_LS_KEY) || 'null');
        if (o && Array.isArray(o.list) && (Date.now() - (o.ts || 0)) < ttl) { usersCache = o.list; return o.list; }
      } catch (e) {}
    }
    const name = c.USERS_SHEET_NAME || 'Accounts';
    let rows = [];
    try {
      rows = await window.__gateFetchSheet(name);         // دالة تحقن لاحقاً (تتخطى فحص القفل)
    } catch (err) {
      const alt = c.USERS_SHEET_NAME_ALT || '';
      if (!alt || alt === name) throw err;
      rows = await window.__gateFetchSheet(alt);          // تجربة الاسم البديل (عربي/إنجليزي)
    }
    const list = [];
    (rows || []).forEach((r) => { const pair = pickPair(r); if (pair) list.push(pair); });
    if (!list.length) throw new Error('EMPTY_ACCOUNTS');
    usersCache = list; saveUsersLocal(list);
    return list;
  }

  /* كلمة المرور لا تُرسَل إلى Apps Script إطلاقاً — نطلب التبويب مرة واحدة فقط */
  async function verifyAgainstSheet(user, pass) {
    let list;
    try { list = await fetchAccounts(false); }
    catch (e) {
      const fb = loadUsersLocal();
      if (!fb) { const ne = new Error('NO_ACCOUNTS_SOURCE'); ne.cause = e; throw ne; }
      list = fb;                                          // بدون إنترنت — استخدم آخر نسخة آمنة
    }
    const u = normUser(user), raw = String(pass || '').trim(), p = passHash(raw);
    const hit = list.find((x) => x.u === u && (passHash(x.p) === p || x.p === raw));
    if (hit) { currentRole = hit.role || ''; return true; }
    const knownUser = list.some((x) => x.u === u);
    throw Object.assign(new Error(knownUser ? 'WRONG_PASS' : 'UNKNOWN_USER'), { accounts: list.length });
  }

  function currentUserName() {
    try { const s = JSON.parse(ls.get(SESSION_KEY) || 'null'); return (s && s.name) || ''; } catch (e) { return ''; }
  }

  function expectedHashes() {
    const c = cfg(), out = [];
    if (c.PASSPHRASE) out.push({ hash: null, plain: String(c.PASSPHRASE), source: 'config' });
    const local = ls.get(LOCAL_KEY);
    if (local) out.push({ hash: local, plain: null, source: 'device' });
    return out;
  }

  async function check(input) {
    const val = String(input || '').trim();
    if (!val) return false;
    const list = expectedHashes();
    if (!list.length) return false;
    const h = await sha256(val);
    return list.some((x) => (x.hash ? x.hash === h : x.plain === val));
  }

  function markUnlocked(userName) {
    const c = cfg();
    const hrs = Math.max(1, Number(c.SESSION_HOURS || c.REMEMBER_HOURS) || 8);
    unlocked = true;
    ls.set(SESSION_KEY, JSON.stringify({ ts: Date.now(), exp: Date.now() + hrs * 3600 * 1000, name: userName || '' }));
    resetAttempts();
    hideGate();
    updateWhoChip();
    startIdleLock();
  }

  function updateWhoChip() {
    const el = document.getElementById('who-chip');
    if (!el) return;
    const nm = currentUserName();
    if (nm) {
      const role = currentRole ? ' · ' + currentRole : '';
      el.innerHTML = `<span class="who-avatar" aria-hidden="true">${esc(nm.slice(0, 1).toUpperCase())}</span><span class="who-name">${esc(nm)}</span>${role ? `<span class="who-role">${esc(role.replace(/^ · /, ''))}</span>` : ''}`;
      el.title = 'المستخدم الحالي' + (role ? ' · الصلاحية: ' + currentRole : '');
      el.classList.remove('hidden');
    } else { el.classList.add('hidden'); el.textContent = ''; }
  }

  function showGate(msg) {
    const ov = $('gate-overlay'); if (!ov) { return; }
    ov.classList.remove('hidden');
    document.body.classList.add('gated', 'no-scroll');
    const c = cfg();
    const modeName = (String(c.MODE || 'sheet').toLowerCase() === 'local') ? 'local' : 'sheet';
    const setup = $('gate-setup'), note = $('gate-note'), mode = $('gate-mode'), chip = $('gate-chip');
    const userF = $('gate-user'), passF = $('gate-pass');
    if (userF) userF.style.display = (modeName === 'sheet') ? '' : 'none';
    const uLabel = document.querySelector('label[for="gate-user"]');
    if (uLabel) uLabel.style.display = (modeName === 'sheet') ? '' : 'none';
    const needsLocalSetup = (modeName === 'local') && !ls.get(LOCAL_KEY);
    if (setup) setup.classList.toggle('hidden', !needsLocalSetup);
    if (note) note.textContent = needsLocalSetup
      ? 'لم يتم تعيين رمز بعد. اختر رمز دخول خاص بهذا الجهاز (٤ أحرف أو أكثر).'
      : (modeName === 'sheet'
        ? 'هذه اللوحة تحتوي على بيانات طلاب — الدخول مسموح لحسابات الكلية المعتمدة فقط.'
        : 'أدخل رمز الدخول للمتابعة.');
    if (mode) mode.textContent = modeName === 'sheet' ? 'التحقق عبر حسابات Google Sheet' : (c.PASSPHRASE ? 'رمز مشترك للوحة' : 'رمز محلي على هذا الجهاز');
    if (chip) chip.innerHTML = modeName === 'sheet'
      ? `<span class="chip-ico" aria-hidden="true">${iconSvg('lock')}</span>دخول بالحسابات المعتمدة`
      : `<span class="chip-ico" aria-hidden="true">${iconSvg('shield')}</span>منطقة آمنة`;
    try { const lu = ls.get('imtiaz_gate_last_user_v1'); if (lu && userF && !userF.value) userF.value = lu; } catch (e) {}
    const err = $('gate-err');
    if (err) { err.textContent = msg || ''; err.classList.toggle('hidden', !msg); }
    const inp = $('gate-pass'); if (inp) setTimeout(() => { try { inp.focus(); } catch (e) { /* ignore */ } }, 60);
  }

  function hideGate() {
    const ov = $('gate-overlay');
    if (ov) ov.classList.add('hidden');
    document.body.classList.remove('gated', 'no-scroll');
    const inp = $('gate-pass'); if (inp) inp.value = '';
    const inp2 = $('gate-pass2'); if (inp2) inp2.value = '';
  }

  function startIdleLock() {
    const mins = Number(cfg().AUTO_LOCK_MINUTES) || 0;
    if (idleTimer) clearTimeout(idleTimer);
    if (mins <= 0) return;
    const arm = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(lock, mins * 60 * 1000); };
    ['click', 'keydown', 'touchstart', 'scroll'].forEach((ev) => document.addEventListener(ev, arm, { passive: true }));
    arm();
  }

  async function lock() {
    unlocked = false; currentRole = '';
    ls.del(SESSION_KEY);
    usersCache = null;
    try { localStorage.removeItem(CACHE_DATA_KEY); } catch (e) {}                 // لا بيانات طلاب على الجهاز بعد القفل
    updateWhoChip();
    closeAllForLock();
    showGate('تم قفل اللوحة.');
    toast('تم قفل اللوحة وحذف البيانات المخزّنة');
  }

  function closeAllForLock() {
    try { window.Overlays && Overlays.closeAll(); } catch (e) { /* ignore */ }
    document.querySelectorAll('.modal-overlay,.profile-overlay,.search-overlay').forEach((n) => n.remove());
    document.body.classList.remove('no-scroll');
  }

  function clearDevicePass() { ls.del(LOCAL_KEY); ls.del(SESSION_KEY); unlocked = false; showGate('تم حذف الرمز المحلي — اختر رمزاً جديداً.'); }

  async function submit(userOrPass, pass, confirmPass) {
    const c = cfg();
    const modeName = (String(c.MODE || 'sheet').toLowerCase() === 'local') ? 'local' : 'sheet';
    let user = '', pwd = '';
    if (modeName === 'sheet') { user = String(userOrPass || '').trim(); pwd = String(pass === undefined ? confirmPass : pass || '').trim(); }
    else { pwd = String(confirmPass !== undefined && pass !== undefined ? pass : (userOrPass || '')).trim(); }

    /* لا نكتب كلمة المرور في localStorage إطلاقاً — اسم المستخدم فقط */
    const rememberUser = (u) => { try { if (u) ls.set('imtiaz_gate_last_user_v1', String(u).trim()); } catch (e) {} };

    const left = lockoutLeft();
    if (left > 0) { showGate(`محاولات كثيرة — انتظر ${left} ثانية ثم أعد المحاولة.`); return false; }

    if (modeName === 'sheet') {
      if (!user || !pwd) { showGate('أدخل اسم المستخدم وكلمة المرور معاً.'); return false; }
      // باب طوارئ اختياري من config
      if (c.PASSPHRASE && pwd === String(c.PASSPHRASE)) { rememberUser(user); markUnlocked(user); return true; }
      let diag = '';
      try {
        await verifyAgainstSheet(user, pwd);
        rememberUser(user); markUnlocked(user);
        toast('أهلاً بك' + (currentRole ? ' · ' + currentRole : ''));
        return true;
      } catch (e) {
        const m = (e && e.message) || '';
        if (m === 'EMPTY_ACCOUNTS') diag = 'تبويب الحسابات فارغ أو أعمدته غير مفهومة — الصف يجب أن يكون: العمود الأول اسم مستخدم، الثاني كلمة مرور.';
        else if (m === 'UNKNOWN_USER') diag = 'اسم المستخدم غير موجود في قائمة الحسابات. المحاولات المتبقية: ';
        else if (m === 'WRONG_PASS') diag = 'كلمة المرور غير صحيحة لهذا الحساب. المحاولات المتبقية: ';
        else if (m === 'NO_ACCOUNTS_SOURCE') diag = (navigator.onLine === false)
          ? 'لا يوجد اتصال بالإنترنت ولا نسخة محفوظة من الحسابات على هذا الجهاز.'
          : `تعذّر قراءة تبويب الحسابات «${c.USERS_SHEET_NAME || 'Accounts'}». تأكد من الاسم ومن أن الـ API يعمل.`;
        else diag = 'تعذّر التحقق من الحسابات الآن. تحقّق من الاتصال أو اسم التبويب في config.js.';
        if (m === 'UNKNOWN_USER' || m === 'WRONG_PASS') {
          const a = bumpAttempts();
          const remain = Math.max(0, c.MAX_ATTEMPTS - (a.n || 0));
          showGate(a.until ? `تم إيقاف المحاولات مؤقتاً لمدة ${c.LOCKOUT_SECONDS} ثانية.` : diag + remain + '.');
          return false;
        }
        showGate(diag); return false;
      }
    }

    // ── الوضع المحلي (بدون جدول) ──
    if (pwd.length < 4) { showGate('الرمز قصير جداً — استخدم ٤ أحرف على الأقل.'); return false; }
    if (!c.PASSPHRASE && !ls.get(LOCAL_KEY)) {
      if (confirmPass !== undefined && confirmPass !== pwd) { showGate('الرمزان غير متطابقين.'); return false; }
      ls.set(LOCAL_KEY, await sha256(pwd));
      markUnlocked('');
      toast('تم ضبط الرمز — احتفظ به، لا يمكن استعادته');
      return true;
    }
    if (await check(pwd)) { markUnlocked(''); return true; }
    const a2 = bumpAttempts();
    const remain2 = Math.max(0, c.MAX_ATTEMPTS - (a2.n || 0));
    showGate(a2.until ? `تم إيقاف المحاولات مؤقتاً لمدة ${c.LOCKOUT_SECONDS} ثانية.` : 'رمز غير صحيح. المحاولات المتبقية: ' + remain2 + '.');
    return false;
  }

  function bindUI(onPass) {
    const form = $('gate-form');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      setBusy(true);
      const u = $('gate-user') ? $('gate-user').value : '';
      const p = $('gate-pass') ? $('gate-pass').value : '';
      Promise.resolve(onPass(u, p)).then(() => setBusy(false)).catch(() => setBusy(false));
    });
    const setupBtn = document.querySelector('[data-action="gate-set-pass"]');
    if (setupBtn) setupBtn.addEventListener('click', () => onPass('', $('gate-pass') ? $('gate-pass').value : '', $('gate-pass2') ? $('gate-pass2').value : ''));

    // تنبيه Caps Lock + عدّاد الحسابات في تذييل البوابة
    const pass = $('gate-pass'), caps = $('gate-caps');
    if (pass && caps) {
      const chk = (e) => { try { if (e.getModifierState) caps.classList.toggle('hidden', !e.getModifierState('CapsLock')); } catch (err) {} };
      pass.addEventListener('keyup', chk); pass.addEventListener('keydown', chk);
      pass.addEventListener('blur', () => caps.classList.add('hidden'));
    }
    updateAccountsHint();
  }

  function setBusy(on) {
    const b = $('gate-submit'); if (!b) return;
    const spin = b.querySelector('.gate-spin'), txt = b.querySelector('.gate-submit-txt');
    b.disabled = !!on; b.classList.toggle('busy', !!on);
    if (spin) spin.classList.toggle('hidden', !on);
    if (txt) txt.textContent = on ? 'جارٍ التحقق…' : 'دخول آمن';
  }

  /* سطر صغير يطمئن المستخدم: كم حساباً معروفاً في الجدول (بدون كشف أي أسماء/كلمات مرور) */
  function updateAccountsHint() {
    const el = $('gate-accounts'); if (!el) return;
    const c = cfg();
    if (String(c.MODE || 'sheet').toLowerCase() === 'local') { el.classList.add('hidden'); return; }
    let n = 0, ts = 0;
    try { const o = JSON.parse(ls.get(USERS_LS_KEY) || 'null'); if (o && Array.isArray(o.list)) { n = o.list.length; ts = o.ts || 0; } } catch (e) {}
    if (!n) { el.classList.add('hidden'); return; }
    const mins = ts ? Math.max(0, Math.round((Date.now() - ts) / 60000)) : null;
    el.textContent = `قائمة الحسابات متاحة على هذا الجهاز (${n} حساباً${mins !== null ? ' · آخر قراءة قبل ' + mins + ' دقيقة' : ''})`;
    el.classList.remove('hidden');
  }

  /* نجاح/فشل التحقق → إعادة ضبط زر «دخول آمن» وتحديث سطر الحسابات */
  function afterSubmit(ok) {
    setBusy(false);
    updateAccountsHint();
    return ok;
  }

  function init(onPass) {
    const c = cfg();
    if (!c.ENABLED) { unlocked = true; return true; }
    if (sessionValid()) { unlocked = true; hideGate(); startIdleLock(); return true; }
    showGate('');
    bindUI(onPass);
    return false;
  }

  return {
    init, submit, lock, showGate, hideGate, clearDevicePass, afterSubmit,
    isUnlocked: () => unlocked,
    userName: currentUserName,
    role: () => currentRole,
    whoChip: updateWhoChip,
    reloadAccounts: () => fetchAccounts(true).then(() => { updateAccountsHint(); return true; }).catch(() => false),
    hasConfiguredPass: () => !!cfg().PASSPHRASE || !!ls.get(LOCAL_KEY),
    gateCfg: cfg
  };
})();

/* ───────────────────────── 1) أدوات عامة ───────────────────────── */

// تهريب HTML (أسماء الطلاب فيها أحياناً علامات ' و " كانت تكسر الأزرار القديمة)
window.esc = function (v) {
  return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};

// يبني خصائص عنصر قابل للضغط: data-action + data-* (بدون onclick داخل النصوص)
window.act = function (action, data) {
  let s = ` data-action="${esc(action)}" role="button" tabindex="0"`;
  Object.keys(data || {}).forEach((k) => {
    if (data[k] !== undefined && data[k] !== null) s += ` data-${k}="${esc(data[k])}"`;
  });
  return s;
};

// تطبيع النص العربي للبحث (أ إ آ → ا ، ى → ي ، ة → ه ، حذف التشكيل)
window.normAr = function (v) {
  return String(v === null || v === undefined ? '' : v)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim();
};

window.toast = function (msg, ms) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window._toastT);
  window._toastT = setTimeout(() => el.classList.remove('show'), ms || 2600);
};

window.copyText = function (text, okMsg) {
  const done = () => toast(okMsg || 'تم النسخ');
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;opacity:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done();
    } catch (e) { toast('تعذّر النسخ'); }
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done).catch(fallback);
  else fallback();
};

/* ───────────────────────── 2) التواريخ (بتوقيت القاهرة) ───────────────────────── */
// السبب الجذري لمشكلة "كل الجروبات قادم": Apps Script يرسل التاريخ كـ UTC
// (3 نوفمبر القاهرة = 2026-11-02T22:00:00Z) والكود القديم كان يقص الجزء "T…" فيرجع يوماً للخلف.

function tzParts(d) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: CFG().TIMEZONE || 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const o = {}; parts.forEach((p) => { o[p.type] = p.value; });
  return o;
}
function dateInTZ(d) { const p = tzParts(d); return `${p.year}-${p.month}-${p.day}`; }

window.formatDate = function (v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return isNaN(v) ? '' : dateInTZ(v);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(s)) {       // لحظة زمنية مطلقة → تاريخ القاهرة
    const d = new Date(s); if (!isNaN(d)) return dateInTZ(d);
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) return s.slice(0, 10);            // تاريخ/وقت محلي بدون منطقة
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);                    // d/m/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
};

window.getTodayStr = function () { return dateInTZ(new Date()); };

window.computeStatus = function (startDate, endDate) {
  const s = formatDate(startDate), e = formatDate(endDate);
  if (!s || !e) return 'upcoming';
  const today = getTodayStr();
  if (today > e) return 'finished';
  if (today >= s) return 'current';
  return 'upcoming';
};

window.computeAge = function (birth) {
  const b = formatDate(birth).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!b) return 'غير محدد';
  const t = getTodayStr().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let age = +t[1] - +b[1];
  if (+t[2] < +b[2] || (+t[2] === +b[2] && +t[3] < +b[3])) age--;
  return age > 0 && age < 100 ? `${age} سنة` : 'غير محدد';
};

window.daysUntil = function (dateStr) {
  const a = Date.parse(getTodayStr() + 'T00:00:00Z'), b = Date.parse(formatDate(dateStr) + 'T00:00:00Z');
  return isNaN(a) || isNaN(b) ? null : Math.round((b - a) / 86400000);
};

window.getRoundDates = function (order) {
  const o = String(order).trim();
  let row = (DB.roundDates || []).find((r) => String(r.round_order).trim() === o && r.start_date);
  if (!row && DB.roundSchedule && DB.roundSchedule.length) {            // احتياطي: جدول الجروبات نفسه يحتوي التواريخ
    const sch = DB.roundSchedule.find((r) => String(r.round_order).trim() === o && r.start_date);
'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   app.js — النواة: البيانات · التواريخ · النوافذ · الملف الشخصي · البحث · التثبيت
   ═══════════════════════════════════════════════════════════════════════════ */

window.DB = {};
const CFG = () => window.APP_CONFIG || {};

/* ═══════════════════════════════════════════════════════════════════════════
   0) ACCESS GATE — بوابة الدخول
   لا تُطلب أي بيانات من الـ API ولا تُعرض أي صفحة قبل اجتياز هذه البوابة.
   الرمز: من config.js (GATE.PASSPHRASE) أو يختاره المستخدم على جهازه (وضع محلي).
   ═══════════════════════════════════════════════════════════════════════════ */

window.Gate = (function () {
  const SESSION_KEY = 'imtiaz_gate_session_v1';
  const LOCAL_KEY = 'imtiaz_gate_local_pass_v1';
  const ATTEMPTS_KEY = 'imtiaz_gate_attempts_v1';
  const CACHE_DATA_KEY = 'imtiaz_data_cache_v2';        // كاش بيانات اللوحة (يُمسح عند القفل)
  let unlocked = false, idleTimer = null;

  const cfg = () => Object.assign({ ENABLED: true, PASSPHRASE: '', REMEMBER_HOURS: 12, AUTO_LOCK_MINUTES: 0, MAX_ATTEMPTS: 5, LOCKOUT_SECONDS: 30 }, CFG().GATE || {});
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  const $ = (id) => document.getElementById(id);
  const sha256 = async function (txt) {
    try {
      if (window.crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* ignore */ }
    let h = 5381; for (let i = 0; i < txt.length; i++) { h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0; }
    return 'f' + h.toString(16);
  };

  function sessionValid() {
    try {
      const raw = ls.get(SESSION_KEY); if (!raw) return false;
      const s = JSON.parse(raw);
      return !!(s && s.exp > Date.now());
    } catch (e) { return false; }
  }
  function lockoutLeft() {
    try {
      const a = JSON.parse(ls.get(ATTEMPTS_KEY) || '{"n":0,"until":0}');
      const left = Math.ceil((a.until - Date.now()) / 1000);
      return left > 0 ? left : 0;
    } catch (e) { return 0; }
  }
  function bumpAttempts() {
    const c = cfg();
    let a = { n: 0, until: 0 };
    try { a = JSON.parse(ls.get(ATTEMPTS_KEY) || '{"n":0,"until":0}'); } catch (e) { /* ignore */ }
    a.n = (a.n || 0) + 1;
    if (a.n >= c.MAX_ATTEMPTS) { a.until = Date.now() + c.LOCKOUT_SECONDS * 1000; a.n = 0; }
    ls.set(ATTEMPTS_KEY, JSON.stringify(a));
    return a;
  }
  function resetAttempts() { ls.del(ATTEMPTS_KEY); }

  /* ── وضع الجدول: قراءة تبويب Accounts (Username | Password) من نفس Apps Script ── */
  const USERS_LS_KEY = 'imtiaz_gate_users_v1';           // نسخة احتياطية للعمل بدون اتصال
  let usersCache = null;                                  // [{u,p}] في الذاكرة
  let currentRole = '';                                   // لو أضفت عمود Role في التبويب

  // تطبيع اسم المستخدم فقط — كلمة المرور تُقارَن كما كُتبت في الجدول تماماً
  function normUser(v) { return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' '); }

  /* ── hash خفيف لكلمات المرور داخل الجدول (FNV-1a مزدوج — لا يُخزَّن نص كلمة المرور) ── */
  function passHash(s) {
    const str = String(s || '');
    let h1 = 0x811c9dc5 >>> 0, h2 = 0x01000193 >>> 0;
    for (let i = 0; i < str.length; i++) {
      const cc = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ cc, 16777619) >>> 0;
      h2 = Math.imul(h2 + cc + i, 2246822519) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  /* يقرأ أي ترتيب للأعمدة: Username|Password أو user|pass أو «اسم المستخدم»|«كلمة المرور» */
  function pickPair(r) {
    const keys = Object.keys(r || {});
    if (!keys.length) return null;
    const nk = keys.map((k) => normKey(k));
    const byName = (list) => { for (let i = 0; i < nk.length; i++) { if (list.indexOf(nk[i]) > -1) return i; } return -1; };
    let ui = byName(['username', 'user', 'login', 'email', 'id', 'المستخدم', 'اسم_المستخدم', 'اسم_المستخدم']);
    let pi = byName(['password', 'pass', 'pwd', 'secret', 'الرمز', 'كلمة_المرور', 'كلمة_السر']);
    if (ui === -1) ui = 0;
    if (pi === -1) pi = keys.length > 1 ? 1 : -1;
    if (ui === pi || pi === -1) return null;
    const u = r[keys[ui]], p = r[keys[pi]];
    if (!String(u == null ? '' : u).trim() || !String(p == null ? '' : p).trim()) return null;
    return { u: normUser(u), p: String(p).trim(), role: String(r[nk.indexOf('role') > -1 ? keys[nk.indexOf('role')] : ''] || '').trim() };
  }

  function saveUsersLocal(list) { try { ls.set(USERS_LS_KEY, JSON.stringify({ ts: Date.now(), list: list })); } catch (e) {} }
  function loadUsersLocal() {
    try {
      const o = JSON.parse(ls.get(USERS_LS_KEY) || 'null');
      if (o && Array.isArray(o.list)) { usersCache = o.list; return o.list; }
    } catch (e) {}
    return null;
  }

  async function fetchAccounts(force) {
    const c = cfg();
    const ttl = Math.max(1, Number(c.USERS_TTL_MINUTES) || 60) * 60 * 1000;
    if (!force && usersCache) return usersCache;
    if (!force) {
      try {
        const o = JSON.parse(ls.get(USERS_LS_KEY) || 'null');
        if (o && Array.isArray(o.list) && (Date.now() - (o.ts || 0)) < ttl) { usersCache = o.list; return o.list; }
      } catch (e) {}
    }
    const name = c.USERS_SHEET_NAME || 'Accounts';
    let rows = [];
    try {
      rows = await window.__gateFetchSheet(name);         // دالة تحقن لاحقاً (تتخطى فحص القفل)
    } catch (err) {
      const alt = c.USERS_SHEET_NAME_ALT || '';
      if (!alt || alt === name) throw err;
      rows = await window.__gateFetchSheet(alt);          // تجربة الاسم البديل (عربي/إنجليزي)
    }
    const list = [];
    (rows || []).forEach((r) => { const pair = pickPair(r); if (pair) list.push(pair); });
    if (!list.length) throw new Error('EMPTY_ACCOUNTS');
    usersCache = list; saveUsersLocal(list);
    return list;
  }

  /* كلمة المرور لا تُرسَل إلى Apps Script إطلاقاً — نطلب التبويب مرة واحدة فقط */
  async function verifyAgainstSheet(user, pass) {
    let list;
    try { list = await fetchAccounts(false); }
    catch (e) {
      const fb = loadUsersLocal();
      if (!fb) { const ne = new Error('NO_ACCOUNTS_SOURCE'); ne.cause = e; throw ne; }
      list = fb;                                          // بدون إنترنت — استخدم آخر نسخة آمنة
    }
    const u = normUser(user), raw = String(pass || '').trim(), p = passHash(raw);
    const hit = list.find((x) => x.u === u && (passHash(x.p) === p || x.p === raw));
    if (hit) { currentRole = hit.role || ''; return true; }
    const knownUser = list.some((x) => x.u === u);
    throw Object.assign(new Error(knownUser ? 'WRONG_PASS' : 'UNKNOWN_USER'), { accounts: list.length });
  }

  function currentUserName() {
    try { const s = JSON.parse(ls.get(SESSION_KEY) || 'null'); return (s && s.name) || ''; } catch (e) { return ''; }
  }

  function expectedHashes() {
    const c = cfg(), out = [];
    if (c.PASSPHRASE) out.push({ hash: null, plain: String(c.PASSPHRASE), source: 'config' });
    const local = ls.get(LOCAL_KEY);
    if (local) out.push({ hash: local, plain: null, source: 'device' });
    return out;
  }

  async function check(input) {
    const val = String(input || '').trim();
    if (!val) return false;
    const list = expectedHashes();
    if (!list.length) return false;
    const h = await sha256(val);
    return list.some((x) => (x.hash ? x.hash === h : x.plain === val));
  }

  function markUnlocked(userName) {
    const c = cfg();
    const hrs = Math.max(1, Number(c.SESSION_HOURS || c.REMEMBER_HOURS) || 8);
    unlocked = true;
    ls.set(SESSION_KEY, JSON.stringify({ ts: Date.now(), exp: Date.now() + hrs * 3600 * 1000, name: userName || '' }));
    resetAttempts();
    hideGate();
    updateWhoChip();
    startIdleLock();
  }

  function updateWhoChip() {
    const el = document.getElementById('who-chip');
    if (!el) return;
    const nm = currentUserName();
    if (nm) {
      const role = currentRole ? ' · ' + currentRole : '';
      el.innerHTML = `<span class="who-avatar" aria-hidden="true">${esc(nm.slice(0, 1).toUpperCase())}</span><span class="who-name">${esc(nm)}</span>${role ? `<span class="who-role">${esc(role.replace(/^ · /, ''))}</span>` : ''}`;
      el.title = 'المستخدم الحالي' + (role ? ' · الصلاحية: ' + currentRole : '');
      el.classList.remove('hidden');
    } else { el.classList.add('hidden'); el.textContent = ''; }
  }

  function showGate(msg) {
    const ov = $('gate-overlay'); if (!ov) { return; }
    ov.classList.remove('hidden');
    document.body.classList.add('gated', 'no-scroll');
    const c = cfg();
    const modeName = (String(c.MODE || 'sheet').toLowerCase() === 'local') ? 'local' : 'sheet';
    const setup = $('gate-setup'), note = $('gate-note'), mode = $('gate-mode'), chip = $('gate-chip');
    const userF = $('gate-user'), passF = $('gate-pass');
    if (userF) userF.style.display = (modeName === 'sheet') ? '' : 'none';
    const uLabel = document.querySelector('label[for="gate-user"]');
    if (uLabel) uLabel.style.display = (modeName === 'sheet') ? '' : 'none';
    const needsLocalSetup = (modeName === 'local') && !ls.get(LOCAL_KEY);
    if (setup) setup.classList.toggle('hidden', !needsLocalSetup);
    if (note) note.textContent = needsLocalSetup
      ? 'لم يتم تعيين رمز بعد. اختر رمز دخول خاص بهذا الجهاز (٤ أحرف أو أكثر).'
      : (modeName === 'sheet'
        ? 'هذه اللوحة تحتوي على بيانات طلاب — الدخول مسموح لحسابات الكلية المعتمدة فقط.'
        : 'أدخل رمز الدخول للمتابعة.');
    if (mode) mode.textContent = modeName === 'sheet' ? 'التحقق عبر حسابات Google Sheet' : (c.PASSPHRASE ? 'رمز مشترك للوحة' : 'رمز محلي على هذا الجهاز');
    if (chip) chip.innerHTML = modeName === 'sheet'
      ? `<span class="chip-ico" aria-hidden="true">${iconSvg('lock')}</span>دخول بالحسابات المعتمدة`
      : `<span class="chip-ico" aria-hidden="true">${iconSvg('shield')}</span>منطقة آمنة`;
    try { const lu = ls.get('imtiaz_gate_last_user_v1'); if (lu && userF && !userF.value) userF.value = lu; } catch (e) {}
    const err = $('gate-err');
    if (err) { err.textContent = msg || ''; err.classList.toggle('hidden', !msg); }
    const inp = $('gate-pass'); if (inp) setTimeout(() => { try { inp.focus(); } catch (e) { /* ignore */ } }, 60);
  }

  function hideGate() {
    const ov = $('gate-overlay');
    if (ov) ov.classList.add('hidden');
    document.body.classList.remove('gated', 'no-scroll');
    const inp = $('gate-pass'); if (inp) inp.value = '';
    const inp2 = $('gate-pass2'); if (inp2) inp2.value = '';
  }

  function startIdleLock() {
    const mins = Number(cfg().AUTO_LOCK_MINUTES) || 0;
    if (idleTimer) clearTimeout(idleTimer);
    if (mins <= 0) return;
    const arm = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(lock, mins * 60 * 1000); };
    ['click', 'keydown', 'touchstart', 'scroll'].forEach((ev) => document.addEventListener(ev, arm, { passive: true }));
    arm();
  }

  async function lock() {
    unlocked = false; currentRole = '';
    ls.del(SESSION_KEY);
    usersCache = null;
    try { localStorage.removeItem(CACHE_DATA_KEY); } catch (e) {}                 // لا بيانات طلاب على الجهاز بعد القفل
    updateWhoChip();
    closeAllForLock();
    showGate('تم قفل اللوحة.');
    toast('تم قفل اللوحة وحذف البيانات المخزّنة');
  }

  function closeAllForLock() {
    try { window.Overlays && Overlays.closeAll(); } catch (e) { /* ignore */ }
    document.querySelectorAll('.modal-overlay,.profile-overlay,.search-overlay').forEach((n) => n.remove());
    document.body.classList.remove('no-scroll');
  }

  function clearDevicePass() { ls.del(LOCAL_KEY); ls.del(SESSION_KEY); unlocked = false; showGate('تم حذف الرمز المحلي — اختر رمزاً جديداً.'); }

  async function submit(userOrPass, pass, confirmPass) {
    const c = cfg();
    const modeName = (String(c.MODE || 'sheet').toLowerCase() === 'local') ? 'local' : 'sheet';
    let user = '', pwd = '';
    if (modeName === 'sheet') { user = String(userOrPass || '').trim(); pwd = String(pass === undefined ? confirmPass : pass || '').trim(); }
    else { pwd = String(confirmPass !== undefined && pass !== undefined ? pass : (userOrPass || '')).trim(); }

    /* لا نكتب كلمة المرور في localStorage إطلاقاً — اسم المستخدم فقط */
    const rememberUser = (u) => { try { if (u) ls.set('imtiaz_gate_last_user_v1', String(u).trim()); } catch (e) {} };

    const left = lockoutLeft();
    if (left > 0) { showGate(`محاولات كثيرة — انتظر ${left} ثانية ثم أعد المحاولة.`); return false; }

    if (modeName === 'sheet') {
      if (!user || !pwd) { showGate('أدخل اسم المستخدم وكلمة المرور معاً.'); return false; }
      // باب طوارئ اختياري من config
      if (c.PASSPHRASE && pwd === String(c.PASSPHRASE)) { rememberUser(user); markUnlocked(user); return true; }
      let diag = '';
      try {
        await verifyAgainstSheet(user, pwd);
        rememberUser(user); markUnlocked(user);
        toast('أهلاً بك' + (currentRole ? ' · ' + currentRole : ''));
        return true;
      } catch (e) {
        const m = (e && e.message) || '';
        if (m === 'EMPTY_ACCOUNTS') diag = 'تبويب الحسابات فارغ أو أعمدته غير مفهومة — الصف يجب أن يكون: العمود الأول اسم مستخدم، الثاني كلمة مرور.';
        else if (m === 'UNKNOWN_USER') diag = 'اسم المستخدم غير موجود في قائمة الحسابات. المحاولات المتبقية: ';
        else if (m === 'WRONG_PASS') diag = 'كلمة المرور غير صحيحة لهذا الحساب. المحاولات المتبقية: ';
        else if (m === 'NO_ACCOUNTS_SOURCE') diag = (navigator.onLine === false)
          ? 'لا يوجد اتصال بالإنترنت ولا نسخة محفوظة من الحسابات على هذا الجهاز.'
          : `تعذّر قراءة تبويب الحسابات «${c.USERS_SHEET_NAME || 'Accounts'}». تأكد من الاسم ومن أن الـ API يعمل.`;
        else diag = 'تعذّر التحقق من الحسابات الآن. تحقّق من الاتصال أو اسم التبويب في config.js.';
        if (m === 'UNKNOWN_USER' || m === 'WRONG_PASS') {
          const a = bumpAttempts();
          const remain = Math.max(0, c.MAX_ATTEMPTS - (a.n || 0));
          showGate(a.until ? `تم إيقاف المحاولات مؤقتاً لمدة ${c.LOCKOUT_SECONDS} ثانية.` : diag + remain + '.');
          return false;
        }
        showGate(diag); return false;
      }
    }

    // ── الوضع المحلي (بدون جدول) ──
    if (pwd.length < 4) { showGate('الرمز قصير جداً — استخدم ٤ أحرف على الأقل.'); return false; }
    if (!c.PASSPHRASE && !ls.get(LOCAL_KEY)) {
      if (confirmPass !== undefined && confirmPass !== pwd) { showGate('الرمزان غير متطابقين.'); return false; }
      ls.set(LOCAL_KEY, await sha256(pwd));
      markUnlocked('');
      toast('تم ضبط الرمز — احتفظ به، لا يمكن استعادته');
      return true;
    }
    if (await check(pwd)) { markUnlocked(''); return true; }
    const a2 = bumpAttempts();
    const remain2 = Math.max(0, c.MAX_ATTEMPTS - (a2.n || 0));
    showGate(a2.until ? `تم إيقاف المحاولات مؤقتاً لمدة ${c.LOCKOUT_SECONDS} ثانية.` : 'رمز غير صحيح. المحاولات المتبقية: ' + remain2 + '.');
    return false;
  }

  function bindUI(onPass) {
    const form = $('gate-form');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      setBusy(true);
      const u = $('gate-user') ? $('gate-user').value : '';
      const p = $('gate-pass') ? $('gate-pass').value : '';
      Promise.resolve(onPass(u, p)).then(() => setBusy(false)).catch(() => setBusy(false));
    });
    const setupBtn = document.querySelector('[data-action="gate-set-pass"]');
    if (setupBtn) setupBtn.addEventListener('click', () => onPass('', $('gate-pass') ? $('gate-pass').value : '', $('gate-pass2') ? $('gate-pass2').value : ''));

    // تنبيه Caps Lock + عدّاد الحسابات في تذييل البوابة
    const pass = $('gate-pass'), caps = $('gate-caps');
    if (pass && caps) {
      const chk = (e) => { try { if (e.getModifierState) caps.classList.toggle('hidden', !e.getModifierState('CapsLock')); } catch (err) {} };
      pass.addEventListener('keyup', chk); pass.addEventListener('keydown', chk);
      pass.addEventListener('blur', () => caps.classList.add('hidden'));
    }
    updateAccountsHint();
  }

  function setBusy(on) {
    const b = $('gate-submit'); if (!b) return;
    const spin = b.querySelector('.gate-spin'), txt = b.querySelector('.gate-submit-txt');
    b.disabled = !!on; b.classList.toggle('busy', !!on);
    if (spin) spin.classList.toggle('hidden', !on);
    if (txt) txt.textContent = on ? 'جارٍ التحقق…' : 'دخول آمن';
  }

  /* سطر صغير يطمئن المستخدم: كم حساباً معروفاً في الجدول (بدون كشف أي أسماء/كلمات مرور) */
  function updateAccountsHint() {
    const el = $('gate-accounts'); if (!el) return;
    const c = cfg();
    if (String(c.MODE || 'sheet').toLowerCase() === 'local') { el.classList.add('hidden'); return; }
    let n = 0, ts = 0;
    try { const o = JSON.parse(ls.get(USERS_LS_KEY) || 'null'); if (o && Array.isArray(o.list)) { n = o.list.length; ts = o.ts || 0; } } catch (e) {}
    if (!n) { el.classList.add('hidden'); return; }
    const mins = ts ? Math.max(0, Math.round((Date.now() - ts) / 60000)) : null;
    el.textContent = `قائمة الحسابات متاحة على هذا الجهاز (${n} حساباً${mins !== null ? ' · آخر قراءة قبل ' + mins + ' دقيقة' : ''})`;
    el.classList.remove('hidden');
  }

  /* نجاح/فشل التحقق → إعادة ضبط زر «دخول آمن» وتحديث سطر الحسابات */
  function afterSubmit(ok) {
    setBusy(false);
    updateAccountsHint();
    return ok;
  }

  function init(onPass) {
    const c = cfg();
    if (!c.ENABLED) { unlocked = true; return true; }
    if (sessionValid()) { unlocked = true; hideGate(); startIdleLock(); return true; }
    showGate('');
    bindUI(onPass);
    return false;
  }

  return {
    init, submit, lock, showGate, hideGate, clearDevicePass, afterSubmit,
    isUnlocked: () => unlocked,
    userName: currentUserName,
    role: () => currentRole,
    whoChip: updateWhoChip,
    reloadAccounts: () => fetchAccounts(true).then(() => { updateAccountsHint(); return true; }).catch(() => false),
    hasConfiguredPass: () => !!cfg().PASSPHRASE || !!ls.get(LOCAL_KEY),
    gateCfg: cfg
  };
})();

/* ───────────────────────── 1) أدوات عامة ───────────────────────── */

// تهريب HTML (أسماء الطلاب فيها أحياناً علامات ' و " كانت تكسر الأزرار القديمة)
window.esc = function (v) {
  return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};

// يبني خصائص عنصر قابل للضغط: data-action + data-* (بدون onclick داخل النصوص)
window.act = function (action, data) {
  let s = ` data-action="${esc(action)}" role="button" tabindex="0"`;
  Object.keys(data || {}).forEach((k) => {
    if (data[k] !== undefined && data[k] !== null) s += ` data-${k}="${esc(data[k])}"`;
  });
  return s;
};

// تطبيع النص العربي للبحث (أ إ آ → ا ، ى → ي ، ة → ه ، حذف التشكيل)
window.normAr = function (v) {
  return String(v === null || v === undefined ? '' : v)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim();
};

window.toast = function (msg, ms) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window._toastT);
  window._toastT = setTimeout(() => el.classList.remove('show'), ms || 2600);
};

window.copyText = function (text, okMsg) {
  const done = () => toast(okMsg || 'تم النسخ');
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;opacity:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done();
    } catch (e) { toast('تعذّر النسخ'); }
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done).catch(fallback);
  else fallback();
};

/* ───────────────────────── 2) التواريخ (بتوقيت القاهرة) ───────────────────────── */
// السبب الجذري لمشكلة "كل الجروبات قادم": Apps Script يرسل التاريخ كـ UTC
// (3 نوفمبر القاهرة = 2026-11-02T22:00:00Z) والكود القديم كان يقص الجزء "T…" فيرجع يوماً للخلف.

function tzParts(d) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: CFG().TIMEZONE || 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const o = {}; parts.forEach((p) => { o[p.type] = p.value; });
  return o;
}
function dateInTZ(d) { const p = tzParts(d); return `${p.year}-${p.month}-${p.day}`; }

window.formatDate = function (v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return isNaN(v) ? '' : dateInTZ(v);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(s)) {       // لحظة زمنية مطلقة → تاريخ القاهرة
    const d = new Date(s); if (!isNaN(d)) return dateInTZ(d);
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) return s.slice(0, 10);            // تاريخ/وقت محلي بدون منطقة
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);                    // d/m/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
};

window.getTodayStr = function () { return dateInTZ(new Date()); };

window.computeStatus = function (startDate, endDate) {
  const s = formatDate(startDate), e = formatDate(endDate);
  if (!s || !e) return 'upcoming';
  const today = getTodayStr();
  if (today > e) return 'finished';
  if (today >= s) return 'current';
  return 'upcoming';
};

window.computeAge = function (birth) {
  const b = formatDate(birth).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!b) return 'غير محدد';
  const t = getTodayStr().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let age = +t[1] - +b[1];
  if (+t[2] < +b[2] || (+t[2] === +b[2] && +t[3] < +b[3])) age--;
  return age > 0 && age < 100 ? `${age} سنة` : 'غير محدد';
};

window.daysUntil = function (dateStr) {
  const a = Date.parse(getTodayStr() + 'T00:00:00Z'), b = Date.parse(formatDate(dateStr) + 'T00:00:00Z');
  return isNaN(a) || isNaN(b) ? null : Math.round((b - a) / 86400000);
};

window.getRoundDates = function (order) {
  const o = String(order).trim();
  let row = (DB.roundDates || []).find((r) => String(r.round_order).trim() === o && r.start_date);
  if (!row && DB.roundSchedule && DB.roundSchedule.length) {            // احتياطي: جدول الجروبات نفسه يحتوي التواريخ
    const sch = DB.roundSchedule.find((r) => String(r.round_order).trim() === o && r.start_date);
    if (sch) row = { start_date: sch.start_date, end_date: sch.end_date };
  }
  if (row) return { start: formatDate(row.start_date), end: formatDate(row.end_date) };
  const ov = (DB.roundsOverview || []).find((r) => String(r.round_order).trim() === o && r.start_date);
  if (ov) return { start: formatDate(ov.start_date), end: formatDate(ov.end_date) };
  const d = (CFG().DEFAULT_ROUND_DATES || {})[o];
  return d ? { start: d.start, end: d.end } : { start: '', end: '' };
};

/* ═══ البند 4 — نموذج تدوير «خيل / معامل / سمك» نصف الشهري ═══
   يقرأ حقول الشيت حرفياً: عمود البداية الفرعية لكل طالب/جروب (sub_unit_start /
   sub_round_start / unit_start / rotation_start / sub_unit …) وعمود ترتيب التدوير
   (rotation_order / sub_rotation / rotation_seq …) بصيغه: "معامل > خيل > سمك" أو
   "equine_lab_fish" أو "يبدأ معامل". البلوكات أسبوعان متتالية من بداية الراوند الذي
   ينتمي إليه القسم (getRoundDates — نفس مصدر تواريخ اللوحة). لا يوجد أي تسلسل ثابت
   في الكود: الترتيب يُشتق دائماً من الشيت، وأي قيمة غير مفهومة تُعرض كما هي. */
const SUBUNIT_NAMES = { horse: 'خيل', equine: 'خيل', lab: 'معامل', labs: 'معامل', fish: 'سمك' };
function subunitToken(t) {
  const s = normAr(String(t || '')).replace(/[_\-.]+/g, ' ').trim();
  if (!s) return '';
  if (/(?:^|\s)(xail|xayl|khail|horse|equine)(?:\s|$)/.test(s)) return 'horse';
  if (/(?:^|\s)(maamel|maaml|malam|lab|labs|labor|laboratories)(?:\s|$)/.test(s)) return 'lab';
  if (/(?:^|\s)(samak|semak|fish)(?:\s|$)/.test(s)) return 'fish';
  return '';
}
/* عمود «الوحدة الفرعية/البداية» في الشيت — يُقرأ بأي رأس من الرؤوس المعروفة */
window.subStartOf = function (row) {
  if (!row) return '';
  const keys = ['sub_unit_start', 'sub_round_start', 'unit_start', 'rotation_start', 'sub_unit', 'substation_start', 'start_sub_unit'];
  for (let i = 0; i < keys.length; i++) { const v = String(row[keys[i]] || '').trim(); if (v) return v; }
  return '';
};
window.rotationOrderOf = function (row) {
  if (!row) return '';
  const keys = ['rotation_order', 'sub_rotation', 'rotation_seq', 'rotation_sequence', 'sub_units_order'];
  for (let i = 0; i < keys.length; i++) { const v = String(row[keys[i]] || '').trim(); if (v) return v; }
  return '';
};
window.parseSubRotation = function (raw, startRaw) {
  const seq = [];
  const pushTok = (tok) => { if (tok && seq.indexOf(tok) === -1) seq.push(tok); };
  String(raw || '').split(/[>→↔\/|،,]+/).forEach((part) => {
    const p = part.trim();
    if (!p) return;
    // القيمة المركبة «equine_lab_fish» تعني تسلسل القسم الكامل كما في الشيت: خيل ثم معامل ثم سمك
    if (/^(equine_?labs?|horse_?lab_?fish|labs?_?equine|equine_lab_fish)$/i.test(p.replace(/\s+/g, '_'))) { ['horse', 'lab', 'fish'].forEach(pushTok); return; }
    const m = p.match(/^\d+\s*[\-–.)]\s*(.+)$/);        // "1 - معمل" ← رقم الترتيب ثم الاسم
    pushTok(subunitToken(m ? m[1] : p));
  });
  const st = subunitToken(startRaw);
  if (!seq.length && st) ['horse', 'lab', 'fish'].forEach(pushTok);   // الشيت حدد البداية فقط → التسلسل الطبيعي للقسم
  if (!seq.length) return null;
  const startIdx = st ? Math.max(0, seq.indexOf(st)) : 0;
  return { sequence: seq, start: seq[startIdx], startIdx };
};
window.subUnitBlocksForOrder = function (order) {
  const d = getRoundDates(order);
  if (!d.start || !d.end) return null;
  const DAY = 86400000;
  const t0 = Date.parse(d.start + 'T00:00:00Z'), t1 = Date.parse(d.end + 'T00:00:00Z');
  if (isNaN(t0) || isNaN(t1) || t1 < t0) return null;
  const blocks = [];
  for (let ws = t0; ws <= t1; ws += 14 * DAY) {
    const we = Math.min(ws + 13 * DAY, t1);
    blocks.push({ start: dateInTZ(new Date(ws)), end: dateInTZ(new Date(we)), idx: blocks.length });
  }
  return blocks.length ? { start: d.start, end: d.end, blocks } : null;
};
window.subUnitAtDate = function (rot, order, dateStr) {
  if (!rot) return null;
  const info = subUnitBlocksForOrder(order);
  if (!info) return null;
  const seq = rot.sequence, L = seq.length;
  const off = ((rot.startIdx || 0) % L + L) % L;       // نقطة انطلاق الشيت (مثلاً "يبدأ معامل")
  const day = Date.parse(dateStr + 'T00:00:00Z');
  let bi = -1;
  info.blocks.forEach((b, i) => {
    const bs = Date.parse(b.start + 'T00:00:00Z'), be = Date.parse(b.end + 'T00:00:00Z');
    if (day >= bs && day <= be) bi = i;
  });
  if (bi < 0) {
    const b0 = Date.parse(info.start + 'T00:00:00Z');
    if (isNaN(day) || isNaN(b0)) return null;
    bi = Math.max(0, Math.floor((day - b0) / (14 * 86400000)));
  }
  const key = seq[(off + bi) % L];
  return { key, label: SUBUNIT_NAMES[key] || key, block: info.blocks[Math.min(bi, info.blocks.length - 1)] || null, blockNo: bi + 1, totalBlocks: info.blocks.length };
};
window.studentSubUnitNow = function (student) {
  if (!student) return null;
  const rot = parseSubRotation(rotationOrderOf(student), subStartOf(student));
  if (!rot) return null;
  const gid = String(student.group_id || '').trim();
  const sched = (DB.roundSchedule || []).filter((r) => String(r.group_id) === gid);
  const today = getTodayStr();
  let row = sched.find((r) => { const s = formatDate(r.start_date), e = formatDate(r.end_date); return s && e && today >= s && today <= e; }) || sched[sched.length - 1];
  if (!row) return null;
  const at = subUnitAtDate(rot, row.round_order, today);
  return at ? Object.assign({}, at, { round_order: row.round_order, sequence: rot.sequence }) : null;
};
window.subUnitSeqLabel = function (seq) { return (seq || []).map((k) => SUBUNIT_NAMES[k] || k).join(' › '); };

/* خريطة الجروبات داخل قسم «خيل ومعامل وسمك»: بداية التدوير تُقرأ من كشف الطلاب
   (أي صف في القسم يحمل sub_unit_start/rotation_order لجروبه)، أو من جدول الجروبات.
   بدون أي قيم ثابتة في الكود — المصدر دائماً الشيت. */
window.getEquineGroupRot = function (gid) {
  DB = DB || {};
  const key = String(gid == null ? '' : gid).trim();
  if (!key) return null;
  if (!window._eqRotMap) {
    const map = {};
    (DB.students || []).forEach((s) => {
      const g = String(s.group_id || '').trim(); if (!g || map[g]) return;
      const rot = parseSubRotation(rotationOrderOf(s), subStartOf(s));
      if (rot) map[g] = rot;
    });
    (DB.groups || []).forEach((gr) => {
      const g = String(gr.group_id || '').trim(); if (!g || map[g]) return;
      const rot = parseSubRotation(rotationOrderOf(gr), subStartOf(gr));
      if (rot) map[g] = rot;
    });
    window._eqRotMap = map;
  }
  return window._eqRotMap[key] || null;
};
/* الوحدة الفرعية لجروب في تاريخ معين داخل راوند معيّن */
window.groupSubUnitAt = function (gid, order, dateStr) {
  const rot = getEquineGroupRot(gid);
  if (!rot) return null;
  return subUnitAtDate(rot, order, dateStr || getTodayStr());
};

/* ═══ البند 2(ج) + البند 5 — مصدر واحد لتسجيلات الوحدات لا يُصفَّر أبداً ═══
   السبب الجذري للتصفير: كان الفلتر يعتمد على round_key المطابق حرفياً لـ 'units'؛
   أي تغيير في عمود الراوند بالشيت (رأس جديد/قيمة مختلفة) يجعل كل الأعداد 0 رغم وجود
   البيانات. الآن: (1) التعرف على صف «تسجيل وحدة» بعدة علامات متساكنة،
   (2) مطابقة اسم الوحدة برؤوس بديلة (unit/station/unit_name/name)،
   (3) حارس ضد التصفير: إذا صار المجموع من الصفر بينما شيت الوحدات يقول إن هناك
   مسجلين، تُستخدم أرقام الشيت (enrolled/registered) ولا تظهر الأصفار مكان بيانات موجودة. */
window.unitRowName = function (row) {
  if (!row) return '';
  const keys = ['unit_name', 'unit', 'station', 'station_name', 'vet_unit', 'name'];
  for (let i = 0; i < keys.length; i++) { const v = String(row[keys[i]] || '').trim(); if (v) return v; }
  return '';
};
window.isUnitRegRow = function (row) {
  if (!row) return false;
  const rk = normRoundKey(row.round_key || '');
  if (rk === 'units') return true;
  const ro = String(row.round_order || '').trim();
  const hasUnit = !!unitRowName(row);
  if (hasUnit && (!ro || ro === '1')) return true;            // ورقتنا التاريخية: تسجيلات الوحدات = راوند 1 بلا round_key مفهوم
  return false;
};
window.getUnitAssignments = function () {
  const fp = (typeof _lastFp !== 'undefined' && _lastFp) || ((DB.students || []).length + ':' + (DB.assignments || []).length);
  if (window._unitRegsCache && window._unitRegsCache.fp === fp) return window._unitRegsCache.rows;
  let rows = (DB.assignments || []).filter(isUnitRegRow).map((r) => Object.assign({}, r, { unit_name: unitRowName(r) }));
  // الحارس: كشف صامت فارغ بينما شيت الوحدات نفسه يعلن تسجيلات → نبني الكشف من أرقام الشيت بدل عرض 0
  const sheetSum = (DB.stationsUnits || []).reduce((a, u) => a + (parseInt(u.registered !== undefined && u.registered !== '' ? u.registered : u.enrolled, 10) || 0), 0);
  if (!rows.length && sheetSum > 0) {
    const byGid = {};
    (DB.students || []).forEach((s) => { const g = String(s.group_id || '').trim(); if (g) (byGid[g] = byGid[g] || []).push(s); });
    (DB.stationsUnits || []).forEach((u) => {
      const reg = parseInt(u.registered !== undefined && u.registered !== '' ? u.registered : u.enrolled, 10) || 0;
      const gid = cleanGroupId(u.group_id || u.group || '');
      const pool = byGid[gid] || [];
      for (let i = 0; i < Math.min(reg, pool.length); i++) {
        rows.push({ group_id: gid, code_short: pool[i].code_short, full_name: pool[i].full_name, gender: pool[i].gender, unit_name: unitRowName(u) || String(u.unit_name || '').trim(), _fromSheet: true });
      }
    });
  }
  window._unitRegsCache = { fp, rows };
  return rows;
};

/* ───────────────────────── 3) قيم ومسميات ───────────────────────── */

window.cleanGroupId = function (val) {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (!str) return '';
  const num = parseFloat(str);
  return isNaN(num) ? str : String(Math.round(num));
};

window.normGender = function (g) {
  const s = String(g || '').trim().toUpperCase();
  if (s === 'F' || s === 'أنثى' || s === 'انثى' || s.startsWith('FEM')) return 'F';
  if (s === 'M' || s === 'ذكر' || s.startsWith('MAL')) return 'M';
  return '';
};

window.formatPhone = function (phone) {
  let p = String(phone === null || phone === undefined ? '' : phone).trim();
  if (/^\d+\.0+$/.test(p)) p = p.replace(/\.0+$/, '');
  p = p.replace(/\D/g, '');
  if (!p) return '';
  if (p.startsWith('0020')) p = p.slice(4);
  if (p.startsWith('20') && p.length === 12) p = p.slice(2);
  if (p.length === 10 && p.startsWith('1')) p = '0' + p;     // الصفر الأول يضيع في Google Sheets
  return p;
};
window.waLink = function (phone) {
  const p = formatPhone(phone);
  return p ? 'https://wa.me/' + (p.startsWith('0') ? '20' + p.slice(1) : p) : '';
};

window.getInitials = function (name) {
  if (!name) return '؟';
  const parts = String(name).trim().split(/\s+/);
  return parts.length === 1 ? parts[0].substring(0, 2) : parts[0].substring(0, 1) + parts[1].substring(0, 1);
};

/* خريطة aliases — احتياطية فقط إن غيّرت أسماء المفاتيح في جدول Google.
   الأسماء العربية المعروضة تُقرأ من تبويب 03_rounds_overview أولاً،
   ثم من مفاتيح config.js ROUND_ALIASES — والكود هنا لا يحتاج أي تعديل. */
const ROUND_ALIAS_FALLBACK = {
  veterinary_units: 'units', vet_units: 'units', units: 'units', round1_units: 'units',
  departments: 'college', college_depts: 'college', college: 'college', round4_college: 'college',
  poultry: 'poultry', poultry_round: 'poultry', round5_poultry: 'poultry',
  slaughterhouse: 'slaughter', food_safety: 'slaughter', slaughter_food: 'slaughter', slaughter: 'slaughter', round3_slaughter: 'slaughter',
  equine_labs: 'equine_lab_fish', horse_lab_fish: 'equine_lab_fish', labs_equine: 'equine_lab_fish', equine_lab_fish: 'equine_lab_fish',
  elective: 'elective', elective_training: 'elective', round6_elective: 'elective'
};
window.normRoundKey = function (key) {
  const raw = String(key === null || key === undefined ? '' : key).trim();
  if (!raw) return '';
  const alias = (CFG().ROUND_ALIASES || {});
  if (alias[raw]) return normRoundKey(alias[raw]);                    // مخصص من config أولاً (ثم تكرار آمن)
  if (ROUND_ALIAS_FALLBACK[raw]) return ROUND_ALIAS_FALLBACK[raw];
  const s = raw.toLowerCase().replace(/[\s\-]+/g, '_').replace(/[^\w]/g, '');
  if (/^(round|rwand|دورة|راوند)[_]?/.test(s)) {                      // "round2_x" → "x"
    const rest = s.replace(/^(round|rwand)[_]?[0-9]*[_]?/, '');
    if (rest && ROUND_ALIAS_FALLBACK[rest]) return ROUND_ALIAS_FALLBACK[rest];
  }
     if (/^(r|rwand)[_]?(1|2)$/.test(s)) return s === 'r2' || s === 'r_2' ? 'units' : 'college';   // R1/R2 كما في الشيت
  if (/^r[_]?3$/.test(s)) return 'poultry';
  if (/^r[_]?4$/.test(s)) return 'slaughter';
  if (/unit|وحدة|وحدات/.test(s)) return 'units';
  if (/poultry|دواجن|دجاج/.test(s)) return 'poultry';
  if (/slaughter|food|مجزر|مجازر|غذاء/.test(s)) return 'slaughter';
  if (/equine|horse|lab|fish|خيل|معامل|سمك/.test(s)) return 'equine_lab_fish';
  if (/college|depart|قسم|اقسام|كلية/.test(s)) return 'college';
  if (/elective|اختياري/.test(s)) return 'elective';
  return raw;                                                          // مجال جديد — يُعرض باسمه العربي من الجدول كما هو
};

/* ── مصادر التواريخ (03_rounds_overview · 09_round_dates · config) مفهرسة برقم الدورة ──
   تُبنى داخل buildDB — وتُستخدم لحل رقم الدورة عندما يكون عمود round_order فارغاً أو نصياً. */
window.__roundDateInfo = {};

/* حسم رقم الدورة لأي صف schedule/assignments/unregistered — بلا اعتماد على مسمى المفتاح:
   1) round_order إن كان رقمة مفهوماً  2) اسم الراوند العربي (تاني/ثالث …)  3) مفتاح راوند معروف
   4) تطابق تام مع مصدر تواريخ (اسم/مفتاح)  — وإلا '' (غير محدد). */
window.resolveRoundOrder = function (row) {
  const o = normRoundOrder(row && row.round_order);
  if (o) return o;
  const name = normAr(String((row && row.round_name_ar) || ''));
  if (name) {
    const nm = name.match(/(?:راوند|دورة|round)\s*([0-9]+)/);
    if (nm) return String(+nm[1]);
    const words = { 'الاولى': '1', 'الثانية': '2', 'الثالثة': '3', 'الرابعة': '4', 'الخامسة': '5', 'السادسة': '6' };
    for (const k in words) { if (name.indexOf(k) > -1) return words[k]; }
  }
  const rk = normRoundKey(String((row && row.round_key) || ''));
  if (rk && ROUND_META[rk]) {
    const idx = ROUND_ORDER.indexOf(rk);
    if (rk === 'elective') return '0';
    if (idx > -1 && idx < 6) return String(idx + 1);                  // units→1 · equine→2 · poultry→3 · slaughter→4 · college→5
  }
  const info = window.__roundDateInfo || {};
  for (const ord in info) {
    const it = info[ord] || {};
    if ((it.name && name && it.name === name) || (it.key && rk && it.key === rk)) return String(ord);
  }
  return '';
};

/* تطبيع رقم الدورة: "R2" · "2" · "round 2" · "الدورة الثانية" → '2' (أو '0' للاختياري) */
window.normRoundOrder = function (v) {
  const s = normAr(String(v === null || v === undefined ? '' : v));
  if (!s) return '';
  const m = s.match(/(?:r(?:ound)?|دورة|راوند|rwand)\s*([0-9٠-٩]+)/);
  if (m) return String(+m[1].replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const d = s.match(/^([0-9٠-٩]+)/);
  if (d) return String(+d[1].replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)));
  const words = { 'الاولى': '1', 'الثانية': '2', 'الثالثة': '3', 'الرابعة': '4', 'الخامسة': '5', 'السادسة': '6' };
  for (const k in words) { if (s.indexOf(k) > -1) return words[k]; }
  return '';
};

window.ROUND_META = {
  units:           { icon: 'hospital',   svg: true, label: 'وحدات بيطرية',       cls: 'badge-round-units', tone: 'tone-teal' },
  college:         { icon: 'landmark',   svg: true, label: 'أقسام الكلية',       cls: 'badge-round-college', tone: 'tone-rust' },
  poultry:         { icon: 'chicken',    svg: true, label: 'دواجن',              cls: 'badge-round-poultry', tone: 'tone-green' },
  slaughter:       { icon: 'meat',       svg: true, label: 'مجازر وسلامة غذاء', cls: 'badge-round-slaughter', tone: 'tone-mustard' },
  equine_lab_fish: { icon: 'microscope', svg: true, label: 'خيل ومعامل وسمك',    cls: 'badge-round-equine', tone: 'tone-navy' },
  elective:        { icon: 'star',       svg: true, label: 'تدريب اختياري',      cls: 'badge-round-elective', tone: 'tone-olive' }
};
// إرجاع أيقونة SVG موحّدة لراوند (مع fallback للرموز القديمة إن وُجدت)
window.roundIcon = function (rKey, chip) {
  const meta = (window.ROUND_META && ROUND_META[rKey]) || null;
  const name = meta ? meta.icon : 'pin';
  if (chip) return `<span class="ico-chip ${meta && meta.tone ? meta.tone : 'tone-gold'}" aria-hidden="true">${iconSvg(name)}</span>`;
  return iconSvg(name);
};
window.ROUND_ORDER = ['units', 'equine_lab_fish', 'poultry', 'slaughter', 'college', 'elective', 'unknown'];

window.roundLabel = function (key) {
  const k = normRoundKey(key);
  return (DB.roundNames && (DB.roundNames[k] || DB.roundNames[key])) || (ROUND_META[k] && ROUND_META[k].label) || String(key || '').trim() || 'غير محدد';
};

window.statusBadge = function (status) {
  const map = { current: ['badge-plum', 'جارٍ الآن'], upcoming: ['badge-grey', 'قادم'], finished: ['badge-emerald', 'انتهى'] };
  const m = map[status] || ['badge-grey', status || 'غير محدد'];
  return `<span class="badge ${m[0]}">${m[1]}</span>`;
};

window.animateCountUp = function (el, target, duration) {
  if (!el) return;
  target = Number(target) || 0;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = target; return; }
  const start = performance.now(); duration = duration || 600;
  (function step(now) {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step); else el.textContent = target;
  })(start);
};

/* ───────────────────────── 4) طبقة البيانات (API + كاش) ───────────────────────── */

const SHEETS = {
  students: '01_students', groups: '02_groups', roundsOverview: '03_rounds_overview', roundSchedule: '04_round_schedule',
  stationsUnits: '05_stations_units_draft', assignments: '06_assignments_round2', unregistered: '07_unregistered_round2',
  round2Summary: '08_round2_summary', roundDates: '09_round_dates', fields: '10_fields',
  issues: '00_data_issues', issuesR2: '00_data_issues_round2'
};
const REQUIRED = ['students', 'groups', 'roundSchedule', 'assignments', 'unregistered', 'round2Summary', 'stationsUnits', 'fields'];
const CACHE_KEY = 'imtiaz_data_cache_v2';

function normKey(k) { return String(k === null || k === undefined ? '' : k).replace(/^\uFEFF/, '').trim(); }
function normCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v).replace(/^\uFEFF/, '').trim();
  if (/^-?\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');      // 6.0 → 6
  return s;
}
function toRows(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    if (raw.length && Array.isArray(raw[0])) {                  // [[header...],[row...]]
      const head = raw[0].map(normKey);
      return raw.slice(1).map((r) => { const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; });
    }
    return raw.filter((r) => r && typeof r === 'object' && !Array.isArray(r));
  }
  if (typeof raw === 'object') {
    if (raw.error) throw new Error(String(raw.error));
    const k = ['data', 'rows', 'values', 'result'].find((x) => Array.isArray(raw[x]));
    if (k) return toRows(raw[k]);
  }
  return [];
}
function normalizeRows(raw) {
  return toRows(raw)
    .map((r) => { const o = {}; Object.keys(r).forEach((k) => { o[normKey(k)] = normCell(r[k]); }); return o; })
    .filter((o) => Object.keys(o).some((k) => o[k] !== ''));    // يحذف الصفوف الفارغة (شائعة في Google Sheets)
}

function parseCSV(text) {                                       // احتياطي للتجربة المحلية فقط
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] || '') !== '');
}

async function fetchSheetRaw(name) {                                  // بدون فحص القفل — يُستخدم لبوابة الحسابات
  const base = CFG().API_URL;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CFG().REQUEST_TIMEOUT_MS || 30000);
  try {
    if (!base) {
      const res = await fetch('./data/' + name + '.csv', { signal: ctl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return normalizeRows(parseCSV(await res.text()));
    }
    let url = base + (base.indexOf('?') > -1 ? '&' : '?') + 'sheet=' + encodeURIComponent(name);
    const tk = (CFG().GATE && CFG().GATE.API_TOKEN) || '';
    if (tk) url += '&key=' + encodeURIComponent(tk);   // مفتاح Apps Script إن كان مفعّلاً
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', cache: 'no-store' });   // بدون headers مخصصة = بدون preflight
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { throw new Error('الرد ليس JSON (تأكد أن Apps Script منشور لـ "Anyone")'); }
    return normalizeRows(json);
  } finally { clearTimeout(timer); }
}

window.__gateFetchSheet = fetchSheetRaw;                                // حقن دالة التحقق في البوابة

async function fetchSheet(name) {
  if (!Gate.isUnlocked()) throw new Error('LOCKED');                    // لا طلب بيانات قبل الدخول
  return fetchSheetRaw(name);
}

async function fetchSheetRetry(name) {
  try { return await fetchSheet(name); }
  catch (e1) { await new Promise((r) => setTimeout(r, 800)); return fetchSheet(name); }
}

async function fetchAllSheets() {
  const keys = Object.keys(SHEETS);
  const settled = await Promise.allSettled(keys.map((k) => fetchSheetRetry(SHEETS[k])));
  const sheets = {}, errors = {};
  settled.forEach((r, i) => { if (r.status === 'fulfilled') sheets[keys[i]] = r.value; else errors[keys[i]] = (r.reason && r.reason.message) || 'فشل'; });
  return { sheets, errors };
}

function readCache() {
  if (!CFG().OFFLINE_CACHE) return null;
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return c && c.sheets ? c : null; } catch (e) { return null; }
}
function writeCache(sheets) {
  if (!CFG().OFFLINE_CACHE) return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), sheets })); } catch (e) { /* الذاكرة ممتلئة — لا مشكلة */ }
}
function hasRequired(sheets) { return REQUIRED.every((k) => Array.isArray(sheets[k])); }

function buildDB(S) {
  const g = (k) => S[k] || [];
  // تطبيع مفاتيح الحقول: مسافات/ZWSP/BOM/Case — حتى لا تنكسر اللوحة عند تعديل رأس العمود في الجدول
  const canonCols = {};
  (g('fields') || []).forEach((f) => {
    const col = normKey(f.column); if (!col) return;
    const c = col.toLowerCase().replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/\s+/g, '_');
    if (!canonCols[c]) canonCols[c] = col;
  });
  const fixRow = (r) => {
    const o = Object.assign({}, r);
    Object.keys(o).forEach((k) => {
      const c = normKey(k).toLowerCase().replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/\s+/g, '_');
      if (canonCols[c] && canonCols[c] !== k) { if (o[canonCols[c]] === undefined) o[canonCols[c]] = o[k]; delete o[k]; }
    });
    return o;
  };
  // قوام الجروب من كشف الطلاب نفسه (أدق من عمود إجمالي قد يكون قديماً في جدول الجروبات)
  const rosterCount = {};
  g('students').map(fixRow).forEach((r) => { const gid = cleanGroupId(r.group_id); if (gid) rosterCount[gid] = (rosterCount[gid] || 0) + 1; });

  DB.students = g('students').map((r) => { r = fixRow(r); return { ...r, group_id: cleanGroupId(r.group_id), gender: normGender(r.gender) }; });
  DB.groups = g('groups').map((r) => {
    r = fixRow(r);
    const gid = cleanGroupId(r.group_id);
    const declared = parseInt(r.total_students, 10) || 0;
    const actual = rosterCount[gid] || 0;
    return { ...r, group_id: gid, total_students: String(actual > 0 ? actual : declared), _declared_total: String(declared) };
  }).sort((a, b) => (+a.group_id || 0) - (+b.group_id || 0));
  DB.roundsOverview = g('roundsOverview').map(fixRow);
  DB.roundSchedule = g('roundSchedule').map((r) => { r = fixRow(r); return { ...r, round_key: normRoundKey(r.round_key), group_id: cleanGroupId(r.group_id) }; });
  DB.stationsUnits = g('stationsUnits').map(fixRow);
  DB.assignments = g('assignments').map((r) => { r = fixRow(r); return { ...r, round_key: normRoundKey(r.round_key), group_id: cleanGroupId(r.group_id), gender: normGender(r.gender) }; });
  DB.unregistered = g('unregistered').map((r) => { r = fixRow(r); return { ...r, round_key: normRoundKey(r.round_key), group_id: cleanGroupId(r.group_id), gender: normGender(r.gender) }; });
  DB.round2Summary = g('round2Summary').map((r) => { r = fixRow(r); return { ...r, round_key: normRoundKey(r.round_key) }; });
  DB.roundDates = g('roundDates').map(fixRow);
  DB.fields = g('fields').map(fixRow);
  DB.issues = g('issues').map(fixRow);
  DB.issuesR2 = g('issuesR2').map(fixRow);

  DB.fieldsMap = {}; DB.fields.forEach((f) => { DB.fieldsMap[f.column] = f.name_ar; });
  DB.prefColumns = DB.fields.map((f) => f.column).filter((c) => /^pref_/.test(c));
  if (!DB.prefColumns.length) DB.prefColumns = ['pref_Poultry', 'pref_Equine', 'pref_Pharma_Vaccines', 'pref_FoodSafety_QC', 'pref_LargeAnimal', 'pref_SmallAnimal'];

  DB.roundNames = {};
  [DB.roundsOverview, DB.roundSchedule, DB.round2Summary].forEach((list) => list.forEach((r) => { if (r.round_key && r.round_name_ar) DB.roundNames[normRoundKey(r.round_key)] = r.round_name_ar; }));

  DB.studentLookup = {};
  DB.students.forEach((s) => {
    if (s.student_code) DB.studentLookup[s.student_code] = s;
    if (s.group_id && s.code_short) DB.studentLookup[s.group_id + '_' + s.code_short] = s;
  });

  DB.roundMatrix = {};
  DB.roundSchedule.forEach((item) => {
    const key = item.round_order + '_' + item.round_key;
    if (!DB.roundMatrix[key]) DB.roundMatrix[key] = { round_order: item.round_order, round_key: item.round_key, round_name_ar: item.round_name_ar, groups: [], total_students: 0 };
    const gInfo = DB.groups.find((x) => String(x.group_id) === String(item.group_id));
    const count = gInfo ? parseInt(gInfo.total_students, 10) || 0 : 0;
    DB.roundMatrix[key].groups.push({ group_id: item.group_id, count });
    DB.roundMatrix[key].total_students += count;
  });
}

window.resolveStudent = function (row) {
  if (!row) return null;
  if (row.student_code && DB.studentLookup[row.student_code]) return DB.studentLookup[row.student_code];
  const g = cleanGroupId(row.group_id), c = String(row.code_short || '').trim();
  if (g && c && DB.studentLookup[g + '_' + c]) return DB.studentLookup[g + '_' + c];
  return null;
};
window.studentKey = function (s) { return s.student_code || (s.group_id + '_' + s.code_short); };

/* ───────────────────────── 5) النوافذ (مع زر الرجوع في الهاتف) ───────────────────────── */

window.Overlays = (function () {
  const stack = []; let ignore = 0;
  const lock = () => document.body.classList.toggle('no-scroll', stack.length > 0);
  const push = () => { try { history.pushState({ ov: stack.length }, '', location.href); } catch (e) { /* ignore */ } };

  function open(el, replace) {
    if (replace && stack.length) { stack.pop().remove(); document.body.appendChild(el); stack.push(el); lock(); return el; }   // نعيد استخدام نفس خانة التاريخ
    document.body.appendChild(el); stack.push(el); push(); lock(); return el;
  }
  function closeTop(fromPop) {
    const el = stack.pop(); if (!el) return false;
    el.remove(); lock();
    if (!fromPop) { try { ignore++; history.back(); } catch (e) { ignore--; } }
    return true;
  }
  function closeEl(el) {
    const i = stack.indexOf(el);
    if (i === -1) { el.remove(); return; }
    if (i === stack.length - 1) closeTop(false); else { stack.splice(i, 1); el.remove(); lock(); }
  }
  function closeAll() {
    const n = stack.length; if (!n) return;
    while (stack.length) stack.pop().remove();
    lock();
    try { ignore++; history.go(-n); } catch (e) { ignore--; }
  }
  window.addEventListener('popstate', () => { if (ignore > 0) { ignore--; return; } closeTop(true); });
  return { open, closeTop, closeEl, closeAll, count: () => stack.length };
})();

window.openModal = function (title, bodyHTML, opts) {
  opts = opts || {};
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-box ${opts.cls || ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-header"><h2 class="modal-title">${esc(title)}</h2><button type="button" class="modal-close" data-action="close-overlay" aria-label="إغلاق">${iconSvg('x')}</button></div>
    <div class="modal-body">${bodyHTML}</div></div>`;
  Overlays.open(overlay, opts.replace);
  return overlay;
};

// زر عام قابل للضغط داخل أي نافذة/صفحة — يستخدم نفس معالج الضغطات الموحّد
window.btn = function (label, action, data, cls) {
  let s = `<button type="button" class="btn ${cls || 'btn-plum'}" data-action="${esc(action)}"`;
  Object.keys(data || {}).forEach((k) => { if (data[k] !== undefined && data[k] !== null) s += ` data-${k}="${esc(data[k])}"`; });
  return s + `>${label}</button>`;
};

/* ───────────────────────── 6) قوائم الطلاب ───────────────────────── */

window._rawRows = [];

// يتكرر في كل نافذة: منع تمرير الصفحة خلف النافذة + إخفاء بحث الهيدر على الهاتف
document.addEventListener('click', (e) => {
  const box = e.target.closest && e.target.closest('.modal-box');
  if (box) box.style.overflowY = 'auto';
});

window.renderStudentListModal = function (title, rows, opts) {
  opts = opts || {};
  const items = (rows || []).filter(Boolean).map((row) => {
    const s = resolveStudent(row);
    const src = s || row;
    const g = normGender(src.gender || row.gender);
    let attrs;
    if (s) attrs = act('student', { sid: studentKey(s) });
    else { window._rawRows.push(row); attrs = act('raw-student', { ri: window._rawRows.length - 1 }); }
    const sub = [src.group_id ? 'جروب ' + src.group_id : 'بدون جروب', src.code_short ? 'كود ' + src.code_short : '', row.unit_name || ''].filter(Boolean).join(' · ');
    return { attrs, name: src.full_name || row.full_name || 'غير محدد', sub, g, search: normAr((src.full_name || '') + ' ' + (src.code_short || '') + ' ' + (src.student_code || '') + ' ' + (src.group_id ? 'جروب ' + src.group_id : '')) };
  });

  const html = `
    ${opts.breadcrumb ? `<div class="breadcrumb-bar">${esc(opts.breadcrumb)}</div>` : ''}
    <div class="list-toolbar">
      <input type="search" class="table-search grow" placeholder="بحث في القائمة…" data-filter-list="#student-list-body" autocomplete="off" enterkeyhint="search">
      <span class="badge badge-plum num" id="list-count">${items.length}</span>
    </div>
    <div class="slist" id="student-list-body">
      ${items.length ? items.map((it) => `
        <div class="slist-row" data-s="${esc(it.search)}"${it.attrs}>
          <div class="initials-avatar">${esc(getInitials(it.name))}</div>
          <div class="slist-main"><div class="slist-name">${esc(it.name)}</div><div class="slist-sub">${esc(it.sub)}</div></div>
          <span class="slist-g ${it.g === 'F' ? 'gender-f' : it.g === 'M' ? 'gender-m' : ''}">${it.g === 'F' ? iconSvg('female') : it.g === 'M' ? iconSvg('male') : ''}</span>
          <span class="slist-arrow" aria-hidden="true">${iconSvg('chevron')}</span>
        </div>`).join('') : '<div class="empty-note">لا توجد أسماء في هذه القائمة.</div>'}
    </div>`;
  return openModal(title, html, { replace: opts.replace, cls: 'modal-list' });
};

window.openStudentDirectoryModal = function () { return renderStudentListModal('دليل طلاب الدفعة', DB.students, { breadcrumb: 'الرئيسية › الدليل' }); };
window.openGroupRosterModal = function (groupId, opts) {
  return renderStudentListModal(`طلاب جروب ${groupId}`, DB.students.filter((s) => String(s.group_id) === String(groupId)), opts);
};

// فلترة أي قائمة (data-filter-list) أثناء الكتابة
document.addEventListener('input', (e) => {
  const inp = e.target.closest && e.target.closest('[data-filter-list]');
  if (!inp) return;
  const q = normAr(inp.value);
  const list = document.querySelector(inp.getAttribute('data-filter-list'));
  if (!list) return;
  let shown = 0;
  list.querySelectorAll('[data-s]').forEach((r) => { const ok = !q || r.getAttribute('data-s').indexOf(q) > -1; r.style.display = ok ? '' : 'none'; if (ok) shown++; });
  const c = document.getElementById('list-count'); if (c) c.textContent = shown;
});

window.openUnknownStudent = function (row, opts) {
  const rows = [['الاسم', row.full_name], ['الكود', row.code_short], ['الجروب', row.group_id || 'غير محدد'], ['الوحدة / الراوند', row.unit_name || roundLabel(row.round_key)], ['الهاتف', formatPhone(row.phone)], ['ملاحظة', row.issue]].filter((r) => r[1]);
  openModal('بيانات الطالب', `<div class="alert-item alert-amber static" style="margin-bottom:12px"><span class="alert-icon">${ico('info')}</span><div>هذا الاسم غير موجود في ملفات الجروبات، لذلك لا يتوفر له ملف كامل.</div></div>
    <div class="kv-list">${rows.map((r) => `<div class="kv"><span>${esc(r[0])}</span><strong>${esc(r[1])}</strong></div>`).join('')}</div>`, opts);
};

/* ───────────────────────── 7) ملف الطالب ───────────────────────── */

function buildStudentJourney(student) {
  const gid = student.group_id;
  const sched = DB.roundSchedule.filter((r) => String(r.group_id) === String(gid));
  const find = (o) => sched.find((r) => String(r.round_order) === String(o)) || {};
  const mine = DB.assignments.filter((a) => (student.student_code && a.student_code === student.student_code) || (gid && String(a.group_id) === String(gid) && String(a.code_short).trim() === String(student.code_short).trim()));
  const isMissing = DB.unregistered.some((u) => (gid && String(u.group_id) === String(gid) && String(u.code_short).trim() === String(student.code_short).trim()));

  const step = (order, title, fallbackName, station) => {
    const r = find(order); const d = getRoundDates(order);
    const start = formatDate(r.start_date) || d.start, end = formatDate(r.end_date) || d.end;
    return { roundName: `${title} — ${r.round_name_ar || fallbackName}`, dates: start ? `${start} إلى ${end}` : 'غير متاح', station, status: computeStatus(start, end) };
  };
  const r2stationText = (m, miss) => m.length
    ? m.map((a) => a.unit_name || a.round_name_ar || 'مسجل').filter((v, i, arr) => arr.indexOf(v) === i).join(' + ')
    : (miss ? 'غير مسجل' : 'غير مسجل');
  // محطة الدورة الحالية لكل طالب — تُقرأ من جدول الجروبات تلقائياً (تعمل لأي دورة قادمة بدون تعديل كود)
  const todayStr = getTodayStr();
  let curRow = sched.find((r) => { const s = formatDate(r.start_date), e = formatDate(r.end_date); return s && e && todayStr >= s && todayStr <= e; });
  if (!curRow) {
    const upcoming = sched.filter((r) => formatDate(r.start_date) && todayStr < formatDate(r.start_date))
                          .sort((a, b) => formatDate(a.start_date) < formatDate(b.start_date) ? -1 : 1);
    curRow = upcoming[0] || sched[sched.length - 1] || null;
  }
  let curStation = 'لم يُحدد بعد';
  if (curRow) {
    const o = String(curRow.round_order);
    if (o === '2') curStation = r2stationText(mine, isMissing);
    else if (o === '1' || curRow.round_key === 'college') curStation = curRow.round_name_ar || roundLabel(curRow.round_key);
    else curStation = curRow.round_name_ar || roundLabel(curRow.round_key);
  }
  const later = 'لم يُحدد بعد';
  const d0 = getRoundDates('0');
  return [
    step(1, 'الراوند 1', 'أقسام الكلية', later),
    step(2, 'الراوند 2', 'وحدات بيطرية', r2stationText(mine, isMissing)),
    { roundName: 'الدورة الحالية (حسب الجدول)', dates: curRow && formatDate(curRow.start_date) ? `${formatDate(curRow.start_date)} إلى ${formatDate(curRow.end_date)}` : 'غير متاح', station: curStation, status: curRow ? computeStatus(formatDate(curRow.start_date) || getRoundDates(curRow.round_order).start, formatDate(curRow.end_date) || getRoundDates(curRow.round_order).end) : 'upcoming' },
    step(3, 'الراوند 3', 'دواجن', later),
    step(4, 'الراوند 4', 'مجازر / خيل', later),
    { roundName: 'تدريب اختياري', dates: d0.start ? `${d0.start} إلى ${d0.end}` : 'غير متاح', station: 'حسب اختيار الطالب', status: computeStatus(d0.start, d0.end) }
  ];
}

window.openStudentProfile = function (rawKey, opts) {
  try {
    const student = DB.studentLookup[String(rawKey).replace(/\s+/g, '')];
    if (!student) { toast('لم يتم العثور على سجل الطالب'); return; }
    closeProfileOnly();

    const phone = formatPhone(student.phone), phoneEmpty = !phone, wa = waLink(student.phone);
    const email = String(student.email || '').trim();
    const rawNid = String(student.national_id || '').trim();
    const masked = rawNid ? '••••••••••' + rawNid.slice(-4) : 'غير متوفر';
    const showNid = CFG().SHOW_NID_BY_DEFAULT && !document.body.classList.contains('presentation-mode');
    const birth = formatDate(student.birth_date), reg = formatDate(student.registered_at);
    const prefs = DB.prefColumns.map((key) => ({ arabicName: DB.fieldsMap[key] || key, rank: parseInt(student[key], 10) || 99 })).sort((a, b) => a.rank - b.rank);
    const journey = buildStudentJourney(student);
    const sid = studentKey(student);

    const panel = document.createElement('div');
    panel.id = 'profile-panel-overlay';
    panel.className = 'modal-overlay profile-overlay';
    panel.innerHTML = `
      <div class="profile-drawer" role="dialog" aria-modal="true" aria-label="ملف الطالب">
        <div class="profile-header">
          <div class="profile-head-main">
            <div class="profile-chips">
              <span class="badge ${student.gender === 'F' ? 'badge-rose' : 'badge-plum'}">${student.gender === 'F' ? 'أنثى' : student.gender === 'M' ? 'ذكر' : 'غير محدد'}</span>
              <span class="cartouche-badge-dark">جروب ${esc(student.group_id || '—')}</span>
              <span class="student-code">${esc(student.code_short || '—')}</span>
            </div>
            <div class="profile-who">
              <div class="initials-avatar lg">${esc(getInitials(student.full_name))}</div>
              <div><h2>${esc(student.full_name || 'غير محدد')}</h2><div class="profile-sub">الكود الأكاديمي: <span class="num">${esc(student.student_code || '—')}</span></div></div>
            </div>
          </div>
          <button type="button" class="modal-close" data-action="close-overlay" aria-label="إغلاق">${ico('x')}</button>
        </div>

        <div class="profile-body">
          ${student.student_notes ? `<div class="alert-item alert-amber static"><span class="alert-icon">${ico('pin')}</span><div><strong>ملاحظة إدارية:</strong> ${esc(student.student_notes)}</div></div>` : ''}

          <div class="profile-section">
            <div class="profile-section-title">${ico('id-card')} البيانات الشخصية</div>
            <div class="personal-info-card">
              <div><div class="k">الرقم القومي</div>
                <div class="v"><span id="nid-display" class="num" data-masked="${showNid ? '0' : '1'}">${esc(showNid ? rawNid || masked : masked)}</span>
                ${rawNid ? `<button type="button" class="btn btn-surface btn-sm" id="nid-toggle-btn" data-action="toggle-nid" data-sid="${esc(sid)}" aria-label="إظهار/إخفاء الرقم القومي">${showNid ? ico('eye-off') : ico('eye')}</button>` : ''}</div>
                ${student.nid_status === 'check' ? `<span class="badge badge-amber">${ico('warning')} يحتاج مراجعة</span>` : ''}</div>
              <div><div class="k">تاريخ الميلاد / السن</div><div class="v"><span class="num">${esc(birth || 'غير محدد')}</span> <small class="muted">(${esc(computeAge(birth))})</small></div></div>
              <div class="span2 divider"><span class="k">تاريخ التسجيل:</span> <strong class="num">${esc(reg || 'غير محدد')}</strong></div>
            </div>
          </div>

          <div class="profile-section hide-in-presentation">
            <div class="profile-section-title">${ico('phone')} بيانات التواصل</div>
            <div class="contact-box">
              <div class="contact-row">
                <div class="grow"><div class="k">رقم الهاتف</div>
                  <div class="v big">${phoneEmpty ? '<span class="muted">غير متوفر</span>' : `<span class="num" dir="ltr">${esc(phone)}</span>`}
                  ${student.phone_status === 'check' ? `<span class="badge badge-amber">${ico('warning')} يحتاج مراجعة</span>` : ''}</div></div>
                ${phoneEmpty ? '' : `<div class="contact-actions">
                  <a href="tel:${esc(phone)}" class="btn btn-plum btn-sm">${ico('phone')} اتصال</a>
                  <a href="${esc(wa)}" target="_blank" rel="noopener" class="btn btn-emerald btn-sm">${ico('whatsapp')} واتساب</a>
                  <button type="button" class="btn btn-surface btn-sm" data-action="copy" data-text="${esc(phone)}" data-msg="تم نسخ رقم الهاتف">${ico('copy')} نسخ</button></div>`}
              </div>
              <div class="contact-row divider-top">
                <div class="grow"><div class="k">البريد الإلكتروني</div><div class="v email">${email ? esc(email) : '<span class="muted">غير متوفر</span>'}</div></div>
                ${email ? `<div class="contact-actions">
                  <a href="mailto:${esc(email)}" class="btn btn-plum btn-sm">${ico('mail')} مراسلة</a>
                  <button type="button" class="btn btn-surface btn-sm" data-action="copy" data-text="${esc(email)}" data-msg="تم نسخ البريد">${ico('copy')} نسخ</button></div>` : ''}
              </div>
            </div>
          </div>

          <div class="profile-section">
            <div class="profile-section-title">المسار التدريبي</div>
            <div class="journey-timeline">
              ${journey.map((st) => `<div class="journey-step ${st.status}"><div class="journey-bullet"></div>
                <div class="journey-content">
                  <div class="journey-top"><span class="journey-name">${esc(st.roundName)}</span>${statusBadge(st.status)}</div>
                  <div class="journey-dates">${ico('calendar')} <span class="num">${esc(st.dates)}</span></div>
                  <div>${ico('map-pin')} موقع التدريب: <strong>${esc(st.station)}</strong></div>
                </div></div>`).join('')}
            </div>
          </div>

          <div class="profile-section">
            <div class="profile-section-title">${ico('star')} ترتيب الرغبات</div>
            <div class="pref-list">
              ${prefs.map((p, i) => `<div class="pref-item"><span class="pref-rank-badge num">#${i + 1}</span><span class="pref-name">${esc(p.arabicName)}</span><span class="pref-score">الرغبة: <strong class="num">${p.rank < 99 ? p.rank : '—'}</strong></span></div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;
    Overlays.open(panel, opts && opts.replace);
  } catch (err) { console.error(err); toast('حدث خطأ أثناء فتح الملف'); }
};

function closeProfileOnly() { const p = document.getElementById('profile-panel-overlay'); if (p) Overlays.closeEl(p); }
window.closeStudentProfile = closeProfileOnly;

/* ───────────────────────── 8) البحث الشامل ───────────────────────── */

window.openGlobalSearch = function () {
  const old = document.getElementById('search-modal-overlay'); if (old) { Overlays.closeEl(old); }
  const overlay = document.createElement('div');
  overlay.id = 'search-modal-overlay'; overlay.className = 'modal-overlay search-overlay';
  overlay.innerHTML = `<div class="search-modal-box" role="dialog" aria-modal="true" aria-label="بحث">
    <div class="search-input-wrap"><span class="search-icon" aria-hidden="true">${ico('search')}</span>
      <input type="search" id="global-search-input" class="search-box-input" placeholder="ابحث باسم الطالب أو الكود أو الهاتف أو الوحدة…" autocomplete="off" enterkeyhint="search">
      <button type="button" class="modal-close dark" data-action="close-overlay" aria-label="إغلاق">${ico('x')}</button></div>
    <div class="search-results-list" id="search-results-list"><div class="empty-note">اكتب للبحث في الطلاب والجروبات والوحدات.</div></div></div>`;
  Overlays.open(overlay);
  const input = overlay.querySelector('#global-search-input'), out = overlay.querySelector('#search-results-list');
  setTimeout(() => input.focus(), 50);

  const render = () => {
    const raw = input.value.trim(), q = normAr(raw), qd = raw.replace(/\D/g, '');
    if (!q) { out.innerHTML = '<div class="empty-note">اكتب للبحث في الطلاب والجروبات والوحدات.</div>'; return; }
    const students = DB.students.filter((s) => normAr(s.full_name).indexOf(q) > -1 || (qd.length >= 3 && (String(s.student_code).indexOf(qd) > -1 || formatPhone(s.phone).indexOf(qd) > -1)) || (qd && String(s.code_short) === qd)).slice(0, 25);
    const groups = DB.groups.filter((g) => normAr('جروب ' + g.group_id + ' ' + (g.group_name || '')).indexOf(q) > -1).slice(0, 8);
    const units = DB.stationsUnits.filter((u) => normAr(u.unit_name).indexOf(q) > -1).slice(0, 8);
    let html = '';
    if (students.length) html += `<div class="search-category-header">الطلاب (${students.length}${students.length === 25 ? '+' : ''})</div>` + students.map((s) => `
      <div class="search-result-row"${act('student', { sid: studentKey(s), replace: 1 })}>
        <div class="initials-avatar">${esc(getInitials(s.full_name))}</div><div class="grow"><strong>${esc(s.full_name)}</strong><br><small>جروب ${esc(s.group_id || '—')} · كود ${esc(s.code_short || '—')}</small></div><span class="slist-arrow">‹</span></div>`).join('');
    if (groups.length) html += '<div class="search-category-header">الجروبات</div>' + groups.map((g) => `
      <div class="search-result-row"${act('group-roster', { gid: g.group_id, replace: 1 })}><span class="cartouche-badge">جروب ${esc(g.group_id)}</span><div class="grow"><small>${esc(g.total_students || 0)} طالب/ة</small></div><span class="slist-arrow">‹</span></div>`).join('');
    if (units.length) html += '<div class="search-category-header">الوحدات</div>' + units.map((u) => `
      <div class="search-result-row"${act('goto-unit', { unit: u.unit_name })}><span>${ico("hospital")}</span><div class="grow"><strong>${esc(u.unit_name)}</strong><br><small>${esc(u.governorate || '')} · ${esc(u.registered || 0)} مقيد</small></div><span class="slist-arrow">‹</span></div>`).join('');
    out.innerHTML = html || '<div class="empty-note">لا توجد نتائج مطابقة.</div>';
  };
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = out.querySelector('[data-action]'); if (first) first.click(); } });
};

/* ───────────────────────── 9) جداول: فرز وبحث ───────────────────────── */

window.makeTableSortable = function (tableEl) {
  if (!tableEl) return;
  const headers = tableEl.querySelectorAll('th[data-col]'); let sortCol = null, dir = 1;
  headers.forEach((th) => th.addEventListener('click', () => {
    const col = th.dataset.col; if (sortCol === col) dir *= -1; else { sortCol = col; dir = 1; }
    headers.forEach((h) => h.classList.remove('sorted-asc', 'sorted-desc')); th.classList.add(dir === 1 ? 'sorted-asc' : 'sorted-desc');
    const tbody = tableEl.querySelector('tbody'); const rows = Array.from(tbody.querySelectorAll('tr'));
    const val = (r) => { const td = r.querySelector(`td[data-col="${col}"]`); return td ? (td.dataset.sort !== undefined ? td.dataset.sort : td.textContent.trim()) : ''; };
    rows.sort((a, b) => { const av = val(a), bv = val(b), an = parseFloat(av), bn = parseFloat(bv); return (!isNaN(an) && !isNaN(bn) ? an - bn : String(av).localeCompare(String(bv), 'ar')) * dir; });
    rows.forEach((r) => tbody.appendChild(r));
  }));
};
window.makeTableSearchable = function (inputEl, tableEl) {
  if (!inputEl || !tableEl) return;
  inputEl.addEventListener('input', () => { const q = normAr(inputEl.value); tableEl.querySelectorAll('tbody tr').forEach((r) => { r.style.display = !q || normAr(r.textContent).indexOf(q) > -1 ? '' : 'none'; }); });
};

/* ───────────────────────── 10) وضع العرض + التحقق ───────────────────────── */

window.togglePresentationMode = function () {
  const on = document.body.classList.toggle('presentation-mode');
  const b = document.querySelector('#presentation-btn .btn-txt'); if (b) b.textContent = on ? 'إنهاء وضع العرض' : 'وضع العرض';
};

window.VERIFY = {
  checks: [],
  add(label, countValue, getLen) { this.checks.push({ label, countValue, getLen }); },
  run() {
    if (!this.checks.length) return;
    const results = this.checks.map((c) => { const len = c.getLen(); return { label: c.label, countValue: c.countValue, listLen: len, ok: Number(c.countValue) === Number(len) }; });
    this.checks = [];
    const badge = document.getElementById('verify-badge'); if (!badge) return;
    const failed = results.filter((r) => !r.ok);
    badge.classList.remove('hidden');
    clearTimeout(this._t);
    if (!failed.length) {
      badge.className = 'verify-badge verify-ok'; badge.innerHTML = `تدقيق متطابق (${results.length} فحص)`;
      this._t = setTimeout(() => badge.classList.add('hidden'), 3500);
    } else {
      badge.className = 'verify-badge verify-fail';
      badge.innerHTML = `<button type="button" class="verify-x" data-action="hide-verify" aria-label="إغلاق">${ico('x')}</button>${ico("warning")} عدم تطابق في ${failed.length} رقم:<br>` + failed.map((f) => `<small>${esc(f.label)}: المعروض <b>${f.countValue}</b> ≠ القائمة <b>${f.listLen}</b></small>`).join('<br>');
    }
  }
};

/* ───────────────────────── 11) التثبيت (PWA) ───────────────────────── */

let deferredPrompt = null;
let installDismissed = false;
try { installDismissed = sessionStorage.getItem('imtiaz_install_dismissed') === '1'; } catch (e) { /* ignore */ }

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches
  || window.matchMedia('(display-mode: fullscreen)').matches
  || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function setInstallVisible(v) {
  const b = document.getElementById('install-btn'), x = document.getElementById('install-close');
  if (b) b.classList.toggle('hidden', !v);
  if (x) x.classList.toggle('hidden', !v);            // زر الإخفاء يظهر فقط عندما يظهر زر التثبيت
}
/* البند 2: على الموبايل لا مساحة لنص "تثبيت التطبيق" — نبدله بaria-label فقط */
function localizeInstallBtnForMobile() {
  const b = document.getElementById('install-btn'); if (!b) return;
  if (window.matchMedia && window.matchMedia('(max-width: 480px)').matches) {
    b.setAttribute('aria-label', 'تثبيت التطبيق');
  } else {
    b.removeAttribute('aria-label');                    // النص المرئي موجود داخل الزر
  }
}
window.addEventListener('resize', localizeInstallBtnForMobile, { passive: true });
localizeInstallBtnForMobile();
function canShowInstall() { return !isStandalone() && !installDismissed; }

window.dismissInstall = function () {
  installDismissed = true;
  try { sessionStorage.setItem('imtiaz_install_dismissed', '1'); } catch (e) { /* ignore */ }
  setInstallVisible(false);
};

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; setInstallVisible(canShowInstall()); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; setInstallVisible(false); toast('تم تثبيت التطبيق — افتحه من أيقونة الشاشة الرئيسية'); });

window.installApp = async function () {
  if (deferredPrompt) {                                   // Chrome/Edge/Android: native install dialog
    try { deferredPrompt.prompt(); } catch (e) { /* ignore */ }
    try { const r = await deferredPrompt.userChoice; if (r && r.outcome === 'accepted') { setInstallVisible(false); toast('تم التثبيت'); } } catch (e) { /* ignore */ }
    deferredPrompt = null;
    return;
  }
  const ios = isIOS();
  openModal('تثبيت التطبيق على جهازك', ios ? `
    <ol class="install-steps">
      <li>افتح الموقع في متصفح <strong>Safari</strong>.</li>
      <li>اضغط زر <strong>المشاركة</strong> <span class="kbd">${ico("upload")}</span> أسفل الشاشة.</li>
      <li>مرّر لأسفل واختر <strong>«إضافة إلى الشاشة الرئيسية»</strong> (Add to Home Screen).</li>
      <li>اضغط <strong>إضافة</strong> — ستجد الأيقونة على شاشتك.</li>
    </ol>` : `
    <ol class="install-steps">
      <li><strong>أندرويد (Chrome):</strong> اضغط القائمة <span class="kbd">⋮</span> ثم <strong>«تثبيت التطبيق»</strong> أو «إضافة إلى الشاشة الرئيسية».</li>
      <li><strong>الكمبيوتر (Chrome / Edge):</strong> اضغط أيقونة التثبيت <span class="kbd">${ico("download")}</span> في آخر شريط العنوان.</li>
      <li>تأكد أن الموقع مفتوح عبر <strong>https</strong>.</li>
    </ol>`);
};

function initInstallUI() {
  if (isStandalone()) { setInstallVisible(false); return; }
  setInstallVisible(canShowInstall());           // نعرض الزر دائماً حتى يتم التثبيت أو يُغلق يدوياً
  window.addEventListener('focus', () => { if (!deferredPrompt) setInstallVisible(canShowInstall()); });
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !window._swReloaded && !Overlays.count()) { window._swReloaded = true; location.reload(); } });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW:', e)));
}

/* ───────────────────────── 12) الصفحات والتنقل ───────────────────────── */

const PAGE_RENDERERS = {
  'overview': () => renderOverview(document.getElementById('page-overview')),
  'schedule': () => renderSchedule(document.getElementById('page-schedule')),
  'units': () => renderUnits(document.getElementById('page-units')),
  'not-registered': () => renderNotRegistered(document.getElementById('page-not-registered'))
};
let _activePage = null;

/* ── مؤشر التبويب المنزلق + شارات العد — يُحدَّثان عند كل تنقّل وعند تغيّر حجم النافذة ── */
window.moveNavIndicator = function () {
  const inner = document.querySelector('.nav-inner');
  const ind = inner && inner.querySelector('.nav-indicator');
  if (!ind) return;
  const active = inner.querySelector('.nav-btn.active');
  if (!active) { ind.classList.remove('show'); return; }
  // قياس داخل تدفق .nav-inner نفسه (offsetLeft/offsetWidth لا تتأثر بتمرير الحاوية ولا بـ RTL)
  ind.style.width = active.offsetWidth + 'px';
  ind.style.transform = 'translateX(' + active.offsetLeft + 'px)';
  ind.classList.add('show');
};
window.updateNavBadges = function () {
  try {
    const btn = document.querySelector('.nav-btn[data-page="not-registered"]');
    if (!btn) return;
    let n = btn.querySelector('.nav-count');
    const count = (typeof DB !== 'undefined' && DB.unregistered) ? DB.unregistered.length : 0;
    if (!count) { if (n) n.remove(); return; }
    if (!n) { n = document.createElement('span'); n.className = 'nav-count'; n.setAttribute('aria-hidden', 'true'); btn.appendChild(n); }
    if (String(count) !== n.textContent) n.textContent = String(count);
  } catch (e) {}
};
window.addEventListener('resize', () => { window.moveNavIndicator && window.moveNavIndicator(); }, { passive: true });

/* البند 2 (دورة الإصلاحات الدقيقة): إعادة رسم المصفوفة عند عبور حد 1200px
   لأن الصياغة الرأسية تُبنى من نفس الـ HTML — لا داعي لإعادة الرسم قبل اكتمال بناء DB */
(function () {
  let wasWide = null;
  const mq = window.matchMedia('(min-width: 1200px)');
  const apply = () => {
    if (wasWide === null) { wasWide = mq.matches; return; }   // أول قياس — الرسم الأول يتم عبر التنقل العادي
    if (wasWide === mq.matches) return;
    wasWide = mq.matches;
    const el = document.getElementById('page-schedule');
    if (el && typeof renderSchedule === 'function' && window.DB && DB.groups) { try { renderSchedule(el); } catch (e) { console.warn('gantt remount:', e); } }
  };
  if (mq.addEventListener) mq.addEventListener('change', apply); else mq.addListener(apply);
})();

window.showPage = function (pageId) {
  const pageEl = document.getElementById('page-' + pageId);
  if (!pageEl) return;
  if (_activePage === pageId && pageEl.dataset.rendered) return;
  document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'));
  pageEl.classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach((b) => { const on = b.dataset.page === pageId; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  window.moveNavIndicator && window.moveNavIndicator(pageId);
  window.updateNavBadges && window.updateNavBadges();
  if (!pageEl.dataset.rendered) {
    try { PAGE_RENDERERS[pageId](); pageEl.dataset.rendered = 'true'; }
    catch (err) { console.error(err); pageEl.innerHTML = `<div class="card error-card"><h3>تعذّر عرض هذه الصفحة</h3><p class="muted">${esc(err.message)}</p><button type="button" class="btn btn-plum" data-action="retry">إعادة تحميل البيانات</button></div>`; }
    setTimeout(() => VERIFY.run(), 60);
  }
  _activePage = pageId;
  window.scrollTo({ top: 0, behavior: 'auto' });
};

function rerenderAll() {
  document.querySelectorAll('.page').forEach((p) => { delete p.dataset.rendered; p.innerHTML = ''; });
  const cur = _activePage || 'overview'; _activePage = null; showPage(cur);
  window.updateNavBadges && window.updateNavBadges();
}

/* ───────────────────────── 13) التحميل والتحديث ───────────────────────── */

function setUpdateBadge(extra) {
  const el = document.getElementById('header-last-update'); if (!el) return;
  el.textContent = `آخر تحديث للبيانات: ${CFG().LAST_DATA_UPDATE || '—'}${extra ? ' · ' + extra : ''}`;
}
/* سياسة عدم الاتصال: الكاش يعمل بصمت عبر Service Worker + localStorage —
   بدون أي banner أو toast أو زر إعادة محاولة. دالة showBanner أُزيلت نهائياً. */
function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; } return h; }
function fingerprint(sheets) { try { const j = JSON.stringify(sheets); return j.length + ':' + hash(j); } catch (e) { return String(Date.now()); } }

function showError(errors) {
  const keys = Object.keys(errors || {}).filter((k) => REQUIRED.indexOf(k) > -1);
  const el = document.getElementById('error-screen'); const ld = document.getElementById('loading-screen'); if (ld) ld.classList.add('hidden');
  document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'));
  el.classList.remove('hidden');
  el.innerHTML = `<div class="card error-card"><div class="error-ico">${ico('satellite-dish')}</div><h2>تعذّر تحميل البيانات</h2>
    <p class="muted">تأكد من الاتصال بالإنترنت، ثم أعد المحاولة. إن استمرت المشكلة فتأكد أن رابط Google Apps Script منشور بصلاحية «أي شخص» وأن أسماء الشيتات صحيحة.</p>
    ${keys.length ? `<details class="err-details"><summary>تفاصيل فنية</summary><ul>${keys.map((k) => `<li><code>${esc(SHEETS[k])}</code>: ${esc(errors[k])}</li>`).join('')}</ul></details>` : ''}
    <button type="button" class="btn btn-plum" data-action="retry">${ico('refresh')} إعادة المحاولة</button></div>`;
}

let _loading = false, _lastFp = null;

async function refreshData(opts) {
  opts = opts || {};
  if (_loading) return;
  _loading = true;
  const btn = document.getElementById('refresh-btn'); if (btn) btn.classList.add('spinning');
  try {
    const { sheets, errors } = await fetchAllSheets();
    const cached = readCache();
    const merged = { ...(cached ? cached.sheets : {}), ...sheets };          // شيت فشل؟ نستخدم آخر نسخة محفوظة له
    const failedRequired = REQUIRED.filter((k) => !sheets[k]);

    if (!hasRequired(merged)) { if (!opts.silent || !DB.students) showError(errors); return; }

    const fp = fingerprint(merged);
    const freshAll = failedRequired.length === 0;
    if (freshAll) writeCache(merged);
    // فشل التحديث؟ نتجاهله بصمت — اللوحة تستمر عرض آخر نسخة محفوظة (كاش صامت بلا إشعارات).

    if (fp !== _lastFp) {
      _lastFp = fp; buildDB(merged);
      const ld = document.getElementById('loading-screen'); if (ld) ld.classList.add('hidden');
      document.getElementById('error-screen').classList.add('hidden');
      if (opts.firstPaint) { showPage('overview'); } else { rerenderAll(); if (opts.silent) toast('تم تحديث البيانات'); }
    }
    if (opts.manual && freshAll) toast('البيانات محدّثة');
    setUpdateBadge();
  } finally { _loading = false; if (btn) btn.classList.remove('spinning'); }
}

/* ═════════════ 12.5) SPLASH — شاشة الاستقبال الفاخرة (تظهر فوراً قبل تحميل البيانات) ═════════════
   تُعرض من index.html مباشرة (لا انتظار JS) ثم تُطوى تلقائياً بعد أول رسم للوحة.        */

window.Splash = (function () {
  let timer = null, done = false;
  function reveal() {
    const el = document.getElementById('gate-splash'); if (!el) return;
    requestAnimationFrame(() => { el.classList.add('go'); });                    // تشغيل حركة النقر الذهبي
    clearTimeout(timer); timer = setTimeout(dismiss, 2600);                      // أمان: تختفي وحدها
  }
  function dismiss(instant) {
    if (done) return; done = true; clearTimeout(timer);
    const el = document.getElementById('gate-splash'); if (!el) return;
    if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.remove(); return; }
    el.classList.add('out');
    setTimeout(() => { try { el.remove(); } catch (e) {} }, 620);
  }
  function skip() { dismiss(); }
  return { reveal, dismiss, skip };
})();

async function init() {
  setUpdateBadge();
  if (CFG().PRESENTATION_MODE) document.body.classList.add('presentation-mode');

  // 1) البوابة أولاً — لا بيانات ولا تسجيل SW قبل الدخول
  const passedNow = Gate.init((user, pass, confirm) => onGateSubmit(user, pass, confirm));
  if (!passedNow) {
    const ld = document.getElementById('loading-screen'); if (ld) ld.classList.add('hidden');
    window.Splash && Splash.dismiss(true);                                       // جلسة محفوظة →الانتقال مباشرة اللوحة
    return;
  }
  bootAfterUnlock();
}

function bootAfterUnlock() {
  Gate.whoChip();
  initInstallUI(); registerSW();
  const afterPaint = () => { window.Splash && Splash.dismiss(); VERIFY.run(); };

  const cached = readCache();
  if (cached && hasRequired(cached.sheets)) {
    // فتح فوري من آخر نسخة محفوظة ثم تحديث في الخلفية
    buildDB(cached.sheets); _lastFp = fingerprint(cached.sheets);
    document.getElementById('loading-screen').classList.add('hidden');
    showPage('overview');
    setUpdateBadge('جارٍ التحديث…');
    afterPaint();
    refreshData({ silent: true }).catch((e) => { console.error(e); setUpdateBadge(); }); // كاش صامت — بلا إشعار عدم اتصال
    return;
  }
  refreshData({ firstPaint: true })
    .then(afterPaint)
    .catch((e) => { console.error(e); afterPaint(); showError({ students: e.message }); });
}

// نجاح الدخول → شاشة الاستقبال ثم تحميل البيانات (البيانات المحفوظة تُمسح عند القفل)
async function onGateSubmit(user, pass, confirm) {
  const ok = await Gate.submit(user, pass, confirm);
  Gate.afterSubmit(ok);                                                          // إعادة ضبط زر «دخول آمن»
  if (!ok) return;
  window.Splash && Splash.reveal();                                              // لحظة الانتقال الجميلة
  const ld = document.getElementById('loading-screen'); if (ld) ld.classList.remove('hidden');
  setTimeout(() => { window.Splash && Splash.dismiss(); }, 1500);                // احتياط إن طال التحميل
  if (!_booted) { _booted = true; bootAfterUnlock(); }
  else { rerenderAll(); }
}
let _booted = false;

window.AppBoot = function () { init(); };

/* ───────────────────────── 14) معالج الضغطات الموحّد ───────────────────────── */
// كل العناصر القابلة للضغط تستخدم data-action — لا onclick داخل النصوص.

const ACTIONS = {
  'page': (el) => { Overlays.closeAll(); showPage(el.dataset.page); },
  'goto-page': (el) => { Overlays.closeAll(); showPage(el.dataset.page); },
  'student': (el) => openStudentProfile(el.dataset.sid, { replace: !!el.dataset.replace }),
  'raw-student': (el) => openUnknownStudent(window._rawRows[+el.dataset.ri] || {}),
  'group-roster': (el) => openGroupRosterModal(el.dataset.gid, { replace: !!el.dataset.replace }),
  'directory': () => openStudentDirectoryModal(),
  'search-open': () => openGlobalSearch(),
  'retry': () => { document.getElementById('error-screen').classList.add('hidden'); const ld = document.getElementById('loading-screen'); ld.classList.remove('hidden'); refreshData({ firstPaint: true }).catch((e) => { console.error(e); showError({ students: e.message }); }); },
  'install': () => installApp(),
  'dismiss-install': () => dismissInstall(),
  'round-detail': (el) => openRoundDetailModal(el.dataset.round, el.dataset.title || roundLabel(el.dataset.round), el.dataset.gid, el.dataset.count, el.dataset.matrix),
  'toggle-presentation': () => togglePresentationMode(),
  'close-overlay': (el) => { const ov = el.closest('.modal-overlay'); if (ov) Overlays.closeEl(ov); },
  'hide-verify': () => document.getElementById('verify-badge').classList.add('hidden'),
  'copy': (el) => copyText(el.dataset.text || '', el.dataset.msg),
  'toggle-nid': (el) => {
    const s = DB.studentLookup[el.dataset.sid]; const out = document.getElementById('nid-display'); if (!s || !out) return;
    const nid = String(s.national_id || ''); const masked = '••••••••••' + nid.slice(-4);
    const wasMasked = out.dataset.masked === '1';
    out.textContent = wasMasked ? nid : masked; out.dataset.masked = wasMasked ? '0' : '1'; el.textContent = wasMasked ? '' : '';
  },

  /* ── بوابة الدخول ── */
  'gate-eye': (el) => {
    const inp = document.getElementById('gate-pass'); if (!inp) return;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    el.textContent = show ? '' : '';
    el.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
    try { inp.focus(); } catch (e) {}
  },
  'gate-reload-accounts': async () => {
    const ok = await Gate.reloadAccounts();
    toast(ok ? 'تم تحديث قائمة الحسابات' : 'تعذّر قراءة تبويب الحسابات');
  },
  'gate-forget': () => {
    const c = Gate.gateCfg();
    const isSheet = String(c.MODE || 'sheet').toLowerCase() !== 'local';
    if (isSheet) {
      openModal('نسيت كلمة المرور؟', `
        <p class="muted">كلمات المرور تُدار من تبويب <b>${esc(c.USERS_SHEET_NAME || 'Accounts')}</b> في جدول Google المرتبط باللوحة:</p>
        <ol class="install-steps">
          <li>افتح جدول Google → التبويب المذكور.</li>
          <li>عدّل الصف الخاص بك (اسم المستخدم / كلمة المرور).</li>
          <li>اضغط «تحديث قائمة الحسابات» بالأسفل أو أعد المحاولة بعد دقيقة.</li>
        </ol>
        <div class="modal-actions">${btn('تحديث قائمة الحسابات', 'gate-reload-accounts', null, 'btn-gold')}</div>`);
      return;
    }
    if (c.PASSPHRASE) { toast('الرمز مضبوط من ملف الإعدادات (config.js) — غيّره هناك ثم أعد النشر.'); return; }
    openModal('نسيت الرمز؟', `
      <p class="muted">الرمز محفوظ على هذا الجهاز فقط ولا يمكن استعادته. يمكنك حذفه وضبط رمز جديد:</p>
      <ol class="install-steps">
        <li>اضغط «حذف الرمز وبدء إعداد جديد» بالأسفل.</li>
        <li>اختر رمزاً جديداً (٤ أحرف أو أكثر).</li>
        <li>احتفظ بالرمز في مكان آمن — لا توجد رسالة استعادة.</li>
      </ol>
      <div class="modal-actions">${btn('حذف الرمز وبدء إعداد جديد', 'gate-clear-local', null, 'btn-rose')}</div>`);
  },
  'gate-clear-local': () => { Overlays.closeAll(); Gate.clearDevicePass(); },
  'gate-help': () => {
    const c = Gate.gateCfg();
    openModal('كيف أحمي بيانات اللوحة؟', `
      <div class="kv-list">
        <div class="kv"><span>الوضع الحالي</span><b>${c.PASSPHRASE ? 'رمز مشترك مكتوب في config.js' : 'رمز محلي على كل جهاز'}</b></div>
        <div class="kv"><span>مدة الجلسة</span><b>${c.REMEMBER_HOURS} ساعة على هذا الجهاز</b></div>
        <div class="kv"><span>القفل التلقائي</span><b>${c.AUTO_LOCK_MINUTES ? c.AUTO_LOCK_MINUTES + ' دقيقة خمول' : 'معطّل'}</b></div>
      </div>
      <h3 style="margin-top:14px">مهم — اقرأ هذا</h3>
      <p class="muted">بوابة الدخول هنا هي <strong>قفل واجهة</strong>: تمنع الفضوليين وتُخفي البيانات عن أي جهاز غير مُصرّح. لكنها ليست تشفيراً كاملاً، لأن ملفات الموقع عامة بطبيعتها، وبياناتها تأتي من رابط Google Apps Script.</p>
      <h3>لحماية كاملة (خطوتان فقط)</h3>
      <ol class="install-steps">
        <li><strong>Cloudflare Access (مجاني حتى 50 مستخدم):</strong> لوحة Cloudflare → <em>Zero Trust → Access → Applications</em> → أضف التطبيق <code>imtiaz-dashboard.pages.dev</code> واختر سياسة «Allow» لبريد الكلية مع رمز تحقق OTP.</li>
        <li><strong>Apps Script:</strong> اجعل السكربت يطلب <code>?token=...</code> صحيحاً، وضع نفس القيمة في <code>GATE.API_TOKEN</code> داخل config.js، وقيّد مشاركة جدول Google على حسابات الكلية فقط.</li>
      </ol>
      <p class="muted" style="margin-top:10px">بهذا لا يستطيع أي شخص قراءة البيانات حتى لو عرف الرابط.</p>`);
  },
  'splash-skip': () => { window.Splash && Splash.dismiss(); }
};
window.registerAction = function (name, fn) { ACTIONS[name] = fn; };

// فتح صفحة الوحدات البيطرية مع فتح وحدة بعينها وتمرير الشاشة إليها
registerAction('goto-unit', (el) => {
  Overlays.closeAll();
  showPage('units');
  const want = String(el.dataset.unit || '').trim();
  setTimeout(() => {
    const cards = document.querySelectorAll('#units-grid .unit-card');
    for (const card of cards) {
      const name = card.querySelector('.unit-name');
      if (name && normAr(name.textContent) === normAr(want)) {
        card.classList.add('open');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
  }, 120);
});

document.addEventListener('click', (e) => {
  const ov = e.target;
  if (ov.classList && ov.classList.contains('modal-overlay')) { Overlays.closeEl(ov); return; }          // الضغط على الخلفية
  const el = e.target.closest ? e.target.closest('[data-action]') : null;
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) { if (el.tagName === 'A') return; fn(el, e); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && Overlays.count()) { Overlays.closeTop(false); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches && e.target.matches('[role="button"][data-action]')) { e.preventDefault(); e.target.click(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openGlobalSearch(); }
});

/* ═══ البند 4 — نموذج تدوير «خيل / معامل / سمك» نصف الشهري ═══
   يقرأ حقول الشيت حرفياً: عمود البداية الفرعية لكل طالب/جروب (sub_unit_start /
   sub_round_start / unit_start / rotation_start / sub_unit …) وعمود ترتيب التدوير
   (rotation_order / sub_rotation / rotation_seq …) بصيغه: "معامل > خيل > سمك" أو
   "equine_lab_fish" أو "يبدأ معامل". البلوكات أسبوعان متتالية من بداية الراوند الذي
   ينتمي إليه القسم (getRoundDates — نفس مصدر تواريخ اللوحة). لا يوجد أي تسلسل ثابت
   في الكود: الترتيب يُشتق دائماً من الشيت، وأي قيمة غير مفهومة تُعرض كما هي. */
const SUBUNIT_NAMES = { horse: 'خيل', equine: 'خيل', lab: 'معامل', labs: 'معامل', fish: 'سمك' };
function subunitToken(t) {
  const s = normAr(String(t || '')).replace(/[_\-.]+/g, ' ').trim();
  if (!s) return '';
  if (/(?:^|\s)(xail|xayl|khail|horse|equine)(?:\s|$)/.test(s)) return 'horse';
  if (/(?:^|\s)(maamel|maaml|malam|lab|labs|labor|laboratories)(?:\s|$)/.test(s)) return 'lab';
  if (/(?:^|\s)(samak|semak|fish)(?:\s|$)/.test(s)) return 'fish';
  return '';
}
/* عمود «الوحدة الفرعية/البداية» في الشيت — يُقرأ بأي رأس من الرؤوس المعروفة */
window.subStartOf = function (row) {
  if (!row) return '';
  const keys = ['sub_unit_start', 'sub_round_start', 'unit_start', 'rotation_start', 'sub_unit', 'substation_start', 'start_sub_unit'];
  for (let i = 0; i < keys.length; i++) { const v = String(row[keys[i]] || '').trim(); if (v) return v; }
  return '';
};
window.rotationOrderOf = function (row) {
  if (!row) return '';
  const keys = ['rotation_order', 'sub_rotation', 'rotation_seq', 'rotation_sequence', 'sub_units_order'];
  for (let i = 0; i < keys.length; i++) { const v = String(row[keys[i]] || '').trim(); if (v) return v; }
  return '';
};
window.parseSubRotation = function (raw, startRaw) {
  const seq = [];
  const pushTok = (tok) => { if (tok && seq.indexOf(tok) === -1) seq.push(tok); };
  String(raw || '').split(/[>→↔\/|،,]+/).forEach((part) => {
    const p = part.trim();
    if (!p) return;
    // القيمة المركبة «equine_lab_fish» تعني تسلسل القسم الكامل كما في الشيت: خيل ثم معامل ثم سمك
    if (/^(equine_?labs?|horse_?lab_?fish|labs?_?equine|equine_lab_fish)$/i.test(p.replace(/\s+/g, '_'))) { ['horse', 'lab', 'fish'].forEach(pushTok); return; }
    const m = p.match(/^\d+\s*[\-–.)]\s*(.+)$/);        // "1 - معمل" ← رقم الترتيب ثم الاسم
    pushTok(subunitToken(m ? m[1] : p));
  });
  const st = subunitToken(startRaw);
  if (!seq.length && st) ['horse', 'lab', 'fish'].forEach(pushTok);   // الشيت حدد البداية فقط → التسلسل الطبيعي للقسم
  if (!seq.length) return null;
  const startIdx = st ? Math.max(0, seq.indexOf(st)) : 0;
  return { sequence: seq, start: seq[startIdx], startIdx };
};
window.subUnitBlocksForOrder = function (order) {
  const d = getRoundDates(order);
  if (!d.start || !d.end) return null;
  const DAY = 86400000;
  const t0 = Date.parse(d.start + 'T00:00:00Z'), t1 = Date.parse(d.end + 'T00:00:00Z');
  if (isNaN(t0) || isNaN(t1) || t1 < t0) return null;
  const blocks = [];
  for (let ws = t0; ws <= t1; ws += 14 * DAY) {
    const we = Math.min(ws + 13 * DAY, t1);
    blocks.push({ start: dateInTZ(new Date(ws)), end: dateInTZ(new Date(we)), idx: blocks.length });
  }
  return blocks.length ? { start: d.start, end: d.end, blocks } : null;
};
window.subUnitAtDate = function (rot, order, dateStr) {
  if (!rot) return null;
  const info = subUnitBlocksForOrder(order);
  if (!info) return null;
  const seq = rot.sequence, L = seq.length;
  const off = ((rot.startIdx || 0) % L + L) % L;       // نقطة انطلاق الشيت (مثلاً "يبدأ معامل")
  const day = Date.parse(dateStr + 'T00:00:00Z');
  let bi = -1;
  info.blocks.forEach((b, i) => {
    const bs = Date.parse(b.start + 'T00:00:00Z'), be = Date.parse(b.end + 'T00:00:00Z');
    if (day >= bs && day <= be) bi = i;
  });
  if (bi < 0) {
    const b0 = Date.parse(info.start + 'T00:00:00Z');
    if (isNaN(day) || isNaN(b0)) return null;
    bi = Math.max(0, Math.floor((day - b0) / (14 * 86400000)));
  }
  const key = seq[(off + bi) % L];
  return { key, label: SUBUNIT_NAMES[key] || key, block: info.blocks[Math.min(bi, info.blocks.length - 1)] || null, blockNo: bi + 1, totalBlocks: info.blocks.length };
};
window.studentSubUnitNow = function (student) {
  if (!student) return null;
  const rot = parseSubRotation(rotationOrderOf(student), subStartOf(student));
  if (!rot) return null;
  const gid = String(student.group_id || '').trim();
  const sched = (DB.roundSchedule || []).filter((r) => String(r.group_id) === gid);
  const today = getTodayStr();
  let row = sched.find((r) => { const s = formatDate(r.start_date), e = formatDate(r.end_date); return s && e && today >= s && today <= e; }) || sched[sched.length - 1];
  if (!row) return null;
  const at = subUnitAtDate(rot, row.round_order, today);
  return at ? Object.assign({}, at, { round_order: row.round_order, sequence: rot.sequence }) : null;
};
window.subUnitSeqLabel = function (seq) { return (seq || []).map((k) => SUBUNIT_NAMES[k] || k).join(' › '); };

/* خريطة الجروبات داخل قسم «خيل ومعامل وسمك»: بداية التدوير تُقرأ من كشف الطلاب
   (أي صف في القسم يحمل sub_unit_start/rotation_order لجروبه)، أو من جدول الجروبات.
   بدون أي قيم ثابتة في الكود — المصدر دائماً الشيت. */
window.getEquineGroupRot = function (gid) {
  DB = DB || {};
  const key = String(gid == null ? '' : gid).trim();
  if (!key) return null;
  if (!window._eqRotMap) {
    const map = {};
    (DB.students || []).forEach((s) => {
      const g = String(s.group_id || '').trim(); if (!g || map[g]) return;
      const rot = parseSubRotation(rotationOrderOf(s), subStartOf(s));
      if (rot) map[g] = rot;
    });
    (DB.groups || []).forEach((gr) => {
      const g = String(gr.group_id || '').trim(); if (!g || map[g]) return;
      const rot = parseSubRotation(rotationOrderOf(gr), subStartOf(gr));
      if (rot) map[g] = rot;
    });
    window._eqRotMap = map;
  }
  return window._eqRotMap[key] || null;
};
/* الوحدة الفرعية لجروب في تاريخ معين داخل راوند معيّن */
window.groupSubUnitAt = function (gid, order, dateStr) {
  const rot = getEquineGroupRot(gid);
  if (!rot) return null;
  return subUnitAtDate(rot, order, dateStr || getTodayStr());
};

/* ═══ البند 2(ج) + البند 5 — مصدر واحد لتسجيلات الوحدات لا يُصفَّر أبداً ═══
   السبب الجذري للتصفير: كان الفلتر يعتمد على round_key المطابق حرفياً لـ 'units'؛
   أي تغيير في عمود الراوند بالشيت (رأس جديد/قيمة مختلفة) يجعل كل الأعداد 0 رغم وجود
   البيانات. الآن: (1) التعرف على صف «تسجيل وحدة» بعدة علامات متساكنة،
   (2) مطابقة اسم الوحدة برؤوس بديلة (unit/station/unit_name/name)،
   (3) حارس ضد التصفير: إذا صار المجموع من الصفر بينما شيت الوحدات يقول إن هناك
   مسجلين، تُستخدم أرقام الشيت (enrolled/registered) ولا تظهر الأصفار مكان بيانات موجودة. */
window.unitRowName = function (row) {
  if (!row) return '';
  const keys = ['unit_name', 'unit', 'station', 'station_name', 'vet_unit', 'name'];
  for (let i = 0; i < keys.length; i++) { const v = String(row[keys[i]] || '').trim(); if (v) return v; }
  return '';
};
window.isUnitRegRow = function (row) {
  if (!row) return false;
  const rk = normRoundKey(row.round_key || '');
  if (rk === 'units') return true;
  const ro = normRoundOrder(row.round_order);
  const hasUnit = !!unitRowName(row);
  if (hasUnit && (!ro || ro === '1')) return true;            // ورقتنا التاريخية: تسجيلات الوحدات = راوند 1 بلا round_key مفهوم
  return false;
};
window.getUnitAssignments = function () {
  const fp = (typeof _lastFp !== 'undefined' && _lastFp) || ((DB.students || []).length + ':' + (DB.assignments || []).length);
  if (window._unitRegsCache && window._unitRegsCache.fp === fp) return window._unitRegsCache.rows;
  let rows = (DB.assignments || []).filter(isUnitRegRow).map((r) => Object.assign({}, r, { unit_name: unitRowName(r) }));
  // الحارس: كشف صامت فارغ بينما شيت الوحدات نفسه يعلن تسجيلات → نبني الكشف من أرقام الشيت بدل عرض 0
  const sheetSum = (DB.stationsUnits || []).reduce((a, u) => a + (parseInt(u.registered !== undefined && u.registered !== '' ? u.registered : u.enrolled, 10) || 0), 0);
  if (!rows.length && sheetSum > 0) {
    const byGid = {};
    (DB.students || []).forEach((s) => { const g = String(s.group_id || '').trim(); if (g) (byGid[g] = byGid[g] || []).push(s); });
    (DB.stationsUnits || []).forEach((u) => {
      const reg = parseInt(u.registered !== undefined && u.registered !== '' ? u.registered : u.enrolled, 10) || 0;
      const gid = cleanGroupId(u.group_id || u.group || '');
      const pool = byGid[gid] || [];
      for (let i = 0; i < Math.min(reg, pool.length); i++) {
        rows.push({ group_id: gid, code_short: pool[i].code_short, full_name: pool[i].full_name, gender: pool[i].gender, unit_name: unitRowName(u) || String(u.unit_name || '').trim(), _fromSheet: true });
      }
    });
  }
  window._unitRegsCache = { fp, rows };
  return rows;
};

/* ───────────────────────── 3) قيم ومسميات ───────────────────────── */

window.cleanGroupId = function (val) {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (!str) return '';
  const num = parseFloat(str);
  return isNaN(num) ? str : String(Math.round(num));
};

window.normGender = function (g) {
  const s = String(g || '').trim().toUpperCase();
  if (s === 'F' || s === 'أنثى' || s === 'انثى' || s.startsWith('FEM')) return 'F';
  if (s === 'M' || s === 'ذكر' || s.startsWith('MAL')) return 'M';
  return '';
};

window.formatPhone = function (phone) {
  let p = String(phone === null || phone === undefined ? '' : phone).trim();
  if (/^\d+\.0+$/.test(p)) p = p.replace(/\.0+$/, '');
  p = p.replace(/\D/g, '');
  if (!p) return '';
  if (p.startsWith('0020')) p = p.slice(4);
  if (p.startsWith('20') && p.length === 12) p = p.slice(2);
  if (p.length === 10 && p.startsWith('1')) p = '0' + p;     // الصفر الأول يضيع في Google Sheets
  return p;
};
window.waLink = function (phone) {
  const p = formatPhone(phone);
  return p ? 'https://wa.me/' + (p.startsWith('0') ? '20' + p.slice(1) : p) : '';
};

window.getInitials = function (name) {
  if (!name) return '؟';
  const parts = String(name).trim().split(/\s+/);
  return parts.length === 1 ? parts[0].substring(0, 2) : parts[0].substring(0, 1) + parts[1].substring(0, 1);
};

/* خريطة aliases — احتياطية فقط إن غيّرت أسماء المفاتيح في جدول Google.
   الأسماء العربية المعروضة تُقرأ من تبويب 03_rounds_overview أولاً،
   ثم من مفاتيح config.js ROUND_ALIASES — والكود هنا لا يحتاج أي تعديل. */
const ROUND_ALIAS_FALLBACK = {
  veterinary_units: 'units', vet_units: 'units', units: 'units', round1_units: 'units',
  departments: 'college', college_depts: 'college', college: 'college', round4_college: 'college',
  poultry: 'poultry', poultry_round: 'poultry', round5_poultry: 'poultry',
  slaughterhouse: 'slaughter', food_safety: 'slaughter', slaughter_food: 'slaughter', slaughter: 'slaughter', round3_slaughter: 'slaughter',
  equine_labs: 'equine_lab_fish', horse_lab_fish: 'equine_lab_fish', labs_equine: 'equine_lab_fish', equine_lab_fish: 'equine_lab_fish',
  elective: 'elective', elective_training: 'elective', round6_elective: 'elective'
};
window.normRoundKey = function (key) {
  const raw = String(key === null || key === undefined ? '' : key).trim();
  if (!raw) return '';
  const alias = (CFG().ROUND_ALIASES || {});
  if (alias[raw]) return normRoundKey(alias[raw]);                    // مخصص من config أولاً (ثم تكرار آمن)
  if (ROUND_ALIAS_FALLBACK[raw]) return ROUND_ALIAS_FALLBACK[raw];
  const s = raw.toLowerCase().replace(/[\s\-]+/g, '_').replace(/[^\w]/g, '');
  if (/^(round|rwand|دورة|راوند)[_]?/.test(s)) {                      // "round2_x" → "x"
    const rest = s.replace(/^(round|rwand)[_]?[0-9]*[_]?/, '');
    if (rest && ROUND_ALIAS_FALLBACK[rest]) return ROUND_ALIAS_FALLBACK[rest];
  }
  if (/^(r|rwand)[_]?(1|2)$/.test(s)) return s === 'r2' || s === 'r_2' ? 'units' : 'college';   // R1/R2 كما في الشيت
  if (/^r[_]?3$/.test(s)) return 'poultry';
  if (/^r[_]?4$/.test(s)) return 'slaughter';
  if (/unit|وحدة|وحدات/.test(s)) return 'units';
  if (/poultry|دواجن|دجاج/.test(s)) return 'poultry';
  if (/slaughter|food|مجزر|مجازر|غذاء/.test(s)) return 'slaughter';
  if (/equine|horse|lab|fish|خيل|معامل|سمك/.test(s)) return 'equine_lab_fish';
  if (/college|depart|قسم|اقسام|كلية/.test(s)) return 'college';
  if (/elective|اختياري/.test(s)) return 'elective';
  return raw;                                                          // مجال جديد — يُعرض باسمه العربي من الجدول كما هو
};

/* ── مصادر التواريخ (03_rounds_overview · 09_round_dates · config) مفهرسة برقم الدورة ──
   تُبنى داخل buildDB — وتُستخدم لحل رقم الدورة عندما يكون عمود round_order فارغاً أو نصياً. */
window.__roundDateInfo = {};

/* حسم رقم الدورة لأي صف schedule/assignments/unregistered — بلا اعتماد على مسمى المفتاح:
   1) round_order إن كان رقمة مفهوماً  2) اسم الراوند العربي (تاني/ثالث …)  3) مفتاح راوند معروف
   4) تطابق تام مع مصدر تواريخ (اسم/مفتاح)  — وإلا '' (غير محدد). */
window.resolveRoundOrder = function (row) {
  const o = normRoundOrder(row && row.round_order);
  if (o) return o;
  const name = normAr(String((row && row.round_name_ar) || ''));
  if (name) {
    const nm = name.match(/(?:راوند|دورة|round)\s*([0-9]+)/);
    if (nm) return String(+nm[1]);
    const words = { 'الاولى': '1', 'الثانية': '2', 'الثالثة': '3', 'الرابعة': '4', 'الخامسة': '5', 'السادسة': '6' };
    for (const k in words) { if (name.indexOf(k) > -1) return words[k]; }
  }
  const rk = normRoundKey(String((row && row.round_key) || ''));
  if (rk && ROUND_META[rk]) {
    const idx = ROUND_ORDER.indexOf(rk);
    if (rk === 'elective') return '0';
    if (idx > -1 && idx < 6) return String(idx + 1);                  // units→1 · equine→2 · poultry→3 · slaughter→4 · college→5
  }
  const info = window.__roundDateInfo || {};
  for (const ord in info) {
    const it = info[ord] || {};
    if ((it.name && name && it.name === name) || (it.key && rk && it.key === rk)) return String(ord);
  }
  return '';
};

/* تطبيع رقم الدورة: "R2" · "2" · "round 2" · "الدورة الثانية" → '2' (أو '0' للاختياري) */
window.normRoundOrder = function (v) {
  const s = normAr(String(v === null || v === undefined ? '' : v));
  if (!s) return '';
  const m = s.match(/(?:r(?:ound)?|دورة|راوند|rwand)\s*([0-9٠-٩]+)/);
  if (m) return String(+m[1].replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const d = s.match(/^([0-9٠-٩]+)/);
  if (d) return String(+d[1].replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)));
  const words = { 'الاولى': '1', 'الثانية': '2', 'الثالثة': '3', 'الرابعة': '4', 'الخامسة': '5', 'السادسة': '6' };
  for (const k in words) { if (s.indexOf(k) > -1) return words[k]; }
  return '';
};

window.ROUND_META = {
  units:           { icon: 'hospital',   svg: true, label: 'وحدات بيطرية',       cls: 'badge-round-units', tone: 'tone-teal' },
  college:         { icon: 'landmark',   svg: true, label: 'أقسام الكلية',       cls: 'badge-round-college', tone: 'tone-rust' },
  poultry:         { icon: 'chicken',    svg: true, label: 'دواجن',              cls: 'badge-round-poultry', tone: 'tone-green' },
  slaughter:       { icon: 'meat',       svg: true, label: 'مجازر وسلامة غذاء', cls: 'badge-round-slaughter', tone: 'tone-mustard' },
  equine_lab_fish: { icon: 'microscope', svg: true, label: 'خيل ومعامل وسمك',    cls: 'badge-round-equine', tone: 'tone-navy' },
  elective:        { icon: 'star',       svg: true, label: 'تدريب اختياري',      cls: 'badge-round-elective', tone: 'tone-olive' }
};
// إرجاع أيقونة SVG موحّدة لراوند (مع fallback للرموز القديمة إن وُجدت)
window.roundIcon = function (rKey, chip) {
  const meta = (window.ROUND_META && ROUND_META[rKey]) || null;
  const name = meta ? meta.icon : 'pin';
  if (chip) return `<span class="ico-chip ${meta && meta.tone ? meta.tone : 'tone-gold'}" aria-hidden="true">${iconSvg(name)}</span>`;
  return iconSvg(name);
};
window.ROUND_ORDER = ['units', 'equine_lab_fish', 'poultry', 'slaughter', 'college', 'elective', 'unknown'];

window.roundLabel = function (key) {
  const k = normRoundKey(key);
  return (DB.roundNames && (DB.roundNames[k] || DB.roundNames[key])) || (ROUND_META[k] && ROUND_META[k].label) || String(key || '').trim() || 'غير محدد';
};

window.statusBadge = function (status) {
  const map = { current: ['badge-plum', 'جارٍ الآن'], upcoming: ['badge-grey', 'قادم'], finished: ['badge-emerald', 'انتهى'] };
  const m = map[status] || ['badge-grey', status || 'غير محدد'];
  return `<span class="badge ${m[0]}">${m[1]}</span>`;
};

window.animateCountUp = function (el, target, duration) {
  if (!el) return;
  target = Number(target) || 0;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = target; return; }
  const start = performance.now(); duration = duration || 600;
  (function step(now) {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step); else el.textContent = target;
  })(start);
};

/* ───────────────────────── 4) طبقة البيانات (API + كاش) ───────────────────────── */

const SHEETS = {
  students: '01_students', groups: '02_groups', roundsOverview: '03_rounds_overview', roundSchedule: '04_round_schedule',
  stationsUnits: '05_stations_units_draft', assignments: '06_assignments_round2', unregistered: '07_unregistered_round2',
  round2Summary: '08_round2_summary', roundDates: '09_round_dates', fields: '10_fields',
  issues: '00_data_issues', issuesR2: '00_data_issues_round2'
};
const REQUIRED = ['students', 'groups', 'roundSchedule', 'assignments', 'unregistered', 'round2Summary', 'stationsUnits', 'fields'];
const CACHE_KEY = 'imtiaz_data_cache_v2';

function normKey(k) { return String(k === null || k === undefined ? '' : k).replace(/^\uFEFF/, '').trim(); }
function normCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v).replace(/^\uFEFF/, '').trim();
  if (/^-?\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');      // 6.0 → 6
  return s;
}
function toRows(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    if (raw.length && Array.isArray(raw[0])) {                  // [[header...],[row...]]
      const head = raw[0].map(normKey);
      return raw.slice(1).map((r) => { const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; });
    }
    return raw.filter((r) => r && typeof r === 'object' && !Array.isArray(r));
  }
  if (typeof raw === 'object') {
    if (raw.error) throw new Error(String(raw.error));
    const k = ['data', 'rows', 'values', 'result'].find((x) => Array.isArray(raw[x]));
    if (k) return toRows(raw[k]);
  }
  return [];
}
function normalizeRows(raw) {
  return toRows(raw)
    .map((r) => { const o = {}; Object.keys(r).forEach((k) => { o[normKey(k)] = normCell(r[k]); }); return o; })
    .filter((o) => Object.keys(o).some((k) => o[k] !== ''));    // يحذف الصفوف الفارغة (شائعة في Google Sheets)
}

function parseCSV(text) {                                       // احتياطي للتجربة المحلية فقط
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] || '') !== '');
}

async function fetchSheetRaw(name) {                                  // بدون فحص القفل — يُستخدم لبوابة الحسابات
  const base = CFG().API_URL;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CFG().REQUEST_TIMEOUT_MS || 30000);
  try {
    if (!base) {
      const res = await fetch('./data/' + name + '.csv', { signal: ctl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return normalizeRows(parseCSV(await res.text()));
    }
    let url = base + (base.indexOf('?') > -1 ? '&' : '?') + 'sheet=' + encodeURIComponent(name);
    const tk = (CFG().GATE && CFG().GATE.API_TOKEN) || '';
    if (tk) url += '&key=' + encodeURIComponent(tk);   // مفتاح Apps Script إن كان مفعّلاً
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', cache: 'no-store' });   // بدون headers مخصصة = بدون preflight
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { throw new Error('الرد ليس JSON (تأكد أن Apps Script منشور لـ "Anyone")'); }
    return normalizeRows(json);
  } finally { clearTimeout(timer); }
}

window.__gateFetchSheet = fetchSheetRaw;                                // حقن دالة التحقق في البوابة

async function fetchSheet(name) {
  if (!Gate.isUnlocked()) throw new Error('LOCKED');                    // لا طلب بيانات قبل الدخول
  return fetchSheetRaw(name);
}

async function fetchSheetRetry(name) {
  try { return await fetchSheet(name); }
  catch (e1) { await new Promise((r) => setTimeout(r, 800)); return fetchSheet(name); }
}

async function fetchAllSheets() {
  const keys = Object.keys(SHEETS);
  const settled = await Promise.allSettled(keys.map((k) => fetchSheetRetry(SHEETS[k])));
  const sheets = {}, errors = {};
  settled.forEach((r, i) => { if (r.status === 'fulfilled') sheets[keys[i]] = r.value; else errors[keys[i]] = (r.reason && r.reason.message) || 'فشل'; });
  return { sheets, errors };
}

function readCache() {
  if (!CFG().OFFLINE_CACHE) return null;
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return c && c.sheets ? c : null; } catch (e) { return null; }
}
function writeCache(sheets) {
  if (!CFG().OFFLINE_CACHE) return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), sheets })); } catch (e) { /* الذاكرة ممتلئة — لا مشكلة */ }
}
function hasRequired(sheets) { return REQUIRED.every((k) => Array.isArray(sheets[k])); }

function buildDB(S) {
  const g = (k) => S[k] || [];
  /* ── تطبيع رؤوس الأعمدة العربية الشائعة → أسماء الحقول التي تعتمد عليها اللوحة ──
     (يُطبَّق على كل شيت؛ لا يمس عموداً إن لم يكن الرأس مطابقاً، فلا كسر للراسلين حالياً) */
  const AR_COLS = {
    'رقم_الجروب': 'group_id', 'رقم_المجموعة': 'group_id', 'المجموعة': 'group_id', 'الجروب': 'group_id',
    'اسم_الجروب': 'group_name', 'اسم_المجموعة': 'group_name',
    'عدد_الطلاب': 'total_students', 'اجمالي_الطلاب': 'total_students', 'إجمالي_الطلاب': 'total_students', 'القوام': 'total_students',
    'رقم_الدورة': 'round_order', 'ترتيب_الدورة': 'round_order', 'الدورة_برقمها': 'round_order',
    'راوند': 'round_key', 'مفتاح_الراوند': 'round_key', 'الراوند': 'round_key',
    'اسم_الراوند': 'round_name_ar', 'اسم_الدورة': 'round_name_ar',
    'كود_الطالب': 'code_short', 'الكود': 'code_short',
    'اسم_الطالب': 'full_name', 'الاسم': 'full_name', 'اسم_الطالب_كاملا': 'full_name', 'اسم_الطالب_بالكامل': 'full_name',
    'النوع': 'gender', 'الجنس': 'gender',
    'الهاتف': 'phone', 'رقم_الهاتف': 'phone', 'موبايل': 'phone',
    'الرقم_القومي': 'national_id',
    'تاريخ_البداية': 'start_date', 'من': 'start_date',
    'تاريخ_النهاية': 'end_date', 'إلى': 'end_date', 'الي': 'end_date',
    'الوحدة': 'unit_name', 'الوحدة_البيطرية': 'unit_name', 'اسم_الوحدة': 'unit_name',
    'المحافظة': 'governorate',
    'المسجلون': 'registered', 'عدد_المسجلين': 'registered', 'المقيدين': 'registered', 'المقيدون': 'registered',
    'غير_المسجلين': 'not_registered',
    'المتوقعون': 'expected_students', 'عدد_المتوقعين': 'expected_students',
    'الطاقة_الاستيعابية': 'capacity', 'السعة': 'capacity',
    'الحالة': 'status', 'البند': 'metric', 'القيمة': 'value',
    'عدد_البنات': 'females', 'عدد_البنين': 'males'
  };
  const canonArKey = function (k) {
    const kk = normKey(k).replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/\s+/g, '_');
    if (AR_COLS[kk]) return AR_COLS[kk];
    const bare = kk.replace(/[أإ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
    if (AR_COLS[bare]) return AR_COLS[bare];
    for (const a in AR_COLS) {
      const b = a.replace(/[أإ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
      if (b === bare) return AR_COLS[a];
    }
    return null;
  };
  // تطبيع مفاتيح الحقول: مسافات/ZWSP/BOM/Case — حتى لا تنكسر اللوحة عند تعديل رأس العمود في الجدول
  const canonCols = {};
  (g('fields') || []).forEach((f) => {
    const col = normKey(f.column); if (!col) return;
    const c = col.toLowerCase().replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/\s+/g, '_');
    if (!canonCols[c]) canonCols[c] = col;
  });
  const fixRow = (r) => {
    const o = Object.assign({}, r);
    Object.keys(o).forEach((k) => {
      const c = normKey(k).toLowerCase().replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/\s+/g, '_');
      if (canonCols[c] && canonCols[c] !== k) { if (o[canonCols[c]] === undefined) o[canonCols[c]] = o[k]; delete o[k]; }
    });
    Object.keys(o).forEach((k) => {
      const mapped = canonArKey(k);
      if (mapped && mapped !== k && o[mapped] === undefined) { o[mapped] = o[k]; delete o[k]; }
    });
    return o;
  };
  // قوام الجروب من كشف الطلاب نفسه (أدق من عمود إجمالي قد يكون قديماً في جدول الجروبات)
  const rosterCount = {};
  g('students').map(fixRow).forEach((r) => { const gid = cleanGroupId(r.group_id); if (gid) rosterCount[gid] = (rosterCount[gid] || 0) + 1; });

  DB.students = g('students').map((r) => { r = fixRow(r); return { ...r, group_id: cleanGroupId(r.group_id), gender: normGender(r.gender) }; });
  DB.groups = g('groups').map((r) => {
    r = fixRow(r);
    const gid = cleanGroupId(r.group_id);
    const declared = parseInt(r.total_students, 10) || 0;
    const actual = rosterCount[gid] || 0;
    return { ...r, group_id: gid, total_students: String(actual > 0 ? actual : declared), _declared_total: String(declared) };
  }).sort((a, b) => (+a.group_id || 0) - (+b.group_id || 0));
  DB.roundsOverview = g('roundsOverview').map(fixRow);
  /* ── فهرسة مصادر التواريخ برقم الدورة (03 + 09 + config) — تُبنى أولاً لأن حسم
     رقم صفّ الجدول قد يعتمد على مطابقة الاسم/المفتاح مع مصدر التواريخ ── */
  const dateInfo = {};
  const putDateInfo = (ord, key, nameAr) => {
    ord = normRoundOrder(ord);
    if (!ord) return;
    const it = dateInfo[ord] || (dateInfo[ord] = { key: '', name: '' });
    if (key) it.key = normRoundKey(key);
    if (nameAr) it.name = normAr(nameAr);
  };
  DB.roundsOverview.forEach((r) => putDateInfo(r.round_order, r.round_key, r.round_name_ar));
  g('roundDates').forEach((r) => { r = fixRow(r); putDateInfo(r.round_order, r.round_key, r.round_name_ar); });
  Object.keys(CFG().DEFAULT_ROUND_DATES || {}).forEach((ord) => putDateInfo(ord, '', ''));
  window.__roundDateInfo = dateInfo;

  /* تطبيع جداول الدورة: round_key مرِنّ، رقم الدورة يُحسم من أي مسميات في الشيت
     ('' · 'R1' · 'راوند ٢' · 'الدورة الثانية')، واسم الراوند لا يضيع */
  const normRoundRow = (r) => {
    r = fixRow(r);
    const o = { ...r, round_key: normRoundKey(r.round_key), group_id: cleanGroupId(r.group_id) };
    const ord = resolveRoundOrder(o);
    if (ord) o.round_order = ord;
    if (!o.round_name_ar && o.round_key) o.round_name_ar = window.ROUND_LABELS[o.round_key] || '';
    return o;
  };
  DB.roundSchedule = g('roundSchedule').map(normRoundRow);
  DB.stationsUnits = g('stationsUnits').map(fixRow);
  DB.assignments = g('assignments').map((r) => { r = normRoundRow(r); r.gender = normGender(r.gender); return r; });
  DB.unregistered = g('unregistered').map((r) => { r = normRoundRow(r); r.gender = normGender(r.gender); return r; });
  DB.round2Summary = g('round2Summary').map((r) => { r = fixRow(r); return { ...r, round_key: normRoundKey(r.round_key) }; });
  /* ملخص الدورة الثانية: شيت بمقاييس صفّية (metric/value) أو جدول راوندات — كلاهما مدعوم */
  if (!DB.round2Summary.some((r) => r.registered || r.not_registered)) {
    const m = {};
    DB.round2Summary.forEach((r) => {
      const k = normKey(r.metric).replace(/\s+/g, '_').toLowerCase();
      m[k] = parseInt(normCell(r.value), 10) || 0;
    });
    if ('registered' in m || 'not_registered' in m) {
      DB.round2Summary = [{ round_key: '', registered: String(m.registered || 0), not_registered: String(m.not_registered || 0) }];
    }
  }
  DB.roundDates = g('roundDates').map(fixRow);
  DB.fields = g('fields').map(fixRow);
  DB.issues = g('issues').map(fixRow);
  DB.issuesR2 = g('issuesR2').map(fixRow);

  DB.fieldsMap = {}; DB.fields.forEach((f) => { DB.fieldsMap[f.column] = f.name_ar; });
  DB.prefColumns = DB.fields.map((f) => f.column).filter((c) => /^pref_/.test(c));
  if (!DB.prefColumns.length) DB.prefColumns = ['pref_Poultry', 'pref_Equine', 'pref_Pharma_Vaccines', 'pref_FoodSafety_QC', 'pref_LargeAnimal', 'pref_SmallAnimal'];

  DB.roundNames = {};
  [DB.roundsOverview, DB.roundSchedule, DB.round2Summary].forEach((list) => list.forEach((r) => { if (r.round_key && r.round_name_ar) DB.roundNames[normRoundKey(r.round_key)] = r.round_name_ar; }));

  DB.studentLookup = {};
  DB.students.forEach((s) => {
    if (s.student_code) DB.studentLookup[s.student_code] = s;
    if (s.group_id && s.code_short) DB.studentLookup[s.group_id + '_' + s.code_short] = s;
  });

  DB.roundMatrix = {};
  DB.roundSchedule.forEach((item) => {
    const key = item.round_order + '_' + item.round_key;
    if (!DB.roundMatrix[key]) DB.roundMatrix[key] = { round_order: item.round_order, round_key: item.round_key, round_name_ar: item.round_name_ar, groups: [], total_students: 0 };
    const gInfo = DB.groups.find((x) => String(x.group_id) === String(item.group_id));
    const count = gInfo ? parseInt(gInfo.total_students, 10) || 0 : 0;
    DB.roundMatrix[key].groups.push({ group_id: item.group_id, count });
    DB.roundMatrix[key].total_students += count;
  });
}

window.resolveStudent = function (row) {
  if (!row) return null;
  if (row.student_code && DB.studentLookup[row.student_code]) return DB.studentLookup[row.student_code];
  const g = cleanGroupId(row.group_id), c = String(row.code_short || '').trim();
  if (g && c && DB.studentLookup[g + '_' + c]) return DB.studentLookup[g + '_' + c];
  return null;
};
window.studentKey = function (s) { return s.student_code || (s.group_id + '_' + s.code_short); };

/* ───────────────────────── 5) النوافذ (مع زر الرجوع في الهاتف) ───────────────────────── */

window.Overlays = (function () {
  const stack = []; let ignore = 0;
  const lock = () => document.body.classList.toggle('no-scroll', stack.length > 0);
  const push = () => { try { history.pushState({ ov: stack.length }, '', location.href); } catch (e) { /* ignore */ } };

  function open(el, replace) {
    if (replace && stack.length) { stack.pop().remove(); document.body.appendChild(el); stack.push(el); lock(); return el; }   // نعيد استخدام نفس خانة التاريخ
    document.body.appendChild(el); stack.push(el); push(); lock(); return el;
  }
  function closeTop(fromPop) {
    const el = stack.pop(); if (!el) return false;
    el.remove(); lock();
    if (!fromPop) { try { ignore++; history.back(); } catch (e) { ignore--; } }
    return true;
  }
  function closeEl(el) {
    const i = stack.indexOf(el);
    if (i === -1) { el.remove(); return; }
    if (i === stack.length - 1) closeTop(false); else { stack.splice(i, 1); el.remove(); lock(); }
  }
  function closeAll() {
    const n = stack.length; if (!n) return;
    while (stack.length) stack.pop().remove();
    lock();
    try { ignore++; history.go(-n); } catch (e) { ignore--; }
  }
  window.addEventListener('popstate', () => { if (ignore > 0) { ignore--; return; } closeTop(true); });
  return { open, closeTop, closeEl, closeAll, count: () => stack.length };
})();

window.openModal = function (title, bodyHTML, opts) {
  opts = opts || {};
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-box ${opts.cls || ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-header"><h2 class="modal-title">${esc(title)}</h2><button type="button" class="modal-close" data-action="close-overlay" aria-label="إغلاق">${iconSvg('x')}</button></div>
    <div class="modal-body">${bodyHTML}</div></div>`;
  Overlays.open(overlay, opts.replace);
  return overlay;
};

// زر عام قابل للضغط داخل أي نافذة/صفحة — يستخدم نفس معالج الضغطات الموحّد
window.btn = function (label, action, data, cls) {
  let s = `<button type="button" class="btn ${cls || 'btn-plum'}" data-action="${esc(action)}"`;
  Object.keys(data || {}).forEach((k) => { if (data[k] !== undefined && data[k] !== null) s += ` data-${k}="${esc(data[k])}"`; });
  return s + `>${label}</button>`;
};

/* ───────────────────────── 6) قوائم الطلاب ───────────────────────── */

window._rawRows = [];

// يتكرر في كل نافذة: منع تمرير الصفحة خلف النافذة + إخفاء بحث الهيدر على الهاتف
document.addEventListener('click', (e) => {
  const box = e.target.closest && e.target.closest('.modal-box');
  if (box) box.style.overflowY = 'auto';
});

window.renderStudentListModal = function (title, rows, opts) {
  opts = opts || {};
  const items = (rows || []).filter(Boolean).map((row) => {
    const s = resolveStudent(row);
    const src = s || row;
    const g = normGender(src.gender || row.gender);
    let attrs;
    if (s) attrs = act('student', { sid: studentKey(s) });
    else { window._rawRows.push(row); attrs = act('raw-student', { ri: window._rawRows.length - 1 }); }
    const sub = [src.group_id ? 'جروب ' + src.group_id : 'بدون جروب', src.code_short ? 'كود ' + src.code_short : '', row.unit_name || ''].filter(Boolean).join(' · ');
    return { attrs, name: src.full_name || row.full_name || 'غير محدد', sub, g, search: normAr((src.full_name || '') + ' ' + (src.code_short || '') + ' ' + (src.student_code || '') + ' ' + (src.group_id ? 'جروب ' + src.group_id : '')) };
  });

  const html = `
    ${opts.breadcrumb ? `<div class="breadcrumb-bar">${esc(opts.breadcrumb)}</div>` : ''}
    <div class="list-toolbar">
      <input type="search" class="table-search grow" placeholder="بحث في القائمة…" data-filter-list="#student-list-body" autocomplete="off" enterkeyhint="search">
      <span class="badge badge-plum num" id="list-count">${items.length}</span>
    </div>
    <div class="slist" id="student-list-body">
      ${items.length ? items.map((it) => `
        <div class="slist-row" data-s="${esc(it.search)}"${it.attrs}>
          <div class="initials-avatar">${esc(getInitials(it.name))}</div>
          <div class="slist-main"><div class="slist-name">${esc(it.name)}</div><div class="slist-sub">${esc(it.sub)}</div></div>
          <span class="slist-g ${it.g === 'F' ? 'gender-f' : it.g === 'M' ? 'gender-m' : ''}">${it.g === 'F' ? iconSvg('female') : it.g === 'M' ? iconSvg('male') : ''}</span>
          <span class="slist-arrow" aria-hidden="true">${iconSvg('chevron')}</span>
        </div>`).join('') : '<div class="empty-note">لا توجد أسماء في هذه القائمة.</div>'}
    </div>`;
  return openModal(title, html, { replace: opts.replace, cls: 'modal-list' });
};

window.openStudentDirectoryModal = function () { return renderStudentListModal('دليل طلاب الدفعة', DB.students, { breadcrumb: 'الرئيسية › الدليل' }); };
window.openGroupRosterModal = function (groupId, opts) {
  return renderStudentListModal(`طلاب جروب ${groupId}`, DB.students.filter((s) => String(s.group_id) === String(groupId)), opts);
};

// فلترة أي قائمة (data-filter-list) أثناء الكتابة
document.addEventListener('input', (e) => {
  const inp = e.target.closest && e.target.closest('[data-filter-list]');
  if (!inp) return;
  const q = normAr(inp.value);
  const list = document.querySelector(inp.getAttribute('data-filter-list'));
  if (!list) return;
  let shown = 0;
  list.querySelectorAll('[data-s]').forEach((r) => { const ok = !q || r.getAttribute('data-s').indexOf(q) > -1; r.style.display = ok ? '' : 'none'; if (ok) shown++; });
  const c = document.getElementById('list-count'); if (c) c.textContent = shown;
});

window.openUnknownStudent = function (row, opts) {
  const rows = [['الاسم', row.full_name], ['الكود', row.code_short], ['الجروب', row.group_id || 'غير محدد'], ['الوحدة / الراوند', row.unit_name || roundLabel(row.round_key)], ['الهاتف', formatPhone(row.phone)], ['ملاحظة', row.issue]].filter((r) => r[1]);
  openModal('بيانات الطالب', `<div class="alert-item alert-amber static" style="margin-bottom:12px"><span class="alert-icon">${ico('info')}</span><div>هذا الاسم غير موجود في ملفات الجروبات، لذلك لا يتوفر له ملف كامل.</div></div>
    <div class="kv-list">${rows.map((r) => `<div class="kv"><span>${esc(r[0])}</span><strong>${esc(r[1])}</strong></div>`).join('')}</div>`, opts);
};

/* ───────────────────────── 7) ملف الطالب ───────────────────────── */

function buildStudentJourney(student) {
  const gid = student.group_id;
  const sched = DB.roundSchedule.filter((r) => String(r.group_id) === String(gid));
  const find = (o) => sched.find((r) => String(r.round_order) === String(o)) || {};
  const mine = DB.assignments.filter((a) => (student.student_code && a.student_code === student.student_code) || (gid && String(a.group_id) === String(gid) && String(a.code_short).trim() === String(student.code_short).trim()));
  const isMissing = DB.unregistered.some((u) => (gid && String(u.group_id) === String(gid) && String(u.code_short).trim() === String(student.code_short).trim()));

  const step = (order, title, fallbackName, station) => {
    const r = find(order); const d = getRoundDates(order);
    const start = formatDate(r.start_date) || d.start, end = formatDate(r.end_date) || d.end;
    return { roundName: `${title} — ${r.round_name_ar || fallbackName}`, dates: start ? `${start} إلى ${end}` : 'غير متاح', station, status: computeStatus(start, end) };
  };
  const r2stationText = (m, miss) => m.length
    ? m.map((a) => a.unit_name || a.round_name_ar || 'مسجل').filter((v, i, arr) => arr.indexOf(v) === i).join(' + ')
    : (miss ? 'غير مسجل' : 'غير مسجل');
  // محطة الدورة الحالية لكل طالب — تُقرأ من جدول الجروبات تلقائياً (تعمل لأي دورة قادمة بدون تعديل كود)
  const todayStr = getTodayStr();
  let curRow = sched.find((r) => { const s = formatDate(r.start_date), e = formatDate(r.end_date); return s && e && todayStr >= s && todayStr <= e; });
  if (!curRow) {
    const upcoming = sched.filter((r) => formatDate(r.start_date) && todayStr < formatDate(r.start_date))
                          .sort((a, b) => formatDate(a.start_date) < formatDate(b.start_date) ? -1 : 1);
    curRow = upcoming[0] || sched[sched.length - 1] || null;
  }
  let curStation = 'لم يُحدد بعد';
  if (curRow) {
    const o = String(curRow.round_order);
    if (o === '2') curStation = r2stationText(mine, isMissing);
    else if (o === '1' || curRow.round_key === 'college') curStation = curRow.round_name_ar || roundLabel(curRow.round_key);
    else curStation = curRow.round_name_ar || roundLabel(curRow.round_key);
  }
  const later = 'لم يُحدد بعد';
  const d0 = getRoundDates('0');
  return [
    step(1, 'الراوند 1', 'أقسام الكلية', later),
    step(2, 'الراوند 2', 'وحدات بيطرية', r2stationText(mine, isMissing)),
    { roundName: 'الدورة الحالية (حسب الجدول)', dates: curRow && formatDate(curRow.start_date) ? `${formatDate(curRow.start_date)} إلى ${formatDate(curRow.end_date)}` : 'غير متاح', station: curStation, status: curRow ? computeStatus(formatDate(curRow.start_date) || getRoundDates(curRow.round_order).start, formatDate(curRow.end_date) || getRoundDates(curRow.round_order).end) : 'upcoming' },
    step(3, 'الراوند 3', 'دواجن', later),
    step(4, 'الراوند 4', 'مجازر / خيل', later),
    { roundName: 'تدريب اختياري', dates: d0.start ? `${d0.start} إلى ${d0.end}` : 'غير متاح', station: 'حسب اختيار الطالب', status: computeStatus(d0.start, d0.end) }
  ];
}

window.openStudentProfile = function (rawKey, opts) {
  try {
    const student = DB.studentLookup[String(rawKey).replace(/\s+/g, '')];
    if (!student) { toast('لم يتم العثور على سجل الطالب'); return; }
    closeProfileOnly();

    const phone = formatPhone(student.phone), phoneEmpty = !phone, wa = waLink(student.phone);
    const email = String(student.email || '').trim();
    const rawNid = String(student.national_id || '').trim();
    const masked = rawNid ? '••••••••••' + rawNid.slice(-4) : 'غير متوفر';
    const showNid = CFG().SHOW_NID_BY_DEFAULT && !document.body.classList.contains('presentation-mode');
    const birth = formatDate(student.birth_date), reg = formatDate(student.registered_at);
    const prefs = DB.prefColumns.map((key) => ({ arabicName: DB.fieldsMap[key] || key, rank: parseInt(student[key], 10) || 99 })).sort((a, b) => a.rank - b.rank);
    const journey = buildStudentJourney(student);
    const sid = studentKey(student);

    const panel = document.createElement('div');
    panel.id = 'profile-panel-overlay';
    panel.className = 'modal-overlay profile-overlay';
    panel.innerHTML = `
      <div class="profile-drawer" role="dialog" aria-modal="true" aria-label="ملف الطالب">
        <div class="profile-header">
          <div class="profile-head-main">
            <div class="profile-chips">
              <span class="badge ${student.gender === 'F' ? 'badge-rose' : 'badge-plum'}">${student.gender === 'F' ? 'أنثى' : student.gender === 'M' ? 'ذكر' : 'غير محدد'}</span>
              <span class="cartouche-badge-dark">جروب ${esc(student.group_id || '—')}</span>
              <span class="student-code">${esc(student.code_short || '—')}</span>
            </div>
            <div class="profile-who">
              <div class="initials-avatar lg">${esc(getInitials(student.full_name))}</div>
              <div><h2>${esc(student.full_name || 'غير محدد')}</h2><div class="profile-sub">الكود الأكاديمي: <span class="num">${esc(student.student_code || '—')}</span></div></div>
            </div>
          </div>
          <button type="button" class="modal-close" data-action="close-overlay" aria-label="إغلاق">${ico('x')}</button>
        </div>

        <div class="profile-body">
          ${student.student_notes ? `<div class="alert-item alert-amber static"><span class="alert-icon">${ico('pin')}</span><div><strong>ملاحظة إدارية:</strong> ${esc(student.student_notes)}</div></div>` : ''}

          <div class="profile-section">
            <div class="profile-section-title">${ico('id-card')} البيانات الشخصية</div>
            <div class="personal-info-card">
              <div><div class="k">الرقم القومي</div>
                <div class="v"><span id="nid-display" class="num" data-masked="${showNid ? '0' : '1'}">${esc(showNid ? rawNid || masked : masked)}</span>
                ${rawNid ? `<button type="button" class="btn btn-surface btn-sm" id="nid-toggle-btn" data-action="toggle-nid" data-sid="${esc(sid)}" aria-label="إظهار/إخفاء الرقم القومي">${showNid ? ico('eye-off') : ico('eye')}</button>` : ''}</div>
                ${student.nid_status === 'check' ? `<span class="badge badge-amber">${ico('warning')} يحتاج مراجعة</span>` : ''}</div>
              <div><div class="k">تاريخ الميلاد / السن</div><div class="v"><span class="num">${esc(birth || 'غير محدد')}</span> <small class="muted">(${esc(computeAge(birth))})</small></div></div>
              <div class="span2 divider"><span class="k">تاريخ التسجيل:</span> <strong class="num">${esc(reg || 'غير محدد')}</strong></div>
            </div>
          </div>

          <div class="profile-section hide-in-presentation">
            <div class="profile-section-title">${ico('phone')} بيانات التواصل</div>
            <div class="contact-box">
              <div class="contact-row">
                <div class="grow"><div class="k">رقم الهاتف</div>
                  <div class="v big">${phoneEmpty ? '<span class="muted">غير متوفر</span>' : `<span class="num" dir="ltr">${esc(phone)}</span>`}
                  ${student.phone_status === 'check' ? `<span class="badge badge-amber">${ico('warning')} يحتاج مراجعة</span>` : ''}</div></div>
                ${phoneEmpty ? '' : `<div class="contact-actions">
                  <a href="tel:${esc(phone)}" class="btn btn-plum btn-sm">${ico('phone')} اتصال</a>
                  <a href="${esc(wa)}" target="_blank" rel="noopener" class="btn btn-emerald btn-sm">${ico('whatsapp')} واتساب</a>
                  <button type="button" class="btn btn-surface btn-sm" data-action="copy" data-text="${esc(phone)}" data-msg="تم نسخ رقم الهاتف">${ico('copy')} نسخ</button></div>`}
              </div>
              <div class="contact-row divider-top">
                <div class="grow"><div class="k">البريد الإلكتروني</div><div class="v email">${email ? esc(email) : '<span class="muted">غير متوفر</span>'}</div></div>
                ${email ? `<div class="contact-actions">
                  <a href="mailto:${esc(email)}" class="btn btn-plum btn-sm">${ico('mail')} مراسلة</a>
                  <button type="button" class="btn btn-surface btn-sm" data-action="copy" data-text="${esc(email)}" data-msg="تم نسخ البريد">${ico('copy')} نسخ</button></div>` : ''}
              </div>
            </div>
          </div>

          <div class="profile-section">
            <div class="profile-section-title">المسار التدريبي</div>
            <div class="journey-timeline">
              ${journey.map((st) => `<div class="journey-step ${st.status}"><div class="journey-bullet"></div>
                <div class="journey-content">
                  <div class="journey-top"><span class="journey-name">${esc(st.roundName)}</span>${statusBadge(st.status)}</div>
                  <div class="journey-dates">${ico('calendar')} <span class="num">${esc(st.dates)}</span></div>
                  <div>${ico('map-pin')} موقع التدريب: <strong>${esc(st.station)}</strong></div>
                </div></div>`).join('')}
            </div>
          </div>

          <div class="profile-section">
            <div class="profile-section-title">${ico('star')} ترتيب الرغبات</div>
            <div class="pref-list">
              ${prefs.map((p, i) => `<div class="pref-item"><span class="pref-rank-badge num">#${i + 1}</span><span class="pref-name">${esc(p.arabicName)}</span><span class="pref-score">الرغبة: <strong class="num">${p.rank < 99 ? p.rank : '—'}</strong></span></div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;
    Overlays.open(panel, opts && opts.replace);
  } catch (err) { console.error(err); toast('حدث خطأ أثناء فتح الملف'); }
};

function closeProfileOnly() { const p = document.getElementById('profile-panel-overlay'); if (p) Overlays.closeEl(p); }
window.closeStudentProfile = closeProfileOnly;

/* ───────────────────────── 8) البحث الشامل ───────────────────────── */

window.openGlobalSearch = function () {
  const old = document.getElementById('search-modal-overlay'); if (old) { Overlays.closeEl(old); }
  const overlay = document.createElement('div');
  overlay.id = 'search-modal-overlay'; overlay.className = 'modal-overlay search-overlay';
  overlay.innerHTML = `<div class="search-modal-box" role="dialog" aria-modal="true" aria-label="بحث">
    <div class="search-input-wrap"><span class="search-icon" aria-hidden="true">${ico('search')}</span>
      <input type="search" id="global-search-input" class="search-box-input" placeholder="ابحث باسم الطالب أو الكود أو الهاتف أو الوحدة…" autocomplete="off" enterkeyhint="search">
      <button type="button" class="modal-close dark" data-action="close-overlay" aria-label="إغلاق">${ico('x')}</button></div>
    <div class="search-results-list" id="search-results-list"><div class="empty-note">اكتب للبحث في الطلاب والجروبات والوحدات.</div></div></div>`;
  Overlays.open(overlay);
  const input = overlay.querySelector('#global-search-input'), out = overlay.querySelector('#search-results-list');
  setTimeout(() => input.focus(), 50);

  const render = () => {
    const raw = input.value.trim(), q = normAr(raw), qd = raw.replace(/\D/g, '');
    if (!q) { out.innerHTML = '<div class="empty-note">اكتب للبحث في الطلاب والجروبات والوحدات.</div>'; return; }
    const students = DB.students.filter((s) => normAr(s.full_name).indexOf(q) > -1 || (qd.length >= 3 && (String(s.student_code).indexOf(qd) > -1 || formatPhone(s.phone).indexOf(qd) > -1)) || (qd && String(s.code_short) === qd)).slice(0, 25);
    const groups = DB.groups.filter((g) => normAr('جروب ' + g.group_id + ' ' + (g.group_name || '')).indexOf(q) > -1).slice(0, 8);
    const units = DB.stationsUnits.filter((u) => normAr(u.unit_name).indexOf(q) > -1).slice(0, 8);
    let html = '';
    if (students.length) html += `<div class="search-category-header">الطلاب (${students.length}${students.length === 25 ? '+' : ''})</div>` + students.map((s) => `
      <div class="search-result-row"${act('student', { sid: studentKey(s), replace: 1 })}>
        <div class="initials-avatar">${esc(getInitials(s.full_name))}</div><div class="grow"><strong>${esc(s.full_name)}</strong><br><small>جروب ${esc(s.group_id || '—')} · كود ${esc(s.code_short || '—')}</small></div><span class="slist-arrow">‹</span></div>`).join('');
    if (groups.length) html += '<div class="search-category-header">الجروبات</div>' + groups.map((g) => `
      <div class="search-result-row"${act('group-roster', { gid: g.group_id, replace: 1 })}><span class="cartouche-badge">جروب ${esc(g.group_id)}</span><div class="grow"><small>${esc(g.total_students || 0)} طالب/ة</small></div><span class="slist-arrow">‹</span></div>`).join('');
    if (units.length) html += '<div class="search-category-header">الوحدات</div>' + units.map((u) => `
      <div class="search-result-row"${act('goto-unit', { unit: u.unit_name })}><span>${ico("hospital")}</span><div class="grow"><strong>${esc(u.unit_name)}</strong><br><small>${esc(u.governorate || '')} · ${esc(u.registered || 0)} مقيد</small></div><span class="slist-arrow">‹</span></div>`).join('');
    out.innerHTML = html || '<div class="empty-note">لا توجد نتائج مطابقة.</div>';
  };
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = out.querySelector('[data-action]'); if (first) first.click(); } });
};

/* ───────────────────────── 9) جداول: فرز وبحث ───────────────────────── */

window.makeTableSortable = function (tableEl) {
  if (!tableEl) return;
  const headers = tableEl.querySelectorAll('th[data-col]'); let sortCol = null, dir = 1;
  headers.forEach((th) => th.addEventListener('click', () => {
    const col = th.dataset.col; if (sortCol === col) dir *= -1; else { sortCol = col; dir = 1; }
    headers.forEach((h) => h.classList.remove('sorted-asc', 'sorted-desc')); th.classList.add(dir === 1 ? 'sorted-asc' : 'sorted-desc');
    const tbody = tableEl.querySelector('tbody'); const rows = Array.from(tbody.querySelectorAll('tr'));
    const val = (r) => { const td = r.querySelector(`td[data-col="${col}"]`); return td ? (td.dataset.sort !== undefined ? td.dataset.sort : td.textContent.trim()) : ''; };
    rows.sort((a, b) => { const av = val(a), bv = val(b), an = parseFloat(av), bn = parseFloat(bv); return (!isNaN(an) && !isNaN(bn) ? an - bn : String(av).localeCompare(String(bv), 'ar')) * dir; });
    rows.forEach((r) => tbody.appendChild(r));
  }));
};
window.makeTableSearchable = function (inputEl, tableEl) {
  if (!inputEl || !tableEl) return;
  inputEl.addEventListener('input', () => { const q = normAr(inputEl.value); tableEl.querySelectorAll('tbody tr').forEach((r) => { r.style.display = !q || normAr(r.textContent).indexOf(q) > -1 ? '' : 'none'; }); });
};

/* ───────────────────────── 10) وضع العرض + التحقق ───────────────────────── */

window.togglePresentationMode = function () {
  const on = document.body.classList.toggle('presentation-mode');
  const b = document.querySelector('#presentation-btn .btn-txt'); if (b) b.textContent = on ? 'إنهاء وضع العرض' : 'وضع العرض';
};

window.VERIFY = {
  checks: [],
  add(label, countValue, getLen) { this.checks.push({ label, countValue, getLen }); },
  run() {
    if (!this.checks.length) return;
    const results = this.checks.map((c) => { const len = c.getLen(); return { label: c.label, countValue: c.countValue, listLen: len, ok: Number(c.countValue) === Number(len) }; });
    this.checks = [];
    const badge = document.getElementById('verify-badge'); if (!badge) return;
    const failed = results.filter((r) => !r.ok);
    badge.classList.remove('hidden');
    clearTimeout(this._t);
    if (!failed.length) {
      badge.className = 'verify-badge verify-ok'; badge.innerHTML = `تدقيق متطابق (${results.length} فحص)`;
      this._t = setTimeout(() => badge.classList.add('hidden'), 3500);
    } else {
      badge.className = 'verify-badge verify-fail';
      badge.innerHTML = `<button type="button" class="verify-x" data-action="hide-verify" aria-label="إغلاق">${ico('x')}</button>${ico("warning")} عدم تطابق في ${failed.length} رقم:<br>` + failed.map((f) => `<small>${esc(f.label)}: المعروض <b>${f.countValue}</b> ≠ القائمة <b>${f.listLen}</b></small>`).join('<br>');
    }
  }
};

/* ───────────────────────── 11) التثبيت (PWA) ───────────────────────── */

let deferredPrompt = null;
let installDismissed = false;
try { installDismissed = sessionStorage.getItem('imtiaz_install_dismissed') === '1'; } catch (e) { /* ignore */ }

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches
  || window.matchMedia('(display-mode: fullscreen)').matches
  || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function setInstallVisible(v) {
  const b = document.getElementById('install-btn'), x = document.getElementById('install-close');
  if (b) b.classList.toggle('hidden', !v);
  if (x) x.classList.toggle('hidden', !v);            // زر الإخفاء يظهر فقط عندما يظهر زر التثبيت
}
/* البند 2: على الموبايل لا مساحة لنص "تثبيت التطبيق" — نبدله بaria-label فقط */
function localizeInstallBtnForMobile() {
  const b = document.getElementById('install-btn'); if (!b) return;
  if (window.matchMedia && window.matchMedia('(max-width: 480px)').matches) {
    b.setAttribute('aria-label', 'تثبيت التطبيق');
  } else {
    b.removeAttribute('aria-label');                    // النص المرئي موجود داخل الزر
  }
}
window.addEventListener('resize', localizeInstallBtnForMobile, { passive: true });
localizeInstallBtnForMobile();
function canShowInstall() { return !isStandalone() && !installDismissed; }

window.dismissInstall = function () {
  installDismissed = true;
  try { sessionStorage.setItem('imtiaz_install_dismissed', '1'); } catch (e) { /* ignore */ }
  setInstallVisible(false);
};

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; setInstallVisible(canShowInstall()); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; setInstallVisible(false); toast('تم تثبيت التطبيق — افتحه من أيقونة الشاشة الرئيسية'); });

window.installApp = async function () {
  if (deferredPrompt) {                                   // Chrome/Edge/Android: native install dialog
    try { deferredPrompt.prompt(); } catch (e) { /* ignore */ }
    try { const r = await deferredPrompt.userChoice; if (r && r.outcome === 'accepted') { setInstallVisible(false); toast('تم التثبيت'); } } catch (e) { /* ignore */ }
    deferredPrompt = null;
    return;
  }
  const ios = isIOS();
  openModal('تثبيت التطبيق على جهازك', ios ? `
    <ol class="install-steps">
      <li>افتح الموقع في متصفح <strong>Safari</strong>.</li>
      <li>اضغط زر <strong>المشاركة</strong> <span class="kbd">${ico("upload")}</span> أسفل الشاشة.</li>
      <li>مرّر لأسفل واختر <strong>«إضافة إلى الشاشة الرئيسية»</strong> (Add to Home Screen).</li>
      <li>اضغط <strong>إضافة</strong> — ستجد الأيقونة على شاشتك.</li>
    </ol>` : `
    <ol class="install-steps">
      <li><strong>أندرويد (Chrome):</strong> اضغط القائمة <span class="kbd">⋮</span> ثم <strong>«تثبيت التطبيق»</strong> أو «إضافة إلى الشاشة الرئيسية».</li>
      <li><strong>الكمبيوتر (Chrome / Edge):</strong> اضغط أيقونة التثبيت <span class="kbd">${ico("download")}</span> في آخر شريط العنوان.</li>
      <li>تأكد أن الموقع مفتوح عبر <strong>https</strong>.</li>
    </ol>`);
};

function initInstallUI() {
  if (isStandalone()) { setInstallVisible(false); return; }
  setInstallVisible(canShowInstall());           // نعرض الزر دائماً حتى يتم التثبيت أو يُغلق يدوياً
  window.addEventListener('focus', () => { if (!deferredPrompt) setInstallVisible(canShowInstall()); });
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !window._swReloaded && !Overlays.count()) { window._swReloaded = true; location.reload(); } });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW:', e)));
}

/* ───────────────────────── 12) الصفحات والتنقل ───────────────────────── */

const PAGE_RENDERERS = {
  'overview': () => renderOverview(document.getElementById('page-overview')),
  'schedule': () => renderSchedule(document.getElementById('page-schedule')),
  'round-1': () => renderRoundPage('1'),
  'round-2': () => renderRoundPage('2'),
  'round-3': () => renderRoundPage('3'),
  'round-4': () => renderRoundPage('4'),
  'units': () => renderUnits(document.getElementById('page-units')),
  'not-registered': () => renderNotRegistered(document.getElementById('page-not-registered'))
};
let _activePage = null;

/* ── مؤشر التبويب المنزلق + شارات العد — يُحدَّثان عند كل تنقّل وعند تغيّر حجم النافذة ── */
window.moveNavIndicator = function () {
  const inner = document.querySelector('.nav-inner');
  const ind = inner && inner.querySelector('.nav-indicator');
  if (!ind) return;
  const active = inner.querySelector('.nav-btn.active');
  if (!active) { ind.classList.remove('show'); return; }
  // قياس داخل تدفق .nav-inner نفسه (offsetLeft/offsetWidth لا تتأثر بتمرير الحاوية ولا بـ RTL)
  ind.style.width = active.offsetWidth + 'px';
  ind.style.transform = 'translateX(' + active.offsetLeft + 'px)';
  ind.classList.add('show');
};
window.updateNavBadges = function () {
  try {
    const btn = document.querySelector('.nav-btn[data-page="not-registered"]');
    if (!btn) return;
    let n = btn.querySelector('.nav-count');
    const count = (typeof DB !== 'undefined' && DB.unregistered) ? DB.unregistered.length : 0;
    if (!count) { if (n) n.remove(); return; }
    if (!n) { n = document.createElement('span'); n.className = 'nav-count'; n.setAttribute('aria-hidden', 'true'); btn.appendChild(n); }
    if (String(count) !== n.textContent) n.textContent = String(count);
  } catch (e) {}
};
window.addEventListener('resize', () => { window.moveNavIndicator && window.moveNavIndicator(); }, { passive: true });

/* البند 2 (دورة الإصلاحات الدقيقة): إعادة رسم المصفوفة عند عبور حد 1200px
   لأن الصياغة الرأسية تُبنى من نفس الـ HTML — لا داعي لإعادة الرسم قبل اكتمال بناء DB */
(function () {
  let wasWide = null;
  const mq = window.matchMedia('(min-width: 1200px)');
  const apply = () => {
    if (wasWide === null) { wasWide = mq.matches; return; }   // أول قياس — الرسم الأول يتم عبر التنقل العادي
    if (wasWide === mq.matches) return;
    wasWide = mq.matches;
    const el = document.getElementById('page-schedule');
    if (el && typeof renderSchedule === 'function' && window.DB && DB.groups) { try { renderSchedule(el); } catch (e) { console.warn('gantt remount:', e); } }
  };
  if (mq.addEventListener) mq.addEventListener('change', apply); else mq.addListener(apply);
})();

window.showPage = function (pageId) {
  const pageEl = document.getElementById('page-' + pageId);
  if (!pageEl) return;
  if (_activePage === pageId && pageEl.dataset.rendered) return;
  document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'));
  pageEl.classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach((b) => { const on = b.dataset.page === pageId; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  window.moveNavIndicator && window.moveNavIndicator(pageId);
  window.updateNavBadges && window.updateNavBadges();
  if (!pageEl.dataset.rendered) {
    try { PAGE_RENDERERS[pageId](); pageEl.dataset.rendered = 'true'; }
    catch (err) { console.error(err); pageEl.innerHTML = `<div class="card error-card"><h3>تعذّر عرض هذه الصفحة</h3><p class="muted">${esc(err.message)}</p><button type="button" class="btn btn-plum" data-action="retry">إعادة تحميل البيانات</button></div>`; }
    setTimeout(() => VERIFY.run(), 60);
  }
  _activePage = pageId;
  window.scrollTo({ top: 0, behavior: 'auto' });
};

function rerenderAll() {
  // إسقاط كاشات المشتقات (تسجيلات الوحدات / خريطة تدوير الخيل) قبل إعادة البناء —
  // وإلا قد تُقرأ نسخة قديمة من DB بعد التحديث (البند 2ج + البند 4)
  window._unitRegsCache = null; window._eqRotMap = null;
  document.querySelectorAll('.page').forEach((p) => { delete p.dataset.rendered; p.innerHTML = ''; });
  const cur = _activePage || 'overview'; _activePage = null; showPage(cur);
  window.updateNavBadges && window.updateNavBadges();
}

/* ───────────────────────── 13) التحميل والتحديث ───────────────────────── */

function setUpdateBadge(extra) {
  const el = document.getElementById('header-last-update'); if (!el) return;
  el.textContent = `آخر تحديث للبيانات: ${CFG().LAST_DATA_UPDATE || '—'}${extra ? ' · ' + extra : ''}`;
}
/* سياسة عدم الاتصال: الكاش يعمل بصمت عبر Service Worker + localStorage —
   بدون أي banner أو toast أو زر إعادة محاولة. دالة showBanner أُزيلت نهائياً. */
function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; } return h; }
function fingerprint(sheets) { try { const j = JSON.stringify(sheets); return j.length + ':' + hash(j); } catch (e) { return String(Date.now()); } }

function showError(errors) {
  const keys = Object.keys(errors || {}).filter((k) => REQUIRED.indexOf(k) > -1);
  const el = document.getElementById('error-screen'); const ld = document.getElementById('loading-screen'); if (ld) ld.classList.add('hidden');
  document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'));
  el.classList.remove('hidden');
  el.innerHTML = `<div class="card error-card"><div class="error-ico">${ico('satellite-dish')}</div><h2>تعذّر تحميل البيانات</h2>
    <p class="muted">تأكد من الاتصال بالإنترنت، ثم أعد المحاولة. إن استمرت المشكلة فتأكد أن رابط Google Apps Script منشور بصلاحية «أي شخص» وأن أسماء الشيتات صحيحة.</p>
    ${keys.length ? `<details class="err-details"><summary>تفاصيل فنية</summary><ul>${keys.map((k) => `<li><code>${esc(SHEETS[k])}</code>: ${esc(errors[k])}</li>`).join('')}</ul></details>` : ''}
    <button type="button" class="btn btn-plum" data-action="retry">${ico('refresh')} إعادة المحاولة</button></div>`;
}

let _loading = false, _lastFp = null;

async function refreshData(opts) {
  opts = opts || {};
  if (_loading) return;
  _loading = true;
  const btn = document.getElementById('refresh-btn'); if (btn) btn.classList.add('spinning');
  try {
    const { sheets, errors } = await fetchAllSheets();
    const cached = readCache();
    const merged = { ...(cached ? cached.sheets : {}), ...sheets };          // شيت فشل؟ نستخدم آخر نسخة محفوظة له
    const failedRequired = REQUIRED.filter((k) => !sheets[k]);

    if (!hasRequired(merged)) { if (!opts.silent || !DB.students) showError(errors); return; }

    const fp = fingerprint(merged);
    const freshAll = failedRequired.length === 0;
    if (freshAll) writeCache(merged);
    // فشل التحديث؟ نتجاهله بصمت — اللوحة تستمر عرض آخر نسخة محفوظة (كاش صامت بلا إشعارات).

    if (fp !== _lastFp) {
      _lastFp = fp; buildDB(merged);
      const ld = document.getElementById('loading-screen'); if (ld) ld.classList.add('hidden');
      document.getElementById('error-screen').classList.add('hidden');
      if (opts.firstPaint) { showPage('overview'); } else { rerenderAll(); if (opts.silent) toast('تم تحديث البيانات'); }
    }
    if (opts.manual && freshAll) toast('البيانات محدّثة');
    setUpdateBadge();
  } finally { _loading = false; if (btn) btn.classList.remove('spinning'); }
}

/* ═════════════ 12.5) SPLASH — شاشة الاستقبال الفاخرة (تظهر فوراً قبل تحميل البيانات) ═════════════
   تُعرض من index.html مباشرة (لا انتظار JS) ثم تُطوى تلقائياً بعد أول رسم للوحة.        */

window.Splash = (function () {
  let timer = null, done = false;
  function reveal() {
    const el = document.getElementById('gate-splash'); if (!el) return;
    requestAnimationFrame(() => { el.classList.add('go'); });                    // تشغيل حركة النقر الذهبي
    clearTimeout(timer); timer = setTimeout(dismiss, 2600);                      // أمان: تختفي وحدها
  }
  function dismiss(instant) {
    if (done) return; done = true; clearTimeout(timer);
    const el = document.getElementById('gate-splash'); if (!el) return;
    if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.remove(); return; }
    el.classList.add('out');
    setTimeout(() => { try { el.remove(); } catch (e) {} }, 620);
  }
  function skip() { dismiss(); }
  return { reveal, dismiss, skip };
})();

async function init() {
  setUpdateBadge();
  if (CFG().PRESENTATION_MODE) document.body.classList.add('presentation-mode');

  // 1) البوابة أولاً — لا بيانات ولا تسجيل SW قبل الدخول
  const passedNow = Gate.init((user, pass, confirm) => onGateSubmit(user, pass, confirm));
  if (!passedNow) {
    const ld = document.getElementById('loading-screen'); if (ld) ld.classList.add('hidden');
    window.Splash && Splash.dismiss(true);                                       // جلسة محفوظة →الانتقال مباشرة اللوحة
    return;
  }
  bootAfterUnlock();
}

function bootAfterUnlock() {
  Gate.whoChip();
  initInstallUI(); registerSW();
  const afterPaint = () => { window.Splash && Splash.dismiss(); VERIFY.run(); };

  const cached = readCache();
  if (cached && hasRequired(cached.sheets)) {
    // فتح فوري من آخر نسخة محفوظة ثم تحديث في الخلفية
    buildDB(cached.sheets); _lastFp = fingerprint(cached.sheets);
    document.getElementById('loading-screen').classList.add('hidden');
    showPage('overview');
    setUpdateBadge('جارٍ التحديث…');
    afterPaint();
    refreshData({ silent: true }).catch((e) => { console.error(e); setUpdateBadge(); }); // كاش صامت — بلا إشعار عدم اتصال
    return;
  }
  refreshData({ firstPaint: true })
    .then(afterPaint)
    .catch((e) => { console.error(e); afterPaint(); showError({ students: e.message }); });
}

// نجاح الدخول → شاشة الاستقبال ثم تحميل البيانات (البيانات المحفوظة تُمسح عند القفل)
async function onGateSubmit(user, pass, confirm) {
  const ok = await Gate.submit(user, pass, confirm);
  Gate.afterSubmit(ok);                                                          // إعادة ضبط زر «دخول آمن»
  if (!ok) return;
  window.Splash && Splash.reveal();                                              // لحظة الانتقال الجميلة
  const ld = document.getElementById('loading-screen'); if (ld) ld.classList.remove('hidden');
  setTimeout(() => { window.Splash && Splash.dismiss(); }, 1500);                // احتياط إن طال التحميل
  if (!_booted) { _booted = true; bootAfterUnlock(); }
  else { rerenderAll(); }
}
let _booted = false;

window.AppBoot = function () { init(); };

/* ───────────────────────── 14) معالج الضغطات الموحّد ───────────────────────── */
// كل العناصر القابلة للضغط تستخدم data-action — لا onclick داخل النصوص.

const ACTIONS = {
  'page': (el) => { Overlays.closeAll(); showPage(el.dataset.page); },
  'goto-page': (el) => { Overlays.closeAll(); showPage(el.dataset.page); },
  'student': (el) => {
    // البند 5: كروت الراوندات تفتح البروفايل المصقول «elite» عند توفره
    if (el.dataset.elite === '1' && window.openEliteStudentProfile) { openEliteStudentProfile(el.dataset.sid); return; }
    openStudentProfile(el.dataset.sid, { replace: !!el.dataset.replace });
  },
  'raw-student': (el) => openUnknownStudent(window._rawRows[+el.dataset.ri] || {}),
  'group-roster': (el) => openGroupRosterModal(el.dataset.gid, { replace: !!el.dataset.replace }),
  'directory': () => openStudentDirectoryModal(),
  'search-open': () => openGlobalSearch(),
  'retry': () => { document.getElementById('error-screen').classList.add('hidden'); const ld = document.getElementById('loading-screen'); ld.classList.remove('hidden'); refreshData({ firstPaint: true }).catch((e) => { console.error(e); showError({ students: e.message }); }); },
  'install': () => installApp(),
  'dismiss-install': () => dismissInstall(),
  'round-detail': (el) => openRoundDetailModal(el.dataset.round, el.dataset.title || roundLabel(el.dataset.round), el.dataset.gid, el.dataset.count, el.dataset.matrix),
  'toggle-presentation': () => togglePresentationMode(),
  'close-overlay': (el) => { const ov = el.closest('.modal-overlay'); if (ov) Overlays.closeEl(ov); },
  'hide-verify': () => document.getElementById('verify-badge').classList.add('hidden'),
  'copy': (el) => copyText(el.dataset.text || '', el.dataset.msg),
  'toggle-nid': (el) => {
    const s = DB.studentLookup[el.dataset.sid]; const out = document.getElementById('nid-display'); if (!s || !out) return;
    const nid = String(s.national_id || ''); const masked = '••••••••••' + nid.slice(-4);
    const wasMasked = out.dataset.masked === '1';
    out.textContent = wasMasked ? nid : masked; out.dataset.masked = wasMasked ? '0' : '1'; el.textContent = wasMasked ? '' : '';
  },

  /* ── بوابة الدخول ── */
  'gate-eye': (el) => {
    const inp = document.getElementById('gate-pass'); if (!inp) return;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    el.textContent = show ? '' : '';
    el.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
    try { inp.focus(); } catch (e) {}
  },
  'gate-reload-accounts': async () => {
    const ok = await Gate.reloadAccounts();
    toast(ok ? 'تم تحديث قائمة الحسابات' : 'تعذّر قراءة تبويب الحسابات');
  },
  'gate-forget': () => {
    const c = Gate.gateCfg();
    const isSheet = String(c.MODE || 'sheet').toLowerCase() !== 'local';
    if (isSheet) {
      openModal('نسيت كلمة المرور؟', `
        <p class="muted">كلمات المرور تُدار من تبويب <b>${esc(c.USERS_SHEET_NAME || 'Accounts')}</b> في جدول Google المرتبط باللوحة:</p>
        <ol class="install-steps">
          <li>افتح جدول Google → التبويب المذكور.</li>
          <li>عدّل الصف الخاص بك (اسم المستخدم / كلمة المرور).</li>
          <li>اضغط «تحديث قائمة الحسابات» بالأسفل أو أعد المحاولة بعد دقيقة.</li>
        </ol>
        <div class="modal-actions">${btn('تحديث قائمة الحسابات', 'gate-reload-accounts', null, 'btn-gold')}</div>`);
      return;
    }
    if (c.PASSPHRASE) { toast('الرمز مضبوط من ملف الإعدادات (config.js) — غيّره هناك ثم أعد النشر.'); return; }
    openModal('نسيت الرمز؟', `
      <p class="muted">الرمز محفوظ على هذا الجهاز فقط ولا يمكن استعادته. يمكنك حذفه وضبط رمز جديد:</p>
      <ol class="install-steps">
        <li>اضغط «حذف الرمز وبدء إعداد جديد» بالأسفل.</li>
        <li>اختر رمزاً جديداً (٤ أحرف أو أكثر).</li>
        <li>احتفظ بالرمز في مكان آمن — لا توجد رسالة استعادة.</li>
      </ol>
      <div class="modal-actions">${btn('حذف الرمز وبدء إعداد جديد', 'gate-clear-local', null, 'btn-rose')}</div>`);
  },
  'gate-clear-local': () => { Overlays.closeAll(); Gate.clearDevicePass(); },
  'gate-help': () => {
    const c = Gate.gateCfg();
    openModal('كيف أحمي بيانات اللوحة؟', `
      <div class="kv-list">
        <div class="kv"><span>الوضع الحالي</span><b>${c.PASSPHRASE ? 'رمز مشترك مكتوب في config.js' : 'رمز محلي على كل جهاز'}</b></div>
        <div class="kv"><span>مدة الجلسة</span><b>${c.REMEMBER_HOURS} ساعة على هذا الجهاز</b></div>
        <div class="kv"><span>القفل التلقائي</span><b>${c.AUTO_LOCK_MINUTES ? c.AUTO_LOCK_MINUTES + ' دقيقة خمول' : 'معطّل'}</b></div>
      </div>
      <h3 style="margin-top:14px">مهم — اقرأ هذا</h3>
      <p class="muted">بوابة الدخول هنا هي <strong>قفل واجهة</strong>: تمنع الفضوليين وتُخفي البيانات عن أي جهاز غير مُصرّح. لكنها ليست تشفيراً كاملاً، لأن ملفات الموقع عامة بطبيعتها، وبياناتها تأتي من رابط Google Apps Script.</p>
      <h3>لحماية كاملة (خطوتان فقط)</h3>
      <ol class="install-steps">
        <li><strong>Cloudflare Access (مجاني حتى 50 مستخدم):</strong> لوحة Cloudflare → <em>Zero Trust → Access → Applications</em> → أضف التطبيق <code>imtiaz-dashboard.pages.dev</code> واختر سياسة «Allow» لبريد الكلية مع رمز تحقق OTP.</li>
        <li><strong>Apps Script:</strong> اجعل السكربت يطلب <code>?token=...</code> صحيحاً، وضع نفس القيمة في <code>GATE.API_TOKEN</code> داخل config.js، وقيّد مشاركة جدول Google على حسابات الكلية فقط.</li>
      </ol>
      <p class="muted" style="margin-top:10px">بهذا لا يستطيع أي شخص قراءة البيانات حتى لو عرف الرابط.</p>`);
  },
  'splash-skip': () => { window.Splash && Splash.dismiss(); }
};
window.registerAction = function (name, fn) { ACTIONS[name] = fn; };

// فتح صفحة الوحدات البيطرية مع فتح وحدة بعينها وتمرير الشاشة إليها
registerAction('goto-unit', (el) => {
  Overlays.closeAll();
  showPage('units');
  const want = String(el.dataset.unit || '').trim();
  setTimeout(() => {
    const cards = document.querySelectorAll('#units-grid .unit-card');
    for (const card of cards) {
      const name = card.querySelector('.unit-name');
      if (name && normAr(name.textContent) === normAr(want)) {
        card.classList.add('open');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
  }, 120);
});

document.addEventListener('click', (e) => {
  const ov = e.target;
  if (ov.classList && ov.classList.contains('modal-overlay')) { Overlays.closeEl(ov); return; }          // الضغط على الخلفية
  const el = e.target.closest ? e.target.closest('[data-action]') : null;
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) { if (el.tagName === 'A') return; fn(el, e); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && Overlays.count()) { Overlays.closeTop(false); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches && e.target.matches('[role="button"][data-action]')) { e.preventDefault(); e.target.click(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openGlobalSearch(); }
});
