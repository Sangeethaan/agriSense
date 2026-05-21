/**
 * generateReportPdf.js  — Premium AgriSense Farm Health Report
 *
 * @param {object} data      - Saved report row from the API
 * @param {string} role      - 'supervisor' | 'manager' | 'farmer'
 * @param {object} aiAdvice  - Optional AI consultant result (supervisor only)
 */

// ─── Brand & Color Palette ────────────────────────────────────────────────────
const C = {
  // Brand (Deep Forest Slate)
  brand:       '#0f172a', // Slate 900
  brandMid:    '#1e293b', // Slate 800
  brandLight:  '#0f766e', // Teal 700
  brandAccent: '#2dd4bf', // Teal 400
  brandSoft:   '#f0fdfa', // Teal 50

  // Status
  green:       '#0d9488', // Teal 600
  greenLight:  '#f0fdfa', // Teal 50
  greenBorder: '#99f6e4', // Teal 200
  greenText:   '#115e59', // Teal 800

  amber:       '#d97706', // Amber 600
  amberLight:  '#fffbeb', // Amber 50
  amberBorder: '#fde68a', // Amber 200
  amberText:   '#78350f', // Amber 800

  red:         '#e11d48', // Rose 600
  redLight:    '#fff1f2', // Rose 50
  redBorder:   '#fecdd3', // Rose 200
  redText:     '#9f1239', // Rose 800

  grey:        '#64748b', // Slate 500
  greyLight:   '#f8fafc', // Slate 50
  greyBorder:  '#e2e8f0', // Slate 200
  greyText:    '#475569', // Slate 600

  // Text
  ink:         '#0f172a', // Slate 900
  muted:       '#64748b', // Slate 500
  white:       '#ffffff',
  divider:     '#e2e8f0', // Slate 200
};

// ─── Health tier config ───────────────────────────────────────────────────────
function getHealthConfig(report) {
  const health = (report?.current_health || '').toLowerCase();
  const risks  = report?.risks || [];

  if (risks.length > 0 || health.includes('urgent') || health.includes('critical') || health.includes('risk')) {
    return {
      label: 'AT RISK',
      sublabel: 'Immediate attention required',
      color: C.red, bg: C.redLight, border: C.redBorder, text: C.redText,
      icon: '⚠', score: 'HIGH RISK',
    };
  }
  if (health.includes('attention') || health.includes('monitor') || health.includes('concern') || health.includes('moderate')) {
    return {
      label: 'NEEDS ATTENTION',
      sublabel: 'Monitor closely and take preventive action',
      color: C.amber, bg: C.amberLight, border: C.amberBorder, text: C.amberText,
      icon: '!', score: 'MODERATE',
    };
  }
  if (!health || health.includes('no agricultural') || health.includes('no observations') || health.includes('no health')) {
    return {
      label: 'NO DATA',
      sublabel: 'No health observations recorded yet',
      color: C.grey, bg: C.greyLight, border: C.greyBorder, text: C.greyText,
      icon: '—', score: 'UNKNOWN',
    };
  }
  return {
    label: 'HEALTHY',
    sublabel: 'Farm is in good condition',
    color: C.green, bg: C.greenLight, border: C.greenBorder, text: C.greenText,
    icon: '✓', score: 'GOOD',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d)     { return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'; }
function fmtDateTime(d) { return d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }

// Thin horizontal rule
function rule(marginTop = 8, marginBottom = 14) {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.6, lineColor: C.divider }],
    margin: [0, marginTop, 0, marginBottom],
  };
}

// Section heading with left accent bar
function heading(title) {
  return {
    columns: [
      {
        canvas: [{ type: 'rect', x: 0, y: 0, w: 3, h: 16, r: 2, color: C.brandLight }],
        width: 10,
        margin: [0, 1, 0, 0],
      },
      {
        text: title.toUpperCase(),
        fontSize: 8,
        bold: true,
        color: C.brandLight,
        letterSpacing: 1.5,
        margin: [4, 2, 0, 0],
      },
    ],
    margin: [0, 20, 0, 10],
  };
}

