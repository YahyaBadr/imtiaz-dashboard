'use strict';

/* ═══ صفحة الملخص — كل عنصر هنا قابل للضغط (data-action) ═══ */

function renderOverview(container) {
  const totalStudents = DB.groups.reduce((a, g) => a + (parseInt(g.total_students, 10) || 0), 0) || DB.students.length;
  const r2Reg = DB.round2Summary.reduce((a, r) => a + (parseInt(r.registered, 10) || 0), 0);
  const r2Missing = DB.round2Summary.reduce((a, r) => a + (parseInt(r.not_registered, 10) || 0), 0);

  // وسم الدورة الثانية — التواريخ من شيت 09_round_dates وليست ثابتة في الكود
  const d2 = getRoundDates('2');
  let r2Tag = 'الدورة الثانية';
  if (d2.start) {
    const left = daysUntil(d2.start);
    if (left !== null && left > 0) r2Tag = `الدورة الثانية: تبدأ خلال ${left} ${left === 1 ? 'يوم' : left === 2 ? 'يومين' : left <= 10 ? 'أيام' : 'يوماً'} (${d2.start})`;
    else if (computeStatus(d2.start, d2.end) === 'current') r2Tag = 'الدورة الثانية (الجارية الآن)';
    else if (computeStatus(d2.start, d2.end) === 'finished') r2Tag = 'الدورة الثانية (انتهت)';
    else r2Tag = `الدورة الثانية: تبدأ اليوم (${d2.start})`;
  }

  const prefAverages = computeFieldPreferences();
  const alerts = buildOverviewAlerts();

  /* كروت المجالات الثلاثة المتناوبة — خيل / معامل / سمك (كل أسبوعين) */
  const domCfg = CFG().DOMAINS || {};
  const today = getTodayStr();
  const blocks = subUnitBlocksForOrder('2');  // راوند الدورة الثانية
  let activeDomain = 'horse';
  let rotationInfo = '';
  if (blocks && blocks.blocks) {
    const todayBlockIdx = Math.max(0, Math.floor((Date.parse(today + 'T00:00:00Z') - Date.parse(blocks.start + 'T00:00:00Z')) / (14 * 86400000)));
    const domOrder = domCfg.order || ['horse', 'lab', 'fish'];
    activeDomain = domOrder[todayBlockIdx % domOrder.length] || 'horse';
    const d = domCfg[activeDomain] || {};
    rotationInfo = `المجال النشط الآن: <strong class="num">${d.label || activeDomain}</strong> · يتم التبديل كل أسبوعين`;
  }

  const domainCards = (domCfg.order || ['horse', 'lab', 'fish']).map((dk) => {
    const d = domCfg[dk] || {};
    const isActive = dk === activeDomain;
    const nextIdx = (domCfg.order || ['horse', 'lab', 'fish']).indexOf(dk) + 1;
    const nextDomain = domCfg.order ? domCfg.order[nextIdx % domCfg.order.length] : 'horse';
    const nextD = domCfg[nextDomain] || {};
    return `
      <div class="domain-card ${isActive ? 'domain-active' : ''}"${act('goto-page', { page: 'schedule' })}>
        <div class="domain-header">
          <div class="domain-ico ${d.tone || 'tone-gold'}">${ico(d.icon || 'pin')}</div>
          <span class="domain-badge ${isActive ? 'badge-gold' : 'badge-plum'}">${isActive ? 'نشط الآن' : 'قادم'}</span>
        </div>
        <div class="domain-title">${esc(d.label || dk)}</div>
        <div class="domain-body">
          <div class="domain-period">${isActive ? rotationInfo : `يبدأ بعد المجالات السابقة · يليه <strong>${esc(nextD.label || nextDomain)}</strong>`}</div>
          <div class="domain-progress">
            <div class="domain-track"></div>
            <div class="domain-fill ${isActive ? '' : 'domain-fill-upcoming'}" style="width:${isActive ? 100 : 33}%"></div>
          </div>
        </div>
        <div class="domain-footer">
          <span class="domain-go">عرض التفاصيل ${ico('external')}</span>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <section class="hero-band">
      <div class="hero-header">
        <div class="hero-title"><span aria-hidden="true">${ico('landmark')}</span><span>المؤشرات الرئيسية للإمتياز البيطري</span></div>
        <span class="hero-tag">${esc(r2Tag)}</span>
      </div>
      <div class="hero-stats-grid">
        <div class="hero-stat-card"${act('directory')}><div class="hero-stat-number num" id="hero-cnt-students">0</div><div class="hero-stat-label">إجمالي طلاب الدفعة المقيدين <span class="go">${ico('external')}</span></div></div>
        <div class="hero-stat-card"${act('r2-registered')}><div class="hero-stat-number num" id="hero-cnt-reg">0</div><div class="hero-stat-label">مسجلون في مواقع التدريب (دورة 2) <span class="go">${ico('external')}</span></div></div>
        <div class="hero-stat-card"${act('goto-page', { page: 'not-registered' })}><div class="hero-stat-number num amber" id="hero-cnt-missing">0</div><div class="hero-stat-label">طلاب غير مسجلين (دورة 2) <span class="go">${ico('external')}</span></div></div>
      </div>
    </section>

    <h2 class="section-title"><span class="title-ornament" aria-hidden="true"></span>تدوير المجالات — كل أسبوعين يتغير المجال</h2>
    <div class="domain-grid elite">
      ${domainCards}
    </div>

    ${alerts.length ? `<h2 class="section-title"><span class="title-ornament" aria-hidden="true"></span>تنبيهات هامة ومتابعات فورية</h2>
      <div class="alerts-strip">${alerts.map((a) => `<div class="alert-item alert-${a.type}"${a.attrs}><span class="alert-icon">${a.icon}</span><div class="grow">${a.html}</div><span class="alert-go">عرض ${ico('external')}</span></div>`).join('')}</div>` : ''}

    <div class="two-col">
      <section>
        <h2 class="section-title"><span class="title-ornament" aria-hidden="true"></span>${ico('bar-chart')} توزيع التدريب بالدورة الثانية (R2)</h2>
        <div class="round-summary-grid">
          ${DB.round2Summary.map((r) => {
            const reg = parseInt(r.registered, 10) || 0, exp = parseInt(r.expected_students, 10) || 0, miss = parseInt(r.not_registered, 10) || 0;
            const declaredExp = parseInt(r._declared_expected, 10) || 0;
            const pct = exp > 0 ? Math.round((reg / exp) * 100) : 0, rk = r.round_key, meta = ROUND_META[rk] || {};
            return `
              <div class="round-card">
                <div class="round-card-name">
                  <span>${roundIcon(rk)} ${esc(r.round_name_ar || roundLabel(rk))}</span>
                  ${miss > 0 ? `<span class="badge badge-amber num tap"${act('r2-unregistered', { round: rk })}>${miss} غير مسجل ${ico("external")}</span>` : '<span class="badge badge-emerald">مكتمل</span>'}
                </div>
                ${declaredExp && declaredExp !== exp ? `<div class="round-declared-note">العدد المعلن في الشيت: <span class="num">${declaredExp}</span> — المعروض من الكشوف: <span class="num">${exp}</span></div>` : ''}
                <div class="round-reg-numbers num">
                  <button type="button" class="num-link"${act('r2-registered', { round: rk })} aria-label="المسجلون">${reg}</button>
                  <span class="sep">/</span>
                  <button type="button" class="num-link muted"${act('r2-expected', { round: rk })} aria-label="المتوقعون">${exp} ${ico('external')}</button>
                </div>
                <div class="progress-wrap"><div class="progress-bar"><div class="progress-fill ${miss > 0 ? 'warn' : ''}" style="width:${Math.min(pct, 100)}%"></div></div><span class="num">${pct}%</span></div>
                <div class="round-groups-label"${act('goto-page', { page: 'schedule' })}>الجروبات المعنية: <strong>${esc(r.groups || '—')}</strong> ${ico('external')}</div>
              </div>`;
          }).join('') || '<div class="empty-note">لا توجد بيانات توزيع.</div>'}
        </div>
      </section>

      <section>
        <h2 class="section-title"><span class="title-ornament" aria-hidden="true"></span>${ico('star')} المجالات الأكثر طلباً</h2>
        <div class="card field-pref-card">
          <div class="muted small">متوسط ترتيب الرغبات (اضغط على أي مجال لعرض من اختاروه أولاً):</div>
          ${prefAverages.map((item, idx) => {
            const barWidth = Math.max(15, Math.round(((6 - parseFloat(item.avg)) / 5) * 100));
            return `
              <div class="field-bar-item"${act('field-pref', { field: item.field })}>
                <div class="field-bar-top">
                  <span class="field-name"><span class="badge badge-gold">#${idx + 1}</span>${esc(item.arabicName)}</span>
                  <span class="field-avg">متوسط: <strong class="num">${item.avg}</strong> · <span class="num">${item.first}</span> اختاروه أولاً ${ico('external')}</span>
                </div>
                <div class="progress-bar thick"><div class="progress-fill plum" style="width:${barWidth}%"></div></div>
              </div>`;
          }).join('')}
        </div>
      </section>
    </div>

    <h2 class="section-title"><span class="title-ornament" aria-hidden="true"></span>${ico('refresh')} موقع كل جروب الآن في مصفوفة التدريب</h2>
    <div class="status-grid">
      ${DB.groups.map((g) => {
        const sched = DB.roundSchedule.filter((r) => String(r.group_id) === String(g.group_id)).sort((a, b) => (+a.round_order || 0) - (+b.round_order || 0));
        if (!sched.length) return `<div class="status-card"${act('group-roster', { gid: g.group_id })}><div><div class="status-group-name">جروب ${esc(g.group_id)}</div><div class="status-round-name">لا يوجد جدول</div></div></div>`;
        const st = (r) => computeStatus(r.start_date, r.end_date);
        const cur = sched.find((r) => st(r) === 'current') || sched.find((r) => st(r) === 'upcoming') || sched[sched.length - 1];
        const meta = ROUND_META[cur.round_key] || {};
        return `<div class="status-card"${act('round-detail', { round: cur.round_key, title: cur.round_name_ar || roundLabel(cur.round_key), gid: g.group_id, count: g.total_students || 0, matrix: cur.round_order + '_' + cur.round_key })}>
          <div><div class="status-group-name">جروب ${esc(g.group_id)}</div><div class="status-round-name">${roundIcon(cur.round_key)} ${esc(cur.round_name_ar || roundLabel(cur.round_key))}</div></div>${statusBadge(st(cur))}</div>`;
      }).join('')}
    </div>

    <h2 class="section-title"><span class="title-ornament" aria-hidden="true"></span>${ico('users')} بيانات ومطابقة قوام الجروبات</h2>
    <div class="table-wrap">
      <div class="table-header"><span class="table-title">قائمة الجروبات وتوزيع الجنس</span><input type="search" class="table-search" id="groups-search" placeholder="تصفية الجروبات…" aria-label="تصفية الجروبات" autocomplete="off"></div>
      <div class="table-scroll">
        <table id="groups-table" class="table-cards">
          <thead><tr><th data-col="group_id">رقم الجروب</th><th data-col="group_name">اسم الجروب</th><th data-col="total_students">الإجمالي</th><th data-col="female_count">طالبات</th><th data-col="male_count">طلاب</th><th data-col="unknown">غير محدد</th><th data-col="type">التصنيف</th></tr></thead>
          <tbody>
            ${DB.groups.map((g) => {
              const tot = parseInt(g.total_students, 10) || 0, f = parseInt(g.female_count, 10) || 0, m = parseInt(g.male_count, 10) || 0, unk = Math.max(0, tot - (f + m));
              return `<tr class="clickable-row"${act('group-roster', { gid: g.group_id })}>
                <td class="num" data-col="group_id" data-label="الجروب" data-sort="${esc(g.group_id)}"><span class="cartouche-badge">جروب ${esc(g.group_id)}</span></td>
                <td data-col="group_name" data-label="الاسم"><strong>${esc(g.group_name || '—')} ${ico('external')}</strong></td>
                <td class="num" data-col="total_students" data-label="الإجمالي"><b>${tot}</b>${g._count_mismatch ? `<span class="badge badge-amber num" title="العدد المعلن في جدول الجروبات ${esc(g._declared_total)} — المعروض من كشف الطلاب ${tot}">المعلن ${esc(g._declared_total)}</span>` : ''}</td>
                <td class="num gender-f" data-col="female_count" data-label="طالبات">${f}</td>
                <td class="num gender-m" data-col="male_count" data-label="طلاب">${m}</td>
                <td data-col="unknown" data-label="غير محدد" data-sort="${unk}">${unk > 0 ? `<span class="badge badge-amber num">غير محدد: ${unk}</span>` : '<span class="muted">0</span>'}</td>
                <td data-col="type" data-label="التصنيف"><span class="badge badge-grey">${esc(g._synthetic ? 'غير معرّف في الجروبات' : (g.type || '—'))}</span></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  animateCountUp(document.getElementById('hero-cnt-students'), totalStudents);
  animateCountUp(document.getElementById('hero-cnt-reg'), r2Reg);
  animateCountUp(document.getElementById('hero-cnt-missing'), r2Missing);
  makeTableSortable(document.getElementById('groups-table'));
  makeTableSearchable(document.getElementById('groups-search'), document.getElementById('groups-table'));
}

function computeFieldPreferences() {
  const prefs = DB.prefColumns, sums = {}, counts = {}, first = {};
  prefs.forEach((p) => { sums[p] = 0; counts[p] = 0; first[p] = 0; });
  DB.students.forEach((s) => prefs.forEach((p) => { const v = parseFloat(s[p]); if (!isNaN(v) && v > 0) { sums[p] += v; counts[p]++; if (v === 1) first[p]++; } }));
  return prefs.map((p) => ({ field: p, arabicName: DB.fieldsMap[p] || p, avg: counts[p] ? (sums[p] / counts[p]).toFixed(2) : '0.00', first: first[p] }))
    .sort((a, b) => parseFloat(a.avg) - parseFloat(b.avg));
}

function buildOverviewAlerts() {
  const alerts = [];
  DB.stationsUnits.forEach((u) => {
    const cap = parseInt(u.capacity, 10), reg = parseInt(u.registered, 10);
    if (!isNaN(cap) && cap > 0 && !isNaN(reg) && reg > cap) alerts.push({ type: 'rose', icon: ico('alert-triangle'), attrs: act('goto-unit', { unit: u.unit_name }), html: `<strong>${esc(u.unit_name)}:</strong> تجاوزت الطاقة الاستيعابية — مسجل <strong class="num">${reg}</strong> وطاقتها <strong class="num">${cap}</strong>.` });
  });
  if (DB.unregistered.length) alerts.push({ type: 'amber', icon: ico('warning'), attrs: act('goto-page', { page: 'not-registered' }), html: `يوجد <strong class="num">${DB.unregistered.length}</strong> طالب/ة غير مسجلين في الدورة الثانية حتى الآن.` });
  const issues = (DB.issues || []).length + (DB.issuesR2 || []).length;
  if (CFG().SHOW_DATA_NOTES && issues) alerts.push({ type: 'plum', icon: ico('receipt'), attrs: act('data-notes'), html: `ملاحظات جودة البيانات: <strong class="num">${issues}</strong> ملاحظة.` });
  return alerts;
}

/* ── قوائم الدورة الثانية ── */
function rowsToStudents(rows) { return rows.map((a) => resolveStudent(a) || a); }

window.openRegisteredR2Modal = function (roundKey, opts) {
  const rows = roundKey ? DB.assignments.filter((a) => a.round_key === roundKey) : DB.assignments;
  return renderStudentListModal(roundKey ? `المسجلون في ${roundLabel(roundKey)}` : 'المسجلون بالدورة الثانية', rows, opts);
};
window.openUnregisteredR2Modal = function (roundKey, opts) {
  return renderStudentListModal(`غير المسجلين في ${roundLabel(roundKey)}`, DB.unregistered.filter((u) => u.round_key === roundKey), opts);
};
window.openExpectedR2Modal = function (roundKey, opts) {
  const all = [...DB.assignments.filter((a) => a.round_key === roundKey), ...DB.unregistered.filter((u) => u.round_key === roundKey)];
  const seen = new Set(), unique = [];
  all.forEach((it) => { const s = resolveStudent(it); const k = s ? studentKey(s) : (it.student_code || (it.group_id + '_' + it.code_short)); if (!seen.has(k)) { seen.add(k); unique.push(it); } });
  return renderStudentListModal(`الطلاب المتوقعون في ${roundLabel(roundKey)}`, unique, opts);
};
window.openFieldPreferencesModal = function (fieldKey) {
  return renderStudentListModal(`الرغبة الأولى: ${DB.fieldsMap[fieldKey] || fieldKey}`, DB.students.filter((s) => parseInt(s[fieldKey], 10) === 1));
};
window.openDataNotesModal = function () {
  const rows = [...(DB.issues || []).map((r) => ({ who: r.name, code: r.code, grp: r.group, txt: r.problem })), ...(DB.issuesR2 || []).map((r) => ({ who: r.full_name, code: r.code_short, grp: r.group_id, txt: r.issue }))];
  openModal('ملاحظات جودة البيانات', `<div class="slist">${rows.map((r) => `<div class="slist-row static"><div class="slist-main"><div class="slist-name">${esc(r.who || '—')}</div><div class="slist-sub">جروب ${esc(r.grp || '—')} · كود ${esc(r.code || '—')}</div><div class="issue-txt">${esc(r.txt || '')}</div></div></div>`).join('')}</div>`);
};

registerAction('r2-registered', (el) => openRegisteredR2Modal(el.dataset.round || null));
registerAction('r2-unregistered', (el) => openUnregisteredR2Modal(el.dataset.round));
registerAction('r2-expected', (el) => openExpectedR2Modal(el.dataset.round));
registerAction('field-pref', (el) => openFieldPreferencesModal(el.dataset.field));
registerAction('data-notes', () => openDataNotesModal());
