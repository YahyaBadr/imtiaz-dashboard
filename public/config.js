'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   config.js — إعدادات اللوحة (ملف واحد فقط — لا تُضِف نسخة ثانية منه)
   Edit the values below, save, then push to GitHub → Cloudflare redeploys.
   ═══════════════════════════════════════════════════════════════════════════ */

window.APP_CONFIG = {

  /* ── 1) Google Apps Script Web App URL (the API that reads your Sheet) ──
     Must be published as: Execute as "Me" + Who has access "Anyone".
     Leave "" to load local CSV files from ./data/ instead (offline testing). */
  API_URL: "https://script.google.com/macros/s/AKfycbySvILv0ZwJStPAGHABLCoV09ebK1iMSqZsIc8ZeiQ9qqL69_ONFuBplEZY3oOqxSlf2Q/exec",

  /* ── 2) Data / cache behaviour ── */
  OFFLINE_CACHE: true,          // يحفظ آخر بيانات في المتصفح لتعمل اللوحة بدون إنترنت
  REQUEST_TIMEOUT_MS: 30000,    // مهلة طلب كل جدول
  TIMEZONE: 'Africa/Cairo',     // كل التواريخ تُحسب بتوقيت القاهرة

  /* ── 3) Header info ── */
  LAST_DATA_UPDATE: '4 نوفمبر 2026',
  ACADEMIC_YEAR: '2026 / 2027',
  VICE_DEAN_EMAIL: 'vicedean@cu.edu.eg',

  /* ── 4) Access Gate — بوابة الدخول (تحمي اللوحة برمز/كلمة مرور) ──
     PASSPHRASE : الرمز الذي يُطلب في شاشة الدخول. اتركه "" ليطلب من كل جهاز
                  أن يختار رمزه عند أول فتح (يُحفظ على الجهاز فقط).
     NOTE: أي رمز تضعه هنا يبقى ظاهراً لكل من يفتح الملف العام، لذلك فهو يمنع
     الفضوليين ولا يغني عن صلاحيات Google Sheets. لحماية حقيقية استخدم وضع
     TOKEN (انشر Apps Script بـ Token مطلوب في الطلبات) أو Cloudflare Access.
     وضع Cloudflare Access: Users → Policies → Add policy → hostname
     imtiaz-dashboard.pages.dev + Email-OTP / Google Workspace. */
  GATE: {
    ENABLED: true,              // false = بدون بوابة دخول
    PASSPHRASE: '',             // ← ضع رمز اللوحة هنا (مثال: "vet#2026")
    REMEMBER_HOURS: 12,         // مدة البقاء داخل اللوحة بعد الدخول (على هذا الجهاز)
    AUTO_LOCK_MINUTES: 0,       // قفل تلقائي بعد الخمول (0 = لا قفل تلقائي)
    MAX_ATTEMPTS: 5,            // محاولات قبل إيقاف مؤقت قصير
    LOCKOUT_SECONDS: 30
  },

  /* ── 5) Feature flags ── */
  SHOW_DATA_NOTES: false,       // صفحة ملاحظات جودة البيانات وتنبيهاتها
  SHOW_NID_BY_DEFAULT: false,   // إظهار الرقم القومي مباشرة (خلاف ذلك يكون مقنّعاً)
  PRESENTATION_MODE: false,     // وضع العرض على البروجيكتور (يخفي أرقام التواصل)
  ENABLE_EDIT_MODE: false,      // مرحلة لاحقة

  /* ── 5) Backup dates for rounds — used only if sheet 09_round_dates is empty ──
     key = round order as string, format YYYY-MM-DD */
  DEFAULT_ROUND_DATES: {
    '1': { start: '2026-09-20', end: '2026-11-03' },
    '2': { start: '2026-11-07', end: '2026-12-24' },
    '3': { start: '2026-12-26', end: '2027-02-09' },
    '4': { start: '2027-02-07', end: '2027-03-30' },
    '0': { start: '2027-04-03', end: '2027-05-03' }
  }
};
