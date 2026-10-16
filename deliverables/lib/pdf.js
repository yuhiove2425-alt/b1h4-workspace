'use strict';

/**
 * 외부 패키지 없이 PDF에서 텍스트를 뽑아냅니다.
 *
 * 처리 흐름
 *   1) "N 0 obj ... endobj" 를 훑어 객체 목록을 만든다 (압축 객체 ObjStm 도 펼침)
 *   2) /Type /Page 객체에서 /Contents 와 /Resources /Font 를 찾는다
 *   3) 폰트의 /ToUnicode CMap 을 읽어 코드 -> 글자 표를 만든다
 *   4) 콘텐츠 스트림의 Tj / TJ / ' / " 연산자에서 글자를 뽑고,
 *      텍스트 위치(Tm/Td/T*)의 y 변화로 줄바꿈을 복원한다
 *
 * 스캔 PDF(그림만 있는 PDF)나 ToUnicode 가 없는 폰트는 글자를 뽑을 수 없습니다.
 * 그런 경우 결과가 비게 되고, 화면에서 "직접 붙여넣기"로 안내합니다.
 */

const zlib = require('zlib');

/* ------------------------------ 객체 수집 ------------------------------ */

function inflate(buf) {
  try { return zlib.inflateSync(buf); } catch (err) { /* 아래에서 재시도 */ }
  try { return zlib.inflateRawSync(buf); } catch (err) { return null; }
}

function decodeStream(dict, raw) {
  if (/\/Filter\s*\/(FlateDecode|Fl)\b/.test(dict) ||
      /\/Filter\s*\[\s*\/(FlateDecode|Fl)\s*\]/.test(dict)) {
    const out = inflate(raw);
    if (!out) return null;
    return applyPredictor(dict, out);
  }
  if (/\/Filter/.test(dict)) return null;          // LZW, DCT 등은 지원하지 않음
  return raw;
}

