'use strict';

/**
 * 업로드한 문서의 내용을 양식(layout)의 각 칸에 넣습니다.
 *
 * 채우는 순서
 *   1) 문서에서 칸 이름(항목명)과 비슷한 자리의 값
 *   2) 없으면 context (로그인한 사람 / 오늘 날짜 / 팀 조직도 같은 앱이 아는 값)
 *   3) 끝까지 못 넣은 내용은 leftovers 로 돌려주어 화면에서 직접 옮길 수 있게 합니다.
 */

const { analyze, norm, stripBullet, looksLikeHeading } = require('./structure');
const { inputCells, repeatRows } = require('./templates');

/* 두 문자열이 얼마나 비슷한지 0~1 로 점수를 냅니다. */
function score(candidate, keyword) {
  const a = norm(candidate);
  const b = norm(keyword);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b)) return 0.85 - Math.min(0.3, (a.length - b.length) / 60);
  if (b.includes(a)) return 0.7 - Math.min(0.3, (b.length - a.length) / 60);

  let shared = 0;
  for (let i = 0; i + 1 < b.length; i++) if (a.includes(b.slice(i, i + 2))) shared++;
  const ratio = b.length > 1 ? shared / (b.length - 1) : 0;
  return ratio > 0.6 ? ratio * 0.6 : 0;
}

function bestMatch(items, keywords, textOf) {
  let best = null;
  items.forEach((item, index) => {
    keywords.forEach(keyword => {
      if (!keyword) return;
      const value = score(textOf(item), keyword);
      if (value >= 0.6 && (!best || value > best.score)) best = { item, index, score: value };
    });
  });
  return best;
}

/**
 * 엑셀에서 온 날짜는 "45763" 같은 일련번호로 나옵니다.
 * 날짜 칸에 그런 숫자가 들어오면 사람이 읽는 날짜로 바꿔줍니다.
 */
function tidyValue(cell, value) {
  const text = String(value == null ? '' : value).trim();
  const label = String(cell.label || cell.for || '');

  if (/날짜|일자|작성일|진행일|기한|완료|시작/.test(label)) {
    const serial = Number(text);
    if (Number.isFinite(serial) && serial >= 20000 && serial <= 80000) {
      const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
      return new Date(ms).toISOString().slice(0, 10);
    }
    /* "2026. 08. 13. ( 목 )" → "2026. 08. 13. (목)" / 짝 안 맞는 괄호는 정리 */
    let out = text.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s{2,}/g, ' ').trim();
    const open = (out.match(/\(/g) || []).length;
    const close = (out.match(/\)/g) || []).length;
    if (open > close) out = out.replace(/\s*\([^)]*$/, '');
    else if (close > open) out = out.replace(/^[^(]*\)\s*/, '');
    return out.trim();
  }

  /* 이름·제목 같은 칸에 숫자 덩어리만 들어오면 잘못 집은 값입니다. */
  if (/이름|명$|작성자|담당|팀|제목|주제/.test(label) && text && !/[가-힣A-Za-z]/.test(text)) return '';
  return text;
}

function contextValue(name, context) {
  const ctx = context || {};
  switch (name) {
    case 'today': return ctx.today || '';
    case 'me':
    case 'author': return ctx.author || '';
    case 'projectName': return ctx.projectName || '';
    case 'teamName': return ctx.teamName || '';
    default: return '';
  }
}

/** 어떤 줄이 표의 열 이름과 얼마나 맞는지. */
function headerScore(parts, cells) {
  return cells.reduce((sum, cell) => {
    const label = cell.for || cell.label || '';
    const best = parts.reduce((m, part) => Math.max(m, score(part, label)), 0);
    return sum + (best >= 0.6 ? best : 0);
  }, 0);
}

const ROW_SEPARATORS = [/\t/, /\s*\|\s*/, /\s+\/\s+/, /\s*,\s*/];

/* -------------------- 표의 열을 "내용을 보고" 판별하기 -------------------- */

const HEADER_WORDS = /^(no|번호|순번|구분|항목|내용|업무|과업|담당|담당자|이름|성명|비고|특이사항|상태|달성|진척|일자|날짜|기간|시작|완료|우선순위|결과|판정|id)$/i;

const STATUS_VALUE = /^(완료|미완료|진행\s*중|진행중|보류|대기|지연|취소|예정|이월|o|x|v|△|○|●|\d{1,3}\s*%)$/i;
const DATE_VALUE = /(\d{4}\s*[-./년]\s*\d{1,2}\s*[-./월]\s*\d{1,2})|^\d{1,2}\s*\/\s*\d{1,2}$|^\d{1,2}월\s*\d{1,2}일$/;

