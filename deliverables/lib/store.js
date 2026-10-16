'use strict';

/**
 * 작성한 산출물 초안을 모듈 자기 폴더(deliverables/data)에 저장합니다.
 * 호스트 앱의 data/db.json 은 건드리지 않습니다 — 모듈만 떼어내도 데이터가 같이 갑니다.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'documents.json');
const MAX_DOCUMENTS = 500;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(FILE)) return { documents: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { documents: Array.isArray(parsed.documents) ? parsed.documents : [] };
  } catch (err) {
    try { fs.copyFileSync(FILE, FILE + '.broken-' + Date.now()); } catch (e) { /* noop */ }
    return { documents: [] };
  }
}

function save(db) {
  ensureDir();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

function uid() {
  return 'dlv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function listDocuments() {
  return load().documents;
}

function createDocument(doc) {
  const db = load();
  const now = new Date().toISOString();
  const saved = Object.assign({ id: uid(), createdAt: now, updatedAt: now }, doc);
  db.documents.unshift(saved);
  db.documents = db.documents.slice(0, MAX_DOCUMENTS);
  save(db);
  return saved;
}

function updateDocument(id, patch) {
  const db = load();
  const doc = db.documents.find(d => d.id === id);
  if (!doc) return null;
  Object.assign(doc, patch, { id: doc.id, createdAt: doc.createdAt, updatedAt: new Date().toISOString() });
  save(db);
  return doc;
}

function deleteDocument(id) {
  const db = load();
  const before = db.documents.length;
  db.documents = db.documents.filter(d => d.id !== id);
  if (db.documents.length === before) return false;
  save(db);
  return true;
}

module.exports = { listDocuments, createDocument, updateDocument, deleteDocument, DATA_DIR };
