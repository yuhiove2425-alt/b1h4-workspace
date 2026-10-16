const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');

/* ----------------------------- 실행 환경 설정 -----------------------------
   로컬에서는 아무것도 설정하지 않아도 예전과 똑같이 동작합니다.
   클라우드에 올릴 때는 환경변수로 값을 바꿔 끼웁니다.
     PORT           서버 포트 (기본 4000)
     DATA_DIR       db.json 저장 위치 (기본 ./data, 클라우드에서는 마운트한 볼륨 경로)
     SESSION_SECRET 로그인 세션 서명 키 (클라우드에서는 반드시 지정)
     TRUST_PROXY    리버스 프록시 뒤에 있으면 1
     SECURE_COOKIE  HTTPS로 서비스하면 1
--------------------------------------------------------------------------- */
const PORT = Number(process.env.PORT) || 4000;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SESSION_SECRET = process.env.SESSION_SECRET || 'b1h4-local-workspace-secret';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const SECURE_COOKIE = process.env.SECURE_COOKIE === '1';
const DEFAULT_TEAM_NAME = process.env.TEAM_NAME || 'B1H4';

const EMPTY_DB = {
  team: null,
  users: [],
  issues: [],
  comments: [],
  sprints: [],
  events: [],
  notifications: [],
  wikis: [],
  roster: [],
  messages: [],
  meetings: [],
  teamChat: [],
  meta: { issueSeq: 0 }
};

/* 팀 조직도 기본값 — 이름은 앱의 팀 화면에서 바로 바꿀 수 있습니다. */
const DEFAULT_ROSTER = [
  { name: '팀원 1', title: '풀스택' },
  { name: '팀원 2', title: '프론트엔드' },
  { name: '팀원 3', title: '백엔드' },
  { name: '팀원 4', title: 'AI모델링' },
  { name: '팀원 5', title: '기획' },
  { name: '팀원 6', title: '서브기획' }
];

let db = null;

function loadDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    db = JSON.parse(JSON.stringify(EMPTY_DB));
  } else {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (err) {
      const backup = DB_FILE + '.broken-' + Date.now();
      fs.copyFileSync(DB_FILE, backup);
      db = JSON.parse(JSON.stringify(EMPTY_DB));
    }
    for (const key of Object.keys(EMPTY_DB)) {
      if (db[key] === undefined) db[key] = JSON.parse(JSON.stringify(EMPTY_DB[key]));
    }
  }
  if (!db.roster || !db.roster.length) {
    db.roster = DEFAULT_ROSTER.map(p => ({ id: uid('ros'), name: p.name, title: p.title, updatedAt: nowISO() }));
  }
  migrateTeam();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

/* 예전 db.json에는 팀 개념이 없었습니다.
   이미 계정이 들어 있는 파일을 그대로 열면 기존 사용자를 전부
   기본 팀(B1H4)에 넣어 주고, 계정이 하나도 없으면 팀 설정 화면부터
   시작하도록 팀을 만들지 않은 채로 둡니다. */
function migrateTeam() {
  if (!db.team && db.users.length > 0) {
    db.team = {
      id: uid('team'),
      name: DEFAULT_TEAM_NAME,
      code: makeTeamCode(),
      createdAt: db.users[0].createdAt || nowISO()
    };
  }
  if (db.team) {
    db.users.forEach(u => { if (!u.teamId) u.teamId = db.team.id; });
  }
}

function saveDB() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function backupDaily() {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = path.join(DATA_DIR, 'backup-' + stamp + '.json');
  if (fs.existsSync(file)) return;
  try {
    fs.writeFileSync(file, JSON.stringify(db, null, 2));
    const olds = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('backup-')).sort();
    while (olds.length > 7) fs.unlinkSync(path.join(DATA_DIR, olds.shift()));
  } catch (err) { /* 백업 실패는 서비스에 영향을 주지 않습니다 */ }
}

['SIGINT', 'SIGTERM'].forEach(sig => {
  process.on(sig, () => {
    try { saveDB(); } catch (err) { /* noop */ }
    process.exit(0);
  });
});

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nowISO() {
  return new Date().toISOString();
}

/* 팀 초대 코드: 헷갈리는 글자(0/O, 1/I)를 뺀 8자리 */
function makeTeamCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/* 초대 코드는 팀장에게만 보여 줍니다. */
function publicTeam(user) {
  if (!db.team) return null;
  const base = { id: db.team.id, name: db.team.name, createdAt: db.team.createdAt };
  if (user && user.role === 'PM') base.code = db.team.code;
  return base;
}

function localIPs() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

const AVATAR_TONES = ['#8FD3F4', '#F7B8CE', '#A8D8EA', '#FBC7D4', '#9AD0EC', '#F6C3D0', '#B5E2F5'];

loadDB();
backupDaily();
setInterval(backupDaily, 3600000);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

if (TRUST_PROXY) app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'b1h4.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: 'lax',
    secure: SECURE_COOKIE
  }
}));

/* 클라우드 상태 확인용 — 로그인 없이 접근합니다. */
app.get('/healthz', (req, res) => {
  res.json({ ok: true, team: db.team ? db.team.name : null, users: db.users.length });
});
app.use(express.static(path.join(__dirname, 'public')));

/* === 산출물 모듈 연결 시작 (deliverables) === */
require('./deliverables')(app, { requireAuth: (req, res, next) => requireAuth(req, res, next) });
/* === 산출물 모듈 연결 끝 === */

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, name: u.name, role: u.role, tone: u.tone, avatarUrl: u.avatarUrl || null, createdAt: u.createdAt };
}

function currentUser(req) {
  if (!req.session || !req.session.userId) return null;
  return db.users.find(u => u.id === req.session.userId) || null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });
  req.user = user;
  next();
}

function requirePM(req, res, next) {
  if (req.user.role !== 'PM') return res.status(403).json({ error: '팀장 권한이 필요합니다.' });
  next();
}

function broadcast(channel, payload) {
  io.emit(channel, payload || {});
}