/* "상/중/하", "완료" 처럼 등급·상태를 나타내는 짧은 값 */
const GRADE_VALUE = /^(상|중|하|최상|최하|높음|보통|낮음|긴급|완료|미완료|진행\s*중|진행중|보류|대기|지연|이월|예정|알파|베타|o|x|v|△|○|●|\d{1,3}\s*%)$/i;

/** 값의 생김새 (행이 새로 시작하는지 판단하는 데 씁니다) */
function valueShape(value) {
  const text = String(value || '').trim();
  if (/^\d{1,3}$/.test(text)) return 'num';
  if (/^[A-Za-z][A-Za-z0-9_.\-]*\d[A-Za-z0-9_.\-]*$/.test(text)) return 'code';
  if (/^[가-힣]{2,4}(\s*[\/,·]\s*[가-힣]{2,4})*$/.test(text) && text.length <= 20) return 'person';
  return 'text';
}

/** 사람 이름처럼 보이는가 (팀 조직도에 있으면 확실) */
function looksLikePerson(value, roster) {
  const text = String(value || '').trim();
  if (!text || text.length > 24) return false;
  if ((roster || []).some(p => p.name && text.includes(p.name))) return true;
  return /^[가-힣]{2,4}(\s*[\/,·]\s*[가-힣]{2,4})*$/.test(text);
}

/** 양식 칸의 이름을 보고 어떤 성격의 열인지 정합니다. */
function cellKind(label) {
  const text = String(label || '');
  if (/이름|성명|담당|작성자|수행자|참여|멘토|멘티/.test(text)) return 'person';
  if (/날짜|일자|기간|시작|완료일|기한|시점/.test(text)) return 'date';
  if (/달성|진척|상태|진행률|판정|우선순위|결과/.test(text)) return 'status';
  if (/^(no|번호|순번|id)$/i.test(text.trim())) return 'num';
  if (/비고|특이사항|참고|메모/.test(text)) return 'note';
  return 'content';
}

/** 원본 표의 한 열이 어떤 성격인지 비율로 계산합니다. */
function columnProfile(matrix, index, roster) {
  const values = matrix.map(row => (row[index] || '').trim()).filter(Boolean);
  const n = values.length || 1;
  return {
    filled: values.length,
    avgLen: values.reduce((sum, v) => sum + v.length, 0) / n,
    person: values.filter(v => looksLikePerson(v, roster)).length / n,
    date: values.filter(v => DATE_VALUE.test(v)).length / n,
    status: values.filter(v => STATUS_VALUE.test(v) || GRADE_VALUE.test(v)).length / n,
    num: values.filter(v => /^\d{1,3}$/.test(v)).length / n
  };
}

/** 문서의 절 제목처럼 보이는 줄 (표의 끝을 알아내는 데 씁니다). */
function isSectionHeading(text) {
  const value = String(text || '').trim();
  if (!value || value.length > 40) return false;
  if (!/[가-힣A-Za-z]/.test(value)) return false;
  return /^\d+([-.]\d+)*[.)]\s*\S/.test(value) ||
         /^[■□◆◇※○●▶▣]\s*\S/.test(value) ||
         /^[ⅠⅡⅢⅣⅤIVX]+\.\s*\S/.test(value) ||
         /^제\s*\d+\s*[장절]/.test(value);
}

/** 원본 표의 머리글 단어로 그 열의 성격을 정합니다. */
function headerKind(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (/과업|업무|내용|활동|작업|항목|task/i.test(value)) return 'content';
  if (/비고|특이|참고|메모|remark/i.test(value)) return 'note';
  if (/담당|이름|성명|수행자|작성자/.test(value)) return 'person';
  if (/달성|상태|진척|결과|판정|진행률|우선순위/.test(value)) return 'status';
  if (/일자|날짜|기간|시작|완료일|기한/.test(value)) return 'date';
  if (/^(no|번호|순번|id)$/i.test(value)) return 'num';
  return '';
}

