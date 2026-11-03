'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   config.js — App Configuration, Security & Feature Flags
   ═══════════════════════════════════════════════════════════════════════════ */

window.APP_CONFIG = {
  // Toggle visibility of Data notes page and technical data error alerts
  SHOW_DATA_NOTES: false,

  // Last data update timestamp shown in the header
  LAST_DATA_UPDATE: '3 نوفمبر 2026',

  // Configured authorized email placeholder for Cloudflare Access
  VICE_DEAN_EMAIL: 'vicedean@cu.edu.eg',

  // Academic year and term
  ACADEMIC_YEAR: '2026 / 2027',

  // National ID default visibility (masked by default as ••••)
  SHOW_NID_BY_DEFAULT: false,

  // Presentation Mode (hides contact details and enlarged text for projector)
  PRESENTATION_MODE: false,

  // Edit Mode capability (built in stage 2)
  ENABLE_EDIT_MODE: false
};