/** PNG 예측기(주로 xref 스트림)가 걸린 경우 되돌립니다. */
function applyPredictor(dict, buf) {
  const pred = Number((/\/Predictor\s+(\d+)/.exec(dict) || [])[1] || 1);
  if (pred < 10) return buf;
  const colors = Number((/\/Colors\s+(\d+)/.exec(dict) || [])[1] || 1);
  const bpc = Number((/\/BitsPerComponent\s+(\d+)/.exec(dict) || [])[1] || 8);
  const columns = Number((/\/Columns\s+(\d+)/.exec(dict) || [])[1] || 1);
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((colors * bpc * columns) / 8);
  const rows = Math.floor(buf.length / (rowLen + 1));
  const out = Buffer.alloc(rows * rowLen);
  let prev = Buffer.alloc(rowLen);

  for (let r = 0; r < rows; r++) {
    const type = buf[r * (rowLen + 1)];
    const row = Buffer.from(buf.slice(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1)));
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (type === 1) row[i] = (row[i] + a) & 0xff;
      else if (type === 2) row[i] = (row[i] + b) & 0xff;
      else if (type === 3) row[i] = (row[i] + ((a + b) >> 1)) & 0xff;
      else if (type === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        row[i] = (row[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }
    row.copy(out, r * rowLen);
    prev = row;
  }
  return out;
}

/** 파일 전체에서 객체를 모읍니다. objects: Map(번호 -> { dict, data }) */
function collectObjects(buf) {
  const latin = buf.toString('latin1');
  const objects = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;

  while ((m = re.exec(latin))) {
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const endIdx = latin.indexOf('endobj', bodyStart);
    const body = latin.slice(bodyStart, endIdx < 0 ? latin.length : endIdx);

    const streamIdx = body.indexOf('stream');
    let dict = body;
    let data = null;

    if (streamIdx >= 0) {
      dict = body.slice(0, streamIdx);
      let dataStart = bodyStart + streamIdx + 'stream'.length;
      if (latin[dataStart] === '\r') dataStart++;
      if (latin[dataStart] === '\n') dataStart++;
      const endStream = latin.indexOf('endstream', dataStart);

      /* /Length 는 "123" 처럼 직접 값일 수도, "191 0 R" 처럼 참조일 수도 있습니다.
         참조인 경우에는 길이를 모르므로 endstream 위치를 그대로 씁니다. */
      const lenMatch = /\/Length\s+(\d+)([\s\S]{0,12})/.exec(dict);
      const declared = lenMatch && !/^\s+\d+\s+R/.test(lenMatch[2]) ? Number(lenMatch[1]) : 0;

      let dataEnd = endStream < 0 ? latin.length : endStream;
      if (declared > 0 && dataStart + declared <= dataEnd) dataEnd = dataStart + declared;
      data = buf.slice(dataStart, dataEnd);
    }
    objects.set(num, { dict, data });
  }

  expandObjectStreams(objects);
  return objects;
}

/** PDF 1.5+ 의 압축 객체 스트림(ObjStm) 안에 든 객체들을 꺼내 목록에 더합니다. */
function expandObjectStreams(objects) {
  Array.from(objects.values()).forEach(obj => {
    if (!obj.data || !/\/Type\s*\/ObjStm/.test(obj.dict)) return;
    const decoded = decodeStream(obj.dict, obj.data);
    if (!decoded) return;
    const text = decoded.toString('latin1');
    const count = Number((/\/N\s+(\d+)/.exec(obj.dict) || [])[1] || 0);
    const first = Number((/\/First\s+(\d+)/.exec(obj.dict) || [])[1] || 0);
    const header = text.slice(0, first).trim().split(/\s+/).map(Number);

    for (let i = 0; i < count; i++) {
      const num = header[i * 2];
      const off = header[i * 2 + 1];
      if (!Number.isFinite(num) || !Number.isFinite(off)) continue;
      const next = i + 1 < count ? first + header[i * 2 + 3] : text.length;
      if (!objects.has(num)) objects.set(num, { dict: text.slice(first + off, next), data: null });
    }
  });
}

function resolve(objects, token) {
  const m = /^\s*(\d+)\s+\d+\s+R\s*$/.exec(String(token || ''));
  if (!m) return null;
  return objects.get(Number(m[1])) || null;
}

/* ------------------------------ ToUnicode ------------------------------ */

function hexToString(hex) {
  const clean = String(hex).replace(/[^0-9a-fA-F]/g, '');
  let out = '';
  for (let i = 0; i + 3 < clean.length + 2 && i < clean.length; i += 4) {
    const code = parseInt(clean.slice(i, i + 4).padEnd(4, '0'), 16);
    if (code) out += String.fromCharCode(code);
  }
  return out;
}

function parseCMap(text) {
  const map = new Map();

  const charBlocks = text.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
  charBlocks.forEach(block => {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let m;
    while ((m = re.exec(block))) map.set(parseInt(m[1], 16), hexToString(m[2]));
  });

  const rangeBlocks = text.match(/beginbfrange([\s\S]*?)endbfrange/g) || [];
  rangeBlocks.forEach(block => {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[\s\S]*?\]|<[0-9a-fA-F]+>)/g;
    let m;
    while ((m = re.exec(block))) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      if (hi - lo > 65535) continue;
      if (m[3][0] === '[') {
        const items = m[3].match(/<([0-9a-fA-F]+)>/g) || [];
        items.forEach((item, i) => map.set(lo + i, hexToString(item)));
      } else {
        const base = hexToString(m[3]);
        if (!base) continue;
        const tail = base.charCodeAt(base.length - 1);
        for (let c = lo; c <= hi; c++) {
          map.set(c, base.slice(0, -1) + String.fromCharCode(tail + (c - lo)));
        }
      }
    }
  });

  return map;
}

function fontInfo(objects, fontObj) {
  const info = { twoByte: false, map: null };
  if (!fontObj) return info;
  const dict = fontObj.dict || '';
  info.twoByte = /\/Subtype\s*\/Type0/.test(dict) || /\/Encoding\s*\/Identity-[HV]/.test(dict);

  const ref = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(dict);
  if (ref) {
    const stream = objects.get(Number(ref[1]));
    if (stream && stream.data) {
      const decoded = decodeStream(stream.dict, stream.data);
      if (decoded) info.map = parseCMap(decoded.toString('latin1'));
    }
  }
  return info;
}

/* --------------------------- 콘텐츠 스트림 해석 --------------------------- */

