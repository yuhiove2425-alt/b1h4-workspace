'use strict';

/**
 * 업로드한 파일에서 텍스트와 표를 뽑아냅니다.
 *
 * 반환 형태 (모든 확장자 공통)
 *   {
 *     kind: 'docx',
 *     text: '문서 전체 텍스트',
 *     blocks: [ {type:'para', text}, {type:'table', rows:[[셀,셀]]} ],
 *     warning: '있으면 화면에 노란 배지로 표시'
 *   }
 */

const zlib = require('zlib');
const { readZip, readZipText, matchEntries } = require('./zip');
const { stripTags, blocks, attr, decodeEntities } = require('./xml');
const { isCompoundFile, readCompoundFile } = require('./cfb');
const { extractPdfText } = require('./pdf');

const SUPPORTED = ['txt', 'md', 'markdown', 'csv', 'docx', 'xlsx', 'pptx', 'hwp', 'hwpx', 'pdf'];

function extOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(String(filename || '').trim());
  return m ? m[1].toLowerCase() : '';
}

function tidy(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/﻿/g, '').replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function paraBlocks(text) {
  return tidy(text).split('\n').map(line => ({ type: 'para', text: line.trim() })).filter(b => b.text);
}

function blocksToText(list) {
  return tidy(list.map(b => {
    if (b.type === 'table') return b.rows.map(r => r.join('\t')).join('\n');
    return b.text;
  }).join('\n'));
}

/* --------------------------------- 텍스트 --------------------------------- */

function extractPlain(buf, kind) {
  const text = tidy(buf.toString('utf8'));
  return { kind, text, blocks: paraBlocks(text) };
}

/* ---------------------------------- DOCX ---------------------------------- */

function docxCellText(tcXml) {
  return blocks(tcXml, 'w:p').map(p => blocks(p, 'w:t').map(stripTags).join('')).join(' ').trim();
}

function extractDocx(buf) {
  const entries = readZip(buf);
  const xml = readZipText(entries, 'word/document.xml');
  if (!xml) return { kind: 'docx', text: '', blocks: [], warning: 'docx 안에서 본문(word/document.xml)을 찾지 못했습니다.' };

  const body = blocks(xml, 'w:body')[0] || xml;
  const out = [];

  /* 표와 문단이 나온 순서를 지키기 위해 위치 기준으로 훑습니다. */
  const re = /<w:(p|tbl)(?:\s[^>]*)?>/g;
  let m;
  while ((m = re.exec(body))) {
    const tag = 'w:' + m[1];
    const close = '</' + tag + '>';
    const start = m.index + m[0].length;
    const end = body.indexOf(close, start);
    if (end < 0) break;
    const inner = body.slice(start, end);
    re.lastIndex = end + close.length;

    if (m[1] === 'p') {
      const text = blocks(inner, 'w:t').map(stripTags).join('').trim();
      if (text) out.push({ type: 'para', text });
    } else {
      const rows = blocks(inner, 'w:tr').map(tr => blocks(tr, 'w:tc').map(docxCellText));
      if (rows.length) out.push({ type: 'table', rows });
    }
  }

  return { kind: 'docx', text: blocksToText(out), blocks: out };
}

/* ---------------------------------- XLSX ---------------------------------- */

function colIndex(ref) {
  const letters = (/^([A-Z]+)/.exec(String(ref || '')) || [])[1] || 'A';
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

function extractXlsx(buf) {
  const entries = readZip(buf);
  const sharedXml = readZipText(entries, 'xl/sharedStrings.xml');
  const shared = blocks(sharedXml, 'si').map(si => blocks(si, 't').map(stripTags).join(''));

  const sheets = matchEntries(entries, /^xl\/worksheets\/sheet\d+\.xml$/);
  const out = [];

  sheets.forEach((sheet, idx) => {
    const xml = sheet.buf.toString('utf8');
    if (sheets.length > 1) out.push({ type: 'para', text: `[시트 ${idx + 1}]` });

    const rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g;
    let rm;
    const rows = [];
    while ((rm = rowRe.exec(xml))) {
      const cells = [];
      const cellRe = /<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g;
      let cm;
      while ((cm = cellRe.exec(rm[1]))) {
        const meta = cm[1] || cm[3] || '';
        const inner = cm[2] || '';
        const index = colIndex(attr(meta, 'r'));
        const type = attr(meta, 't');
        let value;
        if (type === 's') {
          const i = Number(stripTags(blocks(inner, 'v')[0] || ''));
          value = shared[i] || '';
        } else if (type === 'inlineStr') {
          value = blocks(inner, 't').map(stripTags).join('');
        } else {
          value = stripTags(blocks(inner, 'v')[0] || '');
        }
        while (cells.length < index) cells.push('');
        cells[index] = decodeEntities(value).trim();
      }
      if (cells.some(c => c)) rows.push(cells);
    }
    if (rows.length) out.push({ type: 'table', rows });
  });

  if (!out.length) return { kind: 'xlsx', text: '', blocks: [], warning: '엑셀에서 읽을 내용을 찾지 못했습니다.' };
  return { kind: 'xlsx', text: blocksToText(out), blocks: out };
}

/* ---------------------------------- PPTX ---------------------------------- */

function extractPptx(buf) {
  const entries = readZip(buf);
  const slides = matchEntries(entries, /^ppt\/slides\/slide\d+\.xml$/);
  const out = [];

  slides.forEach((slide, idx) => {
    out.push({ type: 'para', text: `[슬라이드 ${idx + 1}]` });
    const xml = slide.buf.toString('utf8');
    blocks(xml, 'a:p').forEach(p => {
      const text = blocks(p, 'a:t').map(stripTags).join('').trim();
      if (text) out.push({ type: 'para', text });
    });
  });

  if (!out.length) return { kind: 'pptx', text: '', blocks: [], warning: '슬라이드에서 읽을 내용을 찾지 못했습니다.' };
  return { kind: 'pptx', text: blocksToText(out), blocks: out };
}

/* ---------------------------------- HWPX ---------------------------------- */

function extractHwpx(buf) {
  const entries = readZip(buf);
  const sections = matchEntries(entries, /^Contents\/section\d+\.xml$/i);
  const out = [];

  sections.forEach(section => {
    const xml = section.buf.toString('utf8');
    blocks(xml, 'hp:p').forEach(p => {
      const text = blocks(p, 'hp:t').map(stripTags).join('').trim();
      if (text) out.push({ type: 'para', text });
    });
  });

  if (!out.length) return { kind: 'hwpx', text: '', blocks: [], warning: 'hwpx 본문을 찾지 못했습니다.' };
  return { kind: 'hwpx', text: blocksToText(out), blocks: out };
}

/* ----------------------------------- HWP ---------------------------------- */

/* 한글 문서의 본문 레코드에서 문단 텍스트(HWPTAG_PARA_TEXT)를 읽습니다. */
const HWPTAG_PARA_TEXT = 0x10 + 51;

/*
 * 제어 문자 폭
 *   - 문자 컨트롤(1워드): 0, 10, 13, 24~31
 *   - 인라인/확장 컨트롤(8워드 = 16바이트): 그 외 32 미만 코드
 */
const HWP_CHAR_CONTROL = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);

function hwpParaText(buf) {
  let out = '';
  for (let i = 0; i + 1 < buf.length;) {
    const code = buf.readUInt16LE(i);
    if (code >= 32) { out += String.fromCharCode(code); i += 2; }
    else if (code === 13 || code === 10) { out += '\n'; i += 2; }
    else if (HWP_CHAR_CONTROL.has(code)) { out += ' '; i += 2; }
    else i += 16;
  }
  return out;
}

function hwpSectionText(buf) {
  let out = '';
  let pos = 0;
  while (pos + 4 <= buf.length) {
    const header = buf.readUInt32LE(pos);
    const tag = header & 0x3ff;
    let size = (header >> 20) & 0xfff;
    pos += 4;
    if (size === 0xfff) {
      if (pos + 4 > buf.length) break;
      size = buf.readUInt32LE(pos);
      pos += 4;
    }
    if (pos + size > buf.length) break;
    if (tag === HWPTAG_PARA_TEXT) out += hwpParaText(buf.slice(pos, pos + size)) + '\n';
    pos += size;
  }
  return out;
}

function extractHwp(buf) {
  const streams = readCompoundFile(buf);
  if (!streams.size) {
    return { kind: 'hwp', text: '', blocks: [], warning: '한글 파일을 열지 못했습니다. 한글에서 hwpx 또는 docx 로 저장한 뒤 올려보세요.' };
  }

  const header = streams.get('FileHeader');
  const compressed = header && header.length > 37 ? !!(header.readUInt32LE(36) & 1) : true;

  const sections = Array.from(streams.keys())
    .filter(name => /^BodyText\/Section\d+$/i.test(name))
    .sort();

  let text = '';
  sections.forEach(name => {
    let data = streams.get(name);
    if (compressed) {
      try { data = zlib.inflateRawSync(data); }
      catch (err) {
        try { data = zlib.inflateSync(data); } catch (err2) { data = null; }
      }
    }
    if (data) text += hwpSectionText(data) + '\n';
  });

  text = tidy(text);

  /* 본문을 못 읽으면 미리보기 텍스트(PrvText)라도 사용합니다. */
  if (!text && streams.has('PrvText')) {
    text = tidy(streams.get('PrvText').toString('utf16le'));
    if (text) {
      return { kind: 'hwp', text, blocks: paraBlocks(text), warning: '한글 본문 대신 미리보기 텍스트만 읽었습니다. 내용이 잘렸을 수 있습니다.' };
    }
  }

  if (!text) {
    return { kind: 'hwp', text: '', blocks: [], warning: '한글 파일에서 글자를 찾지 못했습니다. hwpx 또는 docx 로 저장해 올려보세요.' };
  }
  return { kind: 'hwp', text, blocks: paraBlocks(text) };
}

/* ----------------------------------- PDF ---------------------------------- */

/**
 * 쪽마다 반복되는 머리말·꼬리말·쪽번호를 걸러냅니다.
 * ("프로젝트 기획서" 가 10쪽 내내 반복되면 본문 내용으로 잘못 들어갑니다.)
 */
function dropRunningHeaders(pages) {
  if (pages.length < 3) return pages;

  const count = new Map();
  pages.forEach(page => {
    const lines = page.split('\n').map(l => l.trim());
    new Set([lines[0], lines[lines.length - 1]].filter(Boolean)).forEach(line => {
      if (line.length <= 90) count.set(line, (count.get(line) || 0) + 1);
    });
  });

  const repeated = new Set(
    Array.from(count.entries()).filter(([, n]) => n >= Math.max(3, pages.length * 0.5)).map(([line]) => line)
  );

  return pages.map(page => page.split('\n').filter(line => {
    const text = line.trim();
    if (!text) return false;
    if (repeated.has(text)) return false;
    if (/^-?\s*\d{1,3}\s*-?$/.test(text)) return false;                 // - 2 -
    return true;
  }).join('\n'));
}

function extractPdf(buf) {
  let text = '';
  try {
    const raw = extractPdfText(buf);
    text = tidy(dropRunningHeaders(raw.split('\n\n')).join('\n\n'));
  } catch (err) { text = ''; }

  if (!text) {
    return { kind: 'pdf', text: '', blocks: [], warning: '이 PDF에서는 글자를 뽑지 못했습니다(그림으로 된 PDF일 수 있어요). 내용을 직접 붙여넣어 주세요.' };
  }
  const hangul = (text.match(/[가-힣]/g) || []).length;
  const warning = hangul === 0 && /[A-Za-z]/.test(text) === false
    ? 'PDF에서 읽은 글자가 깨져 보일 수 있습니다. 결과를 확인하고 필요하면 직접 고쳐주세요.'
    : undefined;
  return { kind: 'pdf', text, blocks: paraBlocks(text), warning };
}

/* --------------------------------- 진입점 --------------------------------- */

function extractFile(filename, buf) {
  const ext = extOf(filename);
  if (!buf || !buf.length) return { kind: ext, text: '', blocks: [], warning: '파일이 비어 있습니다.' };

  switch (ext) {
    case 'txt':
    case 'md':
    case 'markdown':
    case 'csv':
      return extractPlain(buf, ext);
    case 'docx':
      return extractDocx(buf);
    case 'xlsx':
      return extractXlsx(buf);
    case 'pptx':
      return extractPptx(buf);
    case 'hwpx':
      return extractHwpx(buf);
    case 'hwp':
      /* 확장자만 hwp 이고 실제로는 hwpx(zip)인 경우도 있습니다. */
      return isCompoundFile(buf) ? extractHwp(buf) : extractHwpx(buf);
    case 'pdf':
      return extractPdf(buf);
    default:
      return {
        kind: ext || 'unknown',
        text: '',
        blocks: [],
        warning: `지원하지 않는 형식입니다. (${SUPPORTED.join(', ')} 만 가능)`
      };
  }
}

module.exports = { extractFile, extOf, SUPPORTED };
