/**
 * generateReportPdf.js
 *
 * Builds a pdfmake document definition for the AgriSense Farm Health Report.
 * Call buildReportPdf(data, role) to get a pdfmake TDocumentDefinitions object,
 * then use pdfmake to open or download it.
 *
 * @param {object} data  - The saved_report row from the API (includes farm/farmer/supervisor meta)
 * @param {string} role  - 'supervisor' | 'manager' | 'farmer'
 *                         Only 'supervisor' sees the AI Consultant Notes section.
 * @param {object} [aiAdvice] - Optional consultAI result ({ potential_risks, suggested_treatments, notes })
 *                              Only included when role === 'supervisor' and advice was generated.
 */

// ─── Color palette ────────────────────────────────────────────────────────────
const COLORS = {
  green:       '#16a34a',
  greenLight:  '#f0fdf4',
  greenBorder: '#86efac',
  yellow:      '#d97706',
  yellowLight: '#fffbeb',
  yellowBorder:'#fcd34d',
  red:         '#dc2626',
  redLight:    '#fff5f5',
  redBorder:   '#fecaca',
  grey:        '#6b7280',
  greyLight:   '#f9fafb',
  greyBorder:  '#e5e7eb',
  text:        '#111827',
  muted:       '#6b7280',
  primary:     '#166534',   // AgriSense brand green
  primaryBg:   '#052e16',
  accent:      '#22c55e',
  white:       '#ffffff',
  divider:     '#e5e7eb',
};

// ─── Health tier → visual config ─────────────────────────────────────────────
function getHealthConfig(report) {
  const health = (report?.current_health || '').toLowerCase();
  const risks  = report?.risks || [];

  if (risks.length > 0 || health.includes('risk') || health.includes('critical')) {
    return { label: 'AT RISK', color: COLORS.red, bg: COLORS.redLight, border: COLORS.redBorder, icon: '⚠' };
  }
  if (health.includes('attention') || health.includes('monitor') || health.includes('concern')) {
    return { label: 'ATTENTION NEEDED', color: COLORS.yellow, bg: COLORS.yellowLight, border: COLORS.yellowBorder, icon: '!' };
  }
  if (health.includes('no agricultural') || health.includes('no observations')) {
    return { label: 'NO DATA', color: COLORS.grey, bg: COLORS.greyLight, border: COLORS.greyBorder, icon: '—' };
  }
  return { label: 'HEALTHY', color: COLORS.green, bg: COLORS.greenLight, border: COLORS.greenBorder, icon: '✓' };
}

// ─── Date formatting helpers ──────────────────────────────────────────────────
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Section header builder ───────────────────────────────────────────────────
function sectionHeader(title, emoji) {
  return {
    columns: [
      {
        text: `${emoji}  ${title}`,
        fontSize: 11,
        bold: true,
        color: COLORS.primary,
        margin: [0, 0, 0, 8],
      },
    ],
    margin: [0, 16, 0, 0],
  };
}

// ─── Thin divider line ────────────────────────────────────────────────────────
function divider() {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: COLORS.divider }],
    margin: [0, 4, 0, 12],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main builder