// Key-value row for metadata table
function kvRow(label, value) {
  return [
    { text: label, fontSize: 8.5, color: C.muted, bold: true, margin: [0, 4, 0, 4] },
    { text: value || '—', fontSize: 8.5, color: C.ink, margin: [0, 4, 0, 4] },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main builder
// ─────────────────────────────────────────────────────────────────────────────
export function buildReportPdf(data, role = 'farmer', aiAdvice = null) {
  const sr      = data.saved_report || data;
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

  const instructions   = content.supervisor_instructions || content.next_steps || [];
  const completedTasks = Array.isArray(sr.completed_tasks) ? sr.completed_tasks : [];
  const risks          = content.risks || [];
  const completedCount = instructions.filter(s => completedTasks.includes(s)).length;
  const progressPct    = instructions.length > 0 ? Math.round((completedCount / instructions.length) * 100) : 0;

  // ─── COVER HEADER ────────────────────────────────────────────────────────
  const coverHeader = [
    // Full-width dark brand bar
    {
      table: {
        widths: ['*'],
        body: [[{
          stack: [
            // Top row: brand + report number
            {
              columns: [
                {
                  stack: [
                    { text: 'AGRISENSE', fontSize: 9, bold: true, color: C.brandAccent, letterSpacing: 3, margin: [0, 0, 0, 3] },
                    { text: 'Farm Health Report', fontSize: 20, bold: true, color: C.white, margin: [0, 0, 0, 2] },
                    {
                      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 60, y2: 0, lineWidth: 2, lineColor: C.brandAccent }],
                      margin: [0, 6, 0, 0],
                    },
                  ],
                  width: '*',
                },
                {
                  stack: [
                    {
                      table: {
                        widths: ['auto'],
                        body: [[{
                          text: `#${reportNumber}`,
                          fontSize: 22,
                          bold: true,
                          color: C.white,
                          alignment: 'center',
                          fillColor: 'rgba(255,255,255,0.1)',
                          margin: [14, 6, 14, 6],
                        }]],
                      },
                      layout: {
                        hLineWidth: () => 1,
                        vLineWidth: () => 1,
                        hLineColor: () => 'rgba(255,255,255,0.18)',
                        vLineColor: () => 'rgba(255,255,255,0.18)',
                      },
                    },
                    { text: 'REPORT NO.', fontSize: 7, color: 'rgba(255,255,255,0.5)', alignment: 'center', margin: [0, 4, 0, 0] },
                  ],
                  width: 'auto',
                  alignment: 'right',
                },
              ],
            },
          ],
          fillColor: C.brand,
          margin: [28, 24, 28, 24],
        }]],
      },
      layout: 'noBorders',
      margin: [-40, -40, -40, 0],
    },

    // Farm name + meta row
    {
      table: {
        widths: ['*', 'auto'],
        body: [[
          {
            stack: [
              { text: farmName, fontSize: 18, bold: true, color: C.ink, margin: [0, 0, 0, 4] },
              {
                columns: [
                  location !== '—' ? { text: `📍 ${location}`, fontSize: 8.5, color: C.muted } : {},
                  cropTypes !== '—' ? { text: `🌾 ${cropTypes}`, fontSize: 8.5, color: C.muted } : {},
                ],
                columnGap: 16,
              },
            ],
            margin: [0, 20, 0, 12],
          },
          {
            stack: [
              { text: `👤  ${farmerName}`,         fontSize: 8.5, color: C.ink,   margin: [0, 2, 0, 3] },
              { text: `🧑‍💼  ${supervisorName}`,     fontSize: 8.5, color: C.ink,   margin: [0, 0, 0, 3] },
              { text: `📅  ${fmtDateTime(savedAt)}`, fontSize: 8,   color: C.muted, margin: [0, 0, 0, 0] },
            ],
            alignment: 'right',
            margin: [0, 20, 0, 12],
          },
        ]],
      },
      layout: 'noBorders',
    },

    // Stats bar
    {
      table: {
        widths: ['*', '*', '*'],
        body: [[
          {
            text: [`${visitCount}\n`, { text: 'Field Visits Analysed', fontSize: 7.5, color: C.muted }],
            fontSize: 18, bold: true, color: C.brandLight,
            alignment: 'center',
            fillColor: C.brandSoft,
            margin: [0, 12, 0, 12],
          },
          {
            text: [`${instructions.length}\n`, { text: 'Action Items Issued', fontSize: 7.5, color: C.muted }],
            fontSize: 18, bold: true, color: C.brandLight,
            alignment: 'center',
            fillColor: C.brandSoft,
            margin: [0, 12, 0, 12],
          },
          {
            text: [`${progressPct}%\n`, { text: 'Task Completion', fontSize: 7.5, color: C.muted }],
            fontSize: 18, bold: true, color: progressPct === 100 ? C.green : C.brandLight,
            alignment: 'center',
            fillColor: C.brandSoft,
            margin: [0, 12, 0, 12],
          },
        ]],
      },
      layout: {
        hLineWidth: (i, node) => (i === 0 || i === node.table.body.length) ? 0 : 0,
        vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length) ? 0 : 1,
        vLineColor: () => C.greenBorder,
      },
      margin: [0, 0, 0, 0],
    },

    rule(0, 0),
  ];

  // ─── HEALTH STATUS ────────────────────────────────────────────────────────
  const healthSection = [
    heading('Health Status'),
    {
      table: {
        widths: ['*'],
        body: [[
          {
            stack: [
              {
                columns: [
                  { text: `${hcfg.icon}  ${hcfg.label}`, color: hcfg.color, bold: true, fontSize: 8.5, letterSpacing: 1.5, width: 'auto' },
                  { text: hcfg.sublabel.toUpperCase(), color: C.muted, fontSize: 7.5, bold: true, letterSpacing: 1, margin: [12, 1, 0, 0] }
                ],
                margin: [0, 0, 0, 10]
              },
              {
                text: content.current_health || 'No health information has been recorded for this reporting period.',
                fontSize: 9.5,
                color: C.ink,
                lineHeight: 1.65,
              }
            ],
            fillColor: hcfg.bg,
            margin: [18, 16, 18, 16]
          }
        ]]
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i) => (i === 0) ? 4 : 0,
        vLineColor: () => hcfg.color,
      },
      margin: [0, 0, 0, 14]
    },
  ];

  // ─── RISKS IDENTIFIED ─────────────────────────────────────────────────────
  const riskSection = [
    heading('Risks Identified'),
    risks.length > 0
      ? {
          table: {
            widths: ['*'],
            body: [[
              {
                stack: [
                  {
                    columns: [
                      { text: '⚠  POTENTIAL RISKS DETECTED', color: C.red, bold: true, fontSize: 8.5, letterSpacing: 1.5, width: 'auto' }
                    ],
                    margin: [0, 0, 0, 10]
                  },
                  {
                    ul: risks.map(r => ({ text: r, fontSize: 9.5, color: C.ink, lineHeight: 1.55 })),
                    margin: [4, 0, 0, 0]
                  }
                ],
                fillColor: C.redLight,
                margin: [18, 16, 18, 16]
              }
            ]]
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i) => (i === 0) ? 4 : 0,
            vLineColor: () => C.red,
          },
          margin: [0, 0, 0, 14]
        }
      : {
          table: {
            widths: ['*'],
            body: [[
              {
                stack: [
                  {
                    columns: [
                      { text: '✓  NO RISKS IDENTIFIED', color: C.green, bold: true, fontSize: 8.5, letterSpacing: 1.5, width: 'auto' },
                      { text: 'ALL SYSTEMS STABLE', color: C.muted, fontSize: 7.5, bold: true, letterSpacing: 1, margin: [12, 1, 0, 0] }
                    ],
                    margin: [0, 0, 0, 6]
                  },
                  {
                    text: 'No biosecurity, pest, or crop health risks were identified in this reporting period.',
                    fontSize: 9.5,
                    color: C.ink,
                    lineHeight: 1.6,
                  }
                ],
                fillColor: C.greenLight,
                margin: [18, 16, 18, 16]
              }
            ]]
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i) => (i === 0) ? 4 : 0,
            vLineColor: () => C.green,
          },
          margin: [0, 0, 0, 14]
        },
  ];

  // ─── ACTION ITEMS / CHECKLIST ─────────────────────────────────────────────
  const taskRows = instructions.length > 0
    ? instructions.map((step, i) => {
        const done = completedTasks.includes(step);
        return {
          unbreakable: true,
          columns: [
            // Number/check circle
            {
              canvas: done
                ? [
                    { type: 'ellipse', x: 9, y: 9, r1: 9, r2: 9, color: C.green },
                    { type: 'polyline', closePath: false, lineWidth: 1.8, lineColor: C.white,
                      points: [{ x: 5, y: 9 }, { x: 8, y: 12 }, { x: 14, y: 6 }] },
                  ]
                : [
                    { type: 'ellipse', x: 9, y: 9, r1: 9, r2: 9, color: C.brandSoft },
                    { type: 'ellipse', x: 9, y: 9, r1: 9, r2: 9, lineWidth: 1, lineColor: C.greyBorder, color: 'transparent' },
                    { type: 'rect', x: 7, y: 7, w: 4, h: 4, color: C.muted },
                  ],
              width: 22,
              margin: [0, 2, 0, 0],
            },
            // Step number
            {
              text: `${i + 1}`,
              fontSize: 7.5,
              bold: true,
              color: done ? C.green : C.muted,
              width: 14,
              margin: [2, 3, 0, 0],
            },
            // Text
            {
              text: step,
              fontSize: 9.5,
              color: done ? C.green : C.ink,
              decoration: done ? 'lineThrough' : undefined,
              lineHeight: 1.55,
              margin: [4, 1, 0, 0],
            },
          ],
          margin: [0, 5, 0, 5],
        };
      })
    : [{ text: 'No action items have been recorded for this period.', fontSize: 9.5, color: C.muted, italics: true }];

  const actionSection = [
    heading('Action Items & Supervisor Instructions'),

    // Progress bar header
    instructions.length > 0
      ? {
          stack: [
            {
              columns: [
                { text: `${completedCount} of ${instructions.length} tasks completed`, fontSize: 8.5, color: C.muted },
                {
                  text: `${progressPct}%`,
                  fontSize: 8.5,
                  bold: true,
                  color: progressPct === 100 ? C.green : C.amber,
                  alignment: 'right',
                },
              ],
              margin: [0, 0, 0, 5],
            },
            // Progress bar
            {
              table: {
                widths: progressPct > 0 ? [`${progressPct}%`, `${100 - progressPct}%`] : ['*'],
                body: progressPct > 0
                  ? [[
                      { text: '', fillColor: progressPct === 100 ? C.green : C.brandLight, margin: [0, 2, 0, 2] },
                      { text: '', fillColor: C.greyBorder, margin: [0, 2, 0, 2] },
                    ]]
                  : [[
                      { text: '', fillColor: C.greyBorder, margin: [0, 2, 0, 2] },
                    ]],
              },
              layout: 'noBorders',
              margin: [0, 0, 0, 14],
            },
          ],
        }
      : {},

    ...taskRows,
  ];

  // ─── AI CONSULTANT NOTES ──────────────────────────────────────────────────
  const consultantSection = (role === 'supervisor' && aiAdvice && aiAdvice.advice)
    ? [
        heading('AI Consultant Notes (Supervisor Only)'),
        {
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                {
                  columns: [
                    {
                      canvas: [{ type: 'rect', x: 0, y: 0, w: 24, h: 24, r: 4, color: C.amberLight }],
                      width: 30,
                    },
                    {
                      text: 'These are AI-generated advisory suggestions only. They do not replace expert agronomist guidance. Always verify before acting.',
                      fontSize: 8,
                      italics: true,
                      color: C.amberText,
                      margin: [0, 2, 0, 0],
                    },
                  ],
                  margin: [0, 0, 0, 10],
                },
                ...(aiAdvice.advice?.potential_risks?.length > 0 ? [
                  { text: 'Potential Risks', fontSize: 9, bold: true, color: C.ink, margin: [0, 0, 0, 5] },
                  {
                    ul: aiAdvice.advice.potential_risks.map(r => ({ text: r, fontSize: 9, color: C.ink, lineHeight: 1.5 })),
                    margin: [0, 0, 0, 10],
                  },
                ] : []),
                ...(aiAdvice.advice?.suggested_treatments?.length > 0 ? [
                  { text: 'Suggested Treatments', fontSize: 9, bold: true, color: C.ink, margin: [0, 0, 0, 5] },
                  {
                    ul: aiAdvice.advice.suggested_treatments.map(t => ({ text: t, fontSize: 9, color: C.ink, lineHeight: 1.5 })),
                    margin: [0, 0, 0, 10],
                  },
                ] : []),
                ...(aiAdvice.advice?.notes ? [
                  { text: aiAdvice.advice.notes, fontSize: 8.5, italics: true, color: C.muted },
                ] : []),
              ],
              fillColor: C.amberLight,
              margin: [18, 16, 18, 16],
            }]],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i) => (i === 0) ? 4 : 0,
            vLineColor: () => C.amber,
          },
          margin: [0, 0, 0, 14],
        },
      ]
    : [];

  // ─── FOOTER SECTION ───────────────────────────────────────────────────────
  const footerContent = [
    rule(20, 10),
    {
      table: {
        widths: ['*', '*', '*'],
        body: [[
          {
            stack: [
              { text: 'APPROVED BY', fontSize: 6.5, color: C.muted, bold: true, letterSpacing: 1 },
              { text: supervisorName, fontSize: 8.5, color: C.ink, margin: [0, 2, 0, 0] },
            ],
          },
          {
            stack: [
              { text: 'REPORT DATE', fontSize: 6.5, color: C.muted, bold: true, letterSpacing: 1 },
              { text: fmtDate(savedAt), fontSize: 8.5, color: C.ink, margin: [0, 2, 0, 0] },
            ],
            alignment: 'center',
          },
          {
            stack: [
              { text: 'DATA SOURCE', fontSize: 6.5, color: C.muted, bold: true, letterSpacing: 1 },
              { text: 'Supervisor transcripts only', fontSize: 8.5, color: C.ink, margin: [0, 2, 0, 0] },
            ],
            alignment: 'right',
          },
        ]],
      },
      layout: 'noBorders',
    },
  ];

  // ─── Page footer (runs on every page) ────────────────────────────────────
  const pageFooter = (currentPage, pageCount) => ({
    columns: [
      {
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: C.divider }] },
          {
            columns: [
              { text: `AgriSense  ·  Farm Health Report  ·  ${farmName}`, fontSize: 7, color: C.muted },
              { text: `Page ${currentPage} of ${pageCount}`, fontSize: 7, color: C.muted, alignment: 'right' },
            ],
            margin: [0, 6, 0, 0],
          },
        ],
        margin: [40, 8, 40, 0],
      },
    ],
  });

  // ─── Assemble ─────────────────────────────────────────────────────────────
  return {
    pageSize:    'A4',
    pageMargins: [40, 40, 40, 52],

    footer: pageFooter,

    background: (currentPage, pageSize) => {
      // Subtle left accent strip on all pages
      if (currentPage === 1) return null;
      return {
        canvas: [{ type: 'rect', x: 0, y: 0, w: 5, h: pageSize.height, color: C.brand }],
      };
    },

    content: [
      ...coverHeader,
      ...healthSection,
      ...riskSection,
      ...actionSection,
      ...consultantSection,
      ...footerContent,
    ],

    defaultStyle: {
      font:       'Roboto',
      fontSize:   10,
      color:      C.ink,
      lineHeight: 1.4,
    },
  };
}

// ─── Export helpers ───────────────────────────────────────────────────────────
export async function downloadReportPdf(data, role = 'farmer', aiAdvice = null) {
  const pdfMake  = (await import('pdfmake/build/pdfmake')).default;
  const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default;
  pdfMake.vfs    = pdfFonts.pdfMake?.vfs || pdfFonts.vfs;

  const sr        = data.saved_report || data;
  const farmName  = sr.farm_name    || 'Farm';
  const reportNum = sr.report_number || 1;
  const filename  = `AgriSense_Report_${farmName.replace(/\s+/g, '_')}_#${reportNum}.pdf`;

  pdfMake.createPdf(buildReportPdf(data, role, aiAdvice)).download(filename);
}

export async function openReportPdfInTab(data, role = 'supervisor', aiAdvice = null) {
  const pdfMake  = (await import('pdfmake/build/pdfmake')).default;
  const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default;
  pdfMake.vfs    = pdfFonts.pdfMake?.vfs || pdfFonts.vfs;

  pdfMake.createPdf(buildReportPdf(data, role, aiAdvice)).open();
}