const WIN_ANSI_EXTRA = {
  0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”',
  0x95: '•', 0x96: '–', 0x97: '—', 0x85: '…'
};

function decodeBytes(bytes, font) {
  let out = '';
  if (font && font.twoByte) {
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      if (font.map && font.map.has(code)) out += font.map.get(code);
      else if (!font.map && code >= 32) out += String.fromCharCode(code);
    }
    return out;
  }
  for (let i = 0; i < bytes.length; i++) {
    const code = bytes[i];
    if (font && font.map && font.map.has(code)) out += font.map.get(code);
    else if (WIN_ANSI_EXTRA[code]) out += WIN_ANSI_EXTRA[code];
    else if (code >= 32) out += String.fromCharCode(code);
  }
  return out;
}

/* 행렬 [a b c d e f] 곱셈과 점 변환 */
function mulMatrix(m1, m2) {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5]
  ];
}

const IDENTITY = [1, 0, 0, 1, 0, 0];

/** 콘텐츠 스트림 한 개에서 텍스트를 뽑습니다. fonts: { 자원이름: fontInfo } */
function extractFromContent(content, fonts) {
  const text = content.toString('latin1');
  let out = '';
  let stack = [];
  let font = null;
  let curY = null;
  let curX = null;
  let fontSize = 10;
  let runText = '';
  let leading = 0;
  let i = 0;

  /*
   * 글자의 실제 위치는 "텍스트 행렬 × 그래픽 행렬" 로 정해집니다.
   * 이 둘을 제대로 따라가야 표의 같은 행에 있는 칸들이 같은 줄로 모입니다.
   */
  let ctm = IDENTITY.slice();
  const ctmStack = [];
  let tm = IDENTITY.slice();          // 텍스트 행렬
  let tlm = IDENTITY.slice();         // 줄 시작 행렬

  const readString = () => {
    let depth = 1;
    const bytes = [];
    i++;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === '\\') {
        const next = text[i + 1];
        const octal = /^[0-7]{1,3}/.exec(text.slice(i + 1, i + 4));
        if (octal) { bytes.push(parseInt(octal[0], 8) & 0xff); i += 1 + octal[0].length; continue; }
        const escapes = { n: 10, r: 13, t: 9, b: 8, f: 12 };
        if (escapes[next] !== undefined) bytes.push(escapes[next]);
        else if (next === '\n') { /* 줄 이어짐 */ }
        else bytes.push(next.charCodeAt(0) & 0xff);
        i += 2;
        continue;
      }
      if (ch === '(') depth++;
      if (ch === ')') { depth--; if (!depth) { i++; break; } }
      bytes.push(text.charCodeAt(i) & 0xff);
      i++;
    }
    return Buffer.from(bytes);
  };

  const readHexString = () => {
    const end = text.indexOf('>', i);
    const hex = text.slice(i + 1, end < 0 ? text.length : end).replace(/[^0-9a-fA-F]/g, '');
    i = (end < 0 ? text.length : end) + 1;
    const bytes = [];
    for (let k = 0; k < hex.length; k += 2) bytes.push(parseInt(hex.slice(k, k + 2).padEnd(2, '0'), 16));
    return Buffer.from(bytes);
  };

  /*
   * 글자를 찍는 위치가 바뀔 때 줄·띄어쓰기·칸을 되살립니다.
   *   - y 가 바뀌면 줄바꿈
   *   - 같은 줄에서 앞 글자가 끝난 자리보다 조금 떨어지면 공백, 많이 떨어지면 탭(다음 칸)
   *
   * HWP/워드에서 내보낸 PDF 는 낱말이나 표의 칸마다 좌표를 새로 찍고 공백 문자를 넣지 않아서,
   * 이 처리가 없으면 "팀명백곰과아이들" 처럼 전부 붙어버립니다.
   * 글자 폭은 폰트 정보 대신 한글 1칸 / 영문 0.5칸으로 어림잡습니다.
   */
  /* 글자를 내보내면서, 다음 위치와 비교할 수 있게 이번 구간의 글자도 모아둡니다. */
  const emit = str => {
    out += str;
    runText += str;
  };

  const runWidth = step => {
    let w = 0;
    for (let k = 0; k < runText.length; k++) {
      w += runText.charCodeAt(k) > 0x1100 ? step : step * 0.5;
    }
    return w;
  };

  /** 현재 텍스트 행렬과 그래픽 행렬로 실제 종이 위 좌표를 구합니다. */
  const devicePos = () => {
    const m = mulMatrix(tm, ctm);
    const scale = Math.hypot(m[2], m[3]) || 1;
    return { x: m[4], y: m[5], size: (fontSize || 10) * scale };
  };

  const moveTo = () => {
    const { x, y, size } = devicePos();
    const step = size || 10;

    if (curY === null) { curY = y; curX = x; runText = ''; return; }

    /* 표의 칸은 세로 가운데 정렬 때문에 같은 행이라도 y가 조금 어긋납니다.
       글자 크기의 절반보다 적게 어긋난 것은 같은 줄로 봅니다. */
    if (Math.abs(y - curY) > step * 0.5) {
      out += '\n';
    } else {
      const gap = x - (curX + runWidth(step));
      if (gap > step * 0.9) out += '\t';
      else if (gap > step * 0.12) out += ' ';
    }
    curY = y;
    curX = x;
    runText = '';
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === '(') { stack.push({ str: readString() }); continue; }
    if (ch === '<' && text[i + 1] !== '<') { stack.push({ str: readHexString() }); continue; }
    if (ch === '<' && text[i + 1] === '<') {                       // 인라인 사전은 건너뜀
      const end = text.indexOf('>>', i);
      i = end < 0 ? text.length : end + 2;
      continue;
    }
    if (ch === '[' || ch === ']') { stack.push({ mark: ch }); i++; continue; }
    if (ch === '/') {
      const m = /^\/([^\s/[\]<>(){}]*)/.exec(text.slice(i));
      stack.push({ name: m ? m[1] : '' });
      i += m ? m[0].length : 1;
      continue;
    }
    if (/[\d+.\-]/.test(ch)) {
      const m = /^[+-]?[\d.]+/.exec(text.slice(i));
      if (m) { stack.push({ num: parseFloat(m[0]) }); i += m[0].length; continue; }
      i++;
      continue;
    }
    if (/[A-Za-z'"*]/.test(ch)) {
      const m = /^[A-Za-z*'"0-9]+/.exec(text.slice(i));
      const op = m ? m[0] : ch;
      i += op.length;

      const nums = stack.filter(t => t.num !== undefined).map(t => t.num);
      const strs = stack.filter(t => t.str);

      if (op === 'q') {
        ctmStack.push(ctm.slice());
      } else if (op === 'Q') {
        ctm = ctmStack.pop() || IDENTITY.slice();
      } else if (op === 'cm') {
        if (nums.length >= 6) ctm = mulMatrix(nums.slice(0, 6), ctm);
      } else if (op === 'BT') {
        /* 텍스트 행렬은 BT 마다 초기화됩니다(줄/칸 비교용 좌표는 유지). */
        tm = IDENTITY.slice();
        tlm = IDENTITY.slice();
      } else if (op === 'Tf') {
        const nameTok = stack.filter(t => t.name !== undefined).pop();
        font = nameTok ? fonts[nameTok.name] || null : null;
        if (nums.length) fontSize = Math.abs(nums[nums.length - 1]) || fontSize;
      } else if (op === 'TL') {
        leading = nums[nums.length - 1] || 0;
      } else if (op === 'Tm') {
        if (nums.length >= 6) {
          tm = nums.slice(0, 6);
          tlm = tm.slice();
          moveTo();
        }
      } else if (op === 'Td' || op === 'TD') {
        if (nums.length >= 2) {
          tlm = mulMatrix([1, 0, 0, 1, nums[nums.length - 2], nums[nums.length - 1]], tlm);
          tm = tlm.slice();
          if (op === 'TD') leading = -nums[nums.length - 1];
          moveTo();
        }
      } else if (op === 'T*') {
        tlm = mulMatrix([1, 0, 0, 1, 0, -leading], tlm);
        tm = tlm.slice();
        moveTo();
      } else if (op === 'Tj') {
        if (strs.length) emit(decodeBytes(strs[strs.length - 1].str, font));
      } else if (op === "'" || op === '"') {
        out += '\n';
        runText = '';
        if (strs.length) emit(decodeBytes(strs[strs.length - 1].str, font));
      } else if (op === 'TJ') {
        stack.forEach(tok => {
          if (tok.str) emit(decodeBytes(tok.str, font));
          else if (tok.num !== undefined && tok.num < -120) emit(' ');
        });
      }
      stack = [];
      continue;
    }
    i++;
  }
  return out;
}

