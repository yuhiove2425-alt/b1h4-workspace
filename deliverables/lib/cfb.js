'use strict';

/**
 * OLE2 / CFB(복합 문서) 최소 리더.
 * 구버전 한글 파일(.hwp)이 이 형식이라, 안에 들어있는 스트림
 * (FileHeader, BodyText/Section0 ...)을 꺼내오기 위해 씁니다.
 */

const HEADER_SIG = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const END_OF_CHAIN = 0xfffffffe;
const FREE_SECT = 0xffffffff;

function isCompoundFile(buf) {
  return !!buf && buf.length > 512 && buf.slice(0, 8).equals(HEADER_SIG);
}

/**
 * 파일 전체 버퍼를 받아 { 스트림이름: Buffer } 맵을 돌려줍니다.
 * 이름은 'BodyText/Section0' 처럼 상위 저장소를 / 로 이어 붙입니다.
 */
function readCompoundFile(buf) {
  if (!isCompoundFile(buf)) return new Map();

  const sectorShift = buf.readUInt16LE(0x1e);
  const miniSectorShift = buf.readUInt16LE(0x20);
  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << miniSectorShift;
  const numFatSectors = buf.readUInt32LE(0x2c);
  const dirStart = buf.readUInt32LE(0x30);
  const miniCutoff = buf.readUInt32LE(0x38);
  const miniFatStart = buf.readUInt32LE(0x3c);
  const difatStart = buf.readUInt32LE(0x44);
  const numDifatSectors = buf.readUInt32LE(0x48);

  const sectorOffset = sector => 512 + sector * sectorSize;
  const entriesPerSector = sectorSize / 4;

  /* DIFAT: FAT 섹터 번호 목록 */
  const fatSectors = [];
  for (let i = 0; i < 109 && fatSectors.length < numFatSectors; i++) {
    const s = buf.readUInt32LE(0x4c + i * 4);
    if (s === FREE_SECT) break;
    fatSectors.push(s);
  }
  let difatSector = difatStart;
  for (let i = 0; i < numDifatSectors && difatSector !== END_OF_CHAIN && difatSector !== FREE_SECT; i++) {
    const base = sectorOffset(difatSector);
    if (base + sectorSize > buf.length) break;
    for (let j = 0; j < entriesPerSector - 1; j++) {
      const s = buf.readUInt32LE(base + j * 4);
      if (s === FREE_SECT || s === END_OF_CHAIN) break;
      fatSectors.push(s);
    }
    difatSector = buf.readUInt32LE(base + sectorSize - 4);
  }

  /* FAT: 섹터 연결 테이블 */
  const fat = [];
  fatSectors.forEach(s => {
    const base = sectorOffset(s);
    if (base + sectorSize > buf.length) return;
    for (let j = 0; j < entriesPerSector; j++) fat.push(buf.readUInt32LE(base + j * 4));
  });

  function chain(start, table) {
    const out = [];
    let cur = start;
    const guard = table.length + 8;
    while (cur !== END_OF_CHAIN && cur !== FREE_SECT && out.length < guard) {
      out.push(cur);
      cur = table[cur];
      if (cur === undefined) break;
    }
    return out;
  }

  function readChain(start, table, size, unit, baseOf) {
    const parts = chain(start, table).map(s => {
      const off = baseOf(s);
      return off + unit <= buf.length ? buf.slice(off, off + unit) : Buffer.alloc(0);
    });
    const joined = Buffer.concat(parts);
    return size >= 0 && size < joined.length ? joined.slice(0, size) : joined;
  }

  /* 미니 FAT */
  const miniFat = [];
  chain(miniFatStart, fat).forEach(s => {
    const base = sectorOffset(s);
    if (base + sectorSize > buf.length) return;
    for (let j = 0; j < entriesPerSector; j++) miniFat.push(buf.readUInt32LE(base + j * 4));
  });

  /* 디렉터리 엔트리 */
  const dirBuf = readChain(dirStart, fat, -1, sectorSize, sectorOffset);
  const entries = [];
  for (let off = 0; off + 128 <= dirBuf.length; off += 128) {
    const nameLen = dirBuf.readUInt16LE(off + 0x40);
    const type = dirBuf[off + 0x42];
    if (type === 0) { entries.push(null); continue; }
    const name = nameLen > 2 ? dirBuf.slice(off, off + nameLen - 2).toString('utf16le') : '';
    entries.push({
      name,
      type,                                        // 1=저장소, 2=스트림, 5=루트
      child: dirBuf.readUInt32LE(off + 0x4c),
      left: dirBuf.readUInt32LE(off + 0x44),
      right: dirBuf.readUInt32LE(off + 0x48),
      start: dirBuf.readUInt32LE(off + 0x74),
      size: dirBuf.readUInt32LE(off + 0x78)
    });
  }
  if (!entries.length || !entries[0]) return new Map();

  /* 미니 스트림 본체(루트 엔트리가 가리킴) */
  const miniStream = readChain(entries[0].start, fat, entries[0].size, sectorSize, sectorOffset);
  const miniOffset = s => s * miniSectorSize;

  function streamData(entry) {
    if (entry.size < miniCutoff) {
      const parts = chain(entry.start, miniFat).map(s => miniStream.slice(miniOffset(s), miniOffset(s) + miniSectorSize));
      const joined = Buffer.concat(parts);
      return joined.slice(0, entry.size);
    }
    return readChain(entry.start, fat, entry.size, sectorSize, sectorOffset);
  }

  /* 디렉터리 트리 순회 (레드블랙 트리 형태로 저장되어 있음) */
  const out = new Map();
  const seen = new Set();

  function walkSiblings(index, prefix) {
    if (index === FREE_SECT || index === undefined || seen.has(index)) return;
    const entry = entries[index];
    if (!entry) return;
    seen.add(index);
    walkSiblings(entry.left, prefix);
    const full = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.type === 2) {
      try { out.set(full, streamData(entry)); } catch (err) { /* 개별 스트림 실패는 무시 */ }
    } else if (entry.type === 1) {
      walkSiblings(entry.child, full);
    }
    walkSiblings(entry.right, prefix);
  }

  walkSiblings(entries[0].child, '');
  return out;
}

module.exports = { isCompoundFile, readCompoundFile };