function pushNotification(userId, type, message, link) {
  if (!userId) return;
  const note = {
    id: uid('ntf'),
    userId,
    type,
    message,
    link: link || null,
    read: false,
    createdAt: nowISO()
  };
  db.notifications.unshift(note);
  db.notifications = db.notifications.slice(0, 500);
  saveDB();
  io.emit('notification:new', { userId });
}

/* ---------------------------------- auth ---------------------------------- */

/* 최초 1회: 팀을 만들면서 팀장 계정을 함께 만듭니다.
   팀이 이미 있으면 이 경로는 막힙니다. */
app.post('/api/team/setup', (req, res) => {
  if (db.team) return res.status(409).json({ error: '이미 팀이 만들어져 있습니다. 로그인하거나 초대 코드로 합류하세요.' });

  const { teamName, username, name, password } = req.body || {};
  const finalTeamName = String(teamName || '').trim() || DEFAULT_TEAM_NAME;
  if (!username || !name || !password) {
    return res.status(400).json({ error: '아이디, 이름, 비밀번호를 모두 입력하세요.' });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
  }
  if (finalTeamName.length > 30) {
    return res.status(400).json({ error: '팀 이름은 30자 이내로 입력하세요.' });
  }

  db.team = {
    id: uid('team'),
    name: finalTeamName,
    code: makeTeamCode(),
    createdAt: nowISO()
  };

  const user = {
    id: uid('usr'),
    username: String(username).trim(),
    name: String(name).trim(),
    role: 'PM',
    teamId: db.team.id,
    passwordHash: bcrypt.hashSync(String(password), 10),
    tone: AVATAR_TONES[0],
    createdAt: nowISO()
  };
  db.users.push(user);
  saveDB();
  req.session.userId = user.id;
  broadcast('users:changed');
  res.json({ user: publicUser(user), team: publicTeam(user), firstUser: true });
});

/* 합류: 팀장이 알려 준 초대 코드가 있어야 계정을 만들 수 있습니다. */
app.post('/api/auth/register', async (req, res) => {
  const { username, name, password, teamCode } = req.body || {};
  if (!db.team) {
    return res.status(400).json({ error: '아직 팀이 만들어지지 않았습니다. 팀 만들기부터 진행하세요.' });
  }
  if (!username || !name || !password) {
    return res.status(400).json({ error: '아이디, 이름, 비밀번호를 모두 입력하세요.' });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
  }
  if (String(teamCode || '').trim().toUpperCase() !== db.team.code) {
    return res.status(403).json({ error: '초대 코드가 맞지 않습니다. 팀장에게 코드를 확인하세요.' });
  }
  const taken = db.users.some(u => u.username.toLowerCase() === String(username).toLowerCase());
  if (taken) return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });

  const user = {
    id: uid('usr'),
    username: String(username).trim(),
    name: String(name).trim(),
    role: '팀원',
    teamId: db.team.id,
    passwordHash: bcrypt.hashSync(String(password), 10),
    tone: AVATAR_TONES[db.users.length % AVATAR_TONES.length],
    createdAt: nowISO()
  };
  db.users.push(user);
  saveDB();
  req.session.userId = user.id;
  broadcast('users:changed');
  res.json({ user: publicUser(user), team: publicTeam(user), firstUser: false });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.users.find(u => u.username.toLowerCase() === String(username || '').toLowerCase());
  if (!user || !bcrypt.compareSync(String(password || ''), user.passwordHash)) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 맞지 않습니다.' });
  }
  req.session.userId = user.id;
  res.json({ user: publicUser(user), team: publicTeam(user) });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  const user = currentUser(req);
  res.json({
    user: publicUser(user),
    team: publicTeam(user),
    hasUsers: db.users.length > 0,
    hasTeam: !!db.team,
    teamName: db.team ? db.team.name : null
  });
});

app.post('/api/auth/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!bcrypt.compareSync(String(current || ''), req.user.passwordHash)) {
    return res.status(400).json({ error: '현재 비밀번호가 맞지 않습니다.' });
  }
  if (String(next || '').length < 4) {
    return res.status(400).json({ error: '새 비밀번호는 4자 이상이어야 합니다.' });
  }
  req.user.passwordHash = bcrypt.hashSync(String(next), 10);
  saveDB();
  res.json({ ok: true });
});

app.post('/api/auth/avatar', requireAuth, (req, res) => {
  const { avatarUrl } = req.body || {};
  if (avatarUrl === null || avatarUrl === undefined || avatarUrl === '') {
    req.user.avatarUrl = null;
  } else {
    if (typeof avatarUrl !== 'string' || !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(avatarUrl)) {
      return res.status(400).json({ error: '올바른 이미지 파일이 아닙니다.' });
    }
    if (avatarUrl.length > 400000) {
      return res.status(400).json({ error: '이미지 용량이 너무 큽니다.' });
    }
    req.user.avatarUrl = avatarUrl;
  }
  saveDB();
  broadcast('users:changed');
  res.json({ user: publicUser(req.user) });
});

/* ---------------------------------- team ---------------------------------- */

app.get('/api/team', requireAuth, (req, res) => {
  res.json({ team: publicTeam(req.user), memberCount: db.users.length });
});

/* 팀 이름 변경 — 팀장만 */
app.patch('/api/team', requireAuth, requirePM, (req, res) => {
  const { name } = req.body || {};
  const next = String(name || '').trim();
  if (!next) return res.status(400).json({ error: '팀 이름을 입력하세요.' });
  if (next.length > 30) return res.status(400).json({ error: '팀 이름은 30자 이내로 입력하세요.' });
  db.team.name = next;
  saveDB();
  broadcast('team:changed');
  res.json({ team: publicTeam(req.user) });
});

/* 초대 코드 재발급 — 코드가 새어 나갔을 때 팀장이 끊어 냅니다. */
app.post('/api/team/code', requireAuth, requirePM, (req, res) => {
  db.team.code = makeTeamCode();
  saveDB();
  res.json({ team: publicTeam(req.user) });
});

