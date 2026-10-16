'use strict';

/**
 * 양식(layout) + 입력값 → 저장 파일.
 * 화면 미리보기, 인쇄(PDF), docx, hwp 가 모두 같은 표 구조를 쓰기 때문에
 * 어느 쪽으로 저장해도 원본 양식과 같은 틀이 나옵니다.
 *
 *   - docx : 실제 Word 파일 (외부 패키지 없이 ZIP 을 직접 만듭니다)
 *   - hml  : 한글 호환 파일 (한글에서 열어 .hwp 로 저장)
 *   - PDF  : 브라우저 인쇄로 처리하므로 여기서 만들지 않습니다
 */

const { createZip } = require('./zip');
const { esc } = require('./xml');

const FONT = '맑은 고딕';
const LABEL_FILL = 'EFEFEF';

/* ------------------------- 표 구조 펼치기 ------------------------- */

/**
 * 반복 행을 실제 값 개수만큼 늘려서, 최종적으로 인쇄될 행 목록을 만듭니다.
 * 반환: [{ h, cells: [{ text, span, rowSpan, head, align, multiline }] }]
 */
function expandRows(template, values) {
  const v = values || {};
  const rows = template.layout.rows || [];
  const out = [];

  const items = (key, minRows) => {
    const data = Array.isArray(v[key]) ? v[key] : [];
    return data.length ? data : Array.from({ length: minRows || 1 }, () => ({}));
  };

  const rowSpanOfCell = cell => {
    if (!cell.rowSpanOf) return cell.rowSpan;
    const target = rows.find(r => r.repeat === cell.rowSpanOf);
    return cell.rowSpan + items(cell.rowSpanOf, target ? target.minRows : 1).length;
  };

  const makeRow = (row, item) => ({
    h: row.h,
    cells: row.cells.map(cell => ({
      text: cell.key
        ? String((item ? item[cell.key] : v[cell.key]) == null ? '' : (item ? item[cell.key] : v[cell.key]))
        : String(cell.label || ''),
      span: cell.span,
      rowSpan: item ? cell.rowSpan : rowSpanOfCell(cell),
      head: cell.label !== undefined ? cell.head !== false : !!cell.head,
      align: cell.align,
      blank: cell.blank
    }))
  });

  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.title) out.push({ title: row.title });

    if (!row.repeat) { out.push(makeRow(row, null)); i++; continue; }

    if (row.block) {
      const key = row.repeat;
      const group = [];
      while (i < rows.length && rows[i].repeat === key && rows[i].block) { group.push(rows[i]); i++; }
      items(key, row.minRows).forEach(item => {
        group.forEach(groupRow => out.push(makeRow(groupRow, item)));
        out.push({ gap: true });
      });
      continue;
    }

    items(row.repeat, row.minRows).forEach(item => out.push(makeRow(row, item)));
    i++;
  }

  return out;
}

function docTitle(template, values, meta) {
  return String((meta && meta.title) || (values && values.__title) || template.layout.title || template.name || '산출물');
}

function fileBaseName(template, values, meta) {
  const title = docTitle(template, values, meta).replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  const date = (meta && meta.date) || new Date().toISOString().slice(0, 10);
  return `${template.name}_${title}_${date}`.replace(/\s+/g, ' ').trim();
}

/* --------------------------------- DOCX --------------------------------- */

