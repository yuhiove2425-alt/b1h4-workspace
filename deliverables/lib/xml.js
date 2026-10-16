'use strict';

/** XML을 정규식으로 훑기 위한 최소 도우미들 (파서 의존성 없이). */

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' '
};

function decodeEntities(str) {
  return String(str || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (m, dec) => safeChar(parseInt(dec, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, m => ENTITIES[m]);
}

function safeChar(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try { return String.fromCodePoint(code); } catch (err) { return ''; }
}

/** XML에 넣으면 안 되는 제어문자를 걸러냅니다(탭/개행은 유지). */
function stripControl(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 32 || code === 9 || code === 10 || code === 13) out += str[i];
  }
  return out;
}

/** 태그를 모두 걷어내고 순수 텍스트만 남깁니다. */
function stripTags(xml) {
  return decodeEntities(String(xml || '').replace(/<[^>]*>/g, ''));
}

/**
 * <tag ...>내용</tag> 블록을 모두 찾아 내용 배열로 돌려줍니다.
 * 같은 태그가 중첩되지 않는 오피스 XML 구조에 맞춘 단순 스캐너입니다.
 */
function blocks(xml, tag) {
  const out = [];
  const re = new RegExp('<' + tag + '(?:\\s[^>]*)?(/)?>', 'g');
  const close = '</' + tag + '>';
  let m;
  while ((m = re.exec(xml))) {
    if (m[1]) { out.push(''); continue; }          // 자기닫기 태그
    const start = m.index + m[0].length;
    const end = xml.indexOf(close, start);
    if (end < 0) break;
    out.push(xml.slice(start, end));
    re.lastIndex = end + close.length;
  }
  return out;
}

/** 해당 태그 안의 텍스트를 모두 이어붙입니다. */
function textOf(xml, tag) {
  return blocks(xml, tag).map(stripTags).join('');
}

/** 속성값 하나를 읽습니다. */
function attr(tagStr, name) {
  const m = new RegExp(name + '="([^"]*)"').exec(tagStr || '');
  return m ? decodeEntities(m[1]) : '';
}

/** XML 텍스트 노드로 안전하게 넣기 위한 이스케이프. */
function esc(str) {
  return stripControl(String(str == null ? '' : str))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

module.exports = { decodeEntities, stripTags, stripControl, blocks, textOf, attr, esc };
