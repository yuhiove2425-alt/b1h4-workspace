/* ============================================================================
 * B1H4 산출물 모듈 (프런트)
 *
 * 양식(layout)은 원본 문서의 표 틀을 그대로 옮겨 놓은 것이고,
 * 미리보기 · 인쇄(PDF) · docx · hwp 가 모두 같은 표 구조를 씁니다.
 *
 * app.js 에서 빌려 쓰는 것: esc, icon, api, toast, S(로그인 사용자/조직도)
 * ========================================================================== */

(function () {
  'use strict';

  const API = '/api/deliverables';

  const M = {
    ready: false,
    templates: [],
    templateId: null,
    values: {},
    source: null,       // { filename, kind, warning, text, filled, leftovers }
    documents: [],
    docId: null,
    busy: ''
  };

  /* ------------------------------ 작은 도우미 ------------------------------ */

  const el = sel => document.querySelector(sel);

  function template() {
    return M.templates.find(t => t.id === M.templateId) || null;
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function context() {
    return {
      author: S.me ? S.me.name : '',
      today: todayISO(),
      projectName: 'B1H4 워크스페이스',
      teamName: 'B1H4',
      roster: (S.roster || []).map(p => ({ name: p.name, title: p.title }))
    };
  }

  function docTitle() {
    const t = template();
    return String(M.values.__title || (t ? t.layout.title : '') || (t ? t.name : '산출물')).trim();
  }

  /** 양식의 모든 낱개 입력 칸 (표지 포함) */
  function singleCells(t) {
    const out = [];
    if (t.layout.cover) t.layout.cover.lines.forEach(line => { if (line.key) out.push(line); });
    (t.layout.rows || []).forEach(row => {
      if (row.repeat) return;
      row.cells.forEach(cell => { if (cell.key) out.push(cell); });
    });
    return out;
  }

  /** 표지 (원본 1쪽) */
  function coverHtml(t) {
    const cover = t.layout.cover;
    if (!cover) return '';
    const lines = cover.lines.map(line => {
      const value = M.values[line.key] == null ? '' : M.values[line.key];
      const input = line.key
        ? (line.multiline
            ? `<textarea class="dv-in" data-dv-key="${esc(line.key)}" placeholder="${esc(line.placeholder)}">${esc(value)}</textarea>`
            : `<input class="dv-in" data-dv-key="${esc(line.key)}" value="${esc(value)}" placeholder="${esc(line.placeholder)}">`)
        : '';
      return `<div class="dv-cover-line">${line.label ? `<span class="dv-cover-label">${esc(line.label)}</span>` : ''}${input}</div>`;
    }).join('');

    return `<div class="dv-cover">
      <div class="dv-cover-title">${esc(cover.title)}</div>
      <div class="dv-cover-lines">${lines}</div>
      <div class="dv-cover-tag">표지 (첫 장)</div>
    </div>`;
  }

  function repeatRows(t) {
    return (t.layout.rows || []).filter(row => row.repeat);
  }

  function blankValues(t) {
    const values = { __title: t.layout.title || t.name };
    singleCells(t).forEach(cell => { values[cell.key] = ''; });
    repeatRows(t).forEach(row => {
      values[row.repeat] = Array.from({ length: row.minRows }, () => ({}));
    });
    return values;
  }

  /** 파일이 없어도 로그인 정보·오늘 날짜·조직도는 먼저 채워둡니다. */
  function applyContextDefaults(t) {
    const ctx = context();
    singleCells(t).forEach(cell => {
      if (!cell.context || M.values[cell.key]) return;
      if (cell.context === 'today') M.values[cell.key] = ctx.today;
      else if (cell.context === 'me' || cell.context === 'author') M.values[cell.key] = ctx.author;
      else if (cell.context === 'projectName') M.values[cell.key] = ctx.projectName;
      else if (cell.context === 'teamName') M.values[cell.key] = ctx.teamName;
    });

    repeatRows(t).forEach(row => {
      const wantsRoster = row.cells.some(c => c.context === 'roster');
      const current = M.values[row.repeat] || [];
      const filled = current.some(item => Object.values(item || {}).some(Boolean));
      if (!wantsRoster || filled || !ctx.roster.length) return;

      M.values[row.repeat] = ctx.roster.map(person => {
        const item = {};
        row.cells.forEach(cell => {
          if (!cell.key) return;
          const label = String(cell.for || cell.label || cell.key).toLowerCase();
          if (/이름|성명|name/.test(label)) item[cell.key] = person.name;
          else if (/역할|담당|직무|role/.test(label)) item[cell.key] = person.title;
          else item[cell.key] = '';
        });
        return item;
      });
    });
  }

  /* -------------------------------- 데이터 -------------------------------- */

  async function loadTemplates() {
    const data = await api('GET', API + '/templates');
    M.templates = data.templates || [];
    M.supported = data.supported || [];
  }

  async function loadDocuments() {
    try {
      M.documents = (await api('GET', API + '/documents')).documents || [];
    } catch (err) {
      M.documents = [];
    }
  }

  async function ensureLoaded() {
    if (M.ready) return;
    await Promise.all([loadTemplates(), loadDocuments()]);
    if (!M.templateId && M.templates.length) selectTemplate(M.templates[0].id, true);
    M.ready = true;
  }

  function selectTemplate(id, silent) {
    const t = M.templates.find(x => x.id === id);
    if (!t) return;
    M.templateId = id;
    M.docId = null;
    M.values = blankValues(t);
    applyContextDefaults(t);
    if (!silent) refillFromSource();
  }

  async function refillFromSource() {
    if (!M.source || !M.source.text) { rerender(); return; }
    setBusy('양식에 맞춰 다시 채우는 중…');
    try {
      const data = await api('POST', API + '/fill', {
        templateId: M.templateId,
        text: M.source.text,
        context: context()
      });
      mergeValues(data.values);
      M.source.filled = data.filled || [];
      M.source.leftovers = data.leftovers || [];
    } catch (err) {
      toast(err.message, 'warn');
    } finally {
      setBusy('');
      rerender();
    }
  }

  /** 서버가 채워준 값 중 비어 있지 않은 것만 덮어씁니다. */
  function mergeValues(incoming) {
    if (!incoming) return;
    Object.keys(incoming).forEach(key => {
      const value = incoming[key];
      if (value == null || value === '') return;
      if (Array.isArray(value)) {
        if (!value.some(item => Object.values(item || {}).some(Boolean))) return;
      }
      M.values[key] = value;
    });
  }

  function setBusy(text) {
    M.busy = text;
    const box = el('#dvBusy');
    if (box) {
      box.textContent = text;
      box.style.display = text ? '' : 'none';
    }
  }

  /* ------------------------------ 파일 업로드 ------------------------------ */

  async function handleFile(file) {
    if (!file) return;
    if (!M.templateId) return toast('먼저 왼쪽에서 양식을 고르세요.', 'warn');
    if (file.size > 25 * 1024 * 1024) return toast('25MB 이하 파일만 올릴 수 있습니다.', 'warn');

    setBusy(`${file.name} 읽는 중…`);
    try {
      const query = new URLSearchParams({
        filename: file.name,
        templateId: M.templateId,
        context: JSON.stringify(context())
      });
      const res = await fetch(`${API}/extract?${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '파일을 읽지 못했습니다.');

      M.source = {
        filename: data.filename,
        kind: data.kind,
        warning: data.warning,
        text: data.text || '',
        filled: data.filled || [],
        leftovers: data.leftovers || []
      };
      mergeValues(data.values);

      if (data.warning) toast(data.warning, 'warn');
      else toast(`${data.filename} 내용을 ${(data.filled || []).length}곳에 넣었습니다.`);
    } catch (err) {
      toast(err.message, 'warn');
    } finally {
      setBusy('');
      rerender();
    }
  }

  /* -------------------------------- 저장하기 -------------------------------- */

  function exportFileName(ext) {
    const t = template();
    const base = `${t ? t.name : '산출물'}_${docTitle()}_${todayISO()}`.replace(/[\\/:*?"<>|]/g, '_');
    return base + ext;
  }

  async function exportBinary(format) {
    const t = template();
    if (!t) return;
    setBusy(format.toUpperCase() + ' 파일 만드는 중…');
    try {
      const res = await fetch(`${API}/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: t.id, values: M.values, title: docTitle(), date: todayISO() })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '파일을 만들지 못했습니다.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName(format === 'docx' ? '.docx' : '.hml');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      if (format === 'hwp') toast('한글 호환 파일(.hml)을 내려받았습니다. 한글에서 열어 .hwp로 저장하세요.');
      else toast('DOCX 파일을 내려받았습니다.');
    } catch (err) {
      toast(err.message, 'warn');
    } finally {
      setBusy('');
    }
  }

  function exportPdf() {
    const t = template();
    if (!t) return;
    const win = window.open('', '_blank');
    if (!win) return toast('팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 눌러주세요.', 'warn');
    win.document.write(printHtml(t));
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
    setTimeout(() => { try { win.focus(); win.print(); } catch (e) { /* noop */ } }, 500);
  }

  async function saveToTeam() {
    const t = template();
    if (!t) return;
    try {
      if (M.docId) {
        await api('PATCH', `${API}/documents/${M.docId}`, { title: docTitle(), values: M.values });
        toast('저장한 산출물을 갱신했습니다.');
      } else {
        const data = await api('POST', API + '/documents', {
          templateId: t.id,
          templateName: t.name,
          title: docTitle(),
          values: M.values,
          sourceName: M.source ? M.source.filename : ''
        });
        M.docId = data.document.id;
        toast('산출물을 저장했습니다.');
      }
      await loadDocuments();
      rerender();
    } catch (err) {
      toast(err.message, 'warn');
    }
  }

  function openSaved(id) {
    const doc = M.documents.find(d => d.id === id);
    if (!doc) return;
    const t = M.templates.find(x => x.id === doc.templateId);
    if (!t) return toast('이 산출물의 양식을 찾을 수 없습니다.', 'warn');
    M.templateId = t.id;
    M.values = Object.assign(blankValues(t), doc.values || {});
    M.docId = doc.id;
    M.source = null;
    rerender();
  }

  /* ---------------------- 양식 표 그리기 (화면 / 인쇄 공용) ---------------------- */

  function repeatItems(key, minRows) {
    const data = Array.isArray(M.values[key]) ? M.values[key] : [];
    return data.length ? data : Array.from({ length: minRows || 1 }, () => ({}));
  }

  /**
   * 반복 행을 값 개수만큼 늘려 실제로 그릴 행 목록을 만듭니다.
   *   - 보통 반복: 한 줄이 여러 번 (표의 데이터 행)
   *   - block 반복: 여러 줄이 한 덩어리로 여러 번 (유스케이스 명세처럼)
   */
  function expandRows(t) {
    const rows = t.layout.rows || [];
    const out = [];
    let i = 0;

    while (i < rows.length) {
      const row = rows[i];
      if (row.title) out.push({ kind: 'title', text: row.title });

      if (!row.repeat) {
        out.push({ kind: 'row', row, rowIndex: i });
        i++;
        continue;
      }

      if (row.block) {
        const group = [];
        const key = row.repeat;
        while (i < rows.length && rows[i].repeat === key && rows[i].block) { group.push(rows[i]); i++; }
        repeatItems(key, row.minRows).forEach((item, index) => {
          group.forEach((groupRow, gi) => {
            out.push({ kind: 'row', row: groupRow, rowIndex: i, repeatIndex: index, item, blockStart: gi === 0 });
          });
          out.push({ kind: 'gap' });
        });
        out.push({ kind: 'add', row, rowIndex: i, label: '항목 추가' });
        continue;
      }

      repeatItems(row.repeat, row.minRows).forEach((item, index) => {
        out.push({ kind: 'row', row, rowIndex: i, repeatIndex: index, item });
      });
      out.push({ kind: 'add', row, rowIndex: i, label: '행 추가' });
      i++;
    }
    return out;
  }

  /** rowSpanOf 가 걸린 칸은 아래 반복 행 수만큼 세로로 합쳐집니다. */
  function cellRowSpan(t, cell) {
    if (!cell.rowSpanOf) return cell.rowSpan;
    const target = (t.layout.rows || []).find(r => r.repeat === cell.rowSpanOf);
    const count = repeatItems(cell.rowSpanOf, target ? target.minRows : 1).length;
    return cell.rowSpan + count;
  }

  function colCount(t) {
    return t.layout.columns.length;
  }

  function colgroupHtml(t) {
    const total = t.layout.columns.reduce((a, b) => a + b, 0);
    return '<colgroup>' + t.layout.columns
      .map(w => `<col style="width:${((w / total) * 100).toFixed(3)}%">`).join('') + '</colgroup>';
  }

  function cellValue(entry, cell) {
    if (entry.repeatIndex === undefined) return M.values[cell.key] == null ? '' : M.values[cell.key];
    const item = entry.item || {};
    return item[cell.key] == null ? '' : item[cell.key];
  }

  /** 화면용 셀 (입력 가능) */
  function editCellHtml(entry, cell, t) {
    const attrs =
      `colspan="${cell.span}" rowspan="${cellRowSpan(t, cell)}"` +
      ` class="dv-c${cell.head ? ' head' : ''}${cell.align === 'left' ? ' left' : ''}"`;

    if (!cell.key) {
      return `<td ${attrs}>${esc(cell.label || '').replace(/\n/g, '<br>')}</td>`;
    }

    const value = cellValue(entry, cell);
    const data = entry.repeatIndex === undefined
      ? `data-dv-key="${esc(cell.key)}"`
      : `data-dv-key="${esc(cell.key)}" data-dv-rep="${esc(entry.row.repeat)}" data-dv-i="${entry.repeatIndex}"`;

    if (cell.multiline) {
      return `<td ${attrs}><textarea class="dv-in" ${data} placeholder="${esc(cell.placeholder)}">${esc(value)}</textarea></td>`;
    }
    return `<td ${attrs}><input class="dv-in" ${data} value="${esc(value)}" placeholder="${esc(cell.placeholder)}"></td>`;
  }

  function formHtml(t) {
    const entries = expandRows(t);
    const cols = colCount(t);
    const parts = [];
    let open = false;

    const openTable = () => {
      if (open) return;
      parts.push(`<table class="dv-form">${colgroupHtml(t)}<tbody>`);
      open = true;
    };
    const closeTable = () => {
      if (!open) return;
      parts.push('</tbody></table>');
      open = false;
    };

    entries.forEach(entry => {
      if (entry.kind === 'title') {
        closeTable();
        parts.push(`<div class="dv-form-title">${esc(entry.text)}</div>`);
        return;
      }
      if (entry.kind === 'gap') { closeTable(); return; }
      if (entry.kind === 'add') {
        closeTable();
        parts.push('<div class="dv-add-wrap">' +
          `<button class="dv-add" data-dv-add="${esc(entry.row.repeat)}">${icon('plus', 12)}${esc(entry.label)}</button>` +
          ((M.values[entry.row.repeat] || []).length > 1
            ? `<button class="dv-add ghost" data-dv-del-row="${esc(entry.row.repeat)}">${icon('close', 12)}마지막 항목 삭제</button>` : '') +
          '</div>');
        return;
      }
      openTable();
      const height = entry.row.h ? ` style="height:${entry.row.h}px"` : '';
      parts.push(`<tr${height}>` + entry.row.cells.map(cell => editCellHtml(entry, cell, t)).join('') + '</tr>');
    });

    closeTable();
    return parts.join('');
  }

  /* --------------------------- 인쇄(PDF)용 HTML --------------------------- */

  function printTable(t) {
    const entries = expandRows(t);
    const total = t.layout.columns.reduce((a, b) => a + b, 0);
    const parts = [];
    let open = false;

    const openTable = () => {
      if (open) return;
      parts.push(`<table style="width:${total}pt">` +
        '<colgroup>' + t.layout.columns.map(w => `<col style="width:${w}pt">`).join('') + '</colgroup><tbody>');
      open = true;
    };
    const closeTable = () => { if (open) { parts.push('</tbody></table>'); open = false; } };

    entries.forEach(entry => {
      if (entry.kind === 'add') return;
      if (entry.kind === 'gap') { closeTable(); return; }
      if (entry.kind === 'title') {
        closeTable();
        parts.push(`<h2>${esc(entry.text)}</h2>`);
        return;
      }
      openTable();
      const height = entry.row.h ? ` style="height:${entry.row.h}pt"` : '';
      const cells = entry.row.cells.map(cell => {
        const cls = (cell.head ? ' class="head"' : '') ;
        const style = cell.align === 'left' || cell.multiline ? ' style="text-align:left"' : '';
        const text = cell.key ? cellValue(entry, cell) : (cell.label || '');
        return `<td colspan="${cell.span}" rowspan="${cellRowSpan(t, cell)}"${cls}${style}>` +
          esc(text).replace(/\n/g, '<br>') + '</td>';
      }).join('');
      parts.push(`<tr${height}>${cells}</tr>`);
    });

    closeTable();
    return parts.join('');
  }

  function printCover(t) {
    const cover = t.layout.cover;
    if (!cover) return '';
    const lines = cover.lines.map(line => {
      const value = M.values[line.key] == null ? '' : M.values[line.key];
      return `<div class="cover-line">${line.label ? `<span class="cover-label">${esc(line.label)}</span>` : ''}` +
        `<span class="cover-value">${esc(value).replace(/\n/g, '<br>')}</span></div>`;
    }).join('');
    return `<section class="cover"><div class="cover-title">${esc(cover.title)}</div>${lines}</section>`;
  }

  function printHtml(t) {
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(docTitle())}</title>
<style>
  .cover { height: 235mm; display: flex; flex-direction: column; align-items: center;
           justify-content: center; page-break-after: always; text-align: center; }
  .cover-title { font-size: 28pt; font-weight: 700; letter-spacing: 2pt; margin-bottom: 40pt; }
  .cover-line { font-size: 13pt; margin-bottom: 12pt; }
  .cover-label { font-weight: 600; margin-right: 6pt; }
  @page { size: A4; margin: 20mm 18mm; }
  body { font-family: "Malgun Gothic", "맑은 고딕", sans-serif; color:#000; margin:0; }
  h1 { font-size: 17pt; text-align:center; margin: 0 0 14pt; font-weight: 700; }
  h2 { font-size: 11pt; margin: 14pt 0 5pt; }
  table { border-collapse: collapse; table-layout: fixed; margin: 0 auto 10pt; }
  td { border: 0.7pt solid #000; padding: 3pt 5pt; font-size: 9.5pt; line-height: 1.45;
       text-align: center; vertical-align: middle; word-break: break-all; white-space: pre-wrap; }
  td.head { background: #EFEFEF; font-weight: 600; }
</style></head><body>
  ${printCover(t)}
  <h1>${esc(docTitle())}</h1>
  ${t.layout.subtitle ? `<div style="text-align:center;font-size:9.5pt;margin-bottom:10pt">${esc(t.layout.subtitle)}</div>` : ''}
  ${printTable(t)}
</body></html>`;
  }

  /* -------------------------------- 화면 그리기 -------------------------------- */

  function templateListHtml() {
    if (!M.templates.length) {
      return `<div class="dv-empty">양식이 없습니다.<br><code>deliverables/templates/</code> 폴더에<br>양식 JSON 을 넣어주세요.</div>`;
    }
    return M.templates.map((t, i) => `
      <button class="dv-tpl ${t.id === M.templateId ? 'on' : ''}" data-dv-template="${esc(t.id)}" title="${esc(t.desc)}">
        <span class="dv-tpl-no">${i + 1}</span>
        <span class="dv-tpl-body">
          <span class="dv-tpl-name">${esc(t.name)}</span>
          ${t.desc ? `<span class="dv-tpl-desc">${esc(t.desc)}</span>` : ''}
        </span>
      </button>`).join('');
  }

  function savedListHtml() {
    if (!M.documents.length) return '';
    return `
      <div class="dv-saved">
        <div class="dv-saved-title">저장한 산출물</div>
        ${M.documents.slice(0, 12).map(doc => `
          <div class="dv-saved-item ${doc.id === M.docId ? 'on' : ''}">
            <button class="dv-saved-open" data-dv-doc="${esc(doc.id)}">
              <span class="dv-saved-name">${esc(doc.title)}</span>
              <span class="dv-saved-meta">${esc(doc.templateName || '')} · ${esc((doc.updatedAt || '').slice(0, 10))}</span>
            </button>
            <button class="dv-icon-btn" data-dv-doc-del="${esc(doc.id)}" title="삭제">${icon('trash', 14)}</button>
          </div>`).join('')}
      </div>`;
  }

  function dropHtml() {
    const supported = (M.supported || []).map(x => '.' + x).join(' ');
    if (!M.source) {
      return `
        <div class="dv-drop" id="dvDrop">
          <div class="dv-drop-icon">${icon('plus', 22)}</div>
          <div class="dv-drop-main">여기에 파일을 끌어다 놓거나 눌러서 선택하세요</div>
          <div class="dv-drop-sub">${esc(supported)}</div>
        </div>`;
    }
    return `
      <div class="dv-drop has-file" id="dvDrop">
        <div class="dv-file">
          <span class="dv-file-kind">${esc(M.source.kind)}</span>
          <span class="dv-file-name">${esc(M.source.filename)}</span>
          <span class="dv-file-count">${(M.source.filled || []).length}곳 자동 입력</span>
        </div>
        <div class="dv-drop-sub">다른 파일을 올리려면 다시 끌어다 놓으세요</div>
      </div>`;
  }

  function noticeHtml() {
    if (!M.source) return '';
    const parts = [];
    if (M.source.warning) {
      parts.push(`<div class="dv-note warn">${icon('bell', 15)}<span>${esc(M.source.warning)}</span></div>`);
    }
    if ((M.source.leftovers || []).length) {
      parts.push(`
        <details class="dv-note">
          <summary>${icon('list', 15)}<span>자동으로 넣지 못한 내용 ${M.source.leftovers.length}개 — 눌러서 확인하고 복사하세요</span></summary>
          <div class="dv-left-list">${M.source.leftovers.map(x => `
            <div class="dv-left-item">
              <div class="dv-left-title">${esc(x.title || '제목 없음')}</div>
              <div class="dv-left-text">${esc(x.text).replace(/\n/g, '<br>')}</div>
            </div>`).join('')}</div>
        </details>`);
    }
    if (M.source.text) {
      parts.push(`
        <details class="dv-note">
          <summary>${icon('wiki', 15)}<span>올린 파일에서 읽은 원문 보기 (${M.source.text.length}자)</span></summary>
          <pre class="dv-source-text">${esc(M.source.text)}</pre>
        </details>`);
    }
    return parts.join('');
  }

  function sheetHtml() {
    const t = template();
    if (!t) {
      return `<div class="dv-sheet-empty">${icon('wiki', 34)}<strong>양식을 먼저 골라주세요</strong>왼쪽 목록에서 만들 문서를 선택하면 여기에 나타납니다.</div>`;
    }
    return `
      <div class="dv-sheet">
        <input class="dv-doc-title" data-dv-title="1" value="${esc(docTitle())}" placeholder="문서 제목">
        ${t.layout.subtitle ? `<div class="dv-doc-sub">${esc(t.layout.subtitle)}</div>` : ''}
        ${coverHtml(t)}
        <div class="dv-sheet-scroll">${formHtml(t)}</div>
        ${t.layout.note ? `<div class="dv-form-note">${esc(t.layout.note)}</div>` : ''}
      </div>`;
  }

  function view() {
    return `
      <div class="dv">
        <aside class="card dv-side">
          <div class="card-title">${icon('list', 18)}양식 선택</div>
          <div class="dv-tpl-list">${templateListHtml()}</div>
          ${savedListHtml()}
        </aside>

        <div class="dv-main">
          <input type="file" id="dvFileInput" accept=".pdf,.md,.txt,.docx,.hwp,.hwpx,.xlsx,.pptx,.csv" hidden>
          ${dropHtml()}
          <div class="dv-busy" id="dvBusy" style="display:${M.busy ? '' : 'none'}">${esc(M.busy)}</div>
          ${noticeHtml()}

          <div class="card dv-doc" id="dvDoc">
            <div class="card-title">${icon('edit', 18)}미리보기 / 수정<span class="spacer"></span>
              ${M.docId ? '<span class="dv-badge">저장됨</span>' : ''}
            </div>
            ${sheetHtml()}
          </div>

          <div class="dv-actions">
            <button class="btn dv-btn" data-dv-export="pdf">${icon('share', 15)}PDF 저장</button>
            <button class="btn dv-btn" data-dv-export="hwp">${icon('story', 15)}HWP 저장</button>
            <button class="btn dv-btn" data-dv-export="docx">${icon('wiki', 15)}DOCX 저장</button>
            <span class="spacer"></span>
            <button class="btn dv-btn" data-dv-reset="1">${icon('trash', 15)}비우기</button>
            <button class="btn btn-primary" data-dv-save="1">${icon('check', 15)}${M.docId ? '저장 갱신' : '팀에 저장'}</button>
          </div>
        </div>
      </div>`;
  }

  function rerender() {
    if (S.view !== 'deliverables') return;
    const host = document.querySelector('#view');
    if (!host) return;
    host.innerHTML = view();
    bindDropzone();
    autoGrowAll();
  }

  /* -------------------------------- 이벤트 -------------------------------- */

  function autoGrow(node) {
    node.style.height = 'auto';
    node.style.height = Math.max(node.parentElement.clientHeight - 8, node.scrollHeight) + 'px';
  }

  function autoGrowAll() {
    document.querySelectorAll('#view .dv-in').forEach(node => {
      if (node.tagName === 'TEXTAREA') autoGrow(node);
    });
  }

  function bindDropzone() {
    const drop = document.querySelector('#dvDrop');
    const input = document.querySelector('#dvFileInput');
    if (!drop || !input || drop.dataset.bound) return;
    drop.dataset.bound = '1';

    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) handleFile(input.files[0]);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, e => {
      e.preventDefault();
      drop.classList.add('over');
    }));
    ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, e => {
      e.preventDefault();
      if (type === 'drop' && e.dataTransfer && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      drop.classList.remove('over');
    }));
  }

  /* 입력 반영 — 다시 그리지 않아야 커서가 튀지 않습니다. */
  document.addEventListener('input', e => {
    const node = e.target;
    if (!node.closest || !node.closest('#view .dv')) return;

    if (node.dataset.dvTitle) { M.values.__title = node.value; return; }
    if (!node.dataset.dvKey) return;

    if (node.dataset.dvRep) {
      const list = M.values[node.dataset.dvRep] || (M.values[node.dataset.dvRep] = []);
      const i = Number(node.dataset.dvI);
      if (!list[i]) list[i] = {};
      list[i][node.dataset.dvKey] = node.value;
    } else {
      M.values[node.dataset.dvKey] = node.value;
    }
    if (node.tagName === 'TEXTAREA') autoGrow(node);
  });

  document.addEventListener('click', async e => {
    const inside = e.target.closest && e.target.closest('#view .dv');
    const target = e.target.closest && e.target.closest(
      '[data-dv-template],[data-dv-doc],[data-dv-doc-del],[data-dv-add],[data-dv-del-row],[data-dv-export],[data-dv-save],[data-dv-reset]');
    if (!inside || !target) return;
    const d = target.dataset;

    if (d.dvTemplate) { selectTemplate(d.dvTemplate); rerender(); return; }
    if (d.dvDoc) { openSaved(d.dvDoc); return; }
    if (d.dvDocDel) {
      if (!confirm('저장한 이 산출물을 삭제할까요?')) return;
      try {
        await api('DELETE', `${API}/documents/${d.dvDocDel}`);
        if (M.docId === d.dvDocDel) M.docId = null;
        await loadDocuments();
        toast('삭제했습니다.');
        rerender();
      } catch (err) { toast(err.message, 'warn'); }
      return;
    }

    if (d.dvAdd) {
      const list = M.values[d.dvAdd] || (M.values[d.dvAdd] = []);
      list.push({});
      rerender();
      const inputs = document.querySelectorAll(`[data-dv-rep="${d.dvAdd}"][data-dv-i="${list.length - 1}"]`);
      if (inputs.length) inputs[0].focus();
      return;
    }
    if (d.dvDelRow) {
      const list = M.values[d.dvDelRow];
      if (list && list.length > 1) list.pop();
      rerender();
      return;
    }

    if (d.dvExport === 'pdf') return exportPdf();
    if (d.dvExport) return exportBinary(d.dvExport);
    if (d.dvSave) return saveToTeam();
    if (d.dvReset) {
      if (!confirm('작성 중인 내용을 모두 비울까요?')) return;
      const t = template();
      if (t) { M.values = blankValues(t); applyContextDefaults(t); }
      M.source = null;
      M.docId = null;
      rerender();
    }
  });

  /* ------------------------------ 모듈 등록 ------------------------------ */

  function bind() {
    bindDropzone();
    autoGrowAll();
    if (!M.ready) {
      ensureLoaded()
        .then(rerender)
        .catch(err => toast('산출물 모듈을 불러오지 못했습니다: ' + err.message, 'warn'));
    }
  }

  if (typeof registerModule === 'function') {
    registerModule({
      id: 'deliverables',
      nav: { label: '산출물', icon: 'task', sub: '양식을 고르고 파일을 올리면 자동으로 채워집니다' },
      view,
      bind
    });
  } else {
    console.warn('[산출물] app.js 의 registerModule 을 찾지 못했습니다. 연결 코드를 확인하세요.');
  }
})();
