'use strict';

function renderOverview(container) {
  const totalStudents = DB.groups.reduce((acc, g) => acc + (parseInt(g.total_students, 10) || 0), 0);
  const r2TotalReg = DB.round2Summary.reduce((acc, r) => acc + (parseInt(r.registered, 10) || 0), 0);
  const r2TotalMissing = DB.round2Summary.reduce((acc, r) => acc + (parseInt(r.not_registered, 10) || 0), 0);

  const todayStr = getTodayStr();
  const r2StartDate = '2026-11-07';
  let r2TagText = '';
  if (todayStr < r2StartDate) {
    const msDiff = new Date(r2StartDate + 'T00:00:00') - new Date(todayStr + 'T00:00:00');
    const daysRemaining = Math.max(1, Math.ceil(msDiff / (1000 * 60 * 60 * 24)));
    r2TagText = `الدورة الثانية: تبدأ خلال ${daysRemaining} أيام (${r2StartDate})`;
  } else if (todayStr <= '2026-12-24') {
    r2TagText = 'الدورة الثانية (الجارية)';
  } else {
    r2TagText = 'الدورة الثانية (انتهت)';
  }

  const prefAverages = computeFieldPreferences();
  const alerts = buildOverviewAlerts();

  const lotusSvg = `
    <svg class="title-ornament" viewBox="0 0 24 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 1L16 6H8L12 1Z" fill="#E3A73C"/>
      <path d="M12 13L8 8H16L12 13Z" fill="#E3A73C"/>
      <circle cx="3" cy="7" r="2.2" fill="#E3A73C"/>
      <circle cx="21" cy="7" r="2.2" fill="#E3A73C"/>
    </svg>`;

  container.innerHTML = `
    <div class="hero-band">
      <div class="hero-header">
        <div class="hero-title">
          <span>🏛️</span>
          <span>المؤشرات الرئيسية للإمتياز البيطري</span>
        </div>
        <span class="hero-tag" id="hero-r2-tag">${r2TagText}</span>
      </div>

      <div class="hero-stats-grid">
        <div class="hero-stat-card" onclick="openStudentDirectoryModal()" role="button" tabindex="0" title="انقر لاستعراض دليل كامل الطلاب">
          <div class="hero-stat-number num" id="hero-cnt-students">0</div>
          <div class="hero-stat-label">إجمالي طلاب الدفعة المقيدين ↗</div>
        </div>
        <div class="hero-stat-card" onclick="openRegisteredR2Modal()" role="button" tabindex="0" title="انقر لاستعراض جميع المسجلين بالدورة الثانية">
          <div class="hero-stat-number num" id="hero-cnt-reg">0</div>
          <div class="hero-stat-label">مسجلون في مواقع التدريب (دورة 2) ↗</div>
        </div>
        <div class="hero-stat-card" onclick="showPage('not-registered')" role="button" tabindex="0" title="انقر لاستعراض الطلاب غير المسجلين">
          <div class="hero-stat-number num" id="hero-cnt-missing" style="color:var(--c-amber)">0</div>
          <div class="hero-stat-label">طلاب غير مسجلين (دورة 2) ↗</div>
        </div>
      </div>
    </div>

    ${alerts.length > 0 ? `
      <h2 class="section-title">${lotusSvg} تنبيهات هامة ومتابعات فورية</h2>
      <div class="alerts-strip">
        ${alerts.map(a => `
          <div class="alert-item alert-${a.type}" onclick="${a.action}" role="button" tabindex="0">
            <span class="alert-icon">${a.icon}</span>
            <div style="flex:1">${a.html}</div>
            <span style="font-size:0.8rem; color:var(--c-text-muted)">عرض ↗</span>
          </div>`).join('')}
      </div>
    ` : ''}

    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:var(--gap); margin-bottom:calc(var(--gap)*1.5)">
      <div>
        <h2 class="section-title">${lotusSvg} توزيع التدريب بالدورة الثانية (R2)</h2>
        <div class="round-summary-grid" style="grid-template-columns:1fr; gap:10px; margin-bottom:0">
          ${DB.round2Summary.map(r => {
            const reg  = parseInt(r.registered, 10) || 0;
            const exp  = parseInt(r.expected_students, 10) || 0;
            const miss = parseInt(r.not_registered, 10) || 0;
            const pct  = exp > 0 ? Math.round((reg / exp) * 100) : 0;
            const rKey = r.round_key;

            return `
              <div class="round-card" style="cursor:default">
                <div class="round-card-name">
                  <span>${r.round_name_ar || roundLabel(rKey)}</span>
                  ${miss > 0 
                    ? `<span class="badge badge-amber num" style="cursor:pointer" onclick="openUnregisteredR2Modal('${rKey}')" title="انقر لعرض غير المسجلين فقط">${miss} غير مسجل ↗</span>` 
                    : `<span class="badge badge-emerald">مكتمل ✓</span>`}
                </div>
                
                <div class="round-reg-numbers num">
                  <span style="cursor:pointer" onclick="openRegisteredR2Modal('${rKey}')" title="انقر لعرض المسجلين فقط">${reg}</span> 
                  <span style="font-size:0.9rem; color:var(--c-text-muted)">/</span> 
                  <span style="cursor:pointer; color:var(--c-text-muted); font-size:1.2rem;" onclick="openExpectedR2Modal('${rKey}')" title="انقر لعرض كل الطلاب المتوقعين">${exp} ↗</span>
                </div>
                
                <div class="progress-wrap">
                  <div class="progress-bar">
                    <div class="progress-fill ${miss > 0 ? 'warn' : ''}" style="width:${Math.min(pct, 100)}%"></div>
                  </div>
                  <span class="num">${pct}%</span>
                </div>
                
                <div class="round-groups-label" style="cursor:pointer" onclick="showPage('schedule')" title="انقر لفتح مصفوفة التدوير">
                  الجروبات المعنية: <strong>${r.groups || '—'}</strong> ↗
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>

      <div>
        <h2 class="section-title">${lotusSvg} المجالات الأكثر طلباً</h2>
        <div class="card field-pref-card">
          <div style="font-size:0.84rem; color:var(--c-text-muted); margin-bottom:4px">
            متوسط ترتيب الرغبات (انقر على أي مجال لعرض الطلاب):
          </div>
          <div style="display:flex; flex-direction:column; gap:6px">
            ${prefAverages.map((item, idx) => {
              const barWidth = Math.max(15, Math.round(((6 - parseFloat(item.avg)) / 5) * 100));
              return `
                <div class="field-bar-item" onclick="openFieldPreferencesModal('${item.field}')" role="button" tabindex="0">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:0.86rem">
                    <span style="font-weight:700; color:var(--c-plum)">
                      <span class="badge badge-gold" style="margin-left:6px; font-size:0.75rem">#${idx + 1}</span>
                      ${item.arabicName}
                    </span>
                    <span style="color:var(--c-text-muted); font-size:0.82rem">
                      متوسط: <strong class="num" style="color:var(--c-plum)">${item.avg}</strong> ↗
                    </span>
                  </div>
                  <div class="progress-bar" style="height:8px">
                    <div class="progress-fill" style="width:${barWidth}%; background:var(--c-plum)"></div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>

    <h2 class="section-title">${lotusSvg} موقع كل جروب الآن في مصفوفة التدريب</h2>
    <div class="status-grid">
      ${DB.groups.map(g => {
        const sched = DB.roundSchedule.filter(r => r.group_id === g.group_id);
        const cur = sched.find(r => computeStatus(r.start_date, r.end_date) === 'current') || sched.find(r => computeStatus(r.start_date, r.end_date) === 'upcoming') || sched[0];
        return `
          <div class="status-card" onclick="showPage('schedule')" role="button" tabindex="0">
            <div>
              <div class="status-group-name">جروب ${g.group_id}</div>
              <div class="status-round-name">${cur.round_name_ar || roundLabel(cur.round_key)}</div>
            </div>
            ${statusBadge(computeStatus(cur.start_date, cur.end_date))}
          </div>`;
      }).join('')}
    </div>

    <h2 class="section-title">${lotusSvg} بيانات ومطابقة قوام الجروبات</h2>
    <div class="table-wrap">
      <div class="table-header">
        <span class="table-title">قائمة الجروبات وتوزيع الجنس</span>
        <input type="text" class="table-search" id="groups-search" placeholder="🔍 تصفية الجروبات…" aria-label="بحث">
      </div>
      <div style="overflow-x:auto">
        <table id="groups-table">
          <thead>
            <tr>
              <th data-col="group_id">رقم الجروب</th>
              <th data-col="group_name">اسم الجروب</th>
              <th data-col="total_students">الإجمالي</th>
              <th data-col="female_count">طالبات</th>
              <th data-col="male_count">طلاب</th>
              <th data-col="unknown">غير محدد</th>
              <th data-col="type">التصنيف</th>
            </tr>
          </thead>
          <tbody>
            ${DB.groups.map(g => {
              const tot = parseInt(g.total_students, 10) || 0;
              const f   = parseInt(g.female_count, 10) || 0;
              const m   = parseInt(g.male_count, 10) || 0;
              const unk = tot - (f + m);
              const unkBadge = unk > 0 ? `<span class="badge badge-amber num">غير محدد: ${unk}</span>` : `<span style="color:var(--c-text-subtle)">0</span>`;
              return `
                <tr class="clickable-row" onclick="openGroupRosterModal('${g.group_id}')">
                  <td class="num" data-col="group_id"><span class="cartouche-badge">جروب ${g.group_id}</span></td>
                  <td data-col="group_name"><strong>${g.group_name || '—'} ↗</strong></td>
                  <td class="num" data-col="total_students"><b>${tot}</b></td>
                  <td class="num gender-f" data-col="female_count">${f}</td>
                  <td class="num gender-m" data-col="male_count">${m}</td>
                  <td data-col="unknown">${unkBadge}</td>
                  <td data-col="type"><span class="badge badge-grey">${g.type || '—'}</span></td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  animateCountUp(document.getElementById('hero-cnt-students'), totalStudents);
  animateCountUp(document.getElementById('hero-cnt-reg'), r2TotalReg);
  animateCountUp(document.getElementById('hero-cnt-missing'), r2TotalMissing);

  const tbl = document.getElementById('groups-table');
  makeTableSortable(tbl);
  makeTableSearchable(document.getElementById('groups-search'), tbl);

  VERIFY.add('إجمالي الطلاب المقيدين (Hero)', totalStudents, () => DB.groups.reduce((acc, g) => acc + (parseInt(g.total_students, 10) || 0), 0));
  VERIFY.add('إجمالي مسجلي الدورة الثانية (Hero)', r2TotalReg, () => DB.round2Summary.reduce((acc, r) => acc + (parseInt(r.registered, 10) || 0), 0));
  VERIFY.add('إجمالي غير المسجلين (Hero)', r2TotalMissing, () => DB.round2Summary.reduce((acc, r) => acc + (parseInt(r.not_registered, 10) || 0), 0));
  VERIFY.add('عدد صفوف جدول الجروبات', DB.groups.length, () => document.querySelectorAll('#groups-table tbody tr').length);
}

function computeFieldPreferences() {
  const prefs = ['pref_Poultry', 'pref_Equine', 'pref_Pharma_Vaccines', 'pref_FoodSafety_QC', 'pref_LargeAnimal', 'pref_SmallAnimal'];
  const sums = {}, counts = {};
  prefs.forEach(p => { sums[p] = 0; counts[p] = 0; });
  DB.students.forEach(s => {
    prefs.forEach(p => {
      const val = parseFloat(s[p]);
      if (!isNaN(val) && val > 0) { sums[p] += val; counts[p]++; }
    });
  });
  return prefs.map(p => ({ field: p, arabicName: DB.fieldsMap[p] || p, avg: counts[p] ? (sums[p] / counts[p]).toFixed(2) : '0', count: counts[p] })).sort((a, b) => parseFloat(a.avg) - parseFloat(b.avg));
}

function buildOverviewAlerts() {
  const alerts = [];
  const overCapUnits = DB.stationsUnits.filter(u => {
    const cap = parseInt(u.capacity, 10); const reg = parseInt(u.registered, 10);
    return !isNaN(cap) && cap > 0 && !isNaN(reg) && reg > cap;
  });
  overCapUnits.forEach(u => alerts.push({ type: 'rose', icon: '🚨', action: "showPage('units')", html: `<strong>${u.unit_name}:</strong> تجاوزت الطاقة الاستيعابية — مسجل <strong class="num">${u.registered}</strong> وطاقتها <strong class="num">${u.capacity}</strong>.` }));
  const missingCount = DB.unregistered.length;
  if (missingCount > 0) alerts.push({ type: 'amber', icon: '⚠️', action: "showPage('not-registered')", html: `يوجد <strong class="num">${missingCount}</strong> طالب/ة غير مسجلين في الدورة الثانية حتى الآن.` });
  return alerts;
}

window.openRegisteredR2Modal = function(roundKey = null) {
  const filtered = roundKey ? DB.assignments.filter(a => a.round_key === roundKey) : DB.assignments;
  const title = roundKey ? `المسجلون في ${roundLabel(roundKey)}` : 'مسجلون بالدورة الثانية';
  const students = filtered.map(a => DB.studentLookup[`${a.group_id}_${a.code_short}`] || a);
  renderStudentListModal(title, students, `<span>الرئيسية</span> <span>›</span> <strong>${title}</strong>`);
};

window.openUnregisteredR2Modal = function(roundKey) {
  const filtered = DB.unregistered.filter(u => u.round_key === roundKey);
  const students = filtered.map(u => DB.studentLookup[`${u.group_id}_${u.code_short}`] || u);
  renderStudentListModal(`غير المسجلين في ${roundLabel(roundKey)}`, students, `<span>الرئيسية</span> <span>›</span> <strong>${roundLabel(roundKey)}</strong>`);
};

window.openExpectedR2Modal = function(roundKey) {
  const reg = DB.assignments.filter(a => a.round_key === roundKey);
  const unreg = DB.unregistered.filter(u => u.round_key === roundKey);
  const all = [...reg, ...unreg];
  const unique = []; const seen = new Set();
  all.forEach(item => {
    const key = `${item.group_id}_${item.code_short}`;
    if (!seen.has(key)) { seen.add(key); unique.push(DB.studentLookup[key] || item); }
  });
  renderStudentListModal(`الطلاب المتوقعين في ${roundLabel(roundKey)}`, unique, `<span>الرئيسية</span> <span>›</span> <strong>${roundLabel(roundKey)}</strong>`);
};

window.openFieldPreferencesModal = function(fieldKey) {
  const arabicName = DB.fieldsMap[fieldKey] || fieldKey;
  const topStudents = DB.students.filter(s => parseInt(s[fieldKey], 10) === 1);
  renderStudentListModal(`الرغبة الأولى: ${arabicName}`, topStudents, `<span>الرئيسية</span> <span>›</span> <span>الرغبات</span>`);
};