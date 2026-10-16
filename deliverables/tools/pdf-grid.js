'use strict';

/**
 * [개발용 도구] PDF 에서 표의 격자(칸 사각형)와 글자 위치를 뽑아냅니다.
 * 양식 원본의 틀을 그대로 재현하기 위한 좌표를 얻는 용도이며, 런타임에는 쓰이지 않습니다.
 *
 *   node tools/pdf-grid.js "templates/samples/1.1._브레인_스토밍_(예시).pdf" [페이지번호]
 */

const fs = require('fs');
const zlib = require('zlib');

function inflate(buf) {
  try { return zlib.inflateSync(buf); } catch (e) { /* noop */ }
  try { return zlib.inflateRawSync(buf); } catch (e) { return null; }
}

/* 3x2 행렬 [a b c d e f] 곱하기 */
function mul(m1, m2) {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5]
  ];
}

function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** 콘텐츠 스트림을 훑어 사각형(칸)과 글자 조각을 모읍니다. */
function parseContent(text, fonts) {
  const rects = [];
  const texts = [];

  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let tm = null;
  let font = null;
  let fontSize = 10;
  let operands = [];
  let path = [];
  let i = 0;

  const readString = () => {
    let depth = 1; const bytes = []; i++;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === '\\') {
        const oct = /^[0-7]{1,3}/.exec(text.slice(i + 1, i + 4));
        if (oct) { bytes.push(parseInt(oct[0], 8) & 0xff); i += 1 + oct[0].length; continue; }
        bytes.push(text.charCodeAt(i + 1) & 0xff); i += 2; continue;
      }
      if (ch === '(') depth++;
      if (ch === ')') { depth--; if (!depth) { i++; break; } }
      bytes.push(text.charCodeAt(i) & 0xff); i++;
    }
    return Buffer.from(bytes);
  };

  const readHex = () => {
    const end = text.indexOf('>', i);
    const hex = text.slice(i + 1, end < 0 ? text.length : end).replace(/[^0-9a-fA-F]/g, '');
    i = (end < 0 ? text.length : end) + 1;
    const bytes = [];
    for (let k = 0; k < hex.length; k += 2) bytes.push(parseInt(hex.slice(k, k + 2).padEnd(2, '0'), 16));
    return Buffer.from(bytes);
  };

  const decode = bytes => {
    let out = '';
    if (font && font.twoByte) {
      for (let k = 0; k + 1 < bytes.length; k += 2) {
        const code = (bytes[k] << 8) | bytes[k + 1];
        out += font.map && font.map.has(code) ? font.map.get(code) : '';
      }
      return out;
    }
    for (let k = 0; k < bytes.length; k++) {
      const code = bytes[k];
      out += font && font.map && font.map.has(code) ? font.map.get(code) : (code >= 32 ? String.fromCharCode(code) : '');
    }
    return out;
  };

  const pushRect = (x, y, w, h) => {
    const [x0, y0] = apply(ctm, x, y);
    const [x1, y1] = apply(ctm, x + w, y + h);
    rects.push({
      x: Math.min(x0, x1), y: Math.min(y0, y1),
      w: Math.abs(x1 - x0), h: Math.abs(y1 - y0)
    });
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === '(') { operands.push({ str: readString() }); continue; }
    if (ch === '<' && text[i + 1] !== '<') { operands.push({ str: readHex() }); continue; }
    if (ch === '<' && text[i + 1] === '<') {
      const end = text.indexOf('>>', i);
      i = end < 0 ? text.length : end + 2;
      continue;
    }
    if (ch === '[' || ch === ']') { operands.push({ mark: ch }); i++; continue; }
    if (ch === '/') {
      const m = /^\/([^\s/[\]<>(){}]*)/.exec(text.slice(i));
      operands.push({ name: m ? m[1] : '' });
      i += m ? m[0].length : 1;
      continue;
    }
    if (/[\d+.\-]/.test(ch)) {
      const m = /^[+-]?[\d.]+/.exec(text.slice(i));
      if (m) { operands.push({ num: parseFloat(m[0]) }); i += m[0].length; continue; }
      i++; continue;
    }
    if (/[A-Za-z'"*]/.test(ch)) {
      const m = /^[A-Za-z*'"0-9]+/.exec(text.slice(i));
      const op = m ? m[0] : ch;
      i += op.length;
      const n = operands.filter(t => t.num !== undefined).map(t => t.num);

      if (op === 'q') stack.push(ctm.slice());
      else if (op === 'Q') ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (op === 'cm' && n.length >= 6) ctm = mul(n.slice(0, 6), ctm);
      else if (op === 're' && n.length >= 4) { pushRect(n[0], n[1], n[2], n[3]); path = []; }
      else if (op === 'm' && n.length >= 2) path = [[n[0], n[1]]];
      else if (op === 'l' && n.length >= 2) path.push([n[0], n[1]]);
      else if (op === 'h' || op === 'f' || op === 'f*' || op === 'B' || op === 'S' || op === 'n') {
        /* 네 점으로 그린 사각형(표 칸 배경/테두리)을 사각형으로 환산 */
        if (path.length >= 4) {
          const xs = path.map(p => p[0]);
          const ys = path.map(p => p[1]);
          const x0 = Math.min(...xs), x1 = Math.max(...xs);
          const y0 = Math.min(...ys), y1 = Math.max(...ys);
          if (x1 - x0 > 0.5 && y1 - y0 > 0.5) pushRect(x0, y0, x1 - x0, y1 - y0);
        }
        if (op !== 'h') path = [];
      } else if (op === 'Tf') {
        const nameTok = operands.filter(t => t.name !== undefined).pop();
        font = nameTok ? fonts[nameTok.name] || null : null;
        if (n.length) fontSize = Math.abs(n[n.length - 1]) || fontSize;
      } else if (op === 'Tm' && n.length >= 6) {
        tm = n.slice(0, 6);
      } else if ((op === 'Td' || op === 'TD') && n.length >= 2 && tm) {
        tm = mul([1, 0, 0, 1, n[n.length - 2], n[n.length - 1]], tm);
      } else if (op === 'Tj' || op === 'TJ' || op === "'" || op === '"') {
        const parts = operands.filter(t => t.str).map(t => decode(t.str)).join('');
        if (parts.trim() && tm) {
          const [px, py] = apply(mul(tm, ctm), 0, 0);
          const scale = Math.abs(mul(tm, ctm)[3]) || 1;
          texts.push({ text: parts, x: px, y: py, size: fontSize * scale });
        }
      }
      operands = [];
      continue;
    }
    i++;
  }
  return { rects, texts };
}

/* --------------------------- 격자 만들기 --------------------------- */

function cluster(values, tolerance) {
  const sorted = values.slice().sort((a, b) => a - b);
  const out = [];
  sorted.forEach(v => {
    if (!out.length || v - out[out.length - 1] > tolerance) out.push(v);
    else out[out.length - 1] = (out[out.length - 1] + v) / 2;
  });
  return out;
}

function buildGrid(rects, texts) {
  /* 너무 작거나 페이지 전체를 덮는 사각형은 칸이 아닙니다. */
  const cells = rects.filter(r => r.w > 12 && r.h > 6 && r.w < 560 && r.h < 700);
  if (!cells.length) return null;

  const xs = cluster(cells.flatMap(r => [r.x, r.x + r.w]), 3);
  const ys = cluster(cells.flatMap(r => [r.y, r.y + r.h]), 3);

  const nearest = (arr, v) => arr.reduce((best, x, i) => Math.abs(x - v) < Math.abs(arr[best] - v) ? i : best, 0);

  return cells.map(r => {
    const c0 = nearest(xs, r.x), c1 = nearest(xs, r.x + r.w);
    const r0 = nearest(ys, r.y), r1 = nearest(ys, r.y + r.h);
    const inside = texts
      .filter(t => t.x >= r.x - 2 && t.x <= r.x + r.w + 2 && t.y >= r.y - 2 && t.y <= r.y + r.h + 2)
      .sort((a, b) => (b.y - a.y) || (a.x - b.x));
    return {
      col: c0, colSpan: Math.max(1, c1 - c0),
      row: r0, rowSpan: Math.max(1, r1 - r0),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h),
      text: inside.map(t => t.text).join(' ').replace(/\s+/g, ' ').trim()
    };
  }).sort((a, b) => (b.y - a.y) || (a.x - b.x));
}

/* ------------------------------ 실행 ------------------------------ */

function main() {
  const file = process.argv[2];
  const pageNo = Number(process.argv[3] || 1);
  if (!file) { console.log('사용법: node tools/pdf-grid.js <pdf경로> [페이지]'); return; }

  const buf = fs.readFileSync(file);
  const pdf = require('../lib/pdf.js');
  const internals = pdf.__internals;
  const objects = internals.collectObjects(buf);

  const pages = [];
  objects.forEach(obj => { if (/\/Type\s*\/Page[^s]/.test(obj.dict + ' ')) pages.push(obj); });
  const page = pages[pageNo - 1];
  if (!page) { console.log('그런 페이지가 없습니다. 전체 ' + pages.length + '쪽'); return; }

  const fonts = internals.pageFonts(objects, page.dict);
  const chunks = internals.contentRefs(page.dict).map(num => {
    const obj = objects.get(num);
    if (!obj || !obj.data) return '';
    const decoded = internals.decodeStream(obj.dict, obj.data);
    return decoded ? decoded.toString('latin1') : '';
  }).join('\n');

  const { rects, texts } = parseContent(chunks, fonts);
  const grid = buildGrid(rects, texts);

  console.log('사각형 ' + rects.length + '개, 글자조각 ' + texts.length + '개');
  if (!grid) { console.log('격자를 찾지 못했습니다.'); return; }
  console.log('칸 ' + grid.length + '개\n');
  grid.forEach(c => {
    console.log(
      `[r${String(c.row).padStart(2)}+${c.rowSpan} c${String(c.col).padStart(2)}+${c.colSpan}] ` +
      `(${c.x},${c.y} ${c.w}x${c.h})  ${c.text.slice(0, 70)}`
    );
  });
}

if (require.main === module) main();
module.exports = { parseContent, buildGrid };