/* ---------------------------------- users --------------------------------- */

app.get('/api/users', requireAuth, (req, res) => {
  res.json({ users: db.users.map(publicUser) });
});

app.patch('/api/users/:id', requireAuth, requirePM, (req, res) => {
  const target = db.users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: '해당 팀원을 찾을 수 없습니다.' });
  const { role, name } = req.body || {};
  if (role) {
    const pmCount = db.users.filter(u => u.role === 'PM').length;
    if (target.role === 'PM' && role !== 'PM' && pmCount <= 1) {
      return res.status(400).json({ error: '팀장은 최소 한 명 있어야 합니다.' });
    }
    target.role = role;
  }
  if (name) target.name = String(name).trim();
  saveDB();
  broadcast('users:changed');
  res.json({ user: publicUser(target) });
});

app.delete('/api/users/:id', requireAuth, requirePM, (req, res) => {
  const target = db.users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: '해당 팀원을 찾을 수 없습니다.' });
  if (target.id === req.user.id) return res.status(400).json({ error: '본인 계정은 삭제할 수 없습니다.' });
  db.users = db.users.filter(u => u.id !== target.id);
  db.issues.forEach(i => { if (i.assigneeId === target.id) i.assigneeId = null; });
  saveDB();
  broadcast('users:changed');
  broadcast('issues:changed');
  res.json({ ok: true });
});

/* --------------------------------- roster ---------------------------------- */

app.get('/api/roster', requireAuth, (req, res) => {
  res.json({ roster: db.roster });
});

app.patch('/api/roster/:id', requireAuth, (req, res) => {
  const person = db.roster.find(r => r.id === req.params.id);
  if (!person) return res.status(404).json({ error: '대상을 찾을 수 없습니다.' });
  const { title, name } = req.body || {};
  if (title !== undefined) person.title = String(title).trim() || person.title;
  if (name !== undefined) person.name = String(name).trim() || person.name;
  person.updatedAt = nowISO();
  saveDB();
  broadcast('roster:changed');
  res.json({ person });
});

/* --------------------------------- issues --------------------------------- */

const STATUSES = ['할 일', '진행 중', '검토', '완료'];
const TYPES = ['작업', '버그', '스토리', '에픽'];
const PRIORITIES = ['낮음', '보통', '높음', '긴급'];

function nextIssueKey() {
  db.meta.issueSeq = (db.meta.issueSeq || 0) + 1;
  return 'B1H4-' + db.meta.issueSeq;
}

app.get('/api/issues', requireAuth, (req, res) => {
  res.json({ issues: db.issues });
});

app.post('/api/issues', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.title || !String(b.title).trim()) {
    return res.status(400).json({ error: '작업 제목을 입력하세요.' });
  }
  const status = STATUSES.includes(b.status) ? b.status : '할 일';
  const siblings = db.issues.filter(i => i.status === status);
  const issue = {
    id: uid('iss'),
    key: nextIssueKey(),
    title: String(b.title).trim(),
    description: String(b.description || ''),
    type: TYPES.includes(b.type) ? b.type : '작업',
    status,
    priority: PRIORITIES.includes(b.priority) ? b.priority : '보통',
    assigneeId: b.assigneeId || null,
    workerIds: Array.isArray(b.workerIds) ? b.workerIds.filter(x => db.users.some(u => u.id === x)) : [],
    reporterId: req.user.id,
    labels: Array.isArray(b.labels) ? b.labels.map(String).slice(0, 6) : [],
    sprintId: b.sprintId || null,
    parentId: b.parentId || null,
    blockedBy: Array.isArray(b.blockedBy) ? b.blockedBy : [],
    dueDate: b.dueDate || null,
    storyPoints: Number(b.storyPoints) || 0,
    order: siblings.length,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    completedAt: status === '완료' ? nowISO() : null
  };
  db.issues.push(issue);
  saveDB();
  if (issue.assigneeId && issue.assigneeId !== req.user.id) {
    pushNotification(issue.assigneeId, 'assign', `${req.user.name}님이 ${issue.key} 작업을 배정했습니다.`, issue.id);
  }
  issue.workerIds.forEach(wid => {
    if (wid !== req.user.id) {
      pushNotification(wid, 'worker', `${req.user.name}님이 ${issue.key} 작업의 작업자로 지정했습니다.`, issue.id);
    }
  });
  broadcast('issues:changed');
  res.json({ issue });
});

app.patch('/api/issues/:id', requireAuth, (req, res) => {
  const issue = db.issues.find(i => i.id === req.params.id);
  if (!issue) return res.status(404).json({ error: '작업을 찾을 수 없습니다.' });
  const b = req.body || {};
  const prevAssignee = issue.assigneeId;
  const prevWorkerIds = issue.workerIds || [];

  if (b.title !== undefined) issue.title = String(b.title).trim() || issue.title;
  if (b.description !== undefined) issue.description = String(b.description);
  if (b.type !== undefined && TYPES.includes(b.type)) issue.type = b.type;
  if (b.priority !== undefined && PRIORITIES.includes(b.priority)) issue.priority = b.priority;
  if (b.assigneeId !== undefined) issue.assigneeId = b.assigneeId || null;
  if (b.workerIds !== undefined) issue.workerIds = Array.isArray(b.workerIds) ? b.workerIds.filter(x => db.users.some(u => u.id === x)) : [];
  if (b.labels !== undefined) issue.labels = Array.isArray(b.labels) ? b.labels.map(String).slice(0, 6) : [];
  if (b.sprintId !== undefined) issue.sprintId = b.sprintId || null;
  if (b.parentId !== undefined) issue.parentId = b.parentId || null;
  if (b.blockedBy !== undefined) issue.blockedBy = Array.isArray(b.blockedBy) ? b.blockedBy : [];
  if (b.dueDate !== undefined) issue.dueDate = b.dueDate || null;
  if (b.storyPoints !== undefined) issue.storyPoints = Number(b.storyPoints) || 0;
  if (b.status !== undefined && STATUSES.includes(b.status)) {
    if (issue.status !== b.status) {
      issue.status = b.status;
      issue.completedAt = b.status === '완료' ? nowISO() : null;
    }
  }
  issue.updatedAt = nowISO();
  saveDB();

  if (issue.assigneeId && issue.assigneeId !== prevAssignee && issue.assigneeId !== req.user.id) {
    pushNotification(issue.assigneeId, 'assign', `${req.user.name}님이 ${issue.key} 작업을 배정했습니다.`, issue.id);
  }
  (issue.workerIds || []).forEach(wid => {
    if (!prevWorkerIds.includes(wid) && wid !== req.user.id) {
      pushNotification(wid, 'worker', `${req.user.name}님이 ${issue.key} 작업의 작업자로 지정했습니다.`, issue.id);
    }
  });
  broadcast('issues:changed');
  res.json({ issue });
});

app.post('/api/issues/reorder', requireAuth, (req, res) => {
  const { id, status, index } = req.body || {};
  const issue = db.issues.find(i => i.id === id);
  if (!issue) return res.status(404).json({ error: '작업을 찾을 수 없습니다.' });
  const targetStatus = STATUSES.includes(status) ? status : issue.status;

  if (issue.status !== targetStatus) {
    issue.status = targetStatus;
    issue.completedAt = targetStatus === '완료' ? nowISO() : null;
  }
  const column = db.issues
    .filter(i => i.status === targetStatus && i.id !== issue.id)
    .sort((a, b2) => a.order - b2.order);
  const at = Math.max(0, Math.min(Number(index) || 0, column.length));
  column.splice(at, 0, issue);
  column.forEach((i, idx) => { i.order = idx; });
  issue.updatedAt = nowISO();
  saveDB();
  broadcast('issues:changed');
  res.json({ ok: true });
});

app.delete('/api/issues/:id', requireAuth, (req, res) => {
  const issue = db.issues.find(i => i.id === req.params.id);
  if (!issue) return res.status(404).json({ error: '작업을 찾을 수 없습니다.' });
  if (issue.reporterId !== req.user.id && req.user.role !== 'PM') {
    return res.status(403).json({ error: '작성자 또는 팀장만 삭제할 수 있습니다.' });
  }
  db.issues = db.issues.filter(i => i.id !== issue.id);
  db.comments = db.comments.filter(c => c.issueId !== issue.id);
  db.issues.forEach(i => {
    if (i.parentId === issue.id) i.parentId = null;
    i.blockedBy = (i.blockedBy || []).filter(x => x !== issue.id);
  });
  saveDB();
  broadcast('issues:changed');
  res.json({ ok: true });
});

/* -------------------------------- comments -------------------------------- */

app.get('/api/issues/:id/comments', requireAuth, (req, res) => {
  const list = db.comments
    .filter(c => c.issueId === req.params.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json({ comments: list });
});

app.post('/api/issues/:id/comments', requireAuth, (req, res) => {
  const issue = db.issues.find(i => i.id === req.params.id);
  if (!issue) return res.status(404).json({ error: '작업을 찾을 수 없습니다.' });
  const body = String((req.body || {}).body || '').trim();
  if (!body) return res.status(400).json({ error: '댓글 내용을 입력하세요.' });

  const mentioned = [];
  db.users.forEach(u => {
    if (body.includes('@' + u.name) || body.includes('@' + u.username)) mentioned.push(u.id);
  });

  const comment = {
    id: uid('cmt'),
    issueId: issue.id,
    authorId: req.user.id,
    body,
    mentions: mentioned,
    createdAt: nowISO()
  };
  db.comments.push(comment);
  saveDB();

  mentioned.forEach(uidTarget => {
    if (uidTarget !== req.user.id) {
      pushNotification(uidTarget, 'mention', `${req.user.name}님이 ${issue.key}에서 언급했습니다.`, issue.id);
    }
  });
  if (issue.assigneeId && issue.assigneeId !== req.user.id && !mentioned.includes(issue.assigneeId)) {
    pushNotification(issue.assigneeId, 'comment', `${req.user.name}님이 ${issue.key}에 댓글을 남겼습니다.`, issue.id);
  }
  broadcast('comments:changed', { issueId: issue.id });
  res.json({ comment });
});

app.patch('/api/comments/:id', requireAuth, (req, res) => {
  const comment = db.comments.find(c => c.id === req.params.id);
  if (!comment) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
  if (comment.authorId !== req.user.id) {
    return res.status(403).json({ error: '작성자만 수정할 수 있습니다.' });
  }
  const body = String((req.body || {}).body || '').trim();
  if (!body) return res.status(400).json({ error: '댓글 내용을 입력하세요.' });

  const mentioned = [];
  db.users.forEach(u => {
    if (body.includes('@' + u.name) || body.includes('@' + u.username)) mentioned.push(u.id);
  });

  comment.body = body;
  comment.mentions = mentioned;
  comment.editedAt = nowISO();
  saveDB();
  broadcast('comments:changed', { issueId: comment.issueId, meetingId: comment.meetingId });
  res.json({ comment });
});

app.delete('/api/comments/:id', requireAuth, (req, res) => {
  const comment = db.comments.find(c => c.id === req.params.id);
  if (!comment) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
  if (comment.authorId !== req.user.id && req.user.role !== 'PM') {
    return res.status(403).json({ error: '작성자 또는 팀장만 삭제할 수 있습니다.' });
  }
  db.comments = db.comments.filter(c => c.id !== comment.id);
  saveDB();
  broadcast('comments:changed', { issueId: comment.issueId, meetingId: comment.meetingId });
  res.json({ ok: true });
});

/* --------------------------------- sprints -------------------------------- */

app.get('/api/sprints', requireAuth, (req, res) => {
  res.json({ sprints: db.sprints });
});

app.post('/api/sprints', requireAuth, requirePM, (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: '스프린트 이름을 입력하세요.' });
  const sprint = {
    id: uid('spr'),
    name: String(b.name).trim(),
    goal: String(b.goal || ''),
    startDate: b.startDate || null,
    endDate: b.endDate || null,
    status: '예정',
    snapshots: [],
    createdAt: nowISO()
  };
  db.sprints.push(sprint);
  saveDB();
  broadcast('sprints:changed');
  res.json({ sprint });
});

