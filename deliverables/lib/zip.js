'use strict';

/**
 * 외부 패키지 없이 ZIP을 읽고 쓰는 최소 구현.
 * docx / xlsx / pptx / hwpx 는 모두 ZIP 컨테이너라서 이 파일 하나로 열 수 있고,
 * 내보내기(docx 생성)에도 같은 파일을 씁니다.
 */

const zlib = require('zlib');

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/* ------------------------------- CRC32 ------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

/* -------------------------------- 읽기 -------------------------------- */

function findEOCD(buf) {
  const min = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

/**
 * ZIP 안의 파일 목록을 { 이름: Buffer } 로 돌려줍니다.
 * 손상된 항목은 조용히 건너뜁니다(전체가 실패하지 않도록).
 */
function readZip(buf) {
  const out = new Map();
  if (!buf || buf.length < 22) return out;

  const eocd = findEOCD(buf);
  if (eocd < 0) return out;

  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== SIG_CENTRAL) break;

    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.slice(offset + 46, offset + 46 + nameLen).toString('utf8');

    offset += 46 + nameLen + extraLen + commentLen;

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== SIG_LOCAL) continue;
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.slice(dataStart, dataStart + compressedSize);

    try {
      if (method === 0) out.set(name, raw);
      else if (method === 8) out.set(name, zlib.inflateRawSync(raw));
    } catch (err) { /* 개별 항목 해제 실패는 무시 */ }
  }
  return out;
}

/** ZIP 안의 특정 파일을 UTF-8 문자열로 읽습니다. */
function readZipText(entries, name) {
  const buf = entries.get(name);
  return buf ? buf.toString('utf8') : '';
}

/** 이름 패턴(정규식)에 맞는 항목들을 이름 순으로 돌려줍니다. */
function matchEntries(entries, pattern) {
  return Array.from(entries.keys())
    .filter(name => pattern.test(name))
    .sort()
    .map(name => ({ name, buf: entries.get(name) }));
}

/* -------------------------------- 쓰기 -------------------------------- */

/**
 * 무압축(stored) ZIP을 만듭니다. Word/한글 모두 무압축 항목을 정상적으로 엽니다.
 * files: [{ name: 'word/document.xml', data: Buffer|string }]
 */
function createZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  files.forEach(file => {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data), 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);        // 필요 버전
    local.writeUInt16LE(0x0800, 6);    // UTF-8 파일명 플래그
    local.writeUInt16LE(0, 8);         // 무압축
    local.writeUInt16LE(0, 10);        // 수정 시각
    local.writeUInt16LE(0x21, 12);     // 수정 날짜(1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  });

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([Buffer.concat(locals), centralBuf, eocd]);
}

module.exports = { readZip, readZipText, matchEntries, createZip, crc32 };