// ─────────────────────────────────────────────────────────────────────────────
export function buildReportPdf(data, role = 'farmer', aiAdvice = null) {
  const sr      = data.saved_report || data;  // handle both shapes
  const content = sr.content || {};
  const hcfg    = getHealthConfig(content);

  const farmName       = sr.farm_name       || 'Unknown Farm';
  const location       = sr.location        || '—';
  const cropTypes      = Array.isArray(sr.crop_types) ? sr.crop_types.join(', ') : (sr.crop_types || '—');
  const farmerName     = sr.farmer_name     || '—';
  const supervisorName = sr.supervisor_name || '—';
  const reportNumber   = sr.report_number   || 1;
  const visitCount     = sr.visit_count     || 0;
  const savedAt        = sr.saved_at        || new Date().toISOString();

  const instructions   = content.supervisor_instructions || [];
  const completedTasks = Array.isArray(sr.completed_tasks) ? sr.completed_tasks : [];
  const risks          = content.risks || [];

  // ── SECTION: Cover / Header ───────────────────────────────────────────────
  const headerSection = [
    // Top brand bar
    {
      table: {
        widths: ['*'],
        body: [[
          {
            stack: [
              {
                columns: [
                  {
                    text: '🌾 AgriSense',
                    fontSize: 16,
                    bold: true,
                    color: COLORS.white,
                    width: '*',
                  },
                  {
                    text: `Report #${reportNumber}`,
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.75)',
                    alignment: 'right',
                    width: 'auto',
                    margin: [0, 3, 0, 0],
                  },
                ],
              },
              {
                text: 'FARM HEALTH REPORT',
                fontSize: 11,
                color: 'rgba(255,255,255,0.85)',
                letterSpacing: 2,
                margin: [0, 2, 0, 0],
              },
            ],
            fillColor: COLORS.primaryBg,
            margin:    [20, 14, 20, 14],
          },
        ]],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 0],
    },

    // Farm info grid
    {
      table: {
        widths: ['*', '*'],
        body: [
          [
            {
              stack: [
                { text: farmName,  fontSize: 14, bold: true, color: COLORS.text },
                { text: location,  fontSize: 9,  color: COLORS.muted, margin: [0, 2, 0, 0] },
                { text: `Crops: ${cropTypes}`, fontSize: 9, color: COLORS.muted, margin: [0, 2, 0, 0] },
              ],
              margin: [0, 12, 0, 8],
            },
            {
              stack: [
                { text: `👤 Farmer: ${farmerName}`,     fontSize: 9, color: COLORS.text, margin: [0, 2, 0, 2] },
                { text: `🧑‍💼 Supervisor: ${supervisorName}`, fontSize: 9, color: COLORS.text, margin: [0, 0, 0, 2] },
                { text: `📅 Saved: ${fmtDateTime(savedAt)}`, fontSize: 9, color: COLORS.muted },
              ],
              alignment: 'right',
              margin: [0, 12, 0, 8],
            },
          ],
        ],
      },
      layout:  'noBorders',
      margin:  [0, 0, 0, 4],
    },

    // Report period banner
    {
      table: {
        widths: ['*'],
        body: [[
          {
            text: `Based on ${visitCount} field visit${visitCount !== 1 ? 's' : ''}`,
            fontSize: 9,
            color:    COLORS.primary,
            bold:     true,
            alignment: 'center',
            fillColor: COLORS.greenLight,
            margin:    [0, 7, 0, 7],
          },
        ]],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => COLORS.greenBorder,
      },
      margin: [0, 0, 0, 0],
    },
  ];

  // ── SECTION: Health Status Banner ────────────────────────────────────────
  const healthSection = [
    sectionHeader('Health Status', '🌿'),
    divider(),
    {
      table: {
        widths: ['auto', '*'],
        body: [[
          {
            text:      hcfg.icon,
            fontSize:  22,
            color:     hcfg.color,
            bold:      true,
            margin:    [12, 10, 12, 10],
            fillColor: hcfg.bg,
          },
          {
            stack: [
              { text: hcfg.label, fontSize: 10, bold: true, color: hcfg.color, margin: [0, 0, 0, 4] },
              { text: content.current_health || 'No health information recorded.', fontSize: 9.5, color: COLORS.text, lineHeight: 1.5 },
            ],
            margin:    [0, 10, 12, 10],
            fillColor: hcfg.bg,
          },
        ]],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => hcfg.border,
      },
      margin: [0, 0, 0, 0],
    },
  ];

  // ── SECTION: Risks ────────────────────────────────────────────────────────
  const riskSection = [
    sectionHeader('Risks Identified', '⚠️'),
    divider(),
    risks.length > 0
      ? {
          ul: risks.map(r => ({ text: r, fontSize: 9.5, color: COLORS.text, lineHeight: 1.5, margin: [0, 2, 0, 2] })),
          margin: [0, 0, 0, 0],
        }
      : { text: 'No risks identified in this report period.', fontSize: 9.5, color: COLORS.muted, italics: true },
  ];

  // ── SECTION: Action Items / Checklist ─────────────────────────────────────
  const actionRows = instructions.length > 0
    ? instructions.map((step, i) => {
        const done = completedTasks.includes(step);
        return {
          columns: [
            {
              canvas: done
                ? [
                    { type: 'rect', x: 0, y: 0, w: 14, h: 14, r: 3, color: COLORS.green },
                    { type: 'polyline', closePath: false, lineWidth: 1.5, lineColor: '#fff',
                      points: [{ x: 3, y: 7 }, { x: 5.5, y: 10 }, { x: 11, y: 4 }] },
                  ]
                : [
                    { type: 'rect', x: 0, y: 0, w: 14, h: 14, r: 3, lineWidth: 1, lineColor: COLORS.greyBorder, color: '#fff' },
                  ],
              width: 18,
              margin: [0, 2, 0, 0],
            },
            {
              text: step,
              fontSize: 9.5,
              color: done ? COLORS.green : COLORS.text,
              decoration: done ? 'lineThrough' : undefined,
              lineHeight: 1.5,
              margin: [6, 0, 0, 0],
            },
          ],
          margin: [0, 4, 0, 4],
        };
      })
    : [{ text: 'No instructions recorded.', fontSize: 9.5, color: COLORS.muted, italics: true }];

  const completedCount = instructions.filter(s => completedTasks.includes(s)).length;
  const progressPct    = instructions.length > 0 ? Math.round((completedCount / instructions.length) * 100) : 0;

  const actionSection = [
    sectionHeader('Action Items', '📋'),
    divider(),
    // Progress summary
    instructions.length > 0
      ? {
          columns: [
            { text: `${completedCount} of ${instructions.length} tasks completed`, fontSize: 8.5, color: COLORS.muted },
            { text: `${progressPct}%`, fontSize: 8.5, bold: true, color: progressPct === 100 ? COLORS.green : COLORS.yellow, alignment: 'right' },
          ],
          margin: [0, 0, 0, 8],
        }
      : {},
    ...actionRows,
  ];

  // ── SECTION: AI Consultant Notes (supervisor only) ────────────────────────
  const consultantSection = (role === 'supervisor' && aiAdvice)
    ? [
        sectionHeader('AI Consultant Notes', '🧠'),
        divider(),
        {
          table: {
            widths: ['*'],
            body: [[
              {
                stack: [
                  {
                    text: '⚠️  AI-generated suggestions only — not supervisor orders. Verify with a certified agronomist before acting.',
                    fontSize: 8,
                    italics: true,
                    color:   COLORS.yellow,
                    margin:  [0, 0, 0, 8],
                  },
                  ...(aiAdvice.potential_risks?.length > 0 ? [
                    { text: 'Potential Risks', fontSize: 9, bold: true, color: COLORS.text, margin: [0, 0, 0, 4] },
                    {
                      ul: aiAdvice.potential_risks.map(r => ({ text: r, fontSize: 9, color: COLORS.text, lineHeight: 1.5 })),
                      margin: [0, 0, 0, 8],
                    },
                  ] : []),
                  ...(aiAdvice.suggested_treatments?.length > 0 ? [
                    { text: 'Suggested Treatments', fontSize: 9, bold: true, color: COLORS.text, margin: [0, 0, 0, 4] },
                    {
                      ul: aiAdvice.suggested_treatments.map(t => ({ text: t, fontSize: 9, color: COLORS.text, lineHeight: 1.5 })),
                      margin: [0, 0, 0, 8],
                    },
                  ] : []),
                  ...(aiAdvice.notes ? [
                    { text: aiAdvice.notes, fontSize: 8.5, italics: true, color: COLORS.muted },
                  ] : []),
                ],
                fillColor: COLORS.yellowLight,
                margin:    [12, 10, 12, 10],
              },
            ]],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0,
            hLineColor: () => COLORS.yellowBorder,
          },
        },
      ]
    : [];

  // ── SECTION: Footer ───────────────────────────────────────────────────────
  const footerSection = [
    divider(),
    {
      columns: [
        {
          text: `Approved by ${supervisorName} · ${fmtDate(savedAt)}`,
          fontSize: 7.5,
          color:    COLORS.muted,
        },
        {
          text: '🔒 Strictly generated from supervisor transcripts only',
          fontSize: 7.5,
          color:    COLORS.muted,
          alignment: 'right',
        },
      ],
      margin: [0, 4, 0, 0],
    },
  ];

  // ── Assemble document definition ──────────────────────────────────────────
  return {
    pageSize:    'A4',
    pageMargins: [40, 40, 40, 50],

    footer: (currentPage, pageCount) => ({
      columns: [
        { text: `AgriSense · Farm Health Report · ${farmName}`, fontSize: 7, color: COLORS.muted, margin: [40, 0, 0, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, fontSize: 7, color: COLORS.muted, alignment: 'right', margin: [0, 0, 40, 0] },
      ],
      margin: [0, 10, 0, 0],
    }),

    content: [
      ...headerSection,
      ...healthSection,
      ...riskSection,
      ...actionSection,
      ...consultantSection,
      ...footerSection,
    ],

    defaultStyle: {
      font:     'Roboto',
      fontSize: 10,
      color:    COLORS.text,
    },
  };
}