/* -------------------------------- 진입점 -------------------------------- */

function pageFonts(objects, pageDict) {
  const fonts = {};
  let resDict = '';
  const inline = /\/Resources\s*<<([\s\S]*?)>>\s*(?:\/|>>)/.exec(pageDict);
  const ref = /\/Resources\s+(\d+)\s+\d+\s+R/.exec(pageDict);
  if (inline) resDict = inline[1];
  else if (ref) {
    const obj = objects.get(Number(ref[1]));
    resDict = obj ? obj.dict : '';
  }

  const fontBlock = /\/Font\s*<<([\s\S]*?)>>/.exec(resDict);
  let fontDict = fontBlock ? fontBlock[1] : '';
  if (!fontBlock) {
    const fontRef = /\/Font\s+(\d+)\s+\d+\s+R/.exec(resDict);
    if (fontRef) {
      const obj = objects.get(Number(fontRef[1]));
      fontDict = obj ? obj.dict : '';
    }
  }

  const re = /\/([^\s/]+)\s+(\d+)\s+\d+\s+R/g;
  let m;
  while ((m = re.exec(fontDict))) fonts[m[1]] = fontInfo(objects, objects.get(Number(m[2])));
  return fonts;
}

function contentRefs(pageDict) {
  const single = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(pageDict);
  if (single) return [Number(single[1])];
  const arr = /\/Contents\s*\[([\s\S]*?)\]/.exec(pageDict);
  if (!arr) return [];
  const out = [];
  const re = /(\d+)\s+\d+\s+R/g;
  let m;
  while ((m = re.exec(arr[1]))) out.push(Number(m[1]));
  return out;
}