app.patch('/api/sprints/:id', requireAuth, requirePM, (req, res) => {
  const sprint = db.sprints.find(s => s.id === req.params.id);
  if (!sprint) return res.status(404).json({ error: '스프린트를 찾을 수 없습니다.' });
  const b = req.body || {};
  if (b.name !== undefined) sprint.name = String(b.name).trim() || sprint.name;
  if (b.goal !== undefined) sprint.goal = String(b.goal);
  if (b.startDate !== undefined) sprint.startDate = b.startDate || null;
  if (b.endDate !== undefined) sprint.endDate = b.endDate || null;
  if (b.status !== undefined && ['예정', '진행 중', '완료'].includes(b.status)) {
    sprint.status = b.status;
    if (b.status === '진행 중') {
      db.sprints.forEach(s => { if (s.id !== sprint.id && s.status === '진행 중') s.status = '완료'; });
    }
  }
  saveDB();
  broadcast('sprints:changed');
  res.json({ sprint });
});

app.delete('/api/sprints/:id', requireAuth, requirePM, (req, res) => {
  db.sprints = db.sprints.filter(s => s.id !== req.params.id);
  db.issues.forEach(i => { if (i.sprintId === req.params.id) i.sprintId = null; });
  saveDB();
  broadcast('sprints:changed');
  broadcast('issues:changed');
  res.json({ ok: true });
});

/* ------------------------------- calendar --------------------------------- */

/* 플래너 조회 — 같은 팀 안에서만 보입니다.
   공유(shared)로 올린 일정은 팀원 전체에게, 공유하지 않은 일정은 본인에게만. */
app.get('/api/events', requireAuth, (req, res) => {
  const myTeam = req.user.teamId;
  const visible = db.events.filter(e => {
    const sameTeam = !e.teamId || e.teamId === myTeam;
    return sameTeam && (e.shared || e.ownerId === req.user.id);
  });
  res.json({ events: visible });
});

app.post('/api/events', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.date) return res.status(400).json({ error: '일정 제목과 날짜를 입력하세요.' });
  const wantsShare = !!b.shared;
  const event = {
    id: uid('evt'),
    title: String(b.title).trim(),
    description: String(b.description || ''),
    date: String(b.date),
    time: b.time || null,
    endTime: b.time ? (b.endTime || null) : null,
    ownerId: req.user.id,
    teamId: req.user.teamId,
    shared: wantsShare,
    createdAt: nowISO()
  };
  db.events.push(event);
  saveDB();
  if (event.shared) {
    db.users.forEach(u => {
      if (u.id !== req.user.id && u.teamId === req.user.teamId) {
        pushNotification(u.id, 'event', `${req.user.name}님이 팀 일정 "${event.title}"을 공유했습니다.`, null);
      }
    });
  }
  broadcast('events:changed');
  res.json({ event });
});

app.patch('/api/events/:id', requireAuth, (req, res) => {
  const event = db.events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
  if (event.ownerId !== req.user.id && req.user.role !== 'PM') {
    return res.status(403).json({ error: '작성자 또는 팀장만 수정할 수 있습니다.' });
  }
  const b = req.body || {};
  if (b.title !== undefined) event.title = String(b.title).trim() || event.title;
  if (b.description !== undefined) event.description = String(b.description);
  if (b.date !== undefined) event.date = String(b.date);
  if (b.time !== undefined) event.time = b.time || null;
  if (b.endTime !== undefined) event.endTime = event.time ? (b.endTime || null) : null;
  if (b.shared !== undefined) event.shared = !!b.shared;
  saveDB();
  broadcast('events:changed');
  res.json({ event });
});

app.delete('/api/events/:id', requireAuth, (req, res) => {
  const event = db.events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
  if (event.ownerId !== req.user.id && req.user.role !== 'PM') {
    return res.status(403).json({ error: '작성자 또는 팀장만 삭제할 수 있습니다.' });
  }
  db.events = db.events.filter(e => e.id !== event.id);
  saveDB();
  broadcast('events:changed');
  res.json({ ok: true });
});

/* ---------------------------------- wiki ----------------------------------- */

app.get('/api/wiki', requireAuth, (req, res) => {
  res.json({ pages: db.wikis });
});

app.post('/api/wiki', requireAuth, (req, res) => {
  const b = req.body || {};
  const page = {
    id: uid('wik'),
    title: String(b.title || '새 메모').trim() || '새 메모',
    body: String(b.body || ''),
    authorId: req.user.id,
    createdAt: nowISO(),
    updatedAt: nowISO()
  };
  db.wikis.push(page);
  saveDB();
  broadcast('wiki:changed');
  res.json({ page });
});

app.patch('/api/wiki/:id', requireAuth, (req, res) => {
  const page = db.wikis.find(p => p.id === req.params.id);
  if (!page) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });
  if (page.authorId !== req.user.id && req.user.role !== 'PM') {
    return res.status(403).json({ error: '작성자 또는 팀장만 수정할 수 있습니다.' });
  }
  const b = req.body || {};
  if (b.title !== undefined) page.title = String(b.title).trim() || page.title;
  if (b.body !== undefined) page.body = String(b.body);
  page.updatedAt = nowISO();
  saveDB();
  broadcast('wiki:changed');
  res.json({ page });
});

