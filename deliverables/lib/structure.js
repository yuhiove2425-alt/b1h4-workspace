'use strict';

/**
 * 추출한 문서를 "제목이 붙은 덩어리"로 정리합니다.
 * 자동 채우기(autofill)가 이 결과를 보고 어느 칸에 무엇을 넣을지 고릅니다.
 *
 * analyze(extracted) →
 *   {
 *     keyValues: [{ key: '작성자', value: '홍길동' }],
 *     sections:  [{ title: '회의 내용', lines: [...], text: '...' }],
 *     tables:    [{ header: [...], rows: [[...]] }],
 *     lines:     ['문서의 모든 줄']
 *   }
 */

const BULLET = /^[\s]*(?:[-•*▪◦·o]|\d+[.)]|[가-힣][.)]|\(\d+\))\s*/;

/** 비교용으로 공백과 기호를 걷어낸 문자열. */
function norm(str) {
  return String(str || '').toLowerCase().replace(/[\s　_.,:;·\-–—()[\]{}<>「」『』【】■□○●◆◇※]/g, '');
}

function stripBullet(line) {
  return String(line || '').replace(BULLET, '').trim();
}

/** "키: 값" 형태면 나눠서 돌려줍니다. */
function splitKeyValue(line) {
  const text = String(line || '').trim();
  if (!text || text.length > 200) return null;

  /* PDF/엑셀 표에서 온 "항목⇥내용" 한 줄 */
  if (text.includes('\t')) {
    const parts = text.split('\t').map(p => p.trim()).filter(Boolean);
    if (parts.length === 2 && parts[0].length <= 30) {
      return { key: parts[0].replace(/\s+/g, ' '), value: parts[1] };
    }
    return null;
  }

  const bracket = /^[[<【(]\s*([^\]>】)]{1,30})\s*[\]>】)]\s*(.*)$/.exec(text);
  if (bracket) return { key: bracket[1].trim(), value: bracket[2].trim() };

  const colon = /^([^:：]{1,30})[:：]\s*(.*)$/.exec(text);
  if (colon && !/^https?$/i.test(colon[1].trim())) {
    return { key: colon[1].trim(), value: colon[2].trim() };
  }
  return null;
}

/** 제목처럼 보이는 줄인지 판단합니다. */
function looksLikeHeading(line) {
  const text = String(line || '').trim();
  if (!text || text.length > 40) return false;
  if (/^[[<【(].{1,30}[\]>】)]$/.test(text)) return true;                 // [회의 내용]
  if (/^[■□◆◇※○●▶▣]\s*\S/.test(text)) return true;                     // ■ 프로젝트 개요
  if (/^\d+[.)]\s*\S/.test(text) && text.length <= 30) return true;      // 1. 개요
  if (/^(제\s*\d+\s*[장절]|[IVX]+\.)\s*\S/.test(text)) return true;
  if (/^\S.{0,28}[:：]\s*$/.test(text)) return true;                     // 회의 내용:
  return false;
}

function headingTitle(line) {
  return String(line || '').trim()
    .replace(/^[[<【(]\s*/, '').replace(/\s*[\]>】)]$/, '')
    .replace(/^[■□◆◇※○●▶▣]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/[:：]\s*$/, '')
    .trim();
}

function analyze(extracted) {
  const blocks = (extracted && extracted.blocks) || [];
  const lines = [];
  const tables = [];
  const keyValues = [];
  const sections = [];
  let current = null;

  const pushSection = title => {
    current = { title, titleNorm: norm(title), lines: [], tables: [] };
    sections.push(current);
    return current;
  };

  const addKeyValue = (key, value) => {
    if (!key || !value) return;
    if (keyValues.some(kv => norm(kv.key) === norm(key))) return;
    keyValues.push({ key: String(key).trim(), value: String(value).trim() });
  };

  blocks.forEach(block => {
    if (block.type === 'table') {
      const rows = block.rows.map(r => r.map(c => String(c || '').trim()));
      const table = { header: rows[0] || [], rows, titleNorm: current ? current.titleNorm : '' };
      tables.push(table);
      if (current) current.tables.push(table);

      /* 2칸짜리 표는 "항목 / 내용" 형태가 많아 키-값으로도 씁니다. */
      rows.forEach(row => {
        if (row.length === 2) addKeyValue(row[0], row[1]);
        else if (row.length > 2 && row[0] && row.slice(1).filter(Boolean).length === 1) {
          addKeyValue(row[0], row.slice(1).find(Boolean));
        }
      });
      /* 표의 한 줄은 탭으로 이어 붙여 한 줄로 둡니다(PDF에서 온 표와 형태를 맞춤). */
      rows.forEach(row => {
        const line = row.join('\t').trim();
        if (line) lines.push(line);
      });
      return;
    }

    const text = String(block.text || '').trim();
    if (!text) return;
    lines.push(text);

    if (looksLikeHeading(text)) {
      const title = headingTitle(text);
      const kv = splitKeyValue(text);
      /* [프로젝트 명] B1H4 처럼 제목 뒤에 값이 붙은 경우 둘 다 기록 */
      if (kv && kv.value) addKeyValue(kv.key, kv.value);
      pushSection(title);
      return;
    }

    const kv = splitKeyValue(text);
    if (kv && kv.value) addKeyValue(kv.key, kv.value);

    if (!current) pushSection('');
    current.lines.push(text);
  });

  sections.forEach(s => {
    s.text = s.lines.join('\n').trim();
    s.bullets = s.lines.map(stripBullet).filter(Boolean);
  });

  return { keyValues, sections, tables, lines, text: (extracted && extracted.text) || '' };
}

module.exports = { analyze, norm, stripBullet, splitKeyValue, looksLikeHeading };