function docxRun(text, opts) {
  const o = opts || {};
  const props =
    `<w:rFonts w:ascii="${FONT}" w:eastAsia="${FONT}" w:hAnsi="${FONT}"/>` +
    (o.bold ? '<w:b/>' : '') +
    `<w:sz w:val="${o.size || 18}"/><w:szCs w:val="${o.size || 18}"/>`;
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function docxPara(text, opts) {
  const o = opts || {};
  const align = o.align && o.align !== 'left' ? `<w:jc w:val="${o.align}"/>` : '';
  const spacing = `<w:spacing w:before="${o.before || 0}" w:after="${o.after || 0}" w:line="${o.line || 240}" w:lineRule="auto"/>`;
  const lines = String(text == null ? '' : text).split('\n');
  const runs = lines.map((line, i) => (i ? '<w:r><w:br/></w:r>' : '') + docxRun(line, o)).join('');
  return `<w:p><w:pPr>${spacing}${align}</w:pPr>${runs}</w:p>`;
}

function docxCell(cell, widthDxa) {
  const props =
    `<w:tcW w:w="${widthDxa}" w:type="dxa"/>` +
    (cell.span > 1 ? `<w:gridSpan w:val="${cell.span}"/>` : '') +
    (cell.rowSpan > 1 ? '<w:vMerge w:val="restart"/>' : '') +
    (cell.head ? `<w:shd w:val="clear" w:fill="${LABEL_FILL}"/>` : '') +
    '<w:vAlign w:val="center"/>';
  const align = cell.align === 'left' ? 'left' : (cell.align === 'right' ? 'right' : 'center');
  return `<w:tc><w:tcPr>${props}</w:tcPr>${docxPara(cell.text, { bold: cell.head, align })}</w:tc>`;
}

/** rowSpan 아래쪽에 넣을 빈 병합 칸 */
function docxMergeCell(widthDxa, span) {
  const props = `<w:tcW w:w="${widthDxa}" w:type="dxa"/>` +
    (span > 1 ? `<w:gridSpan w:val="${span}"/>` : '') +
    '<w:vMerge/>';
  return `<w:tc><w:tcPr>${props}</w:tcPr>${docxPara('', {})}</w:tc>`;
}

function toDocx(template, values, meta) {
  const columns = template.layout.columns;
  const total = columns.reduce((a, b) => a + b, 0);
  const TABLE_WIDTH = 9350;                                  // A4 여백 안쪽 폭(dxa)
  const widths = columns.map(c => Math.round((c / total) * TABLE_WIDTH));

  const rows = expandRows(template, values);
  const body = [];

  /* 표지 (원본 1쪽) */
  const cover = template.layout.cover;
  if (cover) {
    body.push(docxPara('', { after: 1200 }));
    body.push(docxPara(cover.title, { bold: true, size: 56, align: 'center', after: 800 }));
    cover.lines.forEach(line => {
      const value = line.key ? String(values[line.key] == null ? '' : values[line.key]) : '';
      const text = (line.label ? line.label + ' ' : '') + value;
      if (text.trim()) body.push(docxPara(text, { size: 26, align: 'center', after: 240 }));
    });
    body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  }

  body.push(docxPara(docTitle(template, values, meta), { bold: true, size: 32, align: 'center', after: 240 }));
  if (template.layout.subtitle) {
    body.push(docxPara(template.layout.subtitle, { size: 18, align: 'center', after: 160 }));
  }

  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map(side => `<w:${side} w:val="single" w:sz="6" w:space="0" w:color="000000"/>`).join('');

  /* 세로 병합이 걸린 칸을 아래 행에서 이어주기 위한 추적 */
  const pending = [];
  const xml = [];

  rows.forEach(row => {
    if (row.gap) {
      if (xml.length) { body.push(tableWrap(xml.join(''), widths, borders)); xml.length = 0; }
      body.push(docxPara('', { after: 60 }));
      pending.length = 0;
      return;
    }
    if (row.title) {
      /* 표 중간의 소제목은 표를 끊고 문단으로 넣습니다. */
      if (xml.length) { body.push(tableWrap(xml.join(''), widths, borders)); xml.length = 0; }
      body.push(docxPara(row.title, { bold: true, size: 22, before: 200, after: 80, align: 'left' }));
      pending.length = 0;
      return;
    }

    const cells = [];
    let col = 0;
    const carried = pending.filter(p => p.left > 0);

    row.cells.forEach(cell => {
      /* 이 열 자리에 위에서 내려온 병합이 있으면 먼저 채웁니다. */
      while (carried.some(p => p.col === col)) {
        const p = carried.find(x => x.col === col);
        cells.push(docxMergeCell(widths.slice(col, col + p.span).reduce((a, b) => a + b, 0), p.span));
        p.left--;
        col += p.span;
      }
      const width = widths.slice(col, col + cell.span).reduce((a, b) => a + b, 0);
      cells.push(docxCell(cell, width));
      if (cell.rowSpan > 1) pending.push({ col, span: cell.span, left: cell.rowSpan - 1 });
      col += cell.span;
    });

    const height = row.h ? `<w:trPr><w:trHeight w:val="${Math.round(row.h * 20)}"/></w:trPr>` : '';
    xml.push(`<w:tr>${height}${cells.join('')}</w:tr>`);
    pending.forEach(p => { if (p.left > 0 && !row.cells.length) p.left--; });
  });

  if (xml.length) body.push(tableWrap(xml.join(''), widths, borders));

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

  return createZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'word/_rels/document.xml.rels', data: documentRels },
    { name: 'word/document.xml', data: document }
  ]);
}

function tableWrap(rowsXml, widths, borders) {
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>` +
    `<w:jc w:val="center"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>` +
    `<w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
    rowsXml + '</w:tbl>';
}

/* ---------------------------------- HWP ---------------------------------- */

function hwpPara(text, styleId) {
  const lines = String(text == null ? '' : text).split('\n');
  return lines.map(line =>
    `<HP:P ParaShape="${styleId || 0}"><HP:RUN CharShapeIDRef="${styleId || 0}"><HP:T>${esc(line || ' ')}</HP:T></HP:RUN></HP:P>`
  ).join('');
}