app.delete('/api/wiki/:id', requireAuth, (req, res) => {
  const page = db.wikis.find(p => p.id === req.params.id);
  if (!page) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });
  if (page.authorId !== req.user.id && req.user.role !== 'PM') {
    return res.status(403).json({ error: '작성자 또는 팀장만 삭제할 수 있습니다.' });
  }
  db.wikis = db.wikis.filter(p => p.id !== page.id);
  saveDB();
  broadcast('wiki:changed');
  res.json({ ok: true });
});

/* --------------------------------- meetings -------------------------------- */

app.get('/api/meetings', requireAuth, (req, res) => {
  res.json({ meetings: db.meetings });
});

function sanitizeActionItems(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(it => ({
      text: String((it || {}).text || '').trim(),
      done: !!(it || {}).done,
      userId: (it || {}).userId && db.users.some(u => u.id === it.userId) ? it.userId : null,
      dueDate: (it || {}).dueDate || null
    }))
    .filter(it => it.text)
    .slice(0, 100);
}

function sanitizeIssues(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(x => String(x || '').trim()).filter(Boolean).slice(0, 100);
}

function canEditMeeting(meeting, user) {
  return meeting.authorId === user.id || user.role === 'PM';
}

app.post('/api/meetings', requireAuth, (req, res) => {
  const b = req.body || {};
  const meeting = {
    id: uid('meet'),
    title: String(b.title || '새 회의록').trim() || '새 회의록',
    date: b.date || nowISO().slice(0, 10),
    attendeeIds: Array.isArray(b.attendeeIds) ? b.attendeeIds.filter(x => db.users.some(u => u.id === x)) : [],
    agenda: String(b.agenda || '').trim(),
    body: String(b.body || ''),
    actionItems: sanitizeActionItems(b.actionItems),
    issues: sanitizeIssues(b.issues),
    poll: null,
    finalized: false,
    authorId: req.user.id,
    createdAt: nowISO(),
    updatedAt: nowISO()
  };
  db.meetings.push(meeting);
  saveDB();
  broadcast('meeting:changed');
  res.json({ meeting });
});

app.patch('/api/meetings/:id', requireAuth, (req, res) => {
  const meeting = db.meetings.find(m => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: '회의록을 찾을 수 없습니다.' });
  if (!canEditMeeting(meeting, req.user)) {
    return res.status(403).json({ error: '작성자 또는 팀장만 수정할 수 있습니다.' });
  }
  if (meeting.finalized) {
    return res.status(403).json({ error: '확정된 회의록은 수정할 수 없습니다. 먼저 확정을 취소하세요.' });
  }
  const b = req.body || {};
  if (b.title !== undefined) meeting.title = String(b.title).trim() || meeting.title;
  if (b.date !== undefined) meeting.date = b.date || meeting.date;
  if (b.attendeeIds !== undefined) {
    meeting.attendeeIds = Array.isArray(b.attendeeIds) ? b.attendeeIds.filter(x => db.users.some(u => u.id === x)) : [];
  }
  if (b.agenda !== undefined) meeting.agenda = String(b.agenda).trim();
  if (b.body !== undefined) meeting.body = String(b.body);
  if (b.actionItems !== undefined) meeting.actionItems = sanitizeActionItems(b.actionItems);
  if (b.issues !== undefined) meeting.issues = sanitizeIssues(b.issues);
  meeting.updatedAt = nowISO();
  saveDB();
  broadcast('meeting:changed');
  res.json({ meeting });
});

app.delete('/api/meetings/:id', requireAuth, (req, res) => {
  const meeting = db.meetings.find(m => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: '회의록을 찾을 수 없습니다.' });
  if (!canEditMeeting(meeting, req.user)) {
    return res.status(403).json({ error: '작성자 또는 팀장만 삭제할 수 있습니다.' });
  }
  db.meetings = db.meetings.filter(m => m.id !== meeting.id);
  db.comments = db.comments.filter(c => c.meetingId !== meeting.id);
  saveDB();
  broadcast('meeting:changed');
  res.json({ ok: true });
});

app.post('/api/meetings/:id/finalize', requireAuth, (req, res) => {
  const meeting = db.meetings.find(m => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: '회의록을 찾을 수 없습니다.' });
  if (!canEditMeeting(meeting, req.user)) {
    return res.status(403).json({ error: '작성자 또는 팀장만 확정할 수 있습니다.' });
  }
  meeting.finalized = true;
  meeting.updatedAt = nowISO();
  saveDB();
  broadcast('meeting:changed');
  res.json({ meeting });
});

app.post('/api/meetings/:id/unfinalize', requireAuth, (req, res) => {
  const meeting = db.meetings.find(m => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: '회의록을 찾을 수 없습니다.' });
  if (!canEditMeeting(meeting, req.user)) {
    return res.status(403).json({ error: '작성자 또는 팀장만 확정을 취소할 수 있습니다.' });
  }
  meeting.finalized = false;
  meeting.updatedAt = nowISO();
  saveDB();
  broadcast('meeting:changed');
  res.json({ meeting });
});

/* --------------------------------- meeting polls --------------------------------- */

app.post('/api/meetings/:id/poll', requireAuth, (req, res) => {
  const meeting = db.meetings.find(m => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: '회의록을 찾을 수 없습니다.' });
  if (!canEditMeeting(meeting, req.user)) {
    return res.status(403).json({ error: '작성자 또는 팀장만 투표를 만들 수 있습니다.' });
  }
  if (meeting.finalized) return res.status(403).json({ error: '확정된 회의록에는 투표를 만들 수 없습니다.' });

  const b = req.body || {};
  const question = String(b.question || '').trim();
  const options = Array.isArray(b.options) ? b.options.map(x => String(x || '').trim()).filter(Boolean).slice(0, 4) : [];
  if (!question) return res.status(400).json({ error: '투표 질문을 입력하세요.' });
  if (options.length < 2) return res.status(400).json({ error: '선택지를 2개 이상 입력하세요.' });

  meeting.poll = {
    question,
    options: options.map(text => ({ text, votes: 0 })),
    voterIds: [],
    closed: false,
    createdAt: nowISO()
  };
  meeting.updatedAt = nowISO();
  saveDB();
  broadcast('meeting:changed');
  res.json({ meeting });
});

