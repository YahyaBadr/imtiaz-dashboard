'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   config.js — إعدادات اللوحة (ملف واحد فقط — لا تُضِف نسخة ثانية منه)
   Edit the values below, save, then push to GitHub → Cloudflare redeploys.
   ═══════════════════════════════════════════════════════════════════════════ */

window.APP_CONFIG = {

  /* ── 1) Google Apps Script Web App URL (the API that reads your Sheet) ──
     Must be published as: Execute as "Me" + Who has access "Anyone".
     Leave "" to load local CSV files from ./data/ instead (offline testing). */
  API_URL: "",

  /* ── 2) Data / cache behaviour ── */
  OFFLINE_CACHE: true,          // يحفظ آخر بيانات في المتصفح لتعمل اللوحة بدون إنترنت
  REQUEST_TIMEOUT_MS: 30000,    // مهلة طلب كل جدول
  TIMEZONE: 'Africa/Cairo',     // كل التواريخ تُحسب بتوقيت القاهرة

  /* ── 3) Header info ── */
  LAST_DATA_UPDATE: '4 نوفمبر 2026',
  ACADEMIC_YEAR: '2026 / 2027',
  VICE_DEAN_EMAIL: 'vicedean@cu.edu.eg',

  /* ── 4) Access Gate — بوابة الدخول (اسم مستخدم + كلمة مرور من جدول Google) ──
     MODE: 'sheet'  → التحقق يتم من تبويب Accounts في نفس جدول Google (موصى به)
                         الصفوف: Username | Password   (عمودان فقط كما فعلت)
           'local'  → بدون قائمة؛ كل جهاز يختار رمزاً محلياً عند أول فتح
     USERS_SHEET_NAME: اسم التبويب كما هو في Google Sheets (افتراضي Accounts).
                       لو كان الاسم عربياً اكتبه كما هو هنا.
     PASSPHRASE: اختياري — رمز طوارئ عام إن أردت باباً احتياطياً. اتركه "" لتلغيه.
     NOTE: كلمات المرور تُقرأ في المتصفح للتحقق فقط ولا تُرفع لأي مكان آخر؛ الجلسة
     تُحفظ كرمز موقّع محلياً. للحماية القصوى أضف أيضاً Cloudflare Access على
     imtiaz-dashboard.pages.dev (Zero Trust → Access → Applications → Email-OTP). */
  GATE: {
    ENABLED: true,              // false = بدون بوابة دخول
    MODE: 'sheet',              // 'sheet' | 'local'
    USERS_SHEET_NAME: 'Accounts',           // اسم التبويب كما هو في Google Sheets
    USERS_SHEET_NAME_ALT: '',               // بديل إن كان الاسم مختلفاً (مثال: 'الحسابات')
    PASSPHRASE: '',                         // رمز طوارئ عام (اختياري — يُفضّل تركه فارغاً)
    SESSION_HOURS: 8,           // مدة البقاء داخل اللوحة بعد الدخول
    REMEMBER_HOURS: 8,          // (قديم — لنفس الغرض)
    AUTO_LOCK_MINUTES: 0,       // قفل تلقائي بعد الخمول (0 = لا قفل تلقائي)
    MAX_ATTEMPTS: 5,            // محاولات قبل إيقاف مؤقت قصير
    LOCKOUT_SECONDS: 30,
    USERS_TTL_MINUTES: 60,      // إعادة قراءة قائمة المستخدمين بعد هذه المدة
    API_TOKEN: ''               // لو ضبطت SECRET_TOKEN في Apps Script، ضع نفس القيمة هنا
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