/** PDF 버퍼에서 페이지별 텍스트를 뽑아 하나의 문자열로 돌려줍니다. */
function extractPdfText(buf) {
  const objects = collectObjects(buf);
  const pages = [];

  objects.forEach(obj => {
    if (/\/Type\s*\/Page[^s]/.test(obj.dict + ' ')) pages.push(obj);
  });

  const out = [];

  if (pages.length) {
    pages.forEach(page => {
      const fonts = pageFonts(objects, page.dict);
      const chunks = contentRefs(page.dict).map(num => {
        const obj = objects.get(num);
        if (!obj || !obj.data) return '';
        const decoded = decodeStream(obj.dict, obj.data);
        return decoded ? extractFromContent(decoded, fonts) : '';
      });
      const pageText = chunks.join('\n').trim();
      if (pageText) out.push(pageText);
    });
  }

  /* 페이지 구조를 못 읽었을 때의 안전망: 텍스트가 든 스트림을 전부 훑는다 */
  if (!out.length) {
    const allFonts = {};
    objects.forEach(obj => {
      if (/\/Type\s*\/Font/.test(obj.dict)) {
        const name = (/\/BaseFont\s*\/([^\s/>]+)/.exec(obj.dict) || [])[1];
        if (name) allFonts[name] = fontInfo(objects, obj);
      }
    });
    objects.forEach(obj => {
      if (!obj.data || /\/Type\s*\/(ObjStm|XRef|Font|Metadata)/.test(obj.dict)) return;
      const decoded = decodeStream(obj.dict, obj.data);
      if (!decoded) return;
      const head = decoded.slice(0, 4000).toString('latin1');
      if (!/\bBT\b/.test(head) && !/\bTj\b/.test(head) && !/\bTJ\b/.test(head)) return;
      const text = extractFromContent(decoded, allFonts).trim();
      if (text) out.push(text);
    });
  }

  return out.join('\n\n');
}

module.exports = { extractPdfText };

/* 개발용 도구(tools/pdf-grid.js)에서 내부 함수를 재사용하기 위한 통로입니다. */
module.exports.__internals = { collectObjects, decodeStream, pageFonts, contentRefs, fontInfo };