app.post('/api/meetings/:id/poll/vote', requireAuth, (req, res) => {
  const meeting = db.meetings.find(m => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: '회의록을 찾을 수 없습니다.' });
  if (!meeting.poll) return res.status(404).json({ error: '투표가 없습니다.' });
  if (meeting.poll.closed) return res.status(403).json({ error: '종료된 투표입니다.' });
  if (meeting.poll.voterIds.includes(req.user.id)) {
    return res.status(403).json({ error: '이미 투표했습니다.' });
  }
  const idx = Number((req.body || {}).optionIndex);
  if (!Number.isInteger(idx) || !meeting.poll.options[idx]) {
    return res.status(400).json({ error: '선택지를 확인하세요.' });
  }
  meeting.poll.options[idx].votes += 1;
  meeting.poll.voterIds.push(req.user.id);
  meeting.updatedAt = nowISO();
  saveDB();
  broadcast('meeting:changed');
  res.json({ meeting });
});

app.post('/api/meetings/:id/poll/close', requireAuth, (req, res) => {
  const meeting = db.meetings.find(m => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: '회의록을 찾을 수 없습니다.' });
  if (!meeting.poll) return res.status(404).json({ error: '투표가 없습니다.' });
  if (!canEditMeeting(meeting, req.user)) {
    return res.status(403).json({ error: '작성자 또는 팀장만 투표를 종료할 수 있습니다.' });
  }
  meeting.poll.closed = true;
  meeting.updatedAt = nowISO();
  saveDB();
  broadcast('meeting:changed');
  res.json({ meeting });
});

/* --------------------------------- meeting comments --------------------------------- */

app.get('/api/meetings/:id/comments', requireAuth, (req, res) => {
  const list = db.comments
    .filter(c => c.meetingId === req.params.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json({ comments: list });
});

app.post('/api/meetings/:id/comments', requireAuth, (req, res) => {
  const meeting = db.meetings.find(m => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: '회의록을 찾을 수 없습니다.' });
  const body = String((req.body || {}).body || '').trim();
  if (!body) return res.status(400).json({ error: '댓글 내용을 입력하세요.' });

  const mentioned = [];
  db.users.forEach(u => {
    if (body.includes('@' + u.name) || body.includes('@' + u.username)) mentioned.push(u.id);
  });

  const comment = {
    id: uid('cmt'),
    meetingId: meeting.id,
    authorId: req.user.id,
    body,
    mentions: mentioned,
    createdAt: nowISO()
  };
  db.comments.push(comment);
  saveDB();

  mentioned.forEach(uidTarget => {
    if (uidTarget !== req.user.id) {
      pushNotification(uidTarget, 'mention', `${req.user.name}님이 회의록 "${meeting.title}"에서 언급했습니다.`, null);
    }
  });
  if (meeting.authorId !== req.user.id && !mentioned.includes(meeting.authorId)) {
    pushNotification(meeting.authorId, 'comment', `${req.user.name}님이 회의록 "${meeting.title}"에 댓글을 남겼습니다.`, null);
  }
  broadcast('comments:changed', { meetingId: meeting.id });
  res.json({ comment });
});

/* --------------------------------- messages -------------------------------- */

app.get('/api/messages/threads', requireAuth, (req, res) => {
  const meId = req.user.id;
  const threads = db.users.filter(u => u.id !== meId).map(u => {
    const msgs = db.messages
      .filter(m => (m.fromId === meId && m.toId === u.id) || (m.fromId === u.id && m.toId === meId))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const lastMessage = msgs.length ? msgs[msgs.length - 1] : null;
    const unread = msgs.filter(m => m.toId === meId && !m.read).length;
    return { userId: u.id, lastMessage, unread };
  });
  res.json({ threads });
});

app.get('/api/messages/:userId', requireAuth, (req, res) => {
  const meId = req.user.id;
  const otherId = req.params.userId;
  const target = db.users.find(u => u.id === otherId);
  if (!target) return res.status(404).json({ error: '상대를 찾을 수 없습니다.' });
  const msgs = db.messages
    .filter(m => (m.fromId === meId && m.toId === otherId) || (m.fromId === otherId && m.toId === meId))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  let changed = false;
  msgs.forEach(m => { if (m.toId === meId && !m.read) { m.read = true; changed = true; } });
  if (changed) saveDB();
  res.json({ messages: msgs });
});

app.post('/api/messages', requireAuth, (req, res) => {
  const b = req.body || {};
  const target = db.users.find(u => u.id === b.toId);
  if (!target) return res.status(404).json({ error: '상대를 찾을 수 없습니다.' });
  const body = String(b.body || '').trim();
  if (!body) return res.status(400).json({ error: '메시지 내용을 입력하세요.' });

  const message = {
    id: uid('msg'),
    fromId: req.user.id,
    toId: target.id,
    body,
    read: false,
    createdAt: nowISO()
  };
  db.messages.push(message);
  saveDB();

  io.emit('dm:new', { fromId: req.user.id, toId: target.id, message });
  pushNotification(target.id, 'dm', `${req.user.name}님이 메시지를 보냈습니다.`, `dm:${req.user.id}`);
  res.json({ message });
});

/* -------------------------------- 팀 단체 채팅 -------------------------------- */

app.get('/api/team-chat', requireAuth, (req, res) => {
  res.json({ messages: db.teamChat.slice(-200) });
});

app.post('/api/team-chat', requireAuth, (req, res) => {
  const body = String((req.body || {}).body || '').trim();
  if (!body) return res.status(400).json({ error: '메시지 내용을 입력하세요.' });

  const message = {
    id: uid('tchat'),
    userId: req.user.id,
    body,
    createdAt: nowISO()
  };
  db.teamChat.push(message);
  db.teamChat = db.teamChat.slice(-500);
  saveDB();

  io.emit('team-chat:new', { message });
  res.json({ message });
});

