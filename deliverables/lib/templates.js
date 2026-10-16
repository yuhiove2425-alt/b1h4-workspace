'use strict';

/**
 * templates/ 폴더의 JSON 을 읽어 양식 목록을 만듭니다.
 * 파일을 하나 더 떨어뜨리면 서버 재시작 없이 목록에 나타납니다.
 *
 * 양식은 원본 문서의 표 틀을 그대로 옮긴 "layout" 으로 정의합니다.
 *
 *   layout: {
 *     title:    "브레인 스토밍",          // 표 위에 오는 문서 제목
 *     columns:  [56, 35, 33, 60, 234],   // 열 너비 비율 (원본 pt 그대로 써도 됨)
 *     rows: [
 *       { h: 27, cells: [
 *           { label: "팀명", span: 2 },                  // 고정으로 인쇄되는 칸
 *           { key: "teamName", span: 3 }                 // 사용자가 채우는 칸
 *       ]},
 *       { repeat: "items", minRows: 5, cells: [...] }     // 행을 늘릴 수 있는 표
 *     ]
 *   }
 */

const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates');

function normalizeCell(cell, index) {
  const out = {
    span: Math.max(1, Number(cell.span) || 1),
    rowSpan: Math.max(1, Number(cell.rowSpan) || 1),
    align: cell.align === 'left' || cell.align === 'right' ? cell.align : 'center',
    multiline: !!cell.multiline
  };

  if (cell.label !== undefined) {
    out.label = String(cell.label);
    out.head = cell.head === undefined ? true : !!cell.head;   // 회색 배경(항목명) 여부
  }
  if (cell.key) {
    out.key = String(cell.key);
    out.for = String(cell.for || '');
    out.context = cell.context ? String(cell.context) : '';
    out.fallback = cell.fallback ? String(cell.fallback) : '';
    out.keywords = Array.isArray(cell.keywords) ? cell.keywords.map(String) : [];
    out.placeholder = cell.placeholder === undefined ? '' : String(cell.placeholder);
    out.maxLines = Number(cell.maxLines) || 0;
    out.catchAll = !!cell.catchAll;
    out.align = cell.align || (out.multiline ? 'left' : 'center');
    out.head = !!cell.head;
  }
  if (!out.label && !out.key) out.label = '';
  if (cell.blank) out.blank = true;                            // 테두리 없는 여백 칸
  /* 아래 반복 행 개수만큼 세로로 합쳐지는 칸 (예: "팀구성원" 세로 라벨) */
  if (cell.rowSpanOf) out.rowSpanOf = String(cell.rowSpanOf);
  out.index = index;
  return out;
}

function normalizeRow(row) {
  const cells = (Array.isArray(row.cells) ? row.cells : []).map(normalizeCell);
  const out = { h: Number(row.h) || 0, cells };
  if (row.repeat) {
    out.repeat = String(row.repeat);
    out.minRows = Math.max(1, Number(row.minRows) || 3);
    /* block: 여러 줄이 한 덩어리로 반복되는 형태 (유스케이스 명세처럼) */
    if (row.block) out.block = true;
    /* 자동 채우기에서 이 표를 찾을 때 쓸 다른 이름들 (화면에는 안 보임) */
    out.match = Array.isArray(row.match) ? row.match.map(String) : [];
  }
  if (row.header) out.header = true;
  if (row.title) out.title = String(row.title);                // 표 위에 붙는 소제목
  return out;
}

function validate(raw, file) {
  if (!raw || typeof raw !== 'object') throw new Error('양식 정의가 객체가 아닙니다.');
  const id = String(raw.id || path.basename(file, '.json')).trim();
  if (!id) throw new Error('id 가 필요합니다.');
  const layout = raw.layout || {};
  const columns = Array.isArray(layout.columns) && layout.columns.length
    ? layout.columns.map(n => Math.max(1, Number(n) || 1))
    : [1];

  /* 표지: 큰 제목 + "과제명 : ___" 같은 몇 줄 + 날짜 (원본 1쪽) */
  const cover = layout.cover && typeof layout.cover === 'object' ? {
    title: String(layout.cover.title || layout.title || raw.name || ''),
    lines: (Array.isArray(layout.cover.lines) ? layout.cover.lines : []).map((line, i) => ({
      label: line.label === undefined ? '' : String(line.label),
      key: line.key ? String(line.key) : '',
      context: line.context ? String(line.context) : '',
      keywords: Array.isArray(line.keywords) ? line.keywords.map(String) : [],
      fallback: line.fallback ? String(line.fallback) : '',
      placeholder: line.placeholder === undefined ? '' : String(line.placeholder),
      multiline: !!line.multiline,
      maxLines: Number(line.maxLines) || 0,
      index: i
    }))
  } : null;

  return {
    id,
    name: String(raw.name || id).trim(),
    desc: String(raw.desc || ''),
    icon: String(raw.icon || 'story'),
    source: String(raw.source || ''),
    file: path.basename(file),
    layout: {
      cover,
      title: String(layout.title || raw.name || ''),
      subtitle: String(layout.subtitle || ''),
      note: String(layout.note || ''),
      columns,
      rows: (Array.isArray(layout.rows) ? layout.rows : []).map(normalizeRow)
    }
  };
}

/** 양식의 모든 입력 칸을 { key, label, keywords, ... } 목록으로 펼칩니다. */
function inputCells(template) {
  const out = [];

  const cover = template.layout.cover;
  if (cover) {
    cover.lines.forEach(line => {
      if (!line.key) return;
      out.push({
        key: line.key,
        repeat: '',
        label: (line.label || '').replace(/[:：]\s*$/, '').trim() || line.key,
        keywords: line.keywords,
        context: line.context,
        fallback: line.fallback,
        multiline: line.multiline,
        maxLines: line.maxLines
      });
    });
  }

  (template.layout.rows || []).forEach(row => {
    let lastLabel = row.title || '';
    row.cells.forEach(cell => {
      if (cell.label !== undefined && cell.label !== '') lastLabel = cell.label.replace(/\n/g, ' ');
      if (!cell.key) return;
      out.push({
        key: cell.key,
        repeat: row.repeat || '',
        label: cell.for || lastLabel || cell.key,
        keywords: cell.keywords,
        context: cell.context,
        fallback: cell.fallback,
        multiline: cell.multiline,
        maxLines: cell.maxLines,
        catchAll: cell.catchAll
      });
    });
  });
  return out;
}

/** 반복(표) 행 정의만 추립니다. */
function repeatRows(template) {
  return (template.layout.rows || []).filter(row => row.repeat);
}

/** 양식 전체를 파일명 순서대로 돌려줍니다. 잘못된 파일은 건너뛰고 경고만 남깁니다. */
function loadTemplates() {
  let files = [];
  try {
    files = fs.readdirSync(TEMPLATE_DIR).filter(f => f.toLowerCase().endsWith('.json')).sort();
  } catch (err) {
    return [];
  }

  const out = [];
  files.forEach(file => {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8'));
      const template = validate(raw, file);
      if (out.some(t => t.id === template.id)) {
        console.warn('[산출물] 양식 id 가 중복됩니다:', template.id, '(' + file + ')');
        return;
      }
      out.push(template);
    } catch (err) {
      console.warn('[산출물] 양식 파일을 읽지 못했습니다:', file, '-', err.message);
    }
  });
  return out;
}

function findTemplate(id) {
  return loadTemplates().find(t => t.id === id) || null;
}

module.exports = { loadTemplates, findTemplate, inputCells, repeatRows, TEMPLATE_DIR };