function affinity(kind, profile, maxAvgLen, index, width) {
  const longRatio = maxAvgLen ? profile.avgLen / maxAvgLen : 0;
  /* 표에서 "내용" 은 앞쪽, "비고" 는 뒤쪽에 오는 경우가 많습니다. */
  const position = width > 1 ? index / (width - 1) : 0;

  switch (kind) {
    case 'person': return profile.person * 1.2;
    case 'date': return profile.date * 1.2;
    case 'status': return profile.status * 1.2;
    case 'num': return profile.num * (profile.avgLen <= 4 ? 1.2 : 0.4);
    case 'note': return 0.3 * longRatio + 0.4 * position + 0.15 * (1 - profile.person);
    default: return longRatio * (1 - 0.35 * position);   // content: 앞쪽의 긴 열
  }
}

/**
 * 글줄 목록을 양식의 표 행으로 바꿉니다.
 *
 * 열 이름이 서로 달라도(계획 과업/담당/비고 → 이름/업무 내용/특이사항)
 * 값의 생김새로 열을 판별해 제자리에 넣습니다.
 */
function linesToRows(lines, cells, context) {
  const source = (lines || []).map(l => String(l || '').trim()).filter(Boolean);
  if (!source.length) return [];

  const keyCells = cells.filter(c => c.key);
  const keys = keyCells.map(c => c.key);
  const roster = (context && context.roster) || [];
  if (!keys.length) return [];

  const mainCell = keyCells.reduce((best, c) => (c.span > best.span ? c : best), keyCells[0]);
  if (keys.length < 2) return source.map(line => ({ [mainCell.key]: line.replace(/\t/g, ' ') }));

  const separator = ROW_SEPARATORS.find(re =>
    source.filter(line => line.split(re).filter(Boolean).length >= 2).length >= Math.ceil(source.length / 2)
  ) || (source.some(line => line.includes('\t')) ? /\t/ : null);

  if (!separator) return source.map(line => ({ [mainCell.key]: line }));

  /*
   * 1) 줄을 칸 배열로 펼칩니다.
   *    표의 한 칸이 여러 줄로 접히면 칸 수가 적은 줄이 생기는데,
   *    그건 새 행이 아니라 앞 행에서 이어지는 내용입니다.
   *      "쉐이크 모션 인식 ⇥ 쉐이크 모션을 인식할 수"
   *      "있어야 한다. ⇥ 하"        ← 앞 행의 설명 + 우선순위
   */
  const partsPerLine = source.map(line => line.split(separator).map(p => p.trim()).filter(Boolean));
  const widthCount = new Map();
  partsPerLine.forEach(parts => widthCount.set(parts.length, (widthCount.get(parts.length) || 0) + 1));
  const typicalWidth = Array.from(widthCount.entries())
    .filter(([w]) => w >= 2)
    .sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))[0];
  const newRowMin = typicalWidth ? Math.max(2, typicalWidth[0] - 1) : 2;

  const matrix = [];
  partsPerLine.forEach(parts => {
    if (!parts.length) return;
    if (!matrix.length) { matrix.push(parts.slice()); return; }

    const last = matrix[matrix.length - 1];
    const shape = valueShape(parts[0]);
    const prevShape = valueShape(last[0]);

    /*
     * 새 행인지 판단합니다.
     * 첫 칸이 번호·코드·사람 이름이면 새 행이 시작된 것으로 봅니다(F_R_203, 5, 홍길동 …).
     * 그냥 글이면 앞 행에서 이어지는 내용입니다("있어야 한다. ⇥ 하").
     */
    const startsRow = ['num', 'code', 'person'].includes(shape)
      ? true
      : (prevShape === 'text' && parts.length >= newRowMin);

    if (startsRow) { matrix.push(parts.slice()); return; }

    /* 짧은 등급/상태 값 하나만 이어지면 뒤쪽 칸(우선순위·달성 등)에 넣습니다. */
    if (parts.length === 1 && GRADE_VALUE.test(parts[0])) { last.push(parts[0]); return; }

    let at = last.length - 1;
    while (at > 0 && !last[at]) at--;
    last[at] = (last[at] ? last[at] + ' ' : '') + parts[0];
    parts.slice(1).forEach(part => last.push(part));
  });
  if (!matrix.length) return [];

  /* 2) 머리글 줄은 따로 빼둡니다 (열 성격을 정하는 데 씁니다). */
  let header = null;
  while (matrix.length > 1) {
    const first = matrix[0];
    const isHeader = first.every(v => v.length <= 12) &&
      first.filter(v => HEADER_WORDS.test(v) || headerScore([v], cells) >= 0.6).length >= Math.ceil(first.length / 2);
    if (!isHeader) break;
    if (!header) header = first;
    matrix.shift();
  }

  /* 3) 원본 열들의 성격을 계산합니다. */
  const width = matrix.reduce((m, row) => Math.max(m, row.length), 0);
  const profiles = Array.from({ length: width }, (unused, i) => columnProfile(matrix, i, roster));
  const maxAvgLen = Math.max(...profiles.map(p => p.avgLen), 1);

  /*
   * 4) 양식 칸 ↔ 원본 열 연결.
   *    성격이 뚜렷한 칸(이름·날짜·상태·번호)을 먼저 확정하고,
   *    그 다음 "내용" 칸이 가장 긴 열을 가져가고, "비고" 칸은 마지막에 남은 것을 받습니다.
   *    (비고가 먼저 긴 열을 채가면 업무 내용과 뒤바뀝니다)
   */
  const KIND_PRIORITY = { person: 4, date: 4, status: 4, num: 4, content: 2, note: 1 };
  const cellKinds = keyCells.map(cell => cellKind(cell.for || cell.label || ''));
  const cellToCol = new Array(keyCells.length).fill(-1);
  const usedCol = new Set();

  /* 4-1) 원본에 머리글이 있으면 그 이름으로 열 성격을 확정합니다(가장 정확). */
  if (header) {
    const headerKinds = profiles.map((unused, pi) => headerKind(header[pi] || ''));
    keyCells.forEach((cell, ci) => {
      if (cellToCol[ci] >= 0) return;
      const want = cellKinds[ci];
      const pi = headerKinds.findIndex((k, index) => k === want && !usedCol.has(index) && profiles[index].filled);
      if (pi >= 0) { cellToCol[ci] = pi; usedCol.add(pi); }
    });
  }

  /* 4-2) 나머지는 값의 생김새로 맞춥니다. */
  const pairs = [];
  keyCells.forEach((cell, ci) => {
    if (cellToCol[ci] >= 0) return;
    profiles.forEach((profile, pi) => {
      if (!profile.filled || usedCol.has(pi)) return;
      pairs.push({ ci, pi, kind: cellKinds[ci], value: affinity(cellKinds[ci], profile, maxAvgLen, pi, width) });
    });
  });
  pairs.sort((a, b) => (KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind]) || (b.value - a.value));
  pairs.forEach(pair => {
    if (cellToCol[pair.ci] >= 0 || usedCol.has(pair.pi) || pair.value <= 0.15) return;
    cellToCol[pair.ci] = pair.pi;
    usedCol.add(pair.pi);
  });

  /* 5) 아직 짝이 없는 칸은 남은 열을 순서대로 받습니다.
        (번호 열은 양식에 자리가 없으면 버립니다 — 옮겨 적어봐야 의미가 없습니다) */
  const leftoverCols = profiles
    .map((p, i) => i)
    .filter(i => !usedCol.has(i) && profiles[i].filled &&
      !(header ? headerKind(header[i] || '') === 'num' : profiles[i].num > 0.7 && profiles[i].avgLen <= 3));
  cellToCol.forEach((col, ci) => {
    if (col >= 0) return;
    const next = leftoverCols.shift();
    if (next !== undefined) { cellToCol[ci] = next; usedCol.add(next); }
  });

  /* 6) 그래도 남은 열은 "비고" 칸(없으면 내용 칸) 뒤에 이어 붙여 내용을 잃지 않게 합니다. */
  const spillIndex = (() => {
    const note = keyCells.findIndex(c => cellKind(c.for || c.label || '') === 'note');
    if (note >= 0) return note;
    return keyCells.findIndex(c => c.key === mainCell.key);
  })();

  return matrix.map(row => {
    const out = {};
    keyCells.forEach((cell, ci) => {
      const col = cellToCol[ci];
      out[cell.key] = col >= 0 ? (row[col] || '') : '';
    });
    if (leftoverCols.length && spillIndex >= 0) {
      const extra = leftoverCols.map(i => row[i]).filter(Boolean).join(' / ');
      if (extra) {
        const key = keyCells[spillIndex].key;
        out[key] = (out[key] ? out[key] + ' / ' : '') + extra;
      }
    }
    return out;
  }).filter(row => Object.values(row).some(Boolean));
}

