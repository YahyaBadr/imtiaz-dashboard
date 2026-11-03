/******************************************************************************
 * appsscript.gs — Apps Script خلف لوحة الإمتياز البيطري (نسخة محدّثة)
 * يقرأ كل التبويبات بنفس المنطق السابق، ويضيف طبقة حماية اختيارية:
 *   1) SECRET_TOKEN (من Properties) → إذا ضُبط، كل طلب لازم يجيب ?key=... صحيح.
 *   2) ALLOWED_VIEWER_EMAILS → لو غير فارغ، فقط هذه الحسابات تفتح اللوحة.
 *      (يعني حتى صاحب الرابط لا يدخل بدون حساب Google مصرّح + التوكن داخل الرابط.)
 * النشر: Deploy → New deployment → Web app
 *   Execute as: Me   |   Who has access: Anyone  (اللوحة ستظل محمية بالمفاتيح أدناه)
 ******************************************************************************/

var SECRET_TOKEN = '';            // ← ضع هنا توكن عشوائي طويل، مثال: 'x8Fq-2026-imtiaz-Kz91'
var ALLOWED_VIEWER_EMAILS = [];   // ← مثال: ['vicedean@cu.edu.eg','coord@cu.edu.eg'] أو اتركه فارغاً

function doGet(e) {
  var p = (e && e.parameter) || {};

  // 1) فحص التوكن (اختياري لكنه موصى به)
  if (SECRET_TOKEN && String(p.key || '') !== SECRET_TOKEN) {
    return jsonOut({ error: 'UNAUTHORIZED', message: 'مفتاح الوصول غير صحيح.' }, 401);
  }

  // 2) فحص بريد المستخدم (يعمل فقط عندما يكون التطبيق "Execute as: me + Anyone"؟
  //    لا — EffectiveUser متاح دائماً؛ استخدمه كقائمة بيضاء إضافية إن أردت)
  if (ALLOWED_VIEWER_EMAILS && ALLOWED_VIEWER_EMAILS.length) {
    var who = '';
    try { who = Session.getEffectiveUser().getEmail(); } catch (err) {}
    var okWho = ALLOWED_VIEWER_EMAILS.map(function (x) { return String(x).toLowerCase(); })
                                     .indexOf(String(who).toLowerCase()) > -1;
    if (!okWho) return jsonOut({ error: 'FORBIDDEN', message: 'هذا الحساب غير مصرّح له.' }, 403);
  }

  var name = String(p.sheet || p.name || '').trim();
  if (!name) return jsonOut({ error: 'NO_SHEET', message: 'المعامل sheet مطلوب.' }, 400);

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(name);
    if (!sh) return jsonOut({ error: 'NOT_FOUND', message: 'لا يوجد تبويب بهذا الاسم: ' + name }, 404);
    var values = sh.getDataRange().getValues();
    if (!values.length) return jsonOut([]);

    var header = values[0].map(function (h) { return String(h == null ? '' : h).replace(/^\uFEFF/, '').trim(); });
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var o = {}, any = false;
      for (var c = 0; c < header.length; c++) {
        var v = values[r][c];
        if (v instanceof Date) v = v.toISOString();          // ثابت للواجهة (تتعامل معه صح)
        if (header[c]) { o[header[c]] = v; if (String(v).trim() !== '') any = true; }
      }
      if (any) rows.push(o);                                  // تجاهل الصفوف الفارغة
    }
    return jsonOut(rows);
  } catch (err) {
    return jsonOut({ error: 'SERVER', message: String(err && err.message || err) }, 500);
  }
}

function jsonOut(obj, code) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
