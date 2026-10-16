'use strict';

/**
 * 산출물 모듈 진입점.
 *
 * 호스트(server.js)에 붙이는 방법은 한 줄입니다.
 *
 *   require('./deliverables')(app, { requireAuth });
 *
 * requireAuth 를 넘기지 않으면 로그인 없이도 동작하므로,
 * 다른 프로젝트에 그대로 옮겨 붙일 수도 있습니다.
 */

const path = require('path');
const express = require('express');

const { extractFile, SUPPORTED } = require('./lib/extract');
const { fillTemplate } = require('./lib/autofill');
const { loadTemplates, findTemplate } = require('./lib/templates');
const { toDocx, toHwpml, fileBaseName } = require('./lib/render');
const store = require('./lib/store');

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** 업로드 본문(application/octet-stream)을 통째로 읽습니다. */
function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('파일이 너무 큽니다. 25MB 이하로 올려주세요.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function mountDeliverables(app, options) {
  const opts = options || {};
  const requireAuth = typeof opts.requireAuth === 'function' ? opts.requireAuth : (req, res, next) => next();
  const basePath = opts.basePath || '/api/deliverables';
  const assetPath = opts.assetPath || '/deliverables';

  const router = express.Router();

  /* 양식 목록 */
  router.get('/templates', requireAuth, (req, res) => {
    res.json({ templates: loadTemplates(), supported: SUPPORTED });
  });

  /*
   * 파일 업로드 + 자동 채우기.
   * 본문은 파일 바이트 그대로(application/octet-stream), 나머지 정보는 쿼리로 받습니다.
   * 호스트의 express.json({limit:'1mb'}) 와 부딪히지 않게 하려는 의도입니다.
   */
  router.post('/extract', requireAuth, async (req, res) => {
    try {
      const filename = String(req.query.filename || 'upload');
      const templateId = String(req.query.templateId || '');
      const template = templateId ? findTemplate(templateId) : null;
      if (templateId && !template) return res.status(404).json({ error: '양식을 찾을 수 없습니다.' });

      const buf = await readRawBody(req, MAX_UPLOAD_BYTES);
      if (!buf.length) return res.status(400).json({ error: '파일 내용을 받지 못했습니다.' });

      const extracted = extractFile(filename, buf);
      let context = {};
      try { context = JSON.parse(String(req.query.context || '{}')); } catch (err) { context = {}; }

      const result = template ? fillTemplate(template, extracted, context) : null;

      res.json({
        filename,
        kind: extracted.kind,
        warning: extracted.warning || null,
        text: extracted.text,
        values: result ? result.values : null,
        filled: result ? result.filled : [],
        leftovers: result ? result.leftovers : []
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || '파일을 읽지 못했습니다.' });
    }
  });

  /* 이미 읽어둔 텍스트를 다른 양식에 다시 채워 넣기 (양식만 바꿀 때 재업로드 불필요) */
  router.post('/fill', requireAuth, (req, res) => {
    const body = req.body || {};
    const template = findTemplate(String(body.templateId || ''));
    if (!template) return res.status(404).json({ error: '양식을 찾을 수 없습니다.' });

    const text = String(body.text || '');
    const extracted = {
      kind: 'text',
      text,
      blocks: text.split('\n').map(line => ({ type: 'para', text: line.trim() })).filter(b => b.text)
    };
    const result = fillTemplate(template, text ? extracted : null, body.context || {});
    res.json({ values: result.values, filled: result.filled, leftovers: result.leftovers });
  });

  /*
   * 파일로 내려받기.
   * PDF 는 브라우저 인쇄로 처리하므로 여기서는 docx / hwp(.hml) 만 만듭니다.
   */
  router.post('/export/:format', requireAuth, (req, res) => {
    const body = req.body || {};
    const format = String(req.params.format || '').toLowerCase();
    const template = findTemplate(String(body.templateId || ''));
    if (!template) return res.status(404).json({ error: '양식을 찾을 수 없습니다.' });

    const values = body.values || {};
    const meta = {
      title: body.title || '',
      author: (req.user && req.user.name) || body.authorName || '',
      date: body.date || new Date().toISOString().slice(0, 10)
    };
    const base = fileBaseName(template, values, meta);
    const filename = encodeURIComponent(base + (format === 'docx' ? '.docx' : '.hml'));

    try {
      if (format === 'docx') {
        const buf = toDocx(template, values, meta);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
        return res.end(buf);
      }
      if (format === 'hwp' || format === 'hml') {
        const xml = toHwpml(template, values, meta);
        res.setHeader('Content-Type', 'application/x-hwpml; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
        return res.end(Buffer.from(xml, 'utf8'));
      }
      return res.status(400).json({ error: '지원하지 않는 저장 형식입니다.' });
    } catch (err) {
      return res.status(500).json({ error: '파일을 만들지 못했습니다: ' + err.message });
    }
  });

  /* 저장한 산출물 (모듈 자체 저장소) */
  router.get('/documents', requireAuth, (req, res) => {
    res.json({ documents: store.listDocuments() });
  });

  router.post('/documents', requireAuth, (req, res) => {
    const body = req.body || {};
    if (!body.templateId) return res.status(400).json({ error: '양식을 먼저 선택하세요.' });
    const doc = store.createDocument({
      templateId: String(body.templateId),
      templateName: String(body.templateName || ''),
      title: String(body.title || '제목 없음'),
      values: body.values || {},
      sourceName: String(body.sourceName || ''),
      authorId: req.user ? req.user.id : null,
      authorName: req.user ? req.user.name : String(body.authorName || '')
    });
    if (typeof opts.onChange === 'function') opts.onChange('created', doc);
    res.json({ document: doc });
  });

  router.patch('/documents/:id', requireAuth, (req, res) => {
    const body = req.body || {};
    const patch = {};
    if (body.title !== undefined) patch.title = String(body.title);
    if (body.values !== undefined) patch.values = body.values;
    const doc = store.updateDocument(req.params.id, patch);
    if (!doc) return res.status(404).json({ error: '저장된 산출물을 찾을 수 없습니다.' });
    if (typeof opts.onChange === 'function') opts.onChange('updated', doc);
    res.json({ document: doc });
  });

  router.delete('/documents/:id', requireAuth, (req, res) => {
    const ok = store.deleteDocument(req.params.id);
    if (!ok) return res.status(404).json({ error: '저장된 산출물을 찾을 수 없습니다.' });
    if (typeof opts.onChange === 'function') opts.onChange('deleted', { id: req.params.id });
    res.json({ ok: true });
  });

  app.use(basePath, router);
  app.use(assetPath, express.static(path.join(__dirname, 'public')));

  return router;
}

module.exports = mountDeliverables;
module.exports.mountDeliverables = mountDeliverables;