/* ----------------------------- notifications ------------------------------ */

app.get('/api/notifications', requireAuth, (req, res) => {
  res.json({ notifications: db.notifications.filter(n => n.userId === req.user.id).slice(0, 50) });
});

app.post('/api/notifications/read', requireAuth, (req, res) => {
  db.notifications.forEach(n => { if (n.userId === req.user.id) n.read = true; });
  saveDB();
  res.json({ ok: true });
});

/* --------------------------------- summary -------------------------------- */

app.get('/api/summary', requireAuth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const mine = db.issues.filter(i => i.assigneeId === req.user.id);
  const byStatus = {};
  STATUSES.forEach(s => { byStatus[s] = db.issues.filter(i => i.status === s).length; });
  const byPriority = {};
  PRIORITIES.forEach(p => { byPriority[p] = db.issues.filter(i => i.priority === p && i.status !== '완료').length; });
  const byMember = db.users.map(u => ({
    id: u.id,
    name: u.name,
    tone: u.tone,
    open: db.issues.filter(i => i.assigneeId === u.id && i.status !== '완료').length,
    done: db.issues.filter(i => i.assigneeId === u.id && i.status === '완료').length
  }));
  const overdue = db.issues.filter(i => i.dueDate && i.dueDate < today && i.status !== '완료').length;
  const todayEvents = db.events.filter(e => e.date === today && (e.shared || e.ownerId === req.user.id));

  res.json({
    total: db.issues.length,
    mineOpen: mine.filter(i => i.status !== '완료').length,
    mineDone: mine.filter(i => i.status === '완료').length,
    overdue,
    byStatus,
    byPriority,
    byMember,
    todayEvents,
    todayIssues: db.issues.filter(i => i.dueDate === today && i.status !== '완료')
  });
});

app.get('/api/burndown', requireAuth, (req, res) => {
  const sprintId = req.query.sprintId;
  const sprint = db.sprints.find(s => s.id === sprintId);
  if (!sprint || !sprint.startDate || !sprint.endDate) return res.json({ points: [] });

  const issues = db.issues.filter(i => i.sprintId === sprint.id);
  const totalPoints = issues.reduce((sum, i) => sum + (i.storyPoints || 1), 0);
  const start = new Date(sprint.startDate);
  const end = new Date(sprint.endDate);
  const days = Math.max(1, Math.round((end - start) / 86400000));
  const points = [];

  for (let d = 0; d <= days; d++) {
    const cursor = new Date(start.getTime() + d * 86400000);
    const iso = cursor.toISOString().slice(0, 10);
    const burned = issues
      .filter(i => i.completedAt && i.completedAt.slice(0, 10) <= iso)
      .reduce((sum, i) => sum + (i.storyPoints || 1), 0);
    points.push({
      date: iso,
      ideal: Math.max(0, totalPoints - (totalPoints / days) * d),
      actual: Math.max(0, totalPoints - burned),
      future: iso > new Date().toISOString().slice(0, 10)
    });
  }
  res.json({ points, totalPoints, sprint });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ------------------------- 오전 9시 알림 스케줄러 -------------------------- */

let lastMorningRun = null;

setInterval(() => {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  if (now.getHours() === 9 && now.getMinutes() === 0 && lastMorningRun !== stamp) {
    lastMorningRun = stamp;
    const today = stamp;
    db.users.forEach(u => {
      const events = db.events.filter(e => e.date === today && (e.shared || e.ownerId === u.id));
      const issues = db.issues.filter(i => i.assigneeId === u.id && i.dueDate === today && i.status !== '완료');
      if (events.length || issues.length) {
        pushNotification(
          u.id,
          'morning',
          `오늘 일정 ${events.length}건, 마감 작업 ${issues.length}건이 있습니다.`,
          null
        );
      }
    });
    io.emit('morning:brief', { date: today });
  }
}, 30000);

/* --------------------------------- socket --------------------------------- */

const online = new Map();

io.on('connection', socket => {
  socket.on('presence:join', payload => {
    const user = db.users.find(u => u.id === (payload || {}).userId);
    if (!user) return;
    const wasOnline = Array.from(online.values()).includes(user.id);
    online.set(socket.id, user.id);
    io.emit('presence:update', { ids: Array.from(new Set(online.values())) });
    if (!wasOnline) io.emit('presence:login', { id: user.id, name: user.name });
  });
  socket.on('disconnect', () => {
    online.delete(socket.id);
    io.emit('presence:update', { ids: Array.from(new Set(online.values())) });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const line = '='.repeat(58);
  console.log('\n' + line);
  console.log('  ' + (db.team ? db.team.name : 'B1H4') + ' WORKSPACE 서버가 실행되었습니다');
  console.log(line);
  console.log('  데이터 저장 위치 : ' + DATA_DIR);
  console.log('  팀 상태          : ' + (db.team ? db.team.name + ' (팀원 ' + db.users.length + '명)' : '없음 — 첫 접속에서 팀을 만드세요'));

  if (TRUST_PROXY) {
    // 클라우드: 프록시가 앞단에서 도메인과 HTTPS를 처리합니다.
    console.log('  실행 모드        : 클라우드 (프록시 뒤, 포트 ' + PORT + ')');
    if (SESSION_SECRET === 'b1h4-local-workspace-secret') {
      console.log('  ⚠ SESSION_SECRET이 기본값입니다. 환경변수로 반드시 바꾸세요.');
    }
  } else {
    console.log('  내 컴퓨터에서 접속   : http://localhost:' + PORT);
    const ips = localIPs();
    if (ips.length) {
      console.log('  팀원에게 공유할 주소 :');
      ips.forEach(ip => console.log('     http://' + ip + ':' + PORT));
    } else {
      console.log('  팀원 공유 주소를 찾지 못했습니다. 네트워크 연결을 확인하세요.');
    }
  }
  console.log(line);
  console.log('  종료하려면 Ctrl + C 를 누르세요.');
  console.log(line + '\n');
});