/**
 * downloadReportPdf(data, role, aiAdvice)
 * Convenience wrapper — builds the doc and triggers a browser download.
 */
export async function downloadReportPdf(data, role = 'farmer', aiAdvice = null) {
  // pdfmake uses dynamic imports of its font files, which are large.
  // We import lazily here so the main bundle stays lean.
  const pdfMake = (await import('pdfmake/build/pdfmake')).default;
  const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default;
  pdfMake.vfs = pdfFonts.pdfMake?.vfs || pdfFonts.vfs;

  const sr         = data.saved_report || data;
  const farmName   = sr.farm_name    || 'Farm';
  const reportNum  = sr.report_number || 1;
  const filename   = `AgriSense_Report_${farmName.replace(/\s+/g, '_')}_#${reportNum}.pdf`;

  const docDef = buildReportPdf(data, role, aiAdvice);
  pdfMake.createPdf(docDef).download(filename);
}

/**
 * openReportPdfInTab(data, role, aiAdvice)
 * Opens the PDF in a new browser tab (useful for supervisor preview before saving).
 */
export async function openReportPdfInTab(data, role = 'supervisor', aiAdvice = null) {
  const pdfMake  = (await import('pdfmake/build/pdfmake')).default;
  const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default;
  pdfMake.vfs = pdfFonts.pdfMake?.vfs || pdfFonts.vfs;

  const docDef = buildReportPdf(data, role, aiAdvice);
  pdfMake.createPdf(docDef).open();
}
