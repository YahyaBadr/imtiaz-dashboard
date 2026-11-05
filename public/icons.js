'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   icons.js — مجموعة أيقونات SVG موحّدة (Lucide/Tabler style) بدل الإيموجي.
   كل الأيقونات: viewBox 24، stroke=currentColor، stroke-width 2، duotone اختياري
   تُستخدم داخل chips ملوّنة حسب القطاع (حفظ ترميز الألوان الحالي).
   ═══════════════════════════════════════════════════════════════════════════ */

window.ICONS = {
  'building': '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  'hospital': '<path d="M12 6v4"/><path d="M14 8h-4"/><path d="M3 22V8l9-6 9 6v14"/><path d="M9 22v-4h6v4"/>',
  'landmark': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M12 22V10"/>',
  'chicken': '<circle cx="12" cy="8" r="5"/><path d="M4 21c1.5-3 4-5 8-5s6.5 2 8 5"/><path d="M14 6h.01"/>',
  'meat': '<path d="M14.5 3.5a5.5 5.5 0 0 0-7.8 7.8L3 15v6h6l3.7-3.7a5.5 5.5 0 0 0 7.8-7.8l-3 3-2.5-2.5z"/>',
  'microscope': '<path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/>',
  'star': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  'pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  'horse': '<path d="M19 17v2a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a7 7 0 0 1 14 0v10a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V7a9 9 0 0 1 18 0v10a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-2a1 1 0 0 0-1-1V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a1 1 0 0 1-1-1H20a1 1 0 0 0-1-1"/><circle cx="10" cy="11" r="2"/><circle cx="16" cy="11" r="2"/>',
  'fish': '<path d="M11 14.56a5 5 0 0 1 5-4.24M16 14l5-5M12 2a7.5 7.5 0 0 1 7.5 7.5c0 2.12-1.5 3.91-3.5 4.77M4.5 9.5C3 11.61 3 15.39 4.5 17.5M12 2a7.5 7.5 0 0 0-7.5 7.5c0 2.12 1.5 3.91 3.5 4.77M4.5 9.5l7 7M9.5 19.5l2.5 2.5M12 20a7.5 7.5 0 0 0 7.5-7.5M16 4.5l-7 7M20 19.5a7.5 7.5 0 0 0-7.5-7.5M4 4.5l7 7M12 4a7.5 7.5 0 0 1 7.5 7.5M4.5 9.5l7-7M9.5 4.5l-2.5-2.5"/>',
  'calendar': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  'chart': '<line x1="6" x2="6" y1="20" y2="14"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="18" x2="18" y1="20" y2="10"/>',
  'warning': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  'check': '<path d="M20 6 9 17l-5-5"/>',
  'copy': '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  'print': '<polyline points="6 9 6 2 H6 2"/><path d="M6 18H6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v8v8H6z"/><path d="M6 14V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12z"/><path d="M7 15h2"/><path d="M10 15h2"/><path d="M10 18H8v2z"/>',
  'refresh': '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>',
  'eye': '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.56 2.54"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.35-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
  'lock': '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'search': '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'upload': '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  'download': '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  'printer': '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  'moon': '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>',
  'presentation': '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  'trash': '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'chevron': '<path d="m9 18 6-6-6-6"/>',
  'phone': '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  'mail': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/>',
  'external': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  'wifi-off': '<line x1="2" x2="22" y1="2" y2="22"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 4.17-2.64"/><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"/><path d="M16.85 11.25a10 10 0 0 1 2.22 1.68"/><path d="M5 13a10 10 0 0 1 5.24-2.76"/><line x1="12" x2="12.01" y1="20" y2="20"/>',
  'sparkles': '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  'globe': '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  'female': '<circle cx="12" cy="8" r="5"/><path d="M12 13v8"/><path d="M9 18h6"/>',
  'male': '<circle cx="10" cy="14" r="5"/><path d="M19 5 13.7 10.3"/><path d="M15 5h4v4"/>',
  'banknote': '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/>',
  'user-x': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/>',
  'receipt': '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  'satellite-dish': '<path d="M4 10a7.3 7.3 0 0 0 10 10Z"/><path d="m9 15 3-3"/><path d="M17 13a6 6 0 0 0-6-6"/><path d="M21 13A10 10 0 0 0 11 3"/>',
  'megaphone': '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  'clipboard': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  'share': '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  'plus-circle': '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  'sliders': '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
  'compass': '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  'shield': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  'grid': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  'boxes': '<path d="M2.97 12.92A2 2 0 0 0 4 15.5c.8 0 1.52-.4 1.95-1.03"/><path d="M12 3.8V3.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v.3"/><path d="M21.03 12.92A2 2 0 0 1 20 15.5c-.8 0-1.52-.4-1.95-1.03"/><path d="M6.25 3.5c.8 0 1.52.4 1.95 1.03"/><path d="M7 15.5A2 2 0 0 1 9 17.5c.8 0 1.52-.4 1.95-1.03"/><path d="M9.03 12.92A2 2 0 0 1 11 15.5c.8 0 1.52-.4 1.95-1.03"/><path d="M9.5 14.5h5"/><path d="M9.5 8.5h5"/><path d="M14 15.5A2 2 0 0 0 16 17.5c.8 0 1.52-.4 1.95-1.03"/><path d="M17.75 3.5c-.8 0-1.52.4-1.95 1.03"/><path d="M15 6.5a2 2 0 0 0-2-2 2 2 0 0 0-2 2v1a2 2 0 0 0 2 2 2 2 0 0 0 2-2Z"/><path d="M4.5 10.5a2 2 0 0 0-2 2 2 2 0 0 0 2 2 2 2 0 0 0 2-2"/><path d="M19.5 10.5a2 2 0 0 1 2 2 2 2 0 0 1-2 2 2 2 0 0 1-2-2"/><path d="M12 17.5v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h2"/><path d="M12 17.5v3a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/><path d="M12 6.5v-3a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M12 6.5v-3a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/>',
  'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'bar-chart': '<line x1="6" x2="6" y1="20" y2="14"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="18" x2="18" y1="20" y2="10"/>',
  'satellite-dish-alt': '<path d="M4 10a7.3 7.3 0 0 0 10 10Z"/><path d="m9 15 3-3"/><path d="M17 13a6 6 0 0 0-6-6"/><path d="M21 13A10 10 0 0 0 11 3"/>',
  'whatsapp': '<path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',
  'id-card': '<rect width="20" height="16" x="2" y="4" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M8 14c-2 0-3 1-3 2"/><path d="M14 8h4"/><path d="M14 12h4"/><path d="M14 16h2"/>',
  'key': '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.708 7.708 5.5 5.5 0 0 1 7.708-7.708zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  'book': '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  'medal': '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2H21a2 2 0 0 1 .13 2.2L16.79 15"/><path d="M11 12 8 17l4 5 4-5-3-5"/><circle cx="12" cy="8" r="2"/>',
  'plug': '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  'filter': '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  'list': '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 6h13"/><path d="M8 18h13"/>',
  'pie': '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  'trend': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'target': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  'flag': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  'history': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  'sheet': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  'pdf': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-3"/><path d="M9 16v2"/><path d="M14 13v5"/><path d="M14 13h2"/><path d="M17.5 15.5a1.5 1.5 0 0 0-1.5-1.5"/>',
  'word': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m7 13 2 5 2-5 2 5 2-5"/>',
  'excel': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9.5 9 5 5"/><path d="m14.5 9-5 5"/>',
  'csv': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/>',
  'passport': '<rect width="16" height="22" x="4" y="1" rx="2"/><path d="M4 9h16"/><path d="M4 13h16"/><path d="M4 17h16"/><circle cx="12" cy="13" r="2"/>'
};

// أيقونة مصغّرة بحجم ثابت (تُستخدم داخل الشارات والأزرار)
window.ico = function (name, size) {
  return `<svg class="ico${size ? ' s' + size : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${window.ICONS[name] || window.ICONS['pin']}</svg>`;
};

window.iconSvg = function (name, cls) {
  const p = window.ICONS[name] || window.ICONS['pin'];
  return `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
};

// شريحة أيقونة ثنائية اللون (duotone chip) — الخلفية بلون القطاع مع شفافية
window.iconChip = function (name, toneCls) {
  return `<span class="ico-chip ${toneCls || ''}" aria-hidden="true">${window.iconSvg(name)}</span>`;
};