/* -------------------------------- 채우기 -------------------------------- */

function fillTemplate(template, extracted, context) {
  const doc = extracted ? analyze(extracted) : { keyValues: [], sections: [], tables: [], lines: [] };
  const cells = inputCells(template);
  const repeats = repeatRows(template);
  const values = {};
  const filled = [];
  const usedLines = new Set();
  const usedTables = new Set();

  /* 양식에 쓰인 모든 이름 — 문서에서 라벨 줄을 찾을 때 경계로 씁니다. */
  const allLabels = [];
  (template.layout.rows || []).forEach(row => {
    if (row.title) allLabels.push(row.title);
    row.cells.forEach(cell => {
      if (cell.label) {
        /* 원본에서 항목명이 두 줄로 접혀 있을 수 있어 줄 단위로도 등록합니다. */
        allLabels.push(cell.label.replace(/\n/g, ' '));
        cell.label.split('\n').forEach(part => { if (part.trim().length >= 2) allLabels.push(part.trim()); });
      }
      if (cell.for) allLabels.push(cell.for);
    });
  });

  /* 문서의 각 줄을 탭 기준으로 칸 단위로 쪼개 둡니다(원본이 표이므로). */
  const lineParts = doc.lines.map(line => line.split('\t').map(s => s.trim()).filter(Boolean));

  /* 원본 양식에서 항목명은 "작 성 자" 처럼 자간을 벌려 쓰는 경우가 많습니다. */
  const looksLikeFormLabel = text =>
    /^([가-힣]\s+){1,4}[가-힣]$/.test(text) || /[:：]$/.test(text);

  const isLabelish = text =>
    text.length <= 40 && (looksLikeFormLabel(text) || allLabels.some(label => label && score(text, label) >= 0.8));

  const isLabelLine = line =>
    line.split('\t').some(part => isLabelish(part.trim()));

  /**
   * 양식의 항목명을 문서에서 찾아 값을 가져옵니다.
   *   1) 같은 줄의 바로 다음 칸       "제안자 ⇥ 홍길동"
   *   2) 그 줄 아래로 이어지는 내용   "타겟" 다음 줄부터 다음 항목명 직전까지
   */
  const findByLabel = (keywords, multiline, maxLines) => {
    for (let i = 0; i < lineParts.length; i++) {
      if (usedLines.has(i)) continue;
      const parts = lineParts[i];

      for (let p = 0; p < parts.length; p++) {
        if (!keywords.some(k => k && score(parts[p], k) >= 0.8)) continue;

        if (p + 1 < parts.length && !isLabelish(parts[p + 1])) {
          const rest = parts.slice(p + 1);
          const stop = rest.findIndex(isLabelish);
          const value = (stop < 0 ? rest : rest.slice(0, stop)).join(' ').trim();
          if (value) return { value, consumed: false };
          continue;                                  // 빈 칸이면 다른 자리를 더 찾아봅니다
        }

        /*
         * 한 줄짜리 칸이라도 PDF에서는 값이 여러 줄로 쪼개져 있는 경우가 많습니다.
         *   작성일자 → "2026. 08. 13. (" / "목" / ")"
         *   프로젝트명 → "금융규제" / "Compliance AI"
         * 그래서 짧은 줄이 이어지면 최대 4줄까지 모아 한 줄로 잇습니다.
         */
        const oneLine = !multiline && !maxLines;
        const limit = maxLines || (multiline ? 40 : 4);
        const picked = [];
        let j = i + 1;
        while (j < doc.lines.length && picked.length < limit && !usedLines.has(j) && !isLabelLine(doc.lines[j])) {
          const text = doc.lines[j].replace(/\t/g, ' ').trim();
          /* 한 줄짜리 칸인데 긴 문단이 나오면 거기서 멈춥니다(본문을 끌어오지 않도록). */
          if (oneLine && picked.length && (text.length > 40 || doc.lines[j].includes(String.fromCharCode(9)))) break;
          picked.push(text);
          j++;
          if (oneLine && picked.length === 1 && picked[0].length > 40) break;
        }
        if (picked.length) {
          for (let k = i; k < j; k++) usedLines.add(k);
          return { value: oneLine ? picked.join(' ') : picked.join('\n'), consumed: true };
        }
      }
    }
    return null;
  };

  /** 라벨 줄을 찾아 그 다음 줄부터 다음 라벨 직전까지 가져옵니다. */
  const takeAfterLabel = keywords => {
    const lines = doc.lines;
    for (let i = 0; i < lines.length; i++) {
      if (usedLines.has(i)) continue;
      const line = lines[i];
      if (line.length > 40) continue;
      if (!keywords.some(k => k && score(line, k) >= 0.75)) continue;

      const picked = [];
      let j = i + 1;
      while (j < lines.length && picked.length < 80 && !usedLines.has(j) && !isLabelLine(lines[j])) {
        /* "3. 수집 실적 상세" / "3-1. 수집 방식" 같은 다음 절 제목을 만나면 거기서 끊습니다.
           "(99.99%)" 같은 괄호 조각은 제목이 아니므로 걸러야 합니다. */
        if (picked.length && isSectionHeading(lines[j].replace(/\t/g, ' ').trim())) break;
        picked.push(lines[j]);
        j++;
      }
      if (!picked.length) continue;
      for (let k = i; k < j; k++) usedLines.add(k);
      return picked;
    }
    return [];
  };

  /**
   * 문서에서 "이 표의 머리글 줄"을 찾아 그 아래 줄들을 행으로 가져옵니다.
   * 열 이름이 여러 개 맞아떨어져야 하므로 엉뚱한 표를 집을 확률이 낮습니다.
   */
  const findTableByHeader = rowCells => {
    const need = Math.max(1.6, rowCells.length * 0.5);
    for (let i = 0; i < lineParts.length; i++) {
      if (usedLines.has(i)) continue;
      const parts = lineParts[i];
      if (parts.length < 2) continue;
      if (headerScore(parts, rowCells) < need) continue;

      const picked = [];
      let j = i + 1;
      while (j < doc.lines.length && !usedLines.has(j) && picked.length < 200) {
        const next = lineParts[j];
        /* 다음 표의 머리글이나 다른 항목명이 나오면 멈춥니다. */
        if (next.length === 1 && isLabelish(next[0])) break;
        if (next.length >= 2 && headerScore(next, rowCells) >= need) break;
        picked.push(doc.lines[j]);
        j++;
      }
      if (!picked.length) continue;
      for (let k = i; k < j; k++) usedLines.add(k);
      return picked;
    }
    return null;
  };

  /**
   * 열 이름이 달라도 "표처럼 생긴" 줄 뭉치를 찾습니다.
   * 탭으로 2칸 이상 나뉜 줄이 3줄 이상 이어지면 표로 봅니다.
   */
  const findTableByShape = () => {
    let best = null;
    let i = 0;
    while (i < lineParts.length) {
      if (usedLines.has(i) || lineParts[i].length < 2) { i++; continue; }
      let j = i;
      while (j < lineParts.length && !usedLines.has(j) && lineParts[j].length >= 2) j++;
      if (j - i >= 3 && !best) best = { start: i, end: j };
      i = j + 1;
    }
    if (!best) return null;
    for (let k = best.start; k < best.end; k++) usedLines.add(k);
    return doc.lines.slice(best.start, best.end);
  };

  /**
   * 블록 반복(유스케이스 명세처럼 세로로 항목이 늘어선 표)을 채웁니다.
   * 첫 항목명이 여러 번 나오면 그 개수만큼 항목을 만듭니다.
   */
  const fillBlockRepeat = (rowsOfBlock) => {
    const firstLabel = (rowsOfBlock[0].cells.find(c => c.label) || {}).label || '';
    if (!firstLabel) return null;

    const starts = [];
    lineParts.forEach((parts, i) => {
      if (parts.some(p => score(p, firstLabel) >= 0.85)) starts.push(i);
    });
    if (!starts.length) return null;

    const items = starts.map((start, index) => {
      const end = index + 1 < starts.length ? starts[index + 1] : doc.lines.length;
      const item = {};
      rowsOfBlock.forEach(blockRow => {
        const labelCell = blockRow.cells.find(c => c.label);
        const valueCell = blockRow.cells.find(c => c.key);
        if (!labelCell || !valueCell) return;
        const label = labelCell.label.replace(/\n/g, ' ');

        for (let i = start; i < end; i++) {
          const parts = lineParts[i];
          const at = parts.findIndex(p => score(p, label) >= 0.85);
          if (at < 0) continue;
          if (at + 1 < parts.length) {
            item[valueCell.key] = parts.slice(at + 1).join(' ');
          } else {
            const rest = [];
            for (let j = i + 1; j < end && !isLabelLine(doc.lines[j]); j++) rest.push(doc.lines[j].replace(/\t/g, ' '));
            item[valueCell.key] = rest.join('\n');
          }
          break;
        }
      });
      return item;
    }).filter(item => Object.values(item).some(Boolean));

    return items.length ? items : null;
  };

  /* ---------- 반복(표) 행 먼저: 표 통째로 옮기는 게 정확도가 높습니다 ---------- */
  const blockDone = new Set();

  repeats.forEach(row => {
    const rowCells = row.cells.filter(c => c.key);
    const keywords = (row.match || []).concat(row.title ? [row.title] : []).concat(rowCells.map(c => c.for || c.label));
    let rows = null;
    let from = null;

    if (row.block) {
      if (blockDone.has(row.repeat)) return;
      blockDone.add(row.repeat);
      const group = (template.layout.rows || []).filter(r => r.repeat === row.repeat && r.block);
      const items = fillBlockRepeat(group);
      values[row.repeat] = items || [];
      if (items) filled.push({ key: row.repeat, label: row.title || row.repeat, from: '문서의 표' });
      return;
    }

    if (row.context === 'roster' || rowCells.some(c => c.context === 'roster')) {
      const roster = (context && context.roster) || [];
      if (roster.length) {
        rows = roster.map(person => {
          const out = {};
          rowCells.forEach(cell => {
            const label = (cell.for || cell.label || cell.key).toLowerCase();
            if (/이름|성명|name/.test(label)) out[cell.key] = person.name;
            else if (/역할|담당|직무|role/.test(label)) out[cell.key] = person.title;
            else out[cell.key] = '';
          });
          return out;
        });
        from = '팀 조직도';
      }
    }

    if (!rows) {
      const picked = findTableByHeader(rowCells);
      if (picked) {
        const mapped = linesToRows(picked, rowCells, context);
        if (mapped.length) { rows = mapped; from = '문서의 표'; }
      }
    }

    /* 머리글을 못 찾았으면 표 이름(별칭 포함) 아래 줄들을 행으로 씁니다. */
    if (!rows && (row.match || []).length + (row.title ? 1 : 0) > 0) {
      const picked = takeAfterLabel((row.match || []).concat(row.title ? [row.title] : []));
      const mapped = linesToRows(picked, rowCells, context);
      if (mapped.length) { rows = mapped; from = `문서의 "${row.match && row.match[0] || row.title}"`; }
    }

    values[row.repeat] = rows || [];
    if (from) filled.push({ key: row.repeat, label: row.title || rowCells[0].label, from });
  });

  /* ------------------------------ 낱개 칸 ------------------------------ */
  cells.filter(c => !c.repeat).forEach(cell => {
    const keywords = [cell.label].concat(cell.keywords || []);

    const found = findByLabel(keywords, cell.multiline, cell.maxLines);
    if (found && found.value) {
      values[cell.key] = tidyValue(cell, found.value);
      filled.push({ key: cell.key, label: cell.label, from: `문서의 "${cell.label}"` });
      return;
    }

    /* 값 자리에 또 다른 항목명이 들어온 경우(빈 양식)는 값으로 보지 않습니다. */
    const kv = bestMatch(doc.keyValues.filter(item => !isLabelish(item.value)), keywords, item => item.key);
    if (kv && kv.item.value) {
      values[cell.key] = kv.item.value;
      filled.push({ key: cell.key, label: cell.label, from: `문서의 "${kv.item.key}"` });
      return;
    }

    if (cell.context) {
      const value = contextValue(cell.context, context);
      if (value) {
        values[cell.key] = value;
        filled.push({ key: cell.key, label: cell.label, from: '워크스페이스 정보' });
        return;
      }
    }

    if (cell.fallback === 'firstLine' && doc.lines.length) {
      const first = doc.lines.find(line =>
        line.length <= 60 && line.length >= 2 &&
        /[가-힣A-Za-z]/.test(line) && !/[:：\t]/.test(line) &&
        !/^\[(시트|슬라이드)\s*\d+\]$/.test(line));
      if (first) {
        values[cell.key] = first;
        filled.push({ key: cell.key, label: cell.label, from: '문서 첫 줄' });
        return;
      }
    }

    values[cell.key] = '';
  });

  /* ------------------- 남은 내용 배치 (버리지 않기) -------------------
   * 업로드한 문서가 양식과 다른 이름을 쓰면 위 단계에서 아무 데도 못 들어갑니다.
   * 그래서 아직 안 쓴 내용 덩어리를 비어 있는 서술형 칸에 위치를 추정해 넣고,
   * "위치 추정" 이라고 표시해 사용자가 옮길 수 있게 합니다.
   */
  const chunks = [];
  {
    let current = null;
    const startChunk = title => {
      current = { title: title || '', lines: [] };
      chunks.push(current);
    };

    doc.lines.forEach((line, i) => {
      if (usedLines.has(i)) { current = null; return; }
      const text = line.replace(/\t/g, ' ').trim();
      if (!text) { current = null; return; }

      /* 짧은 줄이나 번호가 붙은 줄은 소제목으로 보고 거기서 덩어리를 끊습니다. */
      const isHeading = looksLikeHeading(text) || (text.length <= 40 && !line.includes('\t'));
      if (isHeading) { startChunk(text); return; }
      if (!current) startChunk('');
      /* 표에서 온 줄은 칸 구분이 보이도록 " | " 로 잇습니다. */
      current.lines.push(line.includes('\t') ? line.split('\t').map(s => s.trim()).filter(Boolean).join(' | ') : text);
    });
  }

  const blocks = chunks
    .map(c => ({ title: c.title, text: c.lines.join('\n').trim() }))
    /* 결재란처럼 토막난 조각은 넣어봐야 읽기만 불편합니다. */
    .filter(b => b.text.length >= 20 && !/^(결\s*재|작성\s*\|\s*검토)/.test(b.title || ''));

  /** 미리보기에서 읽기 좋도록 "■ 제목" + 본문 형태로 만듭니다. */
  const formatBlock = block => (block.title ? '■ ' + block.title + '\n' : '') + block.text;

  /*
   * 추정 배치는 서술형 칸에만 합니다.
   * 팀원·담당자·날짜처럼 사실 한 줄이 들어가야 하는 칸에 긴 글이 들어가면 오히려 방해가 됩니다.
   */
  const FACT_LABEL = /팀원|이름|성명|담당|작성자|기록자|참석|멘토|멘티|기업명|날짜|일자|기간|시간|버전|장소|구분|진척|달성|우선순위/;
  const openCells = cells.filter(c =>
    !c.repeat && c.multiline && !values[c.key] && !FACT_LABEL.test(c.label || ''));

  /* catchAll 칸: 끝까지 자리를 못 찾은 내용을 모두 받아 적는 칸 (양식당 하나) */
  const catchCell = cells.find(c => !c.repeat && c.catchAll);

  if (blocks.length && openCells.length) {
    const takenCells = new Set();
    const takenBlocks = new Set();

    /* 1) 제목이 조금이라도 비슷한 짝부터 맞춥니다. */
    const pairs = [];
    blocks.forEach((block, bi) => {
      openCells.forEach((cell, ci) => {
        const value = Math.max(
          score(block.title, cell.label),
          ...(cell.keywords || []).map(k => score(block.title, k))
        );
        if (value >= 0.4) pairs.push({ bi, ci, value });
      });
    });
    pairs.sort((a, b) => b.value - a.value).forEach(pair => {
      if (takenBlocks.has(pair.bi) || takenCells.has(pair.ci)) return;
      takenBlocks.add(pair.bi);
      takenCells.add(pair.ci);
      const cell = openCells[pair.ci];
      const block = blocks[pair.bi];
      values[cell.key] = formatBlock(block);
      filled.push({ key: cell.key, label: cell.label, from: `문서의 "${block.title || '앞부분'}" (위치 추정)` });
    });

    /* 2) 그래도 남은 덩어리는 남은 빈 칸(없으면 catchAll 칸)에 문서 순서대로 넣습니다. */
    const restCells = openCells.filter((c, i) => !takenCells.has(i));
    const restBlocks = blocks.filter((b, i) => !takenBlocks.has(i));
    restBlocks.forEach((block, i) => {
      const cell = restCells[Math.min(i, restCells.length - 1)] || catchCell;
      if (!cell) return;
      const prefix = values[cell.key] ? values[cell.key] + '\n\n' : '';
      values[cell.key] = prefix + formatBlock(block);
      if (!prefix) filled.push({ key: cell.key, label: cell.label, from: '남은 내용 (위치 추정)' });
    });
  } else if (catchCell && blocks.length) {
    values[catchCell.key] = blocks.map(formatBlock).join('\n\n');
    filled.push({ key: catchCell.key, label: catchCell.label, from: '남은 내용 (위치 추정)' });
  }

  const leftovers = doc.sections
    .map((s, i) => ({ s, i }))
    .filter(x => x.s.lines.length)
    .map(x => ({ title: x.s.title, text: x.s.text }))
    .filter(x => x.text)
    .slice(0, 20);

  return { values, filled, leftovers, keyValues: doc.keyValues };
}

module.exports = { fillTemplate, score, linesToRows };