function toHwpml(template, values, meta) {
  const rows = expandRows(template, values);
  const parts = [];

  const cover = template.layout.cover;
  if (cover) {
    for (let i = 0; i < 6; i++) parts.push(hwpPara(''));
    parts.push(hwpPara(cover.title, 1));
    parts.push(hwpPara(''));
    cover.lines.forEach(line => {
      const value = line.key ? String(values[line.key] == null ? '' : values[line.key]) : '';
      const text = (line.label ? line.label + ' ' : '') + value;
      if (text.trim()) parts.push(hwpPara(text, 1));
    });
    for (let i = 0; i < 6; i++) parts.push(hwpPara(''));
  }

  parts.push(hwpPara(docTitle(template, values, meta), 1));
  if (template.layout.subtitle) parts.push(hwpPara(template.layout.subtitle));
  parts.push(hwpPara(''));

  let table = [];
  const flush = () => {
    if (!table.length) return;
    parts.push('<HP:TABLE>' + table.join('') + '</HP:TABLE>');
    table = [];
  };

  rows.forEach(row => {
    if (row.gap) { flush(); parts.push(hwpPara('')); return; }
    if (row.title) { flush(); parts.push(hwpPara('')); parts.push(hwpPara('■ ' + row.title, 1)); return; }
    const cells = row.cells.map(cell =>
      `<HP:TC ColSpan="${cell.span}" RowSpan="${cell.rowSpan}"><HP:SUBLIST>${hwpPara(cell.text)}</HP:SUBLIST></HP:TC>`
    ).join('');
    table.push(`<HP:TR>${cells}</HP:TR>`);
  });
  flush();

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<HWPML Version="2.9" Style="OfficeInternational" SubVersion="8.0.0.1">
<HEAD SecCnt="1">
<DOCSUMMARY><TITLE>${esc(docTitle(template, values, meta))}</TITLE></DOCSUMMARY>
<MAPPINGTABLE>
<FONTFACELIST Lang="HANGUL"><FONTFACE Id="0" Name="${FONT}" Type="TTF"><SUBSTFONT Name="${FONT}" Type="TTF"/></FONTFACE></FONTFACELIST>
<BORDERFILLLIST Count="1">
<BORDERFILL Id="1" ThreeD="false" Shadow="false" Slash="0" BackSlash="0">
<LEFTBORDER Type="1" Width="0.12mm" Color="#000000"/>
<RIGHTBORDER Type="1" Width="0.12mm" Color="#000000"/>
<TOPBORDER Type="1" Width="0.12mm" Color="#000000"/>
<BOTTOMBORDER Type="1" Width="0.12mm" Color="#000000"/>
<DIAGONAL Type="0" Width="0.12mm" Color="#000000"/>
</BORDERFILL>
</BORDERFILLLIST>
<CHARSHAPELIST Count="2">
<CHARSHAPE Id="0" Height="900" TextColor="#000000" ShadeColor="none" UseFontSpace="false" UseKerning="false" SymMark="none" BorderFillIDRef="0">
<FONTID Lang="HANGUL" FaceNameId="0"/><FONTID Lang="LATIN" FaceNameId="0"/>
<RATIO Lang="HANGUL" Value="100"/><SPACING Lang="HANGUL" Value="0"/><RELSZ Lang="HANGUL" Value="100"/><OFFSET Lang="HANGUL" Value="0"/>
</CHARSHAPE>
<CHARSHAPE Id="1" Height="1600" TextColor="#000000" ShadeColor="none" UseFontSpace="false" UseKerning="false" SymMark="none" BorderFillIDRef="0" Bold="true">
<FONTID Lang="HANGUL" FaceNameId="0"/><FONTID Lang="LATIN" FaceNameId="0"/>
<RATIO Lang="HANGUL" Value="100"/><SPACING Lang="HANGUL" Value="0"/><RELSZ Lang="HANGUL" Value="100"/><OFFSET Lang="HANGUL" Value="0"/>
</CHARSHAPE>
</CHARSHAPELIST>
<PARASHAPELIST Count="2">
<PARASHAPE Id="0" TabDef="0" Numbering="0" BorderFill="0" LineSpacingType="PERCENT" LineSpacing="150" Align="LEFT" BreakLatinWord="KEEPWORD" BreakNonLatinWord="KEEPWORD" SnapToGrid="true" Condense="0" FontLineHeight="false" HeadingType="NONE" Level="0" BreakSetting="0">
<PARAMARGIN Indent="0" Left="0" Right="0" Prev="0" Next="0"/>
</PARASHAPE>
<PARASHAPE Id="1" TabDef="0" Numbering="0" BorderFill="0" LineSpacingType="PERCENT" LineSpacing="150" Align="CENTER" BreakLatinWord="KEEPWORD" BreakNonLatinWord="KEEPWORD" SnapToGrid="true" Condense="0" FontLineHeight="false" HeadingType="NONE" Level="0" BreakSetting="0">
<PARAMARGIN Indent="0" Left="0" Right="0" Prev="0" Next="100"/>
</PARASHAPE>
</PARASHAPELIST>
<STYLELIST Count="1">
<STYLE Id="0" Type="PARA" Name="바탕글" EngName="Normal" ParaShape="0" CharShape="0" NextStyle="0" LangId="1042" LockForm="false"/>
</STYLELIST>
</MAPPINGTABLE>
</HEAD>
<BODY>
<SECDEF>
<HP:SEC>
${parts.join('\n')}
</HP:SEC>
</SECDEF>
</BODY>
</HWPML>`;
}

module.exports = { expandRows, toDocx, toHwpml, fileBaseName, docTitle };
