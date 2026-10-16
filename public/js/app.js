/* ============================== 공통 상태 ============================== */

const S = {
  me: null,
  users: [],
  issues: [],
  events: [],
  sprints: [],
  wikis: [],
  roster: [],
  meetings: [],
  notifications: [],
  online: [],
  view: 'home',
  calCursor: new Date(),
  calSelected: todayISO(),
  search: '',
  boardFilter: 'all',
  backlogFilter: 'all',
  backlogView: 'list',
  authMode: 'login',
  team: null,
  wikiSelected: null,
  wikiEditing: false,
  wikiSearch: '',
  meetingSelected: null,
  meetingEditing: false,
  meetingActionDraft: [],
  meetingIssuesDraft: [],
  meetingFieldsDraft: null,
  navOrder: [],
  customLinks: [],
  sidebarCollapsed: false,
  chatMessages: [],
  chatbotTab: 'bot',
  dmThreads: [],
  dmActiveUserId: null,
  dmMessages: [],
  teamChatMessages: [],
  ntfTab: 'feature'
};

const STATUSES = ['할 일', '진행 중', '검토', '완료'];
const STATUS_TONE = { '할 일': '#A9D8F5', '진행 중': '#55ACE0', '검토': '#F7B9CE', '완료': '#7FD1A8' };
const TYPES = ['작업', '버그', '스토리', '에픽'];
const TYPE_ICON = { '작업': 'task', '버그': 'bug', '스토리': 'story', '에픽': 'epic' };
const PRIORITIES = ['낮음', '보통', '높음', '긴급'];
const STATUS_PROGRESS = { '할 일': 0, '진행 중': 45, '검토': 80, '완료': 100 };
const PRI_TONE = { '낮음': '#A9D8F5', '보통': '#55ACE0', '높음': '#F7B9CE', '긴급': '#E4738F' };
const ROSTER_TITLES = ['프론트엔드', '백엔드', 'AI모델링', '기획', '서브기획', '풀스택'];

const NAV = [
  { id: 'home', label: '홈', icon: 'home' },
  { id: 'dashboard', label: '대시보드', icon: 'chart' },
  { id: 'backlog', label: '작업목록', icon: 'list' },
  { id: 'calendar', label: '캘린더', icon: 'calendar' },
  { id: 'team', label: '팀', icon: 'team' },
  { id: 'wiki', label: '공유메모', icon: 'wiki' },
  { id: 'meetings', label: '회의록', icon: 'story' },
  { id: 'sprint', label: '스프린트', icon: 'sprint' }
];

/* === 확장 모듈 레지스트리 시작 === */
const MODULES = [];

function registerModule(mod) {
  if (!mod || !mod.id || MODULES.some(m => m.id === mod.id)) return;
  MODULES.push(mod);
  if (mod.nav) {
    NAV.push({ id: mod.id, label: mod.nav.label, icon: mod.nav.icon || 'story' });
    PAGE_META[mod.id] = [mod.nav.label, mod.nav.sub || ''];
  }
  if (S.me) { loadNavOrder(); renderNav(); }
}
/* === 확장 모듈 레지스트리 끝 === */

function loadNavOrder() {
  const ids = NAV.map(n => n.id);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('b1h4.navOrder.' + S.me.id) || 'null'); } catch (e) { saved = null; }
  if (Array.isArray(saved) && saved.length) {
    const valid = saved.filter(id => ids.includes(id));
    const missing = ids.filter(id => !valid.includes(id));
    S.navOrder = valid.concat(missing);
  } else {
    S.navOrder = ids;
  }
}

function saveNavOrder() {
  try { localStorage.setItem('b1h4.navOrder.' + S.me.id, JSON.stringify(S.navOrder)); } catch (e) { /* noop */ }
}

function loadCustomLinks() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('b1h4.customLinks.' + S.me.id) || 'null'); } catch (e) { saved = null; }
  S.customLinks = Array.isArray(saved) ? saved : [];
}

function saveCustomLinks() {
  try { localStorage.setItem('b1h4.customLinks.' + S.me.id, JSON.stringify(S.customLinks)); } catch (e) { /* noop */ }
}

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 자주 틀리는 맞춤법/띄어쓰기를 교정하는 간단한 사전 기반 전처리기.
// 완전한 문법 검사기가 아니라 채팅에서 흔한 오류만 다룬다.
const SPELL_FIX_MAP = [
  [/안되잖아/g, '안 되잖아'],
  [/안되나요/g, '안 되나요'],
  [/안되겠/g, '안 되겠'],
  [/안되면/g, '안 되면'],
  [/안되네요/g, '안 되네요'],
  [/안됩니다/g, '안 됩니다'],
  [/안되요/g, '안 돼요'],
  [/않되/g, '안 되'],
  [/됬/g, '됐'],
  [/웬지/g, '왠지'],
  [/어의없/g, '어이없'],
  [/금새/g, '금세'],
  [/몇일/g, '며칠'],
  [/역활/g, '역할'],
  [/희안하/g, '희한하'],
  [/오랫만에/g, '오랜만에'],
  [/일일히/g, '일일이'],
];

function correctSpelling(str) {
  let out = String(str == null ? '' : str);
  for (const [pattern, replacement] of SPELL_FIX_MAP) out = out.replace(pattern, replacement);
  return out;
}

// 사용자가 어딘가에 글자를 입력하고 있는 중인지 확인. 타이핑 도중 팀채팅 도착
// 토스트가 화면 위로 튀어나와 방해하는 것을 막는 데 쓰인다.
function isTypingNow() {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

function fmtEventTime(e) {
  if (!e.time) return '종일';
  return e.endTime ? `${e.time} - ${e.endTime}` : e.time;
}

function fmtRelative(isoTime) {
  const diff = Date.now() - new Date(isoTime).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return min + '분 전';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + '시간 전';
  const day = Math.floor(hr / 24);
  if (day < 7) return day + '일 전';
  return new Date(isoTime).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

function userById(id) {
  return S.users.find(u => u.id === id) || null;
}

function roleLabel(role) {
  return role === 'PM' ? '팀장' : role;
}

function avatarIconSize(size) {
  if (size === 'sm') return 15;
  if (size === 'lg') return 26;
  if (size === 'xl') return 46;
  return 20;
}

function avatar(user, size) {
  if (user && user.avatarUrl) return `<div class="avatar ${size || ''}"><img src="${esc(user.avatarUrl)}" alt="${esc(user.name)}"></div>`;
  return `<div class="avatar avatar-empty ${size || ''}">${icon('person', avatarIconSize(size))}</div>`;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) { data = {}; }
  if (!res.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
  return data;
}

function toast(message, kind, link) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'warn' ? ' warn' : '') + (link ? ' clickable' : '');
  el.innerHTML = icon(kind === 'warn' ? 'bell' : 'check', 19) + '<span>' + esc(message) + '</span>';
  const dismiss = () => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => el.remove(), 320);
  };
  if (link) {
    el.addEventListener('click', () => {
      openNotificationLink(link);
      dismiss();
    });
  }
  $('#toasts').appendChild(el);
  setTimeout(dismiss, 3200);
}

/* ============================== 인증 화면 ============================== */

function setAuthMode(mode) {
  S.authMode = mode;
  const isSetup = mode === 'setup';
  const isRegister = mode === 'register';

  // 팀 만들기 단계에서는 로그인/합류 탭을 숨깁니다. 아직 합류할 팀이 없으니까요.
  $('#authSeg').style.display = isSetup ? 'none' : '';
  $$('#authSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));

  $('#fTeamNameWrap').style.display = isSetup ? '' : 'none';
  $('#fNameWrap').style.display = (isSetup || isRegister) ? '' : 'none';
  $('#fTeamCodeWrap').style.display = isRegister ? '' : 'none';

  $('#authSubmit').textContent = isSetup ? '팀 만들고 시작하기'
    : isRegister ? '팀에 합류하기' : '로그인';
  $('#fPassword').setAttribute('autocomplete', (isSetup || isRegister) ? 'new-password' : 'current-password');
  $('#authAlert').innerHTML = '';
}

function authAlert(message, kind) {
  $('#authAlert').innerHTML = `<div class="alert ${kind === 'info' ? 'alert-info' : ''}">${esc(message)}</div>`;
}

async function bootAuth() {
  const data = await api('GET', '/api/auth/me');
  if (data.user) {
    S.me = data.user;
    S.team = data.team || null;
    return startApp();
  }

  if (data.teamName) applyTeamName(data.teamName);

  if (!data.hasTeam) {
    // 서버가 완전히 비어 있는 상태 — 팀 설정부터 시작합니다.
    setAuthMode('setup');
    $('#authNote').textContent = '먼저 팀을 만듭니다. 여기서 만든 계정이 팀장이 되고, 이후 팀원은 초대 코드로 합류합니다.';
  } else {
    setAuthMode('login');
    $('#authNote').textContent = `${data.teamName} 팀에 합류하려면 팀장에게 초대 코드를 받아 "팀 합류"를 눌러주세요.`;
  }
  $('#authScreen').style.display = 'grid';
}

/* 팀 이름을 사이드바와 로그인 화면, 탭 제목에 반영합니다. */
function applyTeamName(name) {
  const teamName = name || 'B1H4';
  const side = $('#sidebarTeamName');
  const brand = $('#authBrandName');
  if (side) side.textContent = teamName;
  if (brand) brand.textContent = teamName + ' Workspace';
  document.title = teamName + ' Workspace';
}

$('#authSeg').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (btn) setAuthMode(btn.dataset.mode);
});

$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const username = $('#fUsername').value.trim();
  const password = $('#fPassword').value;
  const name = $('#fName').value.trim();
  const submit = $('#authSubmit');

  const needsName = S.authMode === 'register' || S.authMode === 'setup';
  if (!username || !password || (needsName && !name)) {
    return authAlert('빈 칸을 모두 채워주세요.');
  }

  let url, payload;
  if (S.authMode === 'setup') {
    url = '/api/team/setup';
    payload = { teamName: $('#fTeamName').value.trim() || 'B1H4', username, name, password };
  } else if (S.authMode === 'register') {
    const teamCode = $('#fTeamCode').value.trim().toUpperCase();
    if (!teamCode) return authAlert('초대 코드를 입력하세요.');
    url = '/api/auth/register';
    payload = { username, name, password, teamCode };
  } else {
    url = '/api/auth/login';
    payload = { username, password };
  }

  submit.disabled = true;
  try {
    const data = await api('POST', url, payload);
    S.me = data.user;
    S.team = data.team || null;
    if (S.team) applyTeamName(S.team.name);
    $('#authScreen').style.display = 'none';
    startApp();
    if (S.authMode === 'setup') {
      toast(`${(S.team && S.team.name) || 'B1H4'} 팀이 만들어졌습니다. 설정에서 초대 코드를 확인하세요.`);
    } else if (S.authMode === 'register') {
      toast(`${(S.team && S.team.name) || '팀'}에 합류했습니다.`);
    }
  } catch (err) {
    authAlert(err.message);
  } finally {
    submit.disabled = false;
  }
});

/* ============================== 앱 시작 ============================== */

let socket = null;

async function startApp() {
  $('#authScreen').style.display = 'none';
  $('#app').classList.add('on');

  $('#searchIcon').innerHTML = icon('search', 17);
  $('#btnBell').innerHTML = icon('bell', 20);
  $('#btnCreate').innerHTML = icon('plus', 22);
  $('#btnLogoutSide').innerHTML = icon('logout', 19) + '<span>로그아웃</span>';
  $('#btnLogoutSide').title = '로그아웃';
  $('#btnSettingsSide').innerHTML = icon('settings', 19) + '<span>설정</span>';
  $('#btnSettingsSide').title = '설정';
  $('#btnSidebarCollapse').innerHTML = icon('sidebar', 14);
  $('#chatbotClose').innerHTML = icon('close', 16);
  $('#chatbotToggle').innerHTML = CHATBOT_FAB_HTML;
  $('#chatbotHeadAvatar').innerHTML = LIZARD_GLASS_IMG;
  $('#chatbotToggle').style.display = 'block';
  initFabDrag();
  loadFabPosition();
  initChatbotPanelDrag();
  initCursorPet();

  loadNavOrder();
  loadCustomLinks();
  renderNav();
  loadSidebarCollapsed();
  setSidebarCollapsed(S.sidebarCollapsed);
  await refreshAll();
  renderSidebarOrg();
  await loadDmThreads();
  render();
  connectSocket();
  checkMorningBrief();
}

function loadSidebarCollapsed() {
  let saved = null;
  try { saved = localStorage.getItem('b1h4.sidebarCollapsed.' + S.me.id); } catch (e) { saved = null; }
  S.sidebarCollapsed = saved === null ? window.innerWidth <= 780 : saved === '1';
}

function saveSidebarCollapsed() {
  try { localStorage.setItem('b1h4.sidebarCollapsed.' + S.me.id, S.sidebarCollapsed ? '1' : '0'); } catch (e) { /* noop */ }
}

function setSidebarCollapsed(collapsed) {
  S.sidebarCollapsed = collapsed;
  $('#workspacePanel').classList.toggle('collapsed', collapsed);
  $('#app').classList.toggle('sidebar-collapsed', collapsed);
  saveSidebarCollapsed();
}

function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('b1h4.theme', theme); } catch (e) { /* noop */ }
}

document.addEventListener('click', e => {
  const themeBtn = e.target.closest('[data-theme-choice]');
  if (!themeBtn) return;
  setTheme(themeBtn.dataset.themeChoice);
  if (S.view === 'settings') render();
});

document.addEventListener('click', e => {
  const lizardBtn = e.target.closest('[data-lizard-choice]');
  if (!lizardBtn) return;
  setLizardPetEnabled(lizardBtn.dataset.lizardChoice === 'on');
  if (S.view === 'settings') render();
});

async function doLogout() {
  await api('POST', '/api/auth/logout');
  location.reload();
}

function connectSocket() {
  socket = io();
  socket.on('connect', () => socket.emit('presence:join', { userId: S.me.id }));
  socket.on('issues:changed', async () => { await loadIssues(); render(); });
  socket.on('events:changed', async () => { await loadEvents(); render(); });
  socket.on('sprints:changed', async () => { await loadSprints(); render(); });
  socket.on('wiki:changed', async () => { await loadWikis(); render(); });
  socket.on('roster:changed', async () => { await loadRoster(); renderSidebarOrg(); });
  socket.on('meeting:changed', async () => { await loadMeetings(); if (S.view === 'meetings') render(); });
  socket.on('users:changed', async () => { await loadUsers(); renderNav(); render(); });
  socket.on('team:changed', async () => { await loadTeam(); render(); });
  socket.on('comments:changed', payload => {
    if (openIssueId && payload && payload.issueId === openIssueId) loadComments(openIssueId);
    if (S.view === 'meetings' && S.meetingSelected && payload && payload.meetingId === S.meetingSelected) {
      loadMeetingComments(S.meetingSelected);
    }
  });
  socket.on('notification:new', async payload => {
    if (!payload || payload.userId !== S.me.id) return;
    const before = S.notifications.length;
    await loadNotifications();
    renderBell();
    if (S.notifications.length > before) {
      const n = S.notifications[0];
      toast(n.message, undefined, n.link);
    }
  });
  socket.on('presence:update', payload => {
    S.online = (payload && payload.ids) || [];
    renderPresence();
    if (S.view === 'team') render();
  });
  socket.on('presence:login', payload => {
    if (!payload || payload.id === S.me.id) return;
    toast(`${payload.name}님이 로그인했습니다.`);
  });
  socket.on('morning:brief', () => { checkMorningBrief(true); });
  socket.on('dm:new', async payload => {
    if (!payload || (payload.fromId !== S.me.id && payload.toId !== S.me.id)) return;
    await loadDmThreads();
    const inThisThread = S.dmActiveUserId && (payload.fromId === S.dmActiveUserId || payload.toId === S.dmActiveUserId);
    if (inThisThread) {
      await loadDmMessages(S.dmActiveUserId);
      if ($('#chatbotPanel').classList.contains('on') && S.chatbotTab === 'dm') renderDmThread();
    } else if ($('#chatbotPanel').classList.contains('on') && S.chatbotTab === 'dm') {
      renderDmList();
    }
    renderChatbotTabs();
    if (payload.toId === S.me.id && !inThisThread) {
      const sender = userById(payload.fromId);
      toast(`${sender ? sender.name : '팀원'}님: ${payload.message.body}`.slice(0, 60));
    }
  });
  socket.on('team-chat:new', payload => {
    if (!payload || !payload.message) return;
    S.teamChatMessages.push(payload.message);
    S.teamChatMessages = S.teamChatMessages.slice(-500);
    const panelOpen = $('#chatbotPanel').classList.contains('on');
    if (panelOpen && S.chatbotTab === 'team') {
      renderTeamChatThread();
    } else if (payload.message.userId !== S.me.id && !isTypingNow()) {
      const sender = userById(payload.message.userId);
      toast(`[팀 채팅] ${sender ? sender.name : '팀원'}: ${payload.message.body}`.slice(0, 60));
    }
  });
}

async function loadUsers() { S.users = (await api('GET', '/api/users')).users; }
async function loadIssues() { S.issues = (await api('GET', '/api/issues')).issues; }
async function loadEvents() { S.events = (await api('GET', '/api/events')).events; }
async function loadSprints() { S.sprints = (await api('GET', '/api/sprints')).sprints; }
async function loadWikis() { S.wikis = (await api('GET', '/api/wiki')).pages; }
async function loadRoster() { S.roster = (await api('GET', '/api/roster')).roster; }
async function loadMeetings() { S.meetings = (await api('GET', '/api/meetings')).meetings; }
async function loadNotifications() { S.notifications = (await api('GET', '/api/notifications')).notifications; }

async function loadTeam() {
  try {
    const data = await api('GET', '/api/team');
    S.team = data.team || null;
    if (S.team) applyTeamName(S.team.name);
  } catch (err) { /* 팀 정보를 못 받아도 나머지 화면은 그대로 동작합니다 */ }
}

async function refreshAll() {
  await Promise.all([loadTeam(), loadUsers(), loadIssues(), loadEvents(), loadSprints(), loadWikis(), loadRoster(), loadMeetings(), loadNotifications()]);
  renderBell();
  renderPresence();
}

/* ============================== 셸 렌더 ============================== */

const FIXED_NAV_START = ['home'];
const FIXED_NAV_END = ['team'];
const FIXED_NAV_IDS = FIXED_NAV_START.concat(FIXED_NAV_END);

function fixedNavItemHTML(n) {
  return `<button class="nav-item ${S.view === n.id ? 'on' : ''}" data-nav="${n.id}" title="${esc(n.label)}">
    <span class="nav-item-icon">${icon(n.icon, 20)}</span><span class="nav-item-label">${n.label}</span>
  </button>`;
}

function draggableNavItemHTML(n) {
  return `<button class="nav-item ${S.view === n.id ? 'on' : ''}" data-nav="${n.id}" data-nav-drag="${n.id}" title="${esc(n.label)}">
    <span class="nav-item-icon">${icon(n.icon, 20)}</span><span class="nav-item-label">${n.label}</span>
    <span class="nav-item-tail">
      ${n.id === 'backlog' ? `<span class="nav-badge">${S.issues.filter(i => i.status !== '완료').length}</span>` : ''}
      <span class="nav-drag-handle">${icon('drag', 15)}</span>
    </span>
  </button>`;
}

function customLinkItemHTML(link) {
  return `<div class="nav-item nav-item-custom" data-custom-link="${link.id}" title="${esc(link.url)}" tabindex="0" role="button">
    <span class="nav-item-icon">${icon('web', 20)}</span><span class="nav-item-label">${esc(link.label)}</span>
    <button type="button" class="nav-custom-del" data-custom-del="${link.id}" title="삭제" aria-label="삭제">${icon('close', 12)}</button>
  </div>`;
}

function renderNav() {
  const order = (S.navOrder.length ? S.navOrder : NAV.map(n => n.id)).filter(id => !FIXED_NAV_IDS.includes(id));
  const leadItems = FIXED_NAV_START.map(id => NAV.find(n => n.id === id)).filter(Boolean).map(fixedNavItemHTML).join('');
  const dragItems = order.map(id => NAV.find(n => n.id === id)).filter(Boolean).map(draggableNavItemHTML).join('');
  const tailItems = FIXED_NAV_END.map(id => NAV.find(n => n.id === id)).filter(Boolean).map(fixedNavItemHTML).join('');
  const customItems = S.customLinks.map(customLinkItemHTML).join('');
  const addItem = `<button type="button" class="nav-item nav-item-add" id="btnAddNavLink" title="메뉴 추가">
    <span class="nav-item-icon">${icon('plus', 20)}</span><span class="nav-item-label">메뉴 추가</span>
  </button>`;
  $('#nav').innerHTML = leadItems + dragItems + tailItems + customItems + addItem;
}

function orgMiniNode(p, isRoot) {
  const user = S.users.find(u => u.name === p.name);
  return `<div class="org-node ${isRoot ? 'root' : 'child'}">
    ${avatar(user, 'sm')}
    <span class="org-mini-name">${esc(p.name)}</span>
    <select class="select org-mini-select" data-roster-for="${p.id}">
      ${ROSTER_TITLES.map(t => `<option ${t === p.title ? 'selected' : ''}>${esc(t)}</option>`).join('')}
      ${ROSTER_TITLES.includes(p.title) ? '' : `<option selected>${esc(p.title)}</option>`}
    </select>
  </div>`;
}

function renderSidebarOrg() {
  const box = $('#sidebarOrg');
  if (!box) return;
  if (!S.roster.length) {
    box.innerHTML = `<div class="empty" style="padding:16px 4px">팀원이 등록되면 조직도가 표시됩니다.</div>`;
    return;
  }
  const lead = S.roster.find(p => p.title === '팀장') || S.roster[0];
  const rest = S.roster.filter(p => p.id !== lead.id);

  box.innerHTML = `
    <div class="org-chart mini">
      ${orgMiniNode(lead, true)}
      ${rest.length ? `
      <div class="org-mini-trunk"></div>
      <div class="org-mini-branch">${rest.map(p => orgMiniNode(p, false)).join('')}</div>` : ''}
    </div>`;
}

function renderPresence() {
  const count = S.online.length || 1;
  $('#presence').innerHTML = `<span class="presence-dot"></span><span class="presence-text">${count}명 접속 중</span>`;
  if ($('#presenceDrop').classList.contains('on')) renderPresenceDrop();
}

function renderPresenceDrop() {
  const online = S.users.filter(u => S.online.includes(u.id));
  const offline = S.users.filter(u => !S.online.includes(u.id));
  const row = u => {
    const rosterEntry = S.roster.find(r => r.name === u.name);
    const on = S.online.includes(u.id);
    return `<div class="presence-drop-item">
      ${avatar(u, 'sm')}
      <div>
        <div class="presence-drop-name">${esc(u.name)}${u.id === S.me.id ? ' (나)' : ''}</div>
        <div class="presence-drop-role">${esc(rosterEntry ? rosterEntry.title : roleLabel(u.role))}</div>
      </div>
      <span class="presence-drop-status"><span class="online-mark ${on ? '' : 'off'}"></span>${on ? '접속 중' : '오프라인'}</span>
    </div>`;
  };
  $('#presenceDrop').innerHTML = `
    <div class="card-title" style="margin-bottom:4px">${icon('team', 17)}팀원 접속 현황</div>
    <div class="row-list">
      ${online.map(row).join('')}
      ${offline.length ? `${online.length ? '<div style="height:1px;background:var(--line);margin:6px 0"></div>' : ''}${offline.map(row).join('')}` : ''}
    </div>`;
}

function renderBell() {
  const unread = S.notifications.filter(n => !n.read).length;
  $('#btnBell').innerHTML = icon('bell', 20) + (unread ? '<span class="dot"></span>' : '');
}

document.addEventListener('click', e => {
  const navBtn = e.target.closest('[data-nav]');
  if (navBtn) {
    S.view = navBtn.dataset.nav;
    renderNav();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

document.addEventListener('click', e => {
  if (e.target.closest('[data-sidebar-collapse]')) {
    e.stopPropagation();
    setSidebarCollapsed(!S.sidebarCollapsed);
  }
});

document.addEventListener('click', e => {
  if (e.target.closest('[data-logo-expand]') && S.sidebarCollapsed) {
    e.stopPropagation();
    setSidebarCollapsed(false);
  }
});

document.addEventListener('click', e => {
  if (e.target.closest('#btnAddNavLink')) {
    openCustomLinkForm();
    return;
  }
  const delBtn = e.target.closest('[data-custom-del]');
  if (delBtn) {
    e.stopPropagation();
    S.customLinks = S.customLinks.filter(l => l.id !== delBtn.dataset.customDel);
    saveCustomLinks();
    renderNav();
    return;
  }
  const linkEl = e.target.closest('[data-custom-link]');
  if (linkEl) {
    const link = S.customLinks.find(l => l.id === linkEl.dataset.customLink);
    if (link) window.open(link.url, '_blank', 'noopener');
  }
});

function openCustomLinkForm() {
  openModal(`
    <div class="modal-head">
      <div style="flex:1">
        <div class="modal-title">메뉴 추가</div>
        <div class="modal-sub">자주 쓰는 링크를 사이드바에 추가해요</div>
      </div>
      <button class="icon-btn" data-close="1">${icon('close', 18)}</button>
    </div>
    <div id="customLinkAlert"></div>
    <div class="field">
      <label for="clName">메뉴 이름</label>
      <input class="input" id="clName" placeholder="예: 회사 캘린더" maxlength="20">
    </div>
    <div class="field">
      <label for="clUrl">링크 주소</label>
      <input class="input" id="clUrl" placeholder="https://...">
    </div>
    <div class="modal-foot">
      <button class="btn btn-soft" data-close="1">취소</button>
      <button class="btn btn-primary" id="clSave">추가</button>
    </div>`);

  $('#clSave').addEventListener('click', () => {
    const name = $('#clName').value.trim();
    let url = $('#clUrl').value.trim();
    if (!name || !url) {
      $('#customLinkAlert').innerHTML = '<div class="alert">메뉴 이름과 링크 주소를 입력하세요.</div>';
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    S.customLinks.push({ id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), label: name, url });
    saveCustomLinks();
    closeModal();
    renderNav();
    toast('메뉴를 추가했습니다.');
  });
}

/* 사이드바 메뉴 드래그 정렬 (포인터 이벤트 기반, FLIP 애니메이션) */

let navPointerDrag = null;

function navSiblingItems() {
  return Array.from($('#nav').querySelectorAll('.nav-item[data-nav-drag]'));
}

function flipNavAnimate(mutate) {
  const items = navSiblingItems();
  const firstRects = new Map(items.map(el => [el, el.getBoundingClientRect()]));
  mutate();
  navSiblingItems().forEach(el => {
    const first = firstRects.get(el);
    if (!first) return;
    const last = el.getBoundingClientRect();
    const dy = first.top - last.top;
    if (Math.abs(dy) > 0.5) {
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.22s cubic-bezier(0.22,1,0.36,1)';
        el.style.transform = '';
      });
    }
  });
}

let navPointerCandidate = null;
let navSuppressClick = false;
const NAV_DRAG_THRESHOLD = 6;

document.addEventListener('pointerdown', e => {
  if (e.button !== undefined && e.button !== 0) return;
  const grabZone = e.target.closest('.nav-item-icon, .nav-item-label, .nav-drag-handle');
  if (!grabZone) return;
  const item = grabZone.closest('.nav-item[data-nav-drag]');
  if (!item) return;
  navPointerCandidate = { item, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
});

document.addEventListener('pointermove', e => {
  if (navPointerDrag) {
    const dragEl = navPointerDrag.el;
    const overEl = document.elementFromPoint(e.clientX, e.clientY);
    const target = overEl && overEl.closest && overEl.closest('.nav-item[data-nav-drag]');
    if (!target || target === dragEl) return;
    const rect = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    flipNavAnimate(() => {
      if (before) target.parentNode.insertBefore(dragEl, target);
      else target.parentNode.insertBefore(dragEl, target.nextSibling);
    });
    return;
  }

  if (navPointerCandidate && e.pointerId === navPointerCandidate.pointerId) {
    const dx = e.clientX - navPointerCandidate.startX;
    const dy = e.clientY - navPointerCandidate.startY;
    if (Math.hypot(dx, dy) > NAV_DRAG_THRESHOLD) {
      const item = navPointerCandidate.item;
      navPointerDrag = { id: item.dataset.navDrag, el: item, pointerId: e.pointerId };
      navSuppressClick = true;
      item.classList.add('dragging');
      document.body.classList.add('nav-dragging');
      try { item.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      navPointerCandidate = null;
    }
  }
});

function endNavPointerDrag() {
  navPointerCandidate = null;
  if (!navPointerDrag) return;
  navPointerDrag.el.classList.remove('dragging');
  document.body.classList.remove('nav-dragging');
  const ids = navSiblingItems().map(el => el.dataset.navDrag);
  S.navOrder = FIXED_NAV_START.concat(ids, FIXED_NAV_END);
  saveNavOrder();
  navPointerDrag = null;
}

document.addEventListener('pointerup', endNavPointerDrag);
document.addEventListener('pointercancel', endNavPointerDrag);

document.addEventListener('click', e => {
  if (navSuppressClick) {
    navSuppressClick = false;
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

document.addEventListener('click', e => {
  if (e.target.closest('[data-logout]')) doLogout();
});

$('#searchInput').addEventListener('input', e => {
  S.search = e.target.value.trim().toLowerCase();
  if (['dashboard', 'backlog'].includes(S.view)) render();
});

$('#btnCreate').addEventListener('click', () => openIssueForm());

$('#btnBell').addEventListener('click', async e => {
  e.stopPropagation();
  const panel = $('#ntfPanel');
  const opening = !panel.classList.contains('on');
  panel.classList.toggle('on', opening);
  if (opening) {
    renderNotifications();
    await api('POST', '/api/notifications/read');
    S.notifications.forEach(n => { n.read = true; });
    setTimeout(renderBell, 600);
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('#ntfPanel') && !e.target.closest('#btnBell')) {
    $('#ntfPanel').classList.remove('on');
  }
});

$('#presence').addEventListener('click', e => {
  e.stopPropagation();
  const panel = $('#presenceDrop');
  const opening = !panel.classList.contains('on');
  panel.classList.toggle('on', opening);
  if (opening) renderPresenceDrop();
});

document.addEventListener('click', e => {
  if (!e.target.closest('#presenceDrop') && !e.target.closest('#presence')) {
    $('#presenceDrop').classList.remove('on');
  }
});

const NTF_MESSAGE_TYPES = ['dm'];

function ntfIcon(type) {
  if (type === 'mention') return 'comment';
  if (type === 'event') return 'calendar';
  if (type === 'morning') return 'clock';
  if (type === 'worker') return 'team';
  if (type === 'dm') return 'comment';
  return 'flag';
}

function renderNotifications() {
  const featureList = S.notifications.filter(n => !NTF_MESSAGE_TYPES.includes(n.type));
  const messageList = S.notifications.filter(n => NTF_MESSAGE_TYPES.includes(n.type));
  const list = S.ntfTab === 'message' ? messageList : featureList;
  const featureUnread = featureList.filter(n => !n.read).length;
  const messageUnread = messageList.filter(n => !n.read).length;

  $('#ntfPanel').innerHTML = `
    <div class="card-title">${icon('bell', 18)}알림</div>
    <div class="ntf-tabs">
      <button class="ntf-tab ${S.ntfTab !== 'message' ? 'on' : ''}" data-ntf-tab="feature">기능 알림${featureUnread ? `<span class="chatbot-tab-badge">${featureUnread > 9 ? '9+' : featureUnread}</span>` : ''}</button>
      <button class="ntf-tab ${S.ntfTab === 'message' ? 'on' : ''}" data-ntf-tab="message">메시지 알림${messageUnread ? `<span class="chatbot-tab-badge">${messageUnread > 9 ? '9+' : messageUnread}</span>` : ''}</button>
    </div>
    ${list.length ? list.map(n => `
      <div class="ntf ${n.read ? '' : 'unread'}" ${n.link ? `data-ntf-link="${esc(n.link)}"` : ''} style="${n.link ? 'cursor:pointer' : ''}">
        <div class="ntf-ic">${icon(ntfIcon(n.type), 16)}</div>
        <div>
          <div class="ntf-msg">${esc(n.message)}</div>
          <div class="ntf-time">${fmtRelative(n.createdAt)}</div>
        </div>
      </div>`).join('') : `<div class="empty">${icon('bell', 30)}<strong>알림 없음</strong>${S.ntfTab === 'message' ? '새 메시지가 오면 여기에 표시됩니다.' : '새 배정이나 언급이 생기면 여기에 표시됩니다.'}</div>`}`;
}

document.addEventListener('click', e => {
  const ntfTabBtn = e.target.closest('[data-ntf-tab]');
  if (ntfTabBtn) {
    S.ntfTab = ntfTabBtn.dataset.ntfTab;
    renderNotifications();
  }
});

document.addEventListener('click', e => {
  const target = e.target.closest('[data-ntf-link]');
  if (target) {
    $('#ntfPanel').classList.remove('on');
    openNotificationLink(target.dataset.ntfLink);
  }
});

function openNotificationLink(link) {
  if (!link) return;
  if (link.startsWith('dm:')) return openDmWith(link.slice(3));
  if (link === 'teamchat') return openTeamChat();
  openIssueDetail(link);
}

async function openDmWith(userId) {
  $('#ntfPanel').classList.remove('on');
  S.chatbotTab = 'dm';
  S.dmActiveUserId = userId;
  await loadDmMessages(userId);
  await toggleChatbot(true);
  await loadDmThreads();
  renderChatbotBody();
  renderChatbotTabs();
}

async function openTeamChat() {
  $('#ntfPanel').classList.remove('on');
  S.chatbotTab = 'team';
  S.dmActiveUserId = null;
  await toggleChatbot(true);
}

/* ============================== 뷰 라우팅 ============================== */

const PAGE_META = {
  home: ['홈', '오늘 할 일과 팀 일정을 한눈에'],
  backlog: ['작업목록', '전체 작업 목록과 우선순위'],
  calendar: ['캘린더', '팀 일정과 작업 마감일'],
  sprint: ['스프린트', '반복 주기 단위로 작업 묶기'],
  dashboard: ['대시보드', '진행 현황과 작업 보드, 팀원별 부하'],
  team: ['팀', '조직도와 작업 흐름, 팀원 관리'],
  wiki: ['공유메모', '자유롭게 기록하고 공유하는 메모 공간'],
  meetings: ['회의록', '회의 내용과 참석자를 기록하고 공유'],
  settings: ['설정', '내 계정 관리']
};

function render() {
  const [title, sub] = PAGE_META[S.view] || ['홈', ''];
  $('#pageTitle').textContent = title;
  $('#pageSub').textContent = sub;
  $('#btnCreate').style.display = ['home', 'dashboard', 'backlog'].includes(S.view) ? '' : 'none';

  const view = $('#view');
  if (S.view === 'home') view.innerHTML = viewHome();
  else if (S.view === 'backlog') view.innerHTML = viewBacklog();
  else if (S.view === 'calendar') view.innerHTML = viewCalendar();
  else if (S.view === 'sprint') { view.innerHTML = viewSprint(); animateBarFills(); }
  else if (S.view === 'dashboard') { view.innerHTML = viewDashboard(); bindBoard(); }
  else if (S.view === 'team') view.innerHTML = viewTeam();
  else if (S.view === 'wiki') { view.innerHTML = viewWiki(); bindWikiEditor(); }
  else if (S.view === 'meetings') { view.innerHTML = viewMeetings(); bindMeetingEditor(); }
  else if (S.view === 'settings') view.innerHTML = viewSettings();
  else {
    /* === 확장 모듈 화면 (산출물 등) === */
    const mod = MODULES.find(m => m.id === S.view);
    if (mod) {
      view.innerHTML = mod.view();
      if (mod.bind) mod.bind();
    }
  }

  renderNav();
  $('#btnSettingsSide').classList.toggle('on', S.view === 'settings');
}

/* --------------------------------- 홈 --------------------------------- */

function viewHome() {
  const today = todayISO();
  const mine = S.issues.filter(i => i.assigneeId === S.me.id && i.status !== '완료');
  const todayEvents = S.events.filter(e => e.date === today);
  const dueToday = S.issues.filter(i => i.dueDate === today && i.status !== '완료');
  const overdue = S.issues.filter(i => i.dueDate && i.dueDate < today && i.status !== '완료');
  const done = S.issues.filter(i => i.status === '완료').length;

  return `
    <div class="grid g-stats" style="margin-bottom:16px">
      ${statTile('list', '내 진행 작업', mine.length, mine.filter(i => i.status === '진행 중').length + '건 진행 중', false, 'mine')}
      ${statTile('calendar', '오늘 일정', todayEvents.length, todayEvents.filter(e => e.shared).length + '건 팀 공유', false, 'todayEvents')}
      ${statTile('clock', '오늘 마감', dueToday.length, '마감일이 오늘인 작업', false, 'dueToday')}
      ${statTile('flag', '기한 초과', overdue.length, done + '건 완료됨', true, 'overdue')}
    </div>

    <div class="grid g-home">
      <div class="card">
        <div class="card-title cal-month-title">
          <span class="cal-title-stack">
            <span class="cal-year">${S.calCursor.getFullYear()}</span>
            <span class="cal-month-num">${S.calCursor.getMonth() + 1}월</span>
          </span>
          <span class="spacer"></span>
          <div class="cal-nav">
            <button data-cal="today" class="cal-today-btn">오늘</button>
            <div class="cal-nav-arrows">
              <button data-cal="prev" aria-label="이전 달">${icon('chevronLeft', 16)}</button>
              <button data-cal="next" aria-label="다음 달">${icon('chevronRight', 16)}</button>
            </div>
          </div>
        </div>
        ${calendarGrid()}
        <div style="margin-top:14px;display:flex;gap:9px">
          <button class="btn btn-soft" data-new-event="1" style="flex:1">${icon('plus', 17)}일정 추가</button>
          <button class="btn btn-pink" data-new-event="shared" style="flex:1">${icon('share', 17)}팀 일정 공유</button>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card">
          <div class="card-title">${icon('clock', 19)}${fmtDate(S.calSelected)} 일정</div>
          ${dayPanel(S.calSelected)}
        </div>

        <div class="card">
          <div class="card-title">${icon('list', 19)}내 작업<span class="spacer"></span>
            <button class="fchip" data-nav="backlog" style="padding:4px 12px;font-size:12px">전체 보기</button>
          </div>
          ${mine.length ? `<div class="row-list">${mine.slice(0, 6).map(issueRow).join('')}</div>`
            : `<div class="empty">${icon('check', 30)}<strong>배정된 작업 없음</strong>새 작업을 만들어 담당자로 본인을 지정해 보세요.</div>`}
        </div>
      </div>
    </div>`;
}

function statTile(ic, label, value, note, pink, previewKey) {
  const clickable = previewKey ? `data-stat-preview="${previewKey}" style="cursor:pointer"` : '';
  return `<div class="stat ${pink ? 'pink' : ''}" ${clickable}>
    <div class="stat-top">${icon(ic, 16)}<span>${label}</span></div>
    <div class="stat-val">${value}</div>
    <div class="stat-note">${esc(note)}</div>
  </div>`;
}

function openStatPreview(kind) {
  const today = todayISO();
  let title, emptyText, emptyIcon, items, rowFn;

  if (kind === 'overdue') {
    title = '기한 초과 작업';
    emptyText = '기한이 지난 작업이 없습니다';
    emptyIcon = 'check';
    rowFn = issueRow;
    items = S.issues.filter(i => i.dueDate && i.dueDate < today && i.status !== '완료')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  } else if (kind === 'allIssues') {
    title = '전체 작업';
    emptyText = '등록된 작업이 없습니다';
    emptyIcon = 'list';
    rowFn = issueRow;
    items = S.issues.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (kind === 'doneIssues') {
    title = '완료된 작업';
    emptyText = '완료된 작업이 없습니다';
    emptyIcon = 'check';
    rowFn = issueRow;
    items = S.issues.filter(i => i.status === '완료').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (kind === 'members') {
    title = '참여 인원';
    emptyText = '팀원이 없습니다';
    emptyIcon = 'team';
    rowFn = memberRow;
    items = S.users.slice().sort((a, b) => S.online.includes(b.id) - S.online.includes(a.id));
  } else if (kind === 'dueToday') {
    title = '오늘 마감 작업';
    emptyText = '오늘 마감인 작업이 없습니다';
    emptyIcon = 'check';
    rowFn = issueRow;
    items = S.issues.filter(i => i.dueDate === today && i.status !== '완료');
  } else if (kind === 'mine') {
    title = '내 진행 작업';
    emptyText = '배정된 작업이 없습니다';
    emptyIcon = 'list';
    rowFn = issueRow;
    items = S.issues.filter(i => i.assigneeId === S.me.id && i.status !== '완료');
  } else {
    title = '오늘 일정';
    emptyText = '오늘 등록된 일정이 없습니다';
    emptyIcon = 'calendar';
    rowFn = eventRow;
    items = S.events.filter(e => e.date === today).sort((a, b) => (a.time || '99') > (b.time || '99') ? 1 : -1);
  }

  openModal(`
    <div class="modal-head">
      <div style="flex:1">
        <div class="modal-title">${title}</div>
        <div class="modal-sub">${items.length}건</div>
      </div>
      <button class="icon-btn" data-close="1">${icon('close', 18)}</button>
    </div>
    ${items.length
      ? `<div class="row-list">${items.map(rowFn).join('')}</div>`
      : `<div class="empty">${icon(emptyIcon, 30)}<strong>${emptyText}</strong></div>`}`);
}

document.addEventListener('click', e => {
  const statBtn = e.target.closest('[data-stat-preview]');
  if (statBtn) openStatPreview(statBtn.dataset.statPreview);
});

function issueRow(i) {
  const assignee = userById(i.assigneeId);
  const late = i.dueDate && i.dueDate < todayISO() && i.status !== '완료';
  return `<button class="row" data-issue="${i.id}">
    <span class="row-bar" style="background:${STATUS_TONE[i.status]}"></span>
    <div class="row-main">
      <div class="row-title">${esc(i.title)}</div>
      <div class="row-meta">
        <span class="tkt-key">${esc(i.key)}</span>
        <span class="chip plain">${esc(i.status)}</span>
        ${i.dueDate ? `<span class="chip ${late ? 'late' : ''}">${fmtDate(i.dueDate)}</span>` : ''}
      </div>
    </div>
    ${avatar(assignee, 'sm')}
  </button>`;
}

function eventRow(e) {
  const owner = userById(e.ownerId);
  return `<button class="row" data-event="${e.id}">
    <span class="row-bar ${e.shared ? 'pink' : ''}"></span>
    <div class="row-main">
      <div class="row-title">${esc(e.title)}</div>
      <div class="row-meta">
        <span>${esc(fmtEventTime(e))}</span>
        <span>${esc(owner ? owner.name : '알 수 없음')}</span>
        ${e.shared ? '<span class="chip pink">팀 공유</span>' : ''}
      </div>
    </div>
  </button>`;
}

function memberRow(u) {
  const on = S.online.includes(u.id);
  const open = S.issues.filter(i => i.assigneeId === u.id && i.status !== '완료').length;
  return `<div class="row">
    ${avatar(u, 'sm')}
    <div class="row-main">
      <div class="row-title">${esc(u.name)}</div>
      <div class="row-meta">
        <span class="online-mark ${on ? '' : 'off'}"></span>
        <span>${on ? '접속 중' : '오프라인'}</span>
        <span class="chip plain">${esc(roleLabel(u.role))}</span>
      </div>
    </div>
    <span class="chip plain">진행 ${open}건</span>
  </div>`;
}

function dayPanel(iso) {
  const events = S.events.filter(e => e.date === iso).sort((a, b) => (a.time || '99') > (b.time || '99') ? 1 : -1);
  const dues = S.issues.filter(i => i.dueDate === iso);
  if (!events.length && !dues.length) {
    return `<div class="empty">${icon('calendar', 30)}<strong>등록된 일정 없음</strong>날짜를 눌러 일정을 추가할 수 있습니다.</div>`;
  }
  return `<div class="row-list">
    ${events.map(eventRow).join('')}
    ${dues.map(issueRow).join('')}
  </div>`;
}

/* 대한민국 법정공휴일 (2025-2027, 관공서의 공휴일에 관한 규정 기준, 근로자의 날 제외) */
const KR_HOLIDAYS = {
  '2025-01-01': '신정',
  '2025-01-27': '임시공휴일',
  '2025-01-28': '설날 연휴',
  '2025-01-29': '설날',
  '2025-01-30': '설날 연휴',
  '2025-03-01': '삼일절',
  '2025-03-03': '삼일절 대체공휴일',
  '2025-05-05': '어린이날·부처님오신날',
  '2025-05-06': '대체공휴일',
  '2025-06-03': '임시공휴일(대통령선거)',
  '2025-06-06': '현충일',
  '2025-08-15': '광복절',
  '2025-10-03': '개천절',
  '2025-10-05': '추석 연휴',
  '2025-10-06': '추석',
  '2025-10-07': '추석 연휴',
  '2025-10-08': '추석 대체공휴일',
  '2025-10-09': '한글날',
  '2025-12-25': '성탄절',
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '삼일절 대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '부처님오신날 대체공휴일',
  '2026-06-03': '전국동시지방선거',
  '2026-06-06': '현충일',
  '2026-07-17': '제헌절',
  '2026-08-15': '광복절',
  '2026-08-17': '광복절 대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '개천절 대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
  '2027-01-01': '신정',
  '2027-02-06': '설날 연휴',
  '2027-02-07': '설날',
  '2027-02-08': '설날 연휴',
  '2027-02-09': '설날 대체공휴일',
  '2027-03-01': '삼일절',
  '2027-05-05': '어린이날',
  '2027-05-13': '부처님오신날',
  '2027-06-06': '현충일',
  '2027-07-17': '제헌절',
  '2027-07-19': '제헌절 대체공휴일',
  '2027-08-15': '광복절',
  '2027-08-16': '광복절 대체공휴일',
  '2027-09-14': '추석 연휴',
  '2027-09-15': '추석',
  '2027-09-16': '추석 연휴',
  '2027-10-03': '개천절',
  '2027-10-04': '개천절 대체공휴일',
  '2027-10-09': '한글날',
  '2027-10-11': '한글날 대체공휴일',
  '2027-12-25': '성탄절',
  '2027-12-27': '성탄절 대체공휴일'
};

function calendarGrid() {
  const cursor = S.calCursor;
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());

  const dows = ['일', '월', '화', '수', '목', '금', '토'];
  let html = '<div class="cal-grid">';
  dows.forEach((d, idx) => {
    html += `<div class="cal-dow ${idx === 0 ? 'sun' : idx === 6 ? 'sat' : ''}">${d}</div>`;
  });

  for (let n = 0; n < 42; n++) {
    const date = new Date(start.getTime() + n * 86400000);
    const iso = isoOf(date);
    const out = date.getMonth() !== month;

    if (out) {
      html += `<div class="cal-cell blank" aria-hidden="true"></div>`;
      continue;
    }

    const dow = date.getDay();
    const holiday = KR_HOLIDAYS[iso];
    const evs = S.events.filter(e => e.date === iso);
    const dues = S.issues.filter(i => i.dueDate === iso && i.status !== '완료');
    const items = [
      ...evs.map(e => ({ id: e.id, type: 'event', label: e.title, cls: e.shared ? 'shared' : '' })),
      ...dues.map(i => ({ id: i.id, type: 'issue', label: i.key, cls: 'due' }))
    ];
    html += `<button class="cal-cell ${iso === todayISO() ? 'today' : ''} ${iso === S.calSelected ? 'sel' : ''}" data-day="${iso}" ${holiday ? `title="${esc(holiday)}"` : ''}>
      <span class="cal-num ${holiday || dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}">${date.getDate()}</span>
      ${holiday ? `<span class="cal-holiday">${esc(holiday)}</span>` : ''}
      ${items.slice(0, 2).map(it => `<span class="cal-pill ${it.cls}" ${it.type === 'event' ? `data-event="${it.id}"` : `data-issue="${it.id}"`}>${esc(it.label)}</span>`).join('')}
      ${items.length > 2 ? `<span class="cal-more">+${items.length - 2}건</span>` : ''}
    </button>`;
  }
  return html + '</div>';
}

/* -------------------------------- 보드 -------------------------------- */

function filterIssues(list) {
  let out = list;
  if (S.search) {
    out = out.filter(i =>
      i.title.toLowerCase().includes(S.search) ||
      i.key.toLowerCase().includes(S.search) ||
      (i.labels || []).some(l => l.toLowerCase().includes(S.search))
    );
  }
  return out;
}

function boardSection() {
  let list = filterIssues(S.issues);
  if (S.boardFilter === 'mine') list = list.filter(i => i.assigneeId === S.me.id);
  else if (S.boardFilter === 'blocked') list = list.filter(i => (i.blockedBy || []).length);
  else if (S.boardFilter === 'urgent') list = list.filter(i => ['높음', '긴급'].includes(i.priority));
  else if (S.boardFilter.startsWith('spr:')) list = list.filter(i => i.sprintId === S.boardFilter.slice(4));

  const active = S.sprints.find(s => s.status === '진행 중');

  return `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">${icon('board', 19)}작업 보드</div>
      <div class="filters">
        ${fchip('all', '전체', S.boardFilter)}
        ${fchip('mine', '내 작업', S.boardFilter)}
        ${fchip('urgent', '높은 우선순위', S.boardFilter)}
        ${fchip('blocked', '차단됨', S.boardFilter)}
        ${active ? fchip('spr:' + active.id, active.name, S.boardFilter) : ''}
      </div>
      <div class="board-scroll"><div class="board">
        ${STATUSES.map(status => {
          const items = list.filter(i => i.status === status).sort((a, b) => a.order - b.order);
          return `<div class="col" data-col="${esc(status)}">
            <div class="col-head">
              <span class="col-mark" style="background:${STATUS_TONE[status]}"></span>
              <span class="col-name">${status}</span>
              <span class="col-count">${items.length}</span>
            </div>
            ${items.map(ticket).join('')}
            ${items.length ? '' : `<div class="empty" style="padding:22px 8px;font-size:12.5px">여기로 작업을 끌어오세요</div>`}
          </div>`;
        }).join('')}
      </div></div>
    </div>`;
}

function fchip(id, label, current) {
  return `<button class="fchip ${current === id ? 'on' : ''}" data-filter="${id}">${esc(label)}</button>`;
}

function ticket(i) {
  const assignee = userById(i.assigneeId);
  const workers = (i.workerIds || []).map(userById).filter(Boolean);
  const late = i.dueDate && i.dueDate < todayISO() && i.status !== '완료';
  const blocked = (i.blockedBy || []).length;
  return `<div class="tkt" draggable="true" data-ticket="${i.id}">
    <div class="tkt-top">
      <span style="color:${PRI_TONE[i.priority]}">${icon(TYPE_ICON[i.type], 15)}</span>
      <span class="tkt-key">${esc(i.key)}</span>
      ${blocked ? `<span class="chip pink">${icon('link', 11)} 차단 ${blocked}</span>` : ''}
    </div>
    <div class="tkt-title">${esc(i.title)}</div>
    <div class="tkt-foot">
      <span class="pri"><span class="pri-dot" style="background:${PRI_TONE[i.priority]}"></span>${esc(i.priority)}</span>
      ${i.storyPoints ? `<span class="chip plain">${i.storyPoints}P</span>` : ''}
      ${i.dueDate ? `<span class="chip ${late ? 'late' : ''}">${fmtDate(i.dueDate)}</span>` : ''}
      ${(i.labels || []).slice(0, 1).map(l => `<span class="chip pink">${esc(l)}</span>`).join('')}
      ${workers.length ? `<span class="avatar-stack" title="작업자: ${workers.map(w => w.name).join(', ')}">${workers.slice(0, 3).map(w => avatar(w, 'sm')).join('')}</span>` : ''}
      <span class="tkt-avatar" title="${assignee ? '담당자: ' + assignee.name : '담당자 미지정'}">${avatar(assignee, 'sm')}</span>
    </div>
  </div>`;
}

let dragId = null;

function bindBoard() {
  $$('.tkt').forEach(el => {
    el.addEventListener('dragstart', () => {
      dragId = el.dataset.ticket;
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      dragId = null;
      $$('.col').forEach(c => c.classList.remove('drop'));
    });
  });

  $$('.col').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      col.classList.add('drop');
    });
    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) col.classList.remove('drop');
    });
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drop');
      if (!dragId) return;
      const tickets = Array.from(col.querySelectorAll('.tkt'));
      let index = tickets.length;
      for (let n = 0; n < tickets.length; n++) {
        const box = tickets[n].getBoundingClientRect();
        if (e.clientY < box.top + box.height / 2) { index = n; break; }
      }
      const id = dragId;
      dragId = null;
      try {
        await api('POST', '/api/issues/reorder', { id, status: col.dataset.col, index });
      } catch (err) { toast(err.message, 'warn'); }
    });
  });
}

/* ------------------------------- 백로그 ------------------------------- */

function viewBacklog() {
  let list = filterIssues(S.issues);
  if (S.backlogFilter === 'mine') list = list.filter(i => i.assigneeId === S.me.id);
  else if (S.backlogFilter === 'open') list = list.filter(i => i.status !== '완료');
  else if (S.backlogFilter === 'done') list = list.filter(i => i.status === '완료');
  else if (S.backlogFilter === 'nosprint') list = list.filter(i => !i.sprintId);

  list = list.slice().sort((a, b) => {
    const rank = p => PRIORITIES.indexOf(p);
    return rank(b.priority) - rank(a.priority) || new Date(b.createdAt) - new Date(a.createdAt);
  });

  return `
    <div class="filters">
      ${fchip('all', '전체', S.backlogFilter)}
      ${fchip('open', '진행 중인 작업', S.backlogFilter)}
      ${fchip('mine', '내 작업', S.backlogFilter)}
      ${fchip('nosprint', '스프린트 미지정', S.backlogFilter)}
      ${fchip('done', '완료', S.backlogFilter)}
      <div class="seg" id="backlogViewSeg" style="margin-left:auto">
        <button type="button" data-backlog-view="list" class="${S.backlogView === 'gantt' ? '' : 'on'}">목록</button>
        <button type="button" data-backlog-view="gantt" class="${S.backlogView === 'gantt' ? 'on' : ''}">간트</button>
      </div>
    </div>
    ${S.backlogView === 'gantt' ? ganttChart(list) : `
    <div class="card">
      ${list.length ? `<table class="tbl">
        <thead><tr><th style="width:88px">키</th><th>제목</th><th style="width:96px">상태</th><th style="width:88px">우선순위</th><th style="width:120px">담당</th><th style="width:96px">마감</th></tr></thead>
        <tbody>${list.map(i => {
          const a = userById(i.assigneeId);
          const late = i.dueDate && i.dueDate < todayISO() && i.status !== '완료';
          return `<tr data-issue="${i.id}">
            <td><span class="tkt-key">${esc(i.key)}</span></td>
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="color:${PRI_TONE[i.priority]}">${icon(TYPE_ICON[i.type], 15)}</span>
                <span style="font-weight:600">${esc(i.title)}</span>
                ${(i.labels || []).slice(0, 2).map(l => `<span class="chip pink">${esc(l)}</span>`).join('')}
              </div>
            </td>
            <td><span class="chip" style="background:${STATUS_TONE[i.status]}22;color:var(--ink-2)">${esc(i.status)}</span></td>
            <td><span class="pri"><span class="pri-dot" style="background:${PRI_TONE[i.priority]}"></span>${esc(i.priority)}</span></td>
            <td><div style="display:flex;align-items:center;gap:7px">${avatar(a, 'sm')}<span style="font-size:12.5px">${esc(a ? a.name : '미지정')}</span></div></td>
            <td>${i.dueDate ? `<span class="chip ${late ? 'late' : 'plain'}">${fmtDate(i.dueDate)}</span>` : '<span style="color:var(--ink-3)">-</span>'}</td>
          </tr>`;
        }).join('')}</tbody></table>`
        : `<div class="empty">${icon('list', 32)}<strong>작업이 없습니다</strong>오른쪽 위 새 작업 버튼으로 첫 작업을 만들어 보세요.</div>`}
    </div>`}`;
}

/* ------------------------------- 간트 차트 ------------------------------- */

function ganttChart(list) {
  if (!list.length) {
    return `<div class="card"><div class="empty">${icon('sprint', 32)}<strong>표시할 작업이 없습니다</strong>필터를 바꾸거나 새 작업을 만들어 보세요.</div></div>`;
  }

  const DAY = 86400000;
  const startOfMs = iso => { const d = new Date(iso); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

  const rows = list.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map(i => {
    const start = startOfMs(i.createdAt);
    const end = i.dueDate ? Math.max(startOfMs(i.dueDate + 'T00:00:00'), start + DAY) : start + DAY;
    return { issue: i, start, end };
  });

  const today = startOfMs(new Date().toISOString());
  let rangeStart = Math.min(today, ...rows.map(r => r.start));
  let rangeEnd = Math.max(today + DAY, ...rows.map(r => r.end));
  const minSpan = DAY * 7;
  if (rangeEnd - rangeStart < minSpan) rangeEnd = rangeStart + minSpan;
  const totalMs = rangeEnd - rangeStart;

  const pct = ms => ((ms - rangeStart) / totalMs) * 100;
  const todayPct = pct(today);

  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, n) => {
    const t = rangeStart + (totalMs * n / tickCount);
    return { pct: (n / tickCount) * 100, label: new Date(t).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) };
  });

  return `
    <div class="card gantt-card">
      <div class="gantt-grid gantt-header-row">
        <div>작업</div>
        <div>담당자 · 결과물</div>
        <div>업무 흐름</div>
        <div class="gantt-track-head">${ticks.map(t => `<span class="gantt-tick-label" style="left:${t.pct}%">${t.label}</span>`).join('')}</div>
        <div>진행률</div>
      </div>
      ${rows.map(({ issue: i, start, end }) => {
        const assignee = userById(i.assigneeId);
        const progress = STATUS_PROGRESS[i.status] || 0;
        const late = !!i.dueDate && i.dueDate < todayISO() && i.status !== '완료';
        const left = Math.max(0, Math.min(100, pct(start)));
        const width = Math.max(2, Math.min(100 - left, pct(end) - pct(start)));
        const stageIdx = STATUSES.indexOf(i.status);
        const output = i.description ? i.description.split('\n')[0].trim().slice(0, 28) : '';
        return `<div class="gantt-grid gantt-row" data-issue="${i.id}">
          <div class="gantt-row-title">
            <span style="color:${PRI_TONE[i.priority]}">${icon(TYPE_ICON[i.type], 14)}</span>
            <span class="tkt-key">${esc(i.key)}</span>
            <span class="gantt-title-text">${esc(i.title)}</span>
          </div>
          <div class="gantt-row-owner">
            ${avatar(assignee, 'sm')}
            <div class="gantt-owner-text">
              <div class="gantt-owner-name">${esc(assignee ? assignee.name : '미지정')}</div>
              <div class="gantt-owner-output">${output ? esc(output) : '결과물 미입력'}</div>
            </div>
          </div>
          <div class="gantt-row-flow" title="${esc(i.status)}">
            ${STATUSES.map((s, idx) => `<span class="gantt-step ${idx < stageIdx ? 'done' : ''} ${idx === stageIdx ? 'on' : ''}" title="${esc(s)}"></span>`).join('')}
          </div>
          <div class="gantt-track">
            ${todayPct >= 0 && todayPct <= 100 ? `<div class="gantt-today" style="left:${todayPct}%"></div>` : ''}
            <div class="gantt-bar-plan ${late ? 'late' : ''}" style="left:${left}%;width:${width}%" title="계획: ${fmtDate(isoOf(new Date(start)))} ~ ${i.dueDate ? fmtDate(i.dueDate) : '미정'}">
              <div class="gantt-bar-fill" style="width:${progress}%"></div>
            </div>
          </div>
          <div class="gantt-row-progress">${progress}%</div>
        </div>`;
      }).join('')}
    </div>`;
}

/* ------------------------------ 캘린더 뷰 ------------------------------ */

function viewCalendar() {
  return `
    <div class="grid g-home">
      <div class="card">
        <div class="card-title cal-month-title">
          <span class="cal-title-stack">
            <span class="cal-year">${S.calCursor.getFullYear()}</span>
            <span class="cal-month-num">${S.calCursor.getMonth() + 1}월</span>
          </span>
          <span class="spacer"></span>
          <div class="cal-nav">
            <button data-cal="today" class="cal-today-btn">오늘</button>
            <div class="cal-nav-arrows">
              <button data-cal="prev" aria-label="이전 달">${icon('chevronLeft', 16)}</button>
              <button data-cal="next" aria-label="다음 달">${icon('chevronRight', 16)}</button>
            </div>
          </div>
        </div>
        ${calendarGrid()}
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card">
          <div class="card-title">${icon('clock', 19)}${fmtDate(S.calSelected)}<span class="spacer"></span>
            <button class="fchip" data-new-event="1" style="padding:4px 12px;font-size:12px">추가</button>
          </div>
          ${dayPanel(S.calSelected)}
        </div>
        <div class="card">
          <div class="card-title">${icon('share', 19)}팀 공유 일정</div>
          ${(() => {
            const shared = S.events.filter(e => e.shared && e.date >= todayISO()).sort((a, b) => a.date > b.date ? 1 : -1).slice(0, 6);
            if (!shared.length) return `<div class="empty">${icon('share', 28)}<strong>공유된 일정 없음</strong>팀장이 등록한 팀 일정이 여기에 모입니다.</div>`;
            return `<div class="row-list">${shared.map(e => `
              <button class="row" data-event="${e.id}">
                <span class="row-bar pink"></span>
                <div class="row-main">
                  <div class="row-title">${esc(e.title)}</div>
                  <div class="row-meta"><span>${fmtDate(e.date)}</span>${e.time ? `<span>${esc(fmtEventTime(e))}</span>` : ''}</div>
                </div>
              </button>`).join('')}</div>`;
          })()}
        </div>
      </div>
    </div>`;
}

/* ------------------------------ 스프린트 ------------------------------ */

function viewSprint() {
  const isPM = S.me.role === 'PM';
  const activeSprint = S.sprints.find(s => s.status === '진행 중');
  const sprintIssues = S.issues.filter(i => i.sprintId);
  const totalPoints = sprintIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
  const donePoints = sprintIssues.filter(i => i.status === '완료').reduce((sum, i) => sum + (i.storyPoints || 0), 0);
  let dday = '-';
  if (activeSprint && activeSprint.endDate) {
    const daysLeft = Math.ceil((new Date(activeSprint.endDate) - new Date(todayISO())) / 86400000);
    dday = daysLeft >= 0 ? `D-${daysLeft}` : `D+${-daysLeft}`;
  }
  return `
    ${S.sprints.length ? `<div class="grid g-stats-sprint" style="margin-bottom:16px">
      ${statTile('sprint', '전체 스프린트', S.sprints.length, `${S.sprints.filter(s => s.status === '진행 중').length}개 진행 중`)}
      <div class="stat wide">
        <div class="stat-top">${icon('clock', 16)}<span>진행 중 스프린트</span></div>
        <div class="stat-val">${dday}</div>
        <div class="stat-note">${esc(activeSprint ? activeSprint.name : '진행 중인 스프린트가 없어요')}</div>
      </div>
      ${statTile('check', '완료 포인트', `${donePoints}/${totalPoints}P`, `${totalPoints ? Math.round(donePoints / totalPoints * 100) : 0}% 완료`)}
      ${statTile('list', '배정된 작업', sprintIssues.length, `전체 ${S.issues.length}건 중`)}
    </div>` : ''}
    ${isPM ? `<div class="filters"><button class="btn btn-primary" data-new-sprint="1">${icon('plus', 17)}스프린트 만들기</button></div>` : ''}
    ${S.sprints.length ? `<div style="display:flex;flex-direction:column;gap:16px">${S.sprints.slice().reverse().map(sprintCard).join('')}</div>`
      : `<div class="card"><div class="empty">${icon('sprint', 32)}<strong>스프린트가 없습니다</strong>${isPM ? '스프린트를 만들어 작업을 주기 단위로 묶어 보세요.' : '팀장이 스프린트를 만들면 여기에 표시됩니다.'}</div></div>`}`;
}

function animateBarFills() {
  const fills = $$('.bar-fill[data-pct]');
  if (!fills.length) return;
  fills.forEach(el => { el.style.width = '0%'; });
  // 강제 리플로우: 0% 상태가 실제로 레이아웃에 반영된 뒤에 전환이 시작되도록 함
  void document.body.offsetHeight;
  requestAnimationFrame(() => {
    fills.forEach(el => { el.style.width = el.dataset.pct + '%'; });
  });
}

const STATUS_PROGRESS_WEIGHT = { '할 일': 0, '진행 중': 0.5, '검토': 0.75, '완료': 1 };

function sprintCard(s) {
  const issues = S.issues.filter(i => i.sprintId === s.id);
  const done = issues.filter(i => i.status === '완료').length;
  const weighted = issues.reduce((sum, i) => sum + (STATUS_PROGRESS_WEIGHT[i.status] || 0), 0);
  const pct = issues.length ? Math.round(weighted / issues.length * 100) : 0;
  const points = issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
  const isPM = S.me.role === 'PM';

  return `<div class="card">
    <div class="card-title">${icon('sprint', 19)}${esc(s.name)}<span class="spacer"></span>
      <span class="chip ${s.status === '진행 중' ? '' : 'plain'}">${esc(s.status)}</span>
    </div>
    ${s.goal ? `<div style="font-size:13px;color:var(--ink-2);line-height:1.6;margin-bottom:13px">${esc(s.goal)}</div>` : ''}
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      ${s.startDate ? `<span class="chip plain">${fmtDate(s.startDate)} - ${fmtDate(s.endDate)}</span>` : ''}
      <span class="chip plain">${issues.length}개 작업</span>
      ${points ? `<span class="chip plain">${points}P</span>` : ''}
    </div>
    <div class="bar-row">
      <span class="bar-label">진행률</span>
      <span class="bar-track"><span class="bar-fill" data-pct="${pct}" style="width:0%"></span></span>
      <span class="bar-val">${pct}%</span>
    </div>
    ${issues.length ? `<div class="row-list" style="margin-top:12px">${issues.slice(0, 4).map(issueRow).join('')}</div>` : ''}
    ${isPM ? `<div style="display:flex;gap:8px;margin-top:14px">
      ${s.status !== '진행 중' ? `<button class="btn btn-soft" data-sprint-start="${s.id}" style="flex:1">시작</button>` : ''}
      ${s.status === '진행 중' ? `<button class="btn btn-soft" data-sprint-close="${s.id}" style="flex:1">완료 처리</button>` : ''}
      <button class="btn btn-soft narrow" data-sprint-edit="${s.id}">${icon('edit', 16)}</button>
      <button class="btn btn-danger narrow" data-sprint-del="${s.id}">${icon('trash', 16)}</button>
    </div>` : ''}
  </div>`;
}

/* ------------------------------ 대시보드 ------------------------------ */

function viewDashboard() {
  const total = S.issues.length || 1;
  const byStatus = STATUSES.map(s => ({ name: s, value: S.issues.filter(i => i.status === s).length, tone: STATUS_TONE[s] }));
  const byPriority = PRIORITIES.map(p => ({ name: p, value: S.issues.filter(i => i.priority === p && i.status !== '완료').length, tone: PRI_TONE[p] }));
  const members = S.users.map(u => ({
    name: u.name,
    avatarUrl: u.avatarUrl,
    open: S.issues.filter(i => i.assigneeId === u.id && i.status !== '완료').length,
    done: S.issues.filter(i => i.assigneeId === u.id && i.status === '완료').length
  })).sort((a, b) => b.open - a.open);
  const maxLoad = Math.max(1, ...members.map(m => m.open + m.done));
  const done = S.issues.filter(i => i.status === '완료').length;

  return `
    <div class="grid g-stats" style="margin-bottom:16px">
      ${statTile('list', '전체 작업', S.issues.length, '팀 전체 등록 기준', false, 'allIssues')}
      ${statTile('check', '완료', done, Math.round(done / total * 100) + '% 완료율', false, 'doneIssues')}
      ${statTile('team', '참여 인원', S.users.length, S.online.length + '명 접속 중', false, 'members')}
      ${statTile('flag', '기한 초과', S.issues.filter(i => i.dueDate && i.dueDate < todayISO() && i.status !== '완료').length, '조치가 필요한 작업', true, 'overdue')}
    </div>

    ${boardSection()}

    <div class="grid g-2">
      <div class="card">
        <div class="card-title">${icon('chart', 19)}상태별 분포</div>
        <div class="ring-wrap">
          ${donut(byStatus)}
          <div class="ring-legend">${byStatus.map(d => `
            <div class="legend-row">
              <span class="legend-mark" style="background:${d.tone}"></span>
              <span class="legend-name">${d.name}</span>
              <span class="legend-val">${d.value}</span>
            </div>`).join('')}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">${icon('flag', 19)}미완료 작업 우선순위</div>
        ${byPriority.map(d => {
          const max = Math.max(1, ...byPriority.map(x => x.value));
          return `<div class="bar-row">
            <span class="bar-label">${d.name}</span>
            <span class="bar-track"><span class="bar-fill ${d.name === '긴급' || d.name === '높음' ? 'pink' : ''}" style="width:${d.value / max * 100}%"></span></span>
            <span class="bar-val">${d.value}</span>
          </div>`;
        }).join('')}
      </div>

      <div class="card" style="grid-column:1/-1">
        <div class="card-title">${icon('team', 19)}팀원별 작업 분포</div>
        ${members.length ? members.map(m => `
          <div style="display:flex;align-items:center;gap:11px;margin-bottom:12px">
            ${avatar(m, 'sm')}
            <span style="width:78px;font-size:13px;font-weight:600">${esc(m.name)}</span>
            <span class="bar-track" style="display:flex">
              <span style="width:${m.open / maxLoad * 100}%;background:linear-gradient(90deg,var(--sky-300),var(--sky-500))"></span>
              <span style="width:${m.done / maxLoad * 100}%;background:var(--sky-200)"></span>
            </span>
            <span style="font-size:12px;color:var(--ink-3);width:96px;text-align:right">진행 ${m.open} · 완료 ${m.done}</span>
          </div>`).join('')
          : `<div class="empty">팀원이 합류하면 분포가 표시됩니다.</div>`}
      </div>
    </div>`;
}

function donut(data) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const R = 46, C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = data.map(d => {
    const len = total ? d.value / total * C : 0;
    const seg = `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${d.tone}" stroke-width="15"
      stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" stroke-linecap="butt"
      transform="rotate(-90 60 60)"/>`;
    offset += len;
    return seg;
  }).join('');
  return `<svg viewBox="0 0 120 120" width="132" height="132">
    <circle cx="60" cy="60" r="${R}" fill="none" stroke="rgba(23,48,63,0.06)" stroke-width="15"/>
    ${arcs}
    <text x="60" y="57" text-anchor="middle" font-size="23" font-weight="700" fill="#17303F">${total}</text>
    <text x="60" y="73" text-anchor="middle" font-size="10" fill="#7C919D">전체 작업</text>
  </svg>`;
}

/* -------------------------------- 팀 -------------------------------- */

function orgNode(u) {
  const open = S.issues.filter(i => i.assigneeId === u.id && i.status !== '완료').length;
  const on = S.online.includes(u.id);
  const rosterEntry = S.roster.find(r => r.name === u.name);
  return `<div class="org-node">
    ${avatar(u, 'lg')}
    <div class="org-node-name">${esc(u.name)}<span class="online-mark ${on ? '' : 'off'}"></span></div>
    ${rosterEntry ? `<div class="org-node-role">${esc(rosterEntry.title)}</div>` : ''}
    <span class="role-tag ${u.role === 'PM' ? '' : 'member'}">${esc(roleLabel(u.role))}</span>
    <div class="org-node-meta">진행 ${open}건</div>
  </div>`;
}

function workflowDiagram() {
  return `<div class="flow-diagram">
    ${STATUSES.map((s, idx) => {
      const items = S.issues.filter(i => i.status === s);
      const assignees = [...new Set(items.map(i => i.assigneeId).filter(Boolean))].map(userById).filter(Boolean);
      return `${idx > 0 ? `<div class="flow-arrow">${icon('chevronRight', 20)}</div>` : ''}
        <div class="flow-stage">
          <div class="flow-badge" style="background:${STATUS_TONE[s]}">${items.length}</div>
          <div class="flow-stage-name">${esc(s)}</div>
          <div class="flow-avatars">
            ${assignees.slice(0, 4).map(u => avatar(u, 'sm')).join('')}
            ${assignees.length > 4 ? `<span class="flow-more">+${assignees.length - 4}</span>` : ''}
            ${!assignees.length ? `<span class="flow-empty">담당자 없음</span>` : ''}
          </div>
        </div>`;
    }).join('')}
  </div>`;
}

function viewTeam() {
  const isPM = S.me.role === 'PM';
  const host = location.origin;
  const pms = S.users.filter(u => u.role === 'PM');
  const members = S.users.filter(u => u.role !== 'PM');

  return `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">${icon('team', 19)}조직도</div>
      <div class="org-chart">
        <div class="org-row org-row-pm">
          ${pms.length ? pms.map(orgNode).join('') : `<div class="org-node placeholder">팀장 없음</div>`}
        </div>
        ${members.length ? `
        <div class="org-trunk"></div>
        <div class="org-row org-row-members">
          ${members.map(orgNode).join('')}
        </div>` : ''}
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">${icon('settings', 19)}팀원 역할</div>
      <div class="row-list">
        ${S.roster.map(p => `
          <div class="member">
            <span style="font-weight:650;font-size:13.5px;width:76px;flex:none">${esc(p.name)}</span>
            <select class="select" data-roster-for="${p.id}" style="width:150px;padding:8px 10px;font-size:13px">
              ${ROSTER_TITLES.map(t => `<option ${t === p.title ? 'selected' : ''}>${esc(t)}</option>`).join('')}
              ${ROSTER_TITLES.includes(p.title) ? '' : `<option selected>${esc(p.title)}</option>`}
            </select>
          </div>`).join('')}
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">${icon('sprint', 19)}작업 흐름도</div>
      ${workflowDiagram()}
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">${icon('team', 19)}팀원 ${S.users.length}명<span class="spacer"></span>
        <span class="chip">${S.online.length}명 접속 중</span>
      </div>
      <div class="row-list">
        ${S.users.map(u => {
          const on = S.online.includes(u.id);
          const open = S.issues.filter(i => i.assigneeId === u.id && i.status !== '완료').length;
          return `<div class="member">
            ${avatar(u, 'lg')}
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px">
                <span class="member-name">${esc(u.name)}</span>
                <span class="online-mark ${on ? '' : 'off'}"></span>
                <span class="role-tag ${u.role === 'PM' ? '' : 'member'}">${esc(roleLabel(u.role))}</span>
              </div>
              <div class="member-meta">아이디 ${esc(u.username)} · 진행 중 작업 ${open}건</div>
            </div>
            ${isPM && u.id !== S.me.id ? `
              <select class="select" data-role-for="${u.id}" style="width:104px;padding:8px 10px;font-size:13px">
                <option value="PM" ${u.role === 'PM' ? 'selected' : ''}>팀장</option>
                <option value="팀원" ${u.role === '팀원' ? 'selected' : ''}>팀원</option>
              </select>
              <button class="btn btn-danger" data-user-del="${u.id}">${icon('trash', 16)}</button>` : ''}
          </div>`;
        }).join('')}
      </div>
      ${isPM ? '' : `<div class="alert alert-info" style="margin-top:14px">권한 변경은 팀장만 할 수 있습니다.</div>`}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-title">${icon('wifi', 19)}팀원 접속 주소</div>
      <div class="share-box">
        ${icon('link', 20)}
        <div style="flex:1;min-width:0">
          <div class="share-url">${esc(host)}</div>
          <div style="font-size:12px;color:var(--ink-3);margin-top:2px">같은 네트워크(와이파이)에 연결된 팀원이 이 주소로 접속합니다.</div>
        </div>
        <button class="btn btn-soft" data-copy="${esc(host)}">주소 복사</button>
      </div>
    </div>`;
}

/* ------------------------------- 설정 ------------------------------- */

function viewSettings() {
  const theme = getTheme();
  const lizardOn = getLizardPetEnabled();
  const isPM = S.me.role === 'PM';
  const team = S.team || { name: 'B1H4' };
  return `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">${icon('team', 19)}팀</div>
      ${isPM ? `
        <div class="field">
          <label for="teamNameInput">팀 이름</label>
          <input class="input" id="teamNameInput" value="${esc(team.name)}" maxlength="30">
        </div>
        <button class="btn btn-soft" id="btnTeamSave" style="margin-bottom:16px">팀 이름 저장</button>

        <div class="card-title" style="margin-top:4px">${icon('link', 19)}초대 코드</div>
        <div class="share-box">
          ${icon('team', 20)}
          <div style="flex:1;min-width:0">
            <div class="share-url" style="letter-spacing:2px">${esc(team.code || '—')}</div>
            <div style="font-size:12px;color:var(--ink-3);margin-top:2px">팀원이 "팀 합류"에서 이 코드를 입력하면 ${esc(team.name)} 팀으로 들어옵니다.</div>
          </div>
          <button class="btn btn-soft" data-copy="${esc(team.code || '')}">코드 복사</button>
        </div>
        <button class="btn btn-danger" id="btnTeamCode" style="margin-top:10px">코드 새로 발급</button>
        <div style="font-size:11.5px;color:var(--ink-3);margin-top:6px;padding-left:3px">새로 발급하면 예전 코드는 즉시 막힙니다. 이미 합류한 팀원은 영향을 받지 않아요.</div>
      ` : `
        <div class="share-box">
          ${icon('team', 20)}
          <div style="flex:1;min-width:0">
            <div class="share-url">${esc(team.name)}</div>
            <div style="font-size:12px;color:var(--ink-3);margin-top:2px">팀원 ${S.users.length}명 · 팀 이름과 초대 코드는 팀장만 관리합니다.</div>
          </div>
        </div>
      `}
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">${icon('theme', 19)}테마</div>
      <div class="seg" id="themeSeg">
        <button type="button" data-theme-choice="light" class="${theme === 'dark' ? '' : 'on'}">라이트</button>
        <button type="button" data-theme-choice="dark" class="${theme === 'dark' ? 'on' : ''}">다크</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">${icon('web', 19)}챗봇 마우스 포인터</div>
      <div class="seg" id="lizardSeg">
        <button type="button" data-lizard-choice="on" class="${lizardOn ? 'on' : ''}">켜짐</button>
        <button type="button" data-lizard-choice="off" class="${lizardOn ? '' : 'on'}">꺼짐</button>
      </div>
      <div style="font-size:11.5px;color:var(--ink-3);margin-top:6px;padding-left:3px">챗봇 창에서 마우스를 따라다니는 포인터 캐릭터를 켜거나 끌 수 있어요.</div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">${icon('settings', 19)}프로필 사진</div>
      <div class="profile-photo-row">
        ${avatar(S.me, 'xl')}
        <div class="profile-photo-actions">
          <button class="btn btn-soft" id="btnAvatarPick">사진 변경</button>
          ${S.me.avatarUrl ? `<button class="btn btn-danger" id="btnAvatarReset">기본 이미지로</button>` : ''}
          <div class="profile-photo-hint">정사각형으로 잘려 표시돼요. 5MB 이하 이미지</div>
        </div>
        <input type="file" id="avatarFileInput" accept="image/*" style="display:none">
      </div>
    </div>
    <div class="card">
      <div class="card-title">${icon('settings', 19)}내 계정</div>
      <div class="two">
        <div class="field">
          <label for="pwCur">현재 비밀번호</label>
          <input class="input" id="pwCur" type="password" autocomplete="current-password">
        </div>
        <div class="field">
          <label for="pwNew">새 비밀번호</label>
          <input class="input" id="pwNew" type="password" autocomplete="new-password">
        </div>
      </div>
      <button class="btn btn-soft" id="btnPw">비밀번호 변경</button>
    </div>`;
}

/* ============================ 마크다운 / 슬래시 명령 ============================ */

function mdInline(text) {
  let t = esc(text);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  return t;
}

function renderMarkdown(src) {
  const rawLines = String(src || '').split('\n');
  let html = '';
  let list = null;
  const closeList = () => { if (list) { html += list === 'ul' ? '</ul>' : '</ol>'; list = null; } };

  rawLines.forEach(line => {
    const l = line.trim();
    if (!l) { closeList(); return; }
    let m;
    if ((m = l.match(/^(#{1,3})\s+(.*)$/))) {
      closeList();
      const lvl = m[1].length + 2;
      html += `<h${lvl} class="md-h">${mdInline(m[2])}</h${lvl}>`;
    } else if (l === '---' || l === '***') {
      closeList();
      html += '<hr class="md-hr">';
    } else if ((m = l.match(/^>\s?(.*)$/))) {
      closeList();
      html += `<blockquote class="md-quote">${mdInline(m[1])}</blockquote>`;
    } else if ((m = l.match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/))) {
      if (list !== 'ul') { closeList(); html += '<ul class="md-list md-tasks">'; list = 'ul'; }
      const checked = m[1].toLowerCase() === 'x';
      html += `<li class="md-task ${checked ? 'done' : ''}"><span class="md-check">${checked ? icon('check', 12) : ''}</span>${mdInline(m[2])}</li>`;
    } else if ((m = l.match(/^[-*]\s+(.*)$/))) {
      if (list !== 'ul') { closeList(); html += '<ul class="md-list">'; list = 'ul'; }
      html += `<li>${mdInline(m[1])}</li>`;
    } else if ((m = l.match(/^\d+\.\s+(.*)$/))) {
      if (list !== 'ol') { closeList(); html += '<ol class="md-list">'; list = 'ol'; }
      html += `<li>${mdInline(m[1])}</li>`;
    } else {
      closeList();
      html += `<p class="md-p">${mdInline(l)}</p>`;
    }
  });
  closeList();
  return html || `<p class="md-p" style="color:var(--ink-3)">내용 없음</p>`;
}

function renderWikiBody(src) {
  const html = renderMarkdown(src);
  return html.replace(/\[\[([^\]]+)\]\]/g, (match, raw) => {
    const title = raw.trim();
    const target = S.wikis.find(w => (w.title || '').toLowerCase() === title.toLowerCase());
    if (target) return `<a href="#" class="wiki-link" data-wiki-link="${esc(target.id)}">${esc(title)}</a>`;
    return `<a href="#" class="wiki-link missing" data-wiki-link-new="${esc(title)}" title="새 메모로 만들기">${esc(title)}</a>`;
  });
}

const SLASH_COMMANDS = [
  { key: 'h1', label: '제목 1', insert: '# ' },
  { key: 'h2', label: '제목 2', insert: '## ' },
  { key: 'h3', label: '제목 3', insert: '### ' },
  { key: 'bullet', label: '글머리 목록', insert: '- ' },
  { key: 'number', label: '번호 목록', insert: '1. ' },
  { key: 'todo', label: '체크박스', insert: '- [ ] ' },
  { key: 'quote', label: '인용구', insert: '> ' },
  { key: 'divider', label: '구분선', insert: '---\n' },
  { key: 'code', label: '코드', insert: '`코드`' }
];

function attachSlashMenu(textarea) {
  if (!textarea) return;
  let menuEl = null;
  const closeMenu = () => { if (menuEl) { menuEl.remove(); menuEl = null; } };

  textarea.addEventListener('input', () => {
    const pos = textarea.selectionStart;
    const before = textarea.value.slice(0, pos);
    const lineStart = before.lastIndexOf('\n') + 1;
    const currentLine = before.slice(lineStart);
    const m = currentLine.match(/^\/(\w*)$/);
    if (!m) { closeMenu(); return; }
    const query = m[1].toLowerCase();
    const matches = SLASH_COMMANDS.filter(c => c.label.toLowerCase().includes(query) || c.key.includes(query));
    if (!matches.length) { closeMenu(); return; }
    if (!menuEl) {
      menuEl = document.createElement('div');
      menuEl.className = 'slash-menu';
      const parent = textarea.parentElement;
      parent.style.position = 'relative';
      parent.appendChild(menuEl);
    }
    menuEl.innerHTML = matches.map(c => `<button type="button" data-slash="${esc(c.key)}">${esc(c.label)}</button>`).join('');
    menuEl.querySelectorAll('[data-slash]').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        const cmd = SLASH_COMMANDS.find(c => c.key === btn.dataset.slash);
        const newBefore = before.slice(0, lineStart) + cmd.insert;
        textarea.value = newBefore + textarea.value.slice(pos);
        const newPos = newBefore.length;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
        closeMenu();
      });
    });
  });

  textarea.addEventListener('blur', () => setTimeout(closeMenu, 150));
  textarea.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
}

function attachMentionMenu(inputEl) {
  if (!inputEl) return;
  let menuEl = null;
  let matches = [];
  let activeIdx = 0;
  let ctx = { before: '', pos: 0, atStart: 0 };

  const closeMenu = () => { if (menuEl) { menuEl.remove(); menuEl = null; } matches = []; };

  const highlight = () => {
    if (!menuEl) return;
    menuEl.querySelectorAll('[data-mention]').forEach((btn, idx) => {
      btn.classList.toggle('active', idx === activeIdx);
    });
    const activeBtn = menuEl.querySelector('[data-mention].active');
    if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest' });
  };

  const pick = u => {
    const newBefore = ctx.before.slice(0, ctx.atStart) + '@' + u.name + ' ';
    inputEl.value = newBefore + inputEl.value.slice(ctx.pos);
    const newPos = newBefore.length;
    inputEl.focus();
    inputEl.setSelectionRange(newPos, newPos);
    closeMenu();
  };

  inputEl.addEventListener('input', () => {
    const pos = inputEl.selectionStart;
    const before = inputEl.value.slice(0, pos);
    const m = before.match(/(?:^|\s)@([^\s@]*)$/);
    if (!m) { closeMenu(); return; }
    const query = m[1].toLowerCase();
    matches = S.users.filter(u => u.name.toLowerCase().includes(query)).slice(0, 6);
    if (!matches.length) { closeMenu(); return; }
    ctx = { before, pos, atStart: pos - m[1].length - 1 };
    activeIdx = 0;
    if (!menuEl) {
      menuEl = document.createElement('div');
      menuEl.className = 'slash-menu mention-menu';
      const parent = inputEl.parentElement;
      parent.style.position = 'relative';
      parent.appendChild(menuEl);
    }
    menuEl.innerHTML = matches.map(u => `<button type="button" data-mention="${u.id}">${avatar(u, 'sm')}<span>${esc(u.name)}</span></button>`).join('');
    menuEl.querySelectorAll('[data-mention]').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        pick(userById(btn.dataset.mention));
      });
    });
    highlight();
  });

  inputEl.addEventListener('blur', () => setTimeout(closeMenu, 150));
  inputEl.addEventListener('keydown', e => {
    if (!menuEl || !matches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = (activeIdx + 1) % matches.length;
      highlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = (activeIdx - 1 + matches.length) % matches.length;
      highlight();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      pick(matches[activeIdx]);
    } else if (e.key === 'Escape') {
      closeMenu();
    }
  });
}

function applyMdAction(ta, act) {
  const start = ta.selectionStart, end = ta.selectionEnd;
  const sel = ta.value.slice(start, end) || '텍스트';

  const wrap = (l, r) => {
    ta.value = ta.value.slice(0, start) + l + sel + r + ta.value.slice(end);
    ta.focus();
    ta.setSelectionRange(start + l.length, start + l.length + sel.length);
  };
  const linePrefix = p => {
    const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    ta.value = ta.value.slice(0, lineStart) + p + ta.value.slice(lineStart);
    ta.focus();
    ta.setSelectionRange(start + p.length, end + p.length);
  };

  if (act === 'bold') wrap('**', '**');
  else if (act === 'italic') wrap('*', '*');
  else if (act === 'code') wrap('`', '`');
  else if (act === 'h1') linePrefix('# ');
  else if (act === 'bullet') linePrefix('- ');
  else if (act === 'todo') linePrefix('- [ ] ');
  else if (act === 'quote') linePrefix('> ');
  ta.dispatchEvent(new Event('input'));
}

function mdToolbar(forId) {
  return `<div class="md-toolbar" data-for="${esc(forId)}">
    <button type="button" data-md="h1" title="제목">${icon('heading', 15)}</button>
    <button type="button" data-md="bold" title="굵게">${icon('bold', 15)}</button>
    <button type="button" data-md="italic" title="기울임">${icon('italic', 15)}</button>
    <button type="button" data-md="bullet" title="목록">${icon('list', 15)}</button>
    <button type="button" data-md="todo" title="체크박스">${icon('check', 15)}</button>
    <button type="button" data-md="quote" title="인용구">${icon('quote', 15)}</button>
  </div>
  <div class="md-hint">'/'를 입력하면 서식 메뉴가 열립니다</div>`;
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-md]');
  if (!btn) return;
  const toolbar = btn.closest('.md-toolbar');
  const ta = toolbar && document.getElementById(toolbar.dataset.for);
  if (ta) applyMdAction(ta, btn.dataset.md);
});

/* -------------------------------- 위키 -------------------------------- */

function filterWikiPages(q) {
  let pages = S.wikis.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  if (q) pages = pages.filter(p => (p.title || '').toLowerCase().includes(q) || (p.body || '').toLowerCase().includes(q));
  return pages;
}

function wikiListHTML(pages, q) {
  if (!pages.length) {
    return `<div class="empty">${icon('wiki', 30)}<strong>${q ? '검색 결과가 없습니다' : '메모가 없습니다'}</strong>${q ? '다른 검색어로 찾아보세요.' : '새 메모를 만들어 자유롭게 기록해 보세요.'}</div>`;
  }
  return `<div class="row-list">${pages.map(p => {
    const author = userById(p.authorId);
    const canEdit = p.authorId === S.me.id || S.me.role === 'PM';
    return `<div class="row ${p.id === S.wikiSelected ? 'sel' : ''}" data-wiki-open="${p.id}" role="button" tabindex="0">
      <span class="row-bar"></span>
      <div class="row-main">
        <div class="row-title">${esc(p.title || '제목 없음')}</div>
        <div class="row-meta"><span>${esc(author ? author.name : '알 수 없음')}</span><span>${fmtRelative(p.updatedAt)}</span></div>
      </div>
      ${canEdit ? `<button class="icon-btn" data-wiki-edit-list="${p.id}" title="수정" aria-label="수정">${icon('edit', 15)}</button>
      <button class="icon-btn" data-wiki-del="${p.id}" title="삭제" aria-label="삭제">${icon('trash', 15)}</button>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function viewWiki() {
  const q = S.wikiSearch.trim().toLowerCase();
  const pages = filterWikiPages(q);
  const current = pages.find(p => p.id === S.wikiSelected) || null;

  return `
    <div class="grid g-home">
      <div class="card">
        <div class="card-title">${icon('wiki', 19)}메모 목록<span class="spacer"></span>
          <button class="fchip" data-wiki-new="1" style="padding:4px 12px;font-size:12px">${icon('plus', 13)}새 메모</button>
        </div>
        <div class="search-wrap" style="width:100%;margin-bottom:12px">
          ${icon('search', 15)}
          <input id="wikiSearchInput" placeholder="제목·내용 검색" value="${esc(S.wikiSearch)}">
        </div>
        <div id="wikiListBox">${wikiListHTML(pages, q)}</div>
      </div>
      <div class="card">
        ${current ? wikiEditor(current) : `<div class="empty" style="padding:60px 20px">${icon('wiki', 34)}<strong>메모를 선택하세요</strong>왼쪽에서 메모를 고르거나 새 메모를 만들어 보세요.</div>`}
      </div>
    </div>`;
}

function wikiEditor(p) {
  const canEdit = p.authorId === S.me.id || S.me.role === 'PM';
  const author = userById(p.authorId);
  const editing = S.wikiEditing && canEdit;

  if (editing) {
    return `
      <div class="field">
        <label for="wTitle">메모 제목</label>
        <input class="input" id="wTitle" value="${esc(p.title || '')}" placeholder="메모 제목">
      </div>
      <div class="field">
        <label for="wBody">내용</label>
        ${mdToolbar('wBody')}
        <textarea class="textarea md-editor" id="wBody" style="min-height:280px" placeholder="자유롭게 기록하세요">${esc(p.body || '')}</textarea>
        <div class="md-hint">[[메모 제목]]을 입력하면 다른 메모로 연결되는 링크가 만들어져요</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="btn btn-soft" data-wiki-cancel="1">취소</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-wiki-save="${p.id}">저장</button>
      </div>`;
  }

  return `
    <div class="card-title">
      ${esc(p.title || '제목 없음')}<span class="spacer"></span>
    </div>
    <div class="row-meta" style="margin-bottom:14px">
      <span>${esc(author ? author.name : '알 수 없음')}</span><span>${fmtRelative(p.updatedAt)} 수정</span>
    </div>
    <div class="md-render">${renderWikiBody(p.body)}</div>
    <div style="display:flex;gap:8px;margin-top:18px">
      <button class="btn btn-soft" data-wiki-list="1">${icon('chevronLeft', 15)}목록으로</button>
      <span class="spacer"></span>
      ${canEdit ? `<button class="btn btn-danger narrow" data-wiki-del="${p.id}">${icon('trash', 16)}</button>
      <button class="btn btn-primary" data-wiki-edit="1">${icon('edit', 15)}편집</button>` : ''}
    </div>`;
}

function bindWikiEditor() {
  if (S.view !== 'wiki') return;
  if (S.wikiEditing) attachSlashMenu($('#wBody'));
  const searchInput = $('#wikiSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      S.wikiSearch = e.target.value;
      const q = S.wikiSearch.trim().toLowerCase();
      const box = $('#wikiListBox');
      if (box) box.innerHTML = wikiListHTML(filterWikiPages(q), q);
    });
  }
}

document.addEventListener('click', async e => {
  const wikiNew = e.target.closest('[data-wiki-new]');
  if (wikiNew) {
    try {
      const { page } = await api('POST', '/api/wiki', { title: '새 메모', body: '' });
      S.wikis.push(page);
      S.wikiSelected = page.id;
      S.wikiEditing = true;
      render();
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  const wikiDelList = e.target.closest('[data-wiki-del]');
  if (wikiDelList) {
    if (!confirm('이 메모를 삭제할까요?')) return;
    try {
      await api('DELETE', '/api/wiki/' + wikiDelList.dataset.wikiDel);
      S.wikis = S.wikis.filter(w => w.id !== wikiDelList.dataset.wikiDel);
      if (S.wikiSelected === wikiDelList.dataset.wikiDel) {
        S.wikiSelected = null;
        S.wikiEditing = false;
      }
      render();
      toast('메모를 삭제했습니다.');
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  const wikiEditList = e.target.closest('[data-wiki-edit-list]');
  if (wikiEditList) {
    S.wikiSelected = wikiEditList.dataset.wikiEditList;
    S.wikiEditing = true;
    render();
    return;
  }

  const wikiOpen = e.target.closest('[data-wiki-open]');
  if (wikiOpen) {
    S.wikiSelected = wikiOpen.dataset.wikiOpen;
    S.wikiEditing = false;
    render();
    return;
  }

  const wikiLink = e.target.closest('[data-wiki-link]');
  if (wikiLink) {
    e.preventDefault();
    S.wikiSelected = wikiLink.dataset.wikiLink;
    S.wikiEditing = false;
    render();
    return;
  }

  const wikiLinkNew = e.target.closest('[data-wiki-link-new]');
  if (wikiLinkNew) {
    e.preventDefault();
    try {
      const { page } = await api('POST', '/api/wiki', { title: wikiLinkNew.dataset.wikiLinkNew, body: '' });
      S.wikis.push(page);
      S.wikiSelected = page.id;
      S.wikiEditing = true;
      render();
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  const wikiEdit = e.target.closest('[data-wiki-edit]');
  if (wikiEdit) {
    S.wikiEditing = true;
    render();
    return;
  }

  const wikiCancel = e.target.closest('[data-wiki-cancel]');
  if (wikiCancel) {
    S.wikiEditing = false;
    render();
    return;
  }

  const wikiList = e.target.closest('[data-wiki-list]');
  if (wikiList) {
    S.wikiSelected = null;
    S.wikiEditing = false;
    render();
    return;
  }

  const wikiSave = e.target.closest('[data-wiki-save]');
  if (wikiSave) {
    const id = wikiSave.dataset.wikiSave;
    const title = $('#wTitle').value.trim();
    const body = $('#wBody').value;
    try {
      const { page } = await api('PATCH', '/api/wiki/' + id, { title: title || '제목 없음', body });
      Object.assign(S.wikis.find(w => w.id === page.id) || {}, page);
      S.wikiEditing = false;
      render();
      toast('메모를 저장했습니다.');
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

});

/* ------------------------------- 회의록 ------------------------------- */

const MEETING_TEMPLATES = {
  weekly: {
    label: '주간회의',
    body: '## 주간 스프린트 회의\n\n### 안건\n- \n\n### 논의 내용\n- \n\n### 결정 사항\n- \n'
  },
  idea: {
    label: '아이디어 회의',
    body: '## 아이디어 회의\n\n### 제안된 아이디어\n- \n\n### 논의\n- \n\n### 다음 액션\n- \n'
  },
  urgent: {
    label: '긴급 점검',
    body: '## 긴급 점검\n\n### 이슈 요약\n- \n\n### 원인 분석\n- \n\n### 대응 방안\n- \n'
  },
  free: {
    label: '자유 회의',
    body: '## 자유 회의\n\n### 내용\n- \n'
  }
};

function syncMeetingDraftFromDOM() {
  if (!S.meetingEditing) return;
  S.meetingActionDraft = $$('.action-item-row').map(row => ({
    text: row.querySelector('.ai-text').value,
    done: row.querySelector('.ai-done').checked,
    userId: row.querySelector('.ai-user').value || null,
    dueDate: row.querySelector('.ai-due').value || null
  }));
  S.meetingIssuesDraft = $$('.issue-row').map(row => row.querySelector('.issue-text').value);
  if ($('#mTitle')) {
    S.meetingFieldsDraft = {
      title: $('#mTitle').value,
      date: $('#mDate').value,
      agenda: $('#mAgenda').value,
      body: $('#mBody').value,
      attendeeIds: $$('.attendee-check input:checked').map(cb => cb.value)
    };
  }
}

function viewMeetings() {
  const meetings = S.meetings.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || new Date(b.updatedAt) - new Date(a.updatedAt));
  const current = meetings.find(m => m.id === S.meetingSelected) || null;

  return `
    <div class="grid g-home">
      <div class="card">
        <div class="card-title">${icon('story', 19)}회의록 목록<span class="spacer"></span>
          <button class="fchip" data-meeting-new="1" style="padding:4px 12px;font-size:12px">${icon('plus', 13)}새 회의록</button>
        </div>
        ${meetings.length ? `<div class="row-list">${meetings.map(m => {
          const attendees = (m.attendeeIds || []).map(userById).filter(Boolean);
          const canEdit = m.authorId === S.me.id || S.me.role === 'PM';
          return `<div class="row ${m.id === S.meetingSelected ? 'sel' : ''}" data-meeting-open="${m.id}" role="button" tabindex="0">
            <span class="row-bar"></span>
            <div class="row-main">
              <div class="row-title">${esc(m.title || '제목 없음')}</div>
              <div class="row-meta">
                <span>${fmtDate(m.date)}</span>
                ${attendees.length ? `<span>참석 ${attendees.length}명</span>` : ''}
              </div>
            </div>
            ${canEdit && !m.finalized ? `<button class="icon-btn" data-meeting-edit-list="${m.id}" title="수정" aria-label="수정">${icon('edit', 15)}</button>` : ''}
            ${canEdit ? `<button class="icon-btn" data-meeting-del="${m.id}" title="삭제" aria-label="삭제">${icon('trash', 15)}</button>` : ''}
          </div>`;
        }).join('')}</div>` : `<div class="empty">${icon('story', 30)}<strong>회의록이 없습니다</strong>새 회의록을 만들어 회의 내용을 기록해 보세요.</div>`}
      </div>
      <div class="card">
        ${current ? meetingEditor(current) : `<div class="empty" style="padding:60px 20px">${icon('story', 34)}<strong>회의록을 선택하세요</strong>왼쪽에서 회의록을 고르거나 새로 만들어 보세요.</div>`}
      </div>
    </div>`;
}

function meetingEditor(m) {
  const canEdit = m.authorId === S.me.id || S.me.role === 'PM';
  const author = userById(m.authorId);
  const editing = S.meetingEditing && canEdit && !m.finalized;
  const attendees = (m.attendeeIds || []).map(userById).filter(Boolean);

  if (editing) {
    const actionDraft = S.meetingActionDraft;
    const issuesDraft = S.meetingIssuesDraft;
    const fd = S.meetingFieldsDraft || {};
    const fTitle = fd.title !== undefined ? fd.title : (m.title || '');
    const fDate = fd.date !== undefined ? fd.date : (m.date || todayISO());
    const fAgenda = fd.agenda !== undefined ? fd.agenda : (m.agenda || '');
    const fBody = fd.body !== undefined ? fd.body : (m.body || '');
    const fAttendeeIds = fd.attendeeIds || (m.attendeeIds || []);
    return `
      <div class="field">
        <label for="mDate">날짜</label>
        <input class="input" id="mDate" type="date" value="${esc(fDate)}">
      </div>
      <div class="field">
        <label for="mTitle">회의 제목</label>
        <input class="input" id="mTitle" value="${esc(fTitle)}" placeholder="주간 스프린트 회의">
      </div>
      <div class="field">
        <label for="mTemplate">템플릿</label>
        <select class="input" id="mTemplate">
          <option value="">템플릿 선택...</option>
          ${Object.entries(MEETING_TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="mAgenda">현재 안건</label>
        <input class="input" id="mAgenda" value="${esc(fAgenda)}" placeholder="예: 2분기 마케팅 예산 편성">
      </div>
      <div class="field">
        <label>참석자<button type="button" class="fchip" data-meeting-attendees-fill="1" style="margin-left:8px;padding:2px 10px;font-size:11px">${icon('team', 12)}지금 접속 중인 팀원으로 채우기</button></label>
        <div class="attendee-picker">
          ${S.users.map(u => `
            <label class="attendee-check">
              <input type="checkbox" value="${u.id}" ${fAttendeeIds.includes(u.id) ? 'checked' : ''}>
              ${avatar(u, 'sm')}<span>${esc(u.name)}</span>
            </label>`).join('')}
        </div>
      </div>
      <div class="field">
        <label for="mBody">내용</label>
        <textarea class="textarea md-editor" id="mBody" style="min-height:220px" placeholder="안건, 논의 내용, 결정사항. '- [ ] '로 액션 아이템도 체크박스로 남길 수 있어요">${esc(fBody)}</textarea>
        <div style="margin-top:8px">${mdToolbar('mBody')}</div>
      </div>
      <div class="field">
        <label>액션 아이템<button type="button" class="fchip" data-meeting-item-add="1" style="margin-left:8px;padding:2px 10px;font-size:11px">${icon('plus', 12)}추가</button></label>
        <div class="action-item-list">
          ${actionDraft.length ? actionDraft.map((it, idx) => `
            <div class="action-item-row" data-idx="${idx}">
              <input type="checkbox" class="ai-done" ${it.done ? 'checked' : ''}>
              <input type="text" class="input ai-text" value="${esc(it.text)}" placeholder="할 일">
              <select class="input ai-user">
                <option value="">담당자</option>
                ${S.users.map(u => `<option value="${u.id}" ${it.userId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
              </select>
              <input type="date" class="input ai-due" value="${esc(it.dueDate || '')}">
              <button type="button" class="icon-btn narrow" data-meeting-item-del="${idx}">${icon('trash', 14)}</button>
            </div>`).join('') : `<div class="empty-hint">액션 아이템이 없습니다</div>`}
        </div>
      </div>
      <div class="field">
        <label>이슈사항<button type="button" class="fchip" data-meeting-issue-add="1" style="margin-left:8px;padding:2px 10px;font-size:11px">${icon('plus', 12)}추가</button></label>
        <div class="issue-list">
          ${issuesDraft.length ? issuesDraft.map((txt, idx) => `
            <div class="issue-row" data-idx="${idx}">
              <input type="text" class="input issue-text" value="${esc(txt)}" placeholder="이슈 내용">
              <button type="button" class="icon-btn narrow" data-meeting-issue-del="${idx}">${icon('trash', 14)}</button>
            </div>`).join('') : `<div class="empty-hint">이슈사항이 없습니다</div>`}
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="btn btn-soft" data-meeting-cancel="1">취소</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-meeting-save="${m.id}">저장</button>
      </div>`;
  }

  const actionItems = m.actionItems || [];
  const issues = m.issues || [];

  return `
    <div class="card-title">${esc(m.title || '제목 없음')}${m.finalized ? `<span class="chip pink" style="margin-left:8px">${icon('check', 11)}확정됨</span>` : ''}</div>
    <div class="row-meta" style="margin-bottom:10px">
      <span>${fmtDate(m.date)}</span><span>${esc(author ? author.name : '알 수 없음')} 작성</span>
    </div>
    ${m.agenda ? `<div class="meeting-agenda"><span class="meeting-agenda-label">현재 안건</span><span class="meeting-agenda-text">${esc(m.agenda)}</span></div>` : ''}
    ${attendees.length ? `<div class="meeting-attendees">${attendees.map(u => `<span class="meeting-attendee">${avatar(u, 'sm')}${esc(u.name)}</span>`).join('')}</div>` : ''}
    <div class="md-render" style="margin-top:14px">${renderMarkdown(m.body)}</div>
    ${actionItems.length ? `
    <div class="field" style="margin-top:16px">
      <label>액션 아이템</label>
      <div class="action-item-list readonly">
        ${actionItems.map((it, idx) => {
          const u = it.userId ? userById(it.userId) : null;
          return `<div class="action-item-row readonly ${it.done ? 'done' : ''}">
            <label class="attendee-check" style="flex:1">
              <input type="checkbox" ${it.done ? 'checked' : ''} ${canEdit && !m.finalized ? `data-meeting-item-toggle="${m.id}:${idx}"` : 'disabled'}>
              <span>${esc(it.text)}</span>
            </label>
            ${u ? `<span class="chip" style="font-size:11px">${esc(u.name)}</span>` : ''}
            ${it.dueDate ? `<span class="row-meta"><span>${fmtDate(it.dueDate)}</span></span>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}
    ${issues.length ? `
    <div class="field" style="margin-top:16px">
      <label>이슈사항</label>
      <ul class="issue-view-list">
        ${issues.map(x => `<li>${esc(x)}</li>`).join('')}
      </ul>
    </div>` : ''}
    ${meetingPollHTML(m)}
    <div class="card-title" style="margin-top:20px">${icon('comment', 18)}댓글</div>
    <div id="mCmtList"><div class="empty" style="padding:18px">불러오는 중</div></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <input class="input" id="mCmtInput" placeholder="댓글 입력 · @이름으로 팀원을 부를 수 있습니다" style="flex:1">
      <button class="btn btn-primary" id="mCmtSend">등록</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap">
      <button class="btn btn-soft" data-meeting-list="1">${icon('chevronLeft', 15)}목록으로</button>
      <div class="dropdown-wrap" style="position:relative">
        <button class="btn btn-soft" data-meeting-export-menu="1">${icon('share', 15)}내보내기</button>
        <div class="export-menu" id="meetingExportMenu" style="display:none">
          <button data-meeting-export="txt">${icon('story', 14)}TXT 다운로드</button>
          <button data-meeting-export="html">${icon('web', 14)}HTML 다운로드</button>
          <button data-meeting-export="pdf">${icon('story', 14)}PDF 출력</button>
          <button data-meeting-export="hwp">${icon('story', 14)}HWP 호환 다운로드</button>
        </div>
      </div>
      <span class="spacer"></span>
      ${canEdit ? `
        ${m.finalized
          ? `<button class="btn btn-soft" data-meeting-unfinalize="${m.id}">${icon('close', 15)}확정 취소</button>`
          : `<button class="btn btn-soft" data-meeting-finalize="${m.id}">${icon('check', 15)}확정하기</button>`}
        <button class="btn btn-danger narrow" data-meeting-del="${m.id}">${icon('trash', 16)}</button>
        ${!m.finalized ? `<button class="btn btn-primary" data-meeting-edit="1">${icon('edit', 15)}편집</button>` : ''}
      ` : ''}
    </div>`;
}

function meetingPollHTML(m) {
  const p = m.poll;
  if (!p) {
    const canManage = m.authorId === S.me.id || S.me.role === 'PM';
    if (!canManage || m.finalized) return '';
    return `
    <div class="field" style="margin-top:16px">
      <label>투표</label>
      <button class="fchip" data-meeting-poll-new="${m.id}">${icon('plus', 13)}투표 만들기</button>
    </div>`;
  }
  const totalVotes = p.options.reduce((sum, o) => sum + o.votes, 0);
  const myVoted = p.voterIds.includes(S.me.id);
  const canManage = m.authorId === S.me.id || S.me.role === 'PM';
  return `
    <div class="field poll-card" style="margin-top:16px">
      <label>투표${p.closed ? '<span class="chip plain" style="margin-left:6px">종료됨</span>' : ''}</label>
      <div class="poll-question">${esc(p.question)}</div>
      <div class="poll-options">
        ${p.options.map((o, idx) => {
          const pct = totalVotes ? Math.round((o.votes / totalVotes) * 100) : 0;
          const clickable = !p.closed && !myVoted && !m.finalized;
          return `<button type="button" class="poll-option ${myVoted || p.closed ? 'voted' : ''}" ${clickable ? `data-meeting-poll-vote="${m.id}:${idx}"` : 'disabled'}>
            <span class="poll-option-top"><span class="poll-option-text">${esc(o.text)}</span><span class="poll-option-pct">${o.votes}표 · ${pct}%</span></span>
            <span class="bar-track"><span class="bar-fill" data-pct="${pct}" style="width:${pct}%"></span></span>
          </button>`;
        }).join('')}
      </div>
      <div class="row-meta" style="margin-top:6px">
        <span>총 ${totalVotes}표</span>
        ${canManage && !p.closed && !m.finalized ? `<button class="fchip" data-meeting-poll-close="${m.id}" style="padding:3px 10px;font-size:11px">투표 종료</button>` : ''}
      </div>
    </div>`;
}

function bindMeetingEditor() {
  if (S.view !== 'meetings') return;
  if (S.meetingEditing) { attachSlashMenu($('#mBody')); return; }
  if (S.meetingSelected && $('#mCmtList')) {
    loadMeetingComments(S.meetingSelected);
    attachMentionMenu($('#mCmtInput'));
  }
}

document.addEventListener('click', async e => {
  const meetingNew = e.target.closest('[data-meeting-new]');
  if (meetingNew) {
    try {
      const attendeeIds = S.online.filter(id => S.users.some(u => u.id === id));
      const { meeting } = await api('POST', '/api/meetings', { title: '새 회의록', date: todayISO(), attendeeIds, body: '' });
      S.meetings.push(meeting);
      S.meetingSelected = meeting.id;
      S.meetingEditing = true;
      S.meetingActionDraft = [];
      S.meetingIssuesDraft = [];
      S.meetingFieldsDraft = null;
      render();
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  const meetingDelList = e.target.closest('[data-meeting-del]');
  if (meetingDelList) {
    if (!confirm('이 회의록을 삭제할까요?')) return;
    try {
      await api('DELETE', '/api/meetings/' + meetingDelList.dataset.meetingDel);
      S.meetings = S.meetings.filter(x => x.id !== meetingDelList.dataset.meetingDel);
      if (S.meetingSelected === meetingDelList.dataset.meetingDel) {
        S.meetingSelected = null;
        S.meetingEditing = false;
      }
      render();
      toast('회의록을 삭제했습니다.');
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  const meetingEditList = e.target.closest('[data-meeting-edit-list]');
  if (meetingEditList) {
    const id = meetingEditList.dataset.meetingEditList;
    const m = S.meetings.find(x => x.id === id);
    S.meetingSelected = id;
    S.meetingActionDraft = ((m && m.actionItems) || []).map(x => ({ ...x }));
    S.meetingIssuesDraft = ((m && m.issues) || []).slice();
    S.meetingFieldsDraft = null;
    S.meetingEditing = true;
    render();
    return;
  }

  const meetingOpen = e.target.closest('[data-meeting-open]');
  if (meetingOpen) {
    S.meetingSelected = meetingOpen.dataset.meetingOpen;
    S.meetingEditing = false;
    render();
    return;
  }

  const meetingEdit = e.target.closest('[data-meeting-edit]');
  if (meetingEdit) {
    const m = S.meetings.find(x => x.id === S.meetingSelected);
    S.meetingActionDraft = ((m && m.actionItems) || []).map(x => ({ ...x }));
    S.meetingIssuesDraft = ((m && m.issues) || []).slice();
    S.meetingFieldsDraft = null;
    S.meetingEditing = true;
    render();
    return;
  }

  const meetingCancel = e.target.closest('[data-meeting-cancel]');
  if (meetingCancel) {
    S.meetingEditing = false;
    S.meetingFieldsDraft = null;
    render();
    return;
  }

  const meetingList = e.target.closest('[data-meeting-list]');
  if (meetingList) {
    S.meetingSelected = null;
    S.meetingEditing = false;
    render();
    return;
  }

  const attendeesFill = e.target.closest('[data-meeting-attendees-fill]');
  if (attendeesFill) {
    $$('.attendee-check input').forEach(cb => { if (S.online.includes(cb.value)) cb.checked = true; });
    toast('접속 중인 팀원을 참석자로 채웠습니다.');
    return;
  }

  const itemAdd = e.target.closest('[data-meeting-item-add]');
  if (itemAdd) {
    syncMeetingDraftFromDOM();
    S.meetingActionDraft.push({ text: '', done: false, userId: null, dueDate: null });
    render();
    return;
  }

  const itemDel = e.target.closest('[data-meeting-item-del]');
  if (itemDel) {
    syncMeetingDraftFromDOM();
    S.meetingActionDraft.splice(Number(itemDel.dataset.meetingItemDel), 1);
    render();
    return;
  }

  const issueAdd = e.target.closest('[data-meeting-issue-add]');
  if (issueAdd) {
    syncMeetingDraftFromDOM();
    S.meetingIssuesDraft.push('');
    render();
    return;
  }

  const issueDel = e.target.closest('[data-meeting-issue-del]');
  if (issueDel) {
    syncMeetingDraftFromDOM();
    S.meetingIssuesDraft.splice(Number(issueDel.dataset.meetingIssueDel), 1);
    render();
    return;
  }

  const meetingSave = e.target.closest('[data-meeting-save]');
  if (meetingSave) {
    const id = meetingSave.dataset.meetingSave;
    syncMeetingDraftFromDOM();
    const title = $('#mTitle').value.trim();
    const date = $('#mDate').value;
    const agenda = $('#mAgenda').value.trim();
    const body = $('#mBody').value;
    const attendeeIds = $$('.attendee-check input:checked').map(cb => cb.value);
    try {
      const { meeting } = await api('PATCH', '/api/meetings/' + id, {
        title: title || '제목 없음', date, agenda, attendeeIds, body,
        actionItems: S.meetingActionDraft, issues: S.meetingIssuesDraft
      });
      Object.assign(S.meetings.find(x => x.id === meeting.id) || {}, meeting);
      S.meetingEditing = false;
      S.meetingFieldsDraft = null;
      render();
      toast('회의록을 저장했습니다.');
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  const itemToggle = e.target.closest('[data-meeting-item-toggle]');
  if (itemToggle) {
    const [mid, idxStr] = itemToggle.dataset.meetingItemToggle.split(':');
    const idx = Number(idxStr);
    const m = S.meetings.find(x => x.id === mid);
    if (!m) return;
    const items = (m.actionItems || []).map(x => ({ ...x }));
    if (!items[idx]) return;
    items[idx].done = itemToggle.checked;
    try {
      const { meeting } = await api('PATCH', '/api/meetings/' + mid, { actionItems: items });
      Object.assign(m, meeting);
      render();
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  const meetingFinalize = e.target.closest('[data-meeting-finalize]');
  if (meetingFinalize) {
    if (!confirm('회의록을 확정할까요? 확정 후에는 확정을 취소하기 전까지 수정할 수 없습니다.')) return;
    try {
      const { meeting } = await api('POST', '/api/meetings/' + meetingFinalize.dataset.meetingFinalize + '/finalize', {});
      Object.assign(S.meetings.find(x => x.id === meeting.id) || {}, meeting);
      render();
      toast('회의록을 확정했습니다.');
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  const meetingUnfinalize = e.target.closest('[data-meeting-unfinalize]');
  if (meetingUnfinalize) {
    try {
      const { meeting } = await api('POST', '/api/meetings/' + meetingUnfinalize.dataset.meetingUnfinalize + '/unfinalize', {});
      Object.assign(S.meetings.find(x => x.id === meeting.id) || {}, meeting);
      render();
      toast('확정을 취소했습니다.');
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  const pollNew = e.target.closest('[data-meeting-poll-new]');
  if (pollNew) { openMeetingPollForm(pollNew.dataset.meetingPollNew); return; }

  const pollVote = e.target.closest('[data-meeting-poll-vote]');
  if (pollVote) {
    const [mid, idxStr] = pollVote.dataset.meetingPollVote.split(':');
    try {
      const { meeting } = await api('POST', '/api/meetings/' + mid + '/poll/vote', { optionIndex: Number(idxStr) });
      Object.assign(S.meetings.find(x => x.id === meeting.id) || {}, meeting);
      render();
      toast('투표했습니다.');
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  const pollClose = e.target.closest('[data-meeting-poll-close]');
  if (pollClose) {
    if (!confirm('투표를 종료할까요?')) return;
    try {
      const { meeting } = await api('POST', '/api/meetings/' + pollClose.dataset.meetingPollClose + '/poll/close', {});
      Object.assign(S.meetings.find(x => x.id === meeting.id) || {}, meeting);
      render();
      toast('투표를 종료했습니다.');
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  const exportMenuBtn = e.target.closest('[data-meeting-export-menu]');
  if (exportMenuBtn) {
    const menu = $('#meetingExportMenu');
    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    return;
  }

  const exportBtn = e.target.closest('[data-meeting-export]');
  if (exportBtn) {
    const menu = $('#meetingExportMenu');
    if (menu) menu.style.display = 'none';
    const m = S.meetings.find(x => x.id === S.meetingSelected);
    if (m) exportMeeting(m, exportBtn.dataset.meetingExport);
    return;
  }

  if (!e.target.closest('.dropdown-wrap')) {
    const menu = $('#meetingExportMenu');
    if (menu) menu.style.display = 'none';
  }
});

document.addEventListener('change', e => {
  const tpl = e.target.closest('#mTemplate');
  if (tpl && tpl.value) {
    const t = MEETING_TEMPLATES[tpl.value];
    if (t) {
      const body = $('#mBody');
      if (!body.value.trim() || confirm('현재 작성된 내용을 템플릿으로 덮어쓸까요?')) {
        body.value = t.body;
      }
      tpl.value = '';
    }
  }
});

/* ------------------------------- 회의록 투표 ------------------------------- */

function openMeetingPollForm(meetingId) {
  let optionCount = 2;

  openModal(`
    <div class="modal-head">
      <div style="flex:1">
        <div class="modal-title">투표 만들기</div>
        <div class="modal-sub">선택지 2~4개</div>
      </div>
      <button class="icon-btn" data-close="1">${icon('close', 18)}</button>
    </div>
    <div id="pollFormAlert"></div>
    <div class="field">
      <label for="pollQuestion">질문</label>
      <input class="input" id="pollQuestion" placeholder="예: 회의 날짜를 언제로 할까요?">
    </div>
    <div class="field">
      <label>선택지</label>
      <div id="pollOptionList">
        <input class="input poll-option-input" style="margin-bottom:8px" placeholder="선택지 1">
        <input class="input poll-option-input" style="margin-bottom:8px" placeholder="선택지 2">
      </div>
      <button type="button" class="fchip" id="pollOptionAdd">${icon('plus', 12)}선택지 추가</button>
    </div>
    <div class="modal-foot">
      <button class="btn btn-soft" data-close="1">취소</button>
      <button class="btn btn-primary" id="pollFormSave">투표 만들기</button>
    </div>`, false, 'flex-modal');

  $('#pollOptionAdd').addEventListener('click', () => {
    if (optionCount >= 4) return;
    optionCount += 1;
    const input = document.createElement('input');
    input.className = 'input poll-option-input';
    input.style.marginBottom = '8px';
    input.placeholder = `선택지 ${optionCount}`;
    $('#pollOptionList').appendChild(input);
    if (optionCount >= 4) $('#pollOptionAdd').style.display = 'none';
  });

  $('#pollFormSave').addEventListener('click', async () => {
    const question = $('#pollQuestion').value.trim();
    const options = $$('.poll-option-input').map(inp => inp.value.trim()).filter(Boolean);
    if (!question || options.length < 2) {
      $('#pollFormAlert').innerHTML = '<div class="alert">질문과 선택지 2개 이상을 입력하세요.</div>';
      return;
    }
    try {
      const { meeting } = await api('POST', '/api/meetings/' + meetingId + '/poll', { question, options });
      Object.assign(S.meetings.find(x => x.id === meeting.id) || {}, meeting);
      closeModal();
      render();
      toast('투표를 만들었습니다.');
    } catch (err) {
      $('#pollFormAlert').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    }
  });
}

/* ------------------------------- 회의록 댓글 ------------------------------- */

let editingMeetingCommentId = null;

async function loadMeetingComments(meetingId) {
  const box = $('#mCmtList');
  if (!box) return;
  const { comments } = await api('GET', `/api/meetings/${meetingId}/comments`);
  if (!comments.length) {
    box.innerHTML = `<div class="empty" style="padding:20px">${icon('comment', 26)}<strong>첫 댓글을 남겨보세요</strong>회의록에 대한 의견을 남겨보세요.</div>`;
    return;
  }
  box.innerHTML = comments.map(c => {
    const author = userById(c.authorId);
    const canDel = c.authorId === S.me.id || S.me.role === 'PM';
    const canEdit = c.authorId === S.me.id;

    if (editingMeetingCommentId === c.id) {
      return `<div class="cmt">
        ${avatar(author, 'sm')}
        <div class="cmt-body">
          <div class="cmt-head"><span class="cmt-name">${esc(author ? author.name : '알 수 없음')}</span></div>
          <textarea class="textarea" id="mCmtEdit-${c.id}" style="min-height:60px">${esc(c.body)}</textarea>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn btn-soft narrow" data-mcmt-edit-cancel="${c.id}" style="padding:6px 13px;font-size:12.5px">취소</button>
            <button class="btn btn-primary narrow" data-mcmt-edit-save="${c.id}" style="padding:6px 13px;font-size:12.5px">저장</button>
          </div>
        </div>
      </div>`;
    }

    let text = esc(c.body);
    S.users.forEach(u => {
      text = text.split('@' + esc(u.name)).join(`<span class="mention">@${esc(u.name)}</span>`);
    });
    return `<div class="cmt">
      ${avatar(author, 'sm')}
      <div class="cmt-body">
        <div class="cmt-head">
          <span class="cmt-name">${esc(author ? author.name : '알 수 없음')}</span>
          <span class="cmt-time">${fmtRelative(c.createdAt)}${c.editedAt ? ' · 수정됨' : ''}</span>
          <span style="margin-left:auto;display:flex;gap:2px">
            ${canEdit ? `<button class="cmt-action" data-mcmt-edit="${c.id}" title="수정">${icon('edit', 14)}</button>` : ''}
            ${canDel ? `<button class="cmt-action danger" data-mcmt-del="${c.id}" title="삭제">${icon('trash', 14)}</button>` : ''}
          </span>
        </div>
        <div class="cmt-text">${text}</div>
      </div>
    </div>`;
  }).join('');
}

document.addEventListener('click', async e => {
  const del = e.target.closest('[data-mcmt-del]');
  if (del) {
    if (!confirm('이 댓글을 삭제할까요?')) return;
    await api('DELETE', '/api/comments/' + del.dataset.mcmtDel);
    if (S.meetingSelected) loadMeetingComments(S.meetingSelected);
    return;
  }

  const editBtn = e.target.closest('[data-mcmt-edit]');
  if (editBtn) {
    editingMeetingCommentId = editBtn.dataset.mcmtEdit;
    if (S.meetingSelected) loadMeetingComments(S.meetingSelected);
    return;
  }

  const editCancel = e.target.closest('[data-mcmt-edit-cancel]');
  if (editCancel) {
    editingMeetingCommentId = null;
    if (S.meetingSelected) loadMeetingComments(S.meetingSelected);
    return;
  }

  const editSave = e.target.closest('[data-mcmt-edit-save]');
  if (editSave) {
    const id = editSave.dataset.mcmtEditSave;
    const ta = $('#mCmtEdit-' + id);
    const body = ta ? ta.value.trim() : '';
    if (!body) return;
    try {
      await api('PATCH', '/api/comments/' + id, { body });
      editingMeetingCommentId = null;
      if (S.meetingSelected) loadMeetingComments(S.meetingSelected);
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  if (e.target.closest('#mCmtSend')) {
    const input = $('#mCmtInput');
    const body = input.value.trim();
    if (!body || !S.meetingSelected) return;
    try {
      await api('POST', `/api/meetings/${S.meetingSelected}/comments`, { body });
      input.value = '';
      loadMeetingComments(S.meetingSelected);
    } catch (err) { toast(err.message, 'warn'); }
  }
});

document.addEventListener('keydown', e => {
  if (e.target && e.target.id === 'mCmtInput' && e.key === 'Enter') {
    e.preventDefault();
    $('#mCmtSend').click();
  }
});

/* ------------------------------- 회의록 내보내기 ------------------------------- */

function mdToPlainText(md) {
  const div = document.createElement('div');
  div.innerHTML = renderMarkdown(md || '');
  return div.textContent.trim();
}

function meetingExportFileBase(m) {
  return `회의록_${(m.title || '제목없음').replace(/[\\/:*?"<>|]/g, '_')}_${m.date || todayISO()}`;
}

function meetingExportSections(m) {
  const attendees = (m.attendeeIds || []).map(userById).filter(Boolean).map(u => u.name);
  const author = userById(m.authorId);
  return {
    title: m.title || '제목 없음',
    date: fmtDate(m.date),
    author: author ? author.name : '알 수 없음',
    agenda: m.agenda || '',
    attendees,
    bodyText: mdToPlainText(m.body),
    bodyHtml: renderMarkdown(m.body || ''),
    actionItems: m.actionItems || [],
    issues: m.issues || [],
    poll: m.poll
  };
}

function triggerBlobDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildMeetingTxt(m) {
  const s = meetingExportSections(m);
  const lines = [
    s.title,
    `날짜: ${s.date}`,
    `작성자: ${s.author}`,
    s.agenda ? `현재 안건: ${s.agenda}` : '',
    s.attendees.length ? `참석자: ${s.attendees.join(', ')}` : '',
    '',
    '[회의 내용]',
    s.bodyText || '(내용 없음)',
    ''
  ];
  if (s.actionItems.length) {
    lines.push('[액션 아이템]');
    s.actionItems.forEach(it => {
      const u = it.userId ? userById(it.userId) : null;
      lines.push(`- [${it.done ? 'x' : ' '}] ${it.text}${u ? ` (담당: ${u.name})` : ''}${it.dueDate ? ` (마감: ${it.dueDate})` : ''}`);
    });
    lines.push('');
  }
  if (s.issues.length) {
    lines.push('[이슈사항]');
    s.issues.forEach(x => lines.push(`- ${x}`));
    lines.push('');
  }
  if (s.poll) {
    lines.push('[투표]');
    lines.push(s.poll.question);
    s.poll.options.forEach(o => lines.push(`- ${o.text}: ${o.votes}표`));
  }
  return lines.filter((l, i) => l !== '' || (lines[i - 1] !== '' && i > 0)).join('\n');
}

function buildMeetingHtml(m) {
  const s = meetingExportSections(m);
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${esc(s.title)}</title>
<style>
  body { font-family: -apple-system, "Malgun Gothic", sans-serif; color:#17303F; max-width:720px; margin:40px auto; padding:0 20px; line-height:1.6; }
  h1 { font-size:22px; margin-bottom:6px; }
  .meta { color:#7C919D; font-size:13px; margin-bottom:18px; }
  .agenda { background:#F4FAFF; border-left:4px solid #55ACE0; padding:10px 14px; margin-bottom:18px; font-weight:600; }
  h2 { font-size:16px; margin:22px 0 8px; border-bottom:1px solid #eee; padding-bottom:4px; }
  ul { padding-left:20px; }
  .done { text-decoration:line-through; color:#7C919D; }
  @media print { body { margin:0; padding:16px; } }
</style></head>
<body>
  <h1>${esc(s.title)}</h1>
  <div class="meta">${esc(s.date)} · 작성자 ${esc(s.author)}${s.attendees.length ? ' · 참석자 ' + esc(s.attendees.join(', ')) : ''}</div>
  ${s.agenda ? `<div class="agenda">현재 안건: ${esc(s.agenda)}</div>` : ''}
  <h2>회의 내용</h2>
  ${s.bodyHtml || '<p>(내용 없음)</p>'}
  ${s.actionItems.length ? `<h2>액션 아이템</h2><ul>${s.actionItems.map(it => {
    const u = it.userId ? userById(it.userId) : null;
    return `<li class="${it.done ? 'done' : ''}">${esc(it.text)}${u ? ' - ' + esc(u.name) : ''}${it.dueDate ? ' (' + esc(it.dueDate) + ')' : ''}</li>`;
  }).join('')}</ul>` : ''}
  ${s.issues.length ? `<h2>이슈사항</h2><ul>${s.issues.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  ${s.poll ? `<h2>투표</h2><p>${esc(s.poll.question)}</p><ul>${s.poll.options.map(o => `<li>${esc(o.text)}: ${o.votes}표</li>`).join('')}</ul>` : ''}
</body></html>`;
}

function buildMeetingHwpml(m) {
  const s = meetingExportSections(m);
  const roster = S.roster || [];
  const actionsByUser = {};
  s.actionItems.forEach(it => {
    const u = it.userId ? userById(it.userId) : null;
    const key = u ? u.name : '미지정';
    if (!actionsByUser[key]) actionsByUser[key] = [];
    actionsByUser[key].push(it);
  });
  const progressTotal = s.actionItems.length;
  const progressDone = s.actionItems.filter(it => it.done).length;
  const progressPct = progressTotal ? Math.round((progressDone / progressTotal) * 100) : 0;

  function para(text) { return `<HP:P><HP:RUN CharShapeIDRef="0"><HP:T>${esc(text || ' ')}</HP:T></HP:RUN></HP:P>`; }

  const bodyParas = (s.bodyText || '(내용 없음)').split('\n').map(para).join('');

  const memberRows = roster.length
    ? roster.map(p => `<HP:TR><HP:TC><HP:SUBLIST>${para(p.name)}</HP:SUBLIST></HP:TC><HP:TC><HP:SUBLIST>${para(p.title)}</HP:SUBLIST></HP:TC></HP:TR>`).join('')
    : `<HP:TR><HP:TC><HP:SUBLIST>${para('-')}</HP:SUBLIST></HP:TC><HP:TC><HP:SUBLIST>${para('-')}</HP:SUBLIST></HP:TC></HP:TR>`;

  const progressRows = Object.keys(actionsByUser).length
    ? Object.entries(actionsByUser).map(([name, items]) => `<HP:TR><HP:TC><HP:SUBLIST>${para(name)}</HP:SUBLIST></HP:TC><HP:TC><HP:SUBLIST>${items.map(it => para(it.text)).join('')}</HP:SUBLIST></HP:TC><HP:TC><HP:SUBLIST>${para(items.map(it => it.done ? '완료' : (it.dueDate || '진행중')).join(', '))}</HP:SUBLIST></HP:TC></HP:TR>`).join('')
    : `<HP:TR><HP:TC><HP:SUBLIST>${para('-')}</HP:SUBLIST></HP:TC><HP:TC><HP:SUBLIST>${para('-')}</HP:SUBLIST></HP:TC><HP:TC><HP:SUBLIST>${para('-')}</HP:SUBLIST></HP:TC></HP:TR>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<HWPML Version="2.9" Style="OfficeInternational" SubVersion="8.0.0.1">
<HEAD SecCnt="1">
<DOCSUMMARY><TITLE>${esc(s.title)}</TITLE></DOCSUMMARY>
<MAPPINGTABLE>
<FONTFACELIST Lang="HANGUL"><FONTFACE Id="0" Name="맑은 고딕" Type="TTF"><SUBSTFONT Name="맑은 고딕" Type="TTF"/></FONTFACE></FONTFACELIST>
<BORDERFILLLIST Count="1">
<BORDERFILL Id="1" ThreeD="false" Shadow="false" Slash="0" BackSlash="0">
<LEFTBORDER Type="1" Width="0.12mm" Color="#000000"/>
<RIGHTBORDER Type="1" Width="0.12mm" Color="#000000"/>
<TOPBORDER Type="1" Width="0.12mm" Color="#000000"/>
<BOTTOMBORDER Type="1" Width="0.12mm" Color="#000000"/>
<DIAGONAL Type="0" Width="0.12mm" Color="#000000"/>
</BORDERFILL>
</BORDERFILLLIST>
<CHARSHAPELIST Count="1">
<CHARSHAPE Id="0" Height="1000" TextColor="#000000" ShadeColor="none" UseFontSpace="false" UseKerning="false" SymMark="none" BorderFillIDRef="0">
<FONTID Lang="HANGUL" FaceNameId="0"/><FONTID Lang="LATIN" FaceNameId="0"/>
<RATIO Lang="HANGUL" Value="100"/><SPACING Lang="HANGUL" Value="0"/><RELSZ Lang="HANGUL" Value="100"/><OFFSET Lang="HANGUL" Value="0"/>
</CHARSHAPE>
</CHARSHAPELIST>
<PARASHAPELIST Count="1">
<PARASHAPE Id="0" TabDef="0" Numbering="0" BorderFill="0" LineSpacingType="PERCENT" LineSpacing="160" Align="JUSTIFY" BreakLatinWord="KEEPWORD" BreakNonLatinWord="KEEPWORD" SnapToGrid="true" Condense="0" FontLineHeight="false" HeadingType="NONE" Level="0" BreakSetting="0">
<PARAMARGIN Indent="0" Left="0" Right="0" Prev="0" Next="0"/>
</PARASHAPE>
</PARASHAPELIST>
<STYLELIST Count="1">
<STYLE Id="0" Type="PARA" Name="바탕글" EngName="Normal" ParaShape="0" CharShape="0" NextStyle="0" LangId="1042" LockForm="false"/>
</STYLELIST>
</MAPPINGTABLE>
</HEAD>
<BODY>
<SECDEF>
<HP:SEC>
<HP:P><HP:RUN CharShapeIDRef="0"><HP:T>프로젝트 진행일지</HP:T></HP:RUN></HP:P>
${para('[프로젝트 명] B1H4 워크스페이스')}
${para('')}
${para('<작성자> ' + s.author)}
${para('<날  짜>  ' + s.date)}
${para('<진척률>  ' + progressPct + '%')}
${para('')}
${para('<팀 명>  B1H4')}
<HP:P><HP:RUN CharShapeIDRef="0"><HP:T>&lt;팀구성원&gt;</HP:T></HP:RUN></HP:P>
<HP:TABLE><HP:TR><HP:TC><HP:SUBLIST>${para('이름')}</HP:SUBLIST></HP:TC><HP:TC><HP:SUBLIST>${para('역할')}</HP:SUBLIST></HP:TC></HP:TR>${memberRows}</HP:TABLE>
${para('')}
<HP:P><HP:RUN CharShapeIDRef="0"><HP:T>&lt;일별 진행상황&gt;</HP:T></HP:RUN></HP:P>
<HP:TABLE><HP:TR><HP:TC><HP:SUBLIST>${para('이름')}</HP:SUBLIST></HP:TC><HP:TC><HP:SUBLIST>${para('업무 내용')}</HP:SUBLIST></HP:TC><HP:TC><HP:SUBLIST>${para('특이사항')}</HP:SUBLIST></HP:TC></HP:TR>${progressRows}</HP:TABLE>
${para('')}
<HP:P><HP:RUN CharShapeIDRef="0"><HP:T>&lt;회 의 내 용&gt;</HP:T></HP:RUN></HP:P>
${s.agenda ? para('[안건] ' + s.agenda) : ''}
${bodyParas}
${s.issues.length ? para('[이슈사항] ' + s.issues.join(' / ')) : ''}
</HP:SEC>
</SECDEF>
</BODY>
</HWPML>`;
}

function exportMeeting(m, format) {
  const base = meetingExportFileBase(m);
  if (format === 'txt') {
    triggerBlobDownload(base + '.txt', buildMeetingTxt(m), 'text/plain;charset=utf-8');
  } else if (format === 'html') {
    triggerBlobDownload(base + '.html', buildMeetingHtml(m), 'text/html;charset=utf-8');
  } else if (format === 'pdf') {
    const win = window.open('', '_blank');
    if (!win) { toast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.', 'warn'); return; }
    win.document.write(buildMeetingHtml(m));
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
    setTimeout(() => { win.focus(); win.print(); }, 400);
  } else if (format === 'hwp') {
    triggerBlobDownload(base + '.hml', buildMeetingHwpml(m), 'application/xml;charset=utf-8');
    toast('한글(HWP) 호환 파일(.hml)을 내려받았습니다. 한글 프로그램에서 열어 .hwp로 저장할 수 있어요.');
  }
}

/* ============================== 이벤트 위임 ============================== */

document.addEventListener('click', async e => {
  const calBtn = e.target.closest('[data-cal]');
  if (calBtn) {
    const mode = calBtn.dataset.cal;
    if (mode === 'prev') S.calCursor = new Date(S.calCursor.getFullYear(), S.calCursor.getMonth() - 1, 1);
    else if (mode === 'next') S.calCursor = new Date(S.calCursor.getFullYear(), S.calCursor.getMonth() + 1, 1);
    else { S.calCursor = new Date(); S.calSelected = todayISO(); }
    return render();
  }

  const issueBtn = e.target.closest('[data-issue]');
  if (issueBtn) return openIssueDetail(issueBtn.dataset.issue);

  const ticketEl = e.target.closest('[data-ticket]');
  if (ticketEl) return openIssueDetail(ticketEl.dataset.ticket);

  const eventBtn = e.target.closest('[data-event]');
  if (eventBtn) {
    const ev = S.events.find(x => x.id === eventBtn.dataset.event);
    if (ev) {
      S.calSelected = ev.date;
      const picked = new Date(ev.date);
      if (picked.getFullYear() !== S.calCursor.getFullYear() || picked.getMonth() !== S.calCursor.getMonth()) {
        S.calCursor = new Date(picked.getFullYear(), picked.getMonth(), 1);
      }
      render();
      openEventForm(ev);
    }
    return;
  }

  const dayBtn = e.target.closest('[data-day]');
  if (dayBtn) {
    S.calSelected = dayBtn.dataset.day;
    const picked = new Date(S.calSelected);
    if (picked.getMonth() !== S.calCursor.getMonth()) S.calCursor = new Date(picked.getFullYear(), picked.getMonth(), 1);
    return render();
  }

  const filterBtn = e.target.closest('[data-filter]');
  if (filterBtn) {
    if (S.view === 'dashboard') S.boardFilter = filterBtn.dataset.filter;
    else S.backlogFilter = filterBtn.dataset.filter;
    return render();
  }

  const backlogViewBtn = e.target.closest('[data-backlog-view]');
  if (backlogViewBtn) {
    S.backlogView = backlogViewBtn.dataset.backlogView;
    return render();
  }

  const newEvent = e.target.closest('[data-new-event]');
  if (newEvent) return openEventForm(null, newEvent.dataset.newEvent === 'shared');

  const newSprint = e.target.closest('[data-new-sprint]');
  if (newSprint) return openSprintForm();

  const editSprint = e.target.closest('[data-sprint-edit]');
  if (editSprint) {
    const sprint = S.sprints.find(x => x.id === editSprint.dataset.sprintEdit);
    if (sprint) openSprintForm(sprint);
    return;
  }

  const startSprint = e.target.closest('[data-sprint-start]');
  if (startSprint) {
    await api('PATCH', '/api/sprints/' + startSprint.dataset.sprintStart, { status: '진행 중' });
    return toast('스프린트를 시작했습니다.');
  }

  const closeSprint = e.target.closest('[data-sprint-close]');
  if (closeSprint) {
    await api('PATCH', '/api/sprints/' + closeSprint.dataset.sprintClose, { status: '완료' });
    return toast('스프린트를 완료 처리했습니다.');
  }

  const delSprint = e.target.closest('[data-sprint-del]');
  if (delSprint) {
    if (!confirm('이 스프린트를 삭제할까요? 작업은 유지되고 스프린트 지정만 해제됩니다.')) return;
    await api('DELETE', '/api/sprints/' + delSprint.dataset.sprintDel);
    return toast('스프린트를 삭제했습니다.');
  }

  const delUser = e.target.closest('[data-user-del]');
  if (delUser) {
    if (!confirm('이 팀원 계정을 삭제할까요? 배정된 작업은 담당자 미지정으로 바뀝니다.')) return;
    try {
      await api('DELETE', '/api/users/' + delUser.dataset.userDel);
      toast('팀원 계정을 삭제했습니다.');
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  const copyBtn = e.target.closest('[data-copy]');
  if (copyBtn) {
    try {
      await navigator.clipboard.writeText(copyBtn.dataset.copy);
      toast('복사했습니다.');
    } catch (err) {
      toast('복사에 실패했습니다. 직접 선택해 복사하세요.', 'warn');
    }
    return;
  }

  if (e.target.id === 'btnTeamSave') {
    const name = $('#teamNameInput').value.trim();
    if (!name) return toast('팀 이름을 입력하세요.', 'warn');
    try {
      const { team } = await api('PATCH', '/api/team', { name });
      S.team = team;
      applyTeamName(team.name);
      toast(`팀 이름을 ${team.name}으로 바꿨습니다.`);
      render();
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  if (e.target.id === 'btnTeamCode') {
    if (!confirm('초대 코드를 새로 발급하면 예전 코드는 바로 막힙니다. 진행할까요?')) return;
    try {
      const { team } = await api('POST', '/api/team/code');
      S.team = team;
      toast('새 초대 코드를 발급했습니다.');
      render();
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  if (e.target.id === 'btnPw') {
    const current = $('#pwCur').value, next = $('#pwNew').value;
    try {
      await api('POST', '/api/auth/password', { current, next });
      $('#pwCur').value = ''; $('#pwNew').value = '';
      toast('비밀번호를 변경했습니다.');
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  if (e.target.id === 'btnAvatarPick') {
    $('#avatarFileInput').click();
    return;
  }

  if (e.target.id === 'btnAvatarReset') {
    try {
      const { user } = await api('POST', '/api/auth/avatar', { avatarUrl: null });
      applyMyAvatar(user.avatarUrl);
      toast('기본 이미지로 되돌렸습니다.');
    } catch (err) { toast(err.message, 'warn'); }
  }
});

function applyMyAvatar(avatarUrl) {
  S.me.avatarUrl = avatarUrl;
  const meInList = S.users.find(u => u.id === S.me.id);
  if (meInList) meInList.avatarUrl = avatarUrl;
  if (S.view === 'settings' || S.view === 'team') render();
  renderSidebarOrg();
}

function openAvatarCropModal(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const VIEW = 260;
      openModal(`
        <div class="modal-head">
          <div style="flex:1">
            <div class="modal-title">사진 조정</div>
            <div class="modal-sub">드래그로 위치를, 슬라이더로 크기를 맞춰보세요</div>
          </div>
          <button class="icon-btn" data-close="1">${icon('close', 18)}</button>
        </div>
        <div class="modal-body">
          <div class="avatar-crop-stage" id="avatarCropStage" style="width:${VIEW}px;height:${VIEW}px">
            <img id="avatarCropImg" src="${reader.result}" draggable="false" alt="">
          </div>
          <div class="avatar-crop-zoom-row">
            <span class="avatar-crop-zoom-label">사이즈</span>
            <input type="range" id="avatarCropZoom" min="100" max="300" value="100">
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-soft" data-close="1">취소</button>
          <button class="btn btn-primary" id="avatarCropApply">적용</button>
        </div>`, false, 'avatar-crop-modal');

      const stage = $('#avatarCropStage');
      const imgEl = $('#avatarCropImg');
      const zoomEl = $('#avatarCropZoom');
      const baseScale = VIEW / Math.min(img.naturalWidth, img.naturalHeight);
      const st = { naturalW: img.naturalWidth, naturalH: img.naturalHeight, baseScale, zoom: 1, ox: 0, oy: 0 };

      function clampOffset() {
        const s = st.baseScale * st.zoom;
        const maxX = Math.max(0, (st.naturalW * s - VIEW) / 2);
        const maxY = Math.max(0, (st.naturalH * s - VIEW) / 2);
        st.ox = Math.min(maxX, Math.max(-maxX, st.ox));
        st.oy = Math.min(maxY, Math.max(-maxY, st.oy));
      }
      function applyTransform() {
        const s = st.baseScale * st.zoom;
        imgEl.style.width = (st.naturalW * s) + 'px';
        imgEl.style.height = (st.naturalH * s) + 'px';
        imgEl.style.transform = `translate(-50%, -50%) translate(${st.ox}px, ${st.oy}px)`;
      }
      applyTransform();

      let dragging = false, startX = 0, startY = 0, startOx = 0, startOy = 0;
      stage.addEventListener('pointerdown', e => {
        dragging = true;
        stage.setPointerCapture(e.pointerId);
        startX = e.clientX; startY = e.clientY;
        startOx = st.ox; startOy = st.oy;
      });
      stage.addEventListener('pointermove', e => {
        if (!dragging) return;
        st.ox = startOx + (e.clientX - startX);
        st.oy = startOy + (e.clientY - startY);
        clampOffset();
        applyTransform();
      });
      const endDrag = () => { dragging = false; };
      stage.addEventListener('pointerup', endDrag);
      stage.addEventListener('pointercancel', endDrag);
      stage.addEventListener('pointerleave', endDrag);

      zoomEl.addEventListener('input', () => {
        st.zoom = Number(zoomEl.value) / 100;
        clampOffset();
        applyTransform();
      });

      $('#avatarCropApply').addEventListener('click', async () => {
        const OUT = 200;
        const s = st.baseScale * st.zoom;
        const sSize = VIEW / s;
        const sx = st.naturalW / 2 - sSize / 2 - st.ox / s;
        const sy = st.naturalH / 2 - sSize / 2 - st.oy / s;
        const canvas = document.createElement('canvas');
        canvas.width = OUT; canvas.height = OUT;
        canvas.getContext('2d').drawImage(img, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
        try {
          const { user } = await api('POST', '/api/auth/avatar', { avatarUrl: dataUrl });
          applyMyAvatar(user.avatarUrl);
          closeModal();
          toast('프로필 사진을 변경했습니다.');
        } catch (err) {
          toast(err.message || '이미지를 처리하지 못했습니다.', 'warn');
        }
      });
    };
    img.onerror = () => toast('이미지를 불러올 수 없습니다.', 'warn');
    img.src = reader.result;
  };
  reader.onerror = () => toast('파일을 읽을 수 없습니다.', 'warn');
  reader.readAsDataURL(file);
}

document.addEventListener('change', e => {
  if (e.target.id !== 'avatarFileInput') return;
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    toast('이미지 파일을 선택하세요.', 'warn');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast('이미지 용량은 5MB 이하로 선택하세요.', 'warn');
    return;
  }
  openAvatarCropModal(file);
});

document.addEventListener('change', async e => {
  const roleSel = e.target.closest('[data-role-for]');
  if (roleSel) {
    try {
      await api('PATCH', '/api/users/' + roleSel.dataset.roleFor, { role: roleSel.value });
      toast('권한을 변경했습니다.');
    } catch (err) {
      toast(err.message, 'warn');
      render();
    }
    return;
  }

  const rosterSel = e.target.closest('[data-roster-for]');
  if (rosterSel) {
    try {
      await api('PATCH', '/api/roster/' + rosterSel.dataset.rosterFor, { title: rosterSel.value });
      toast('역할을 변경했습니다.');
    } catch (err) {
      toast(err.message, 'warn');
      renderSidebarOrg();
    }
  }
});

/* ================================ 모달 ================================ */

function openModal(html, wide, extraClass) {
  $('#scrimInner').innerHTML = `<div class="modal ${wide ? 'wide' : ''} ${extraClass || ''}">${html}</div>`;
  $('#scrim').classList.add('on');
}

function closeModal() {
  $('#scrim').classList.remove('on');
  $('#scrimInner').innerHTML = '';
  openIssueId = null;
  editingCommentId = null;
}

$('#scrim').addEventListener('click', e => { if (e.target.id === 'scrim') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function userOptions(selected) {
  return `<option value="">담당자 미지정</option>` +
    S.users.map(u => `<option value="${u.id}" ${u.id === selected ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
}

function sprintOptions(selected) {
  return `<option value="">스프린트 없음</option>` +
    S.sprints.map(s => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}

/* 작업 생성 / 수정 폼 */

function openIssueForm(issue) {
  const i = issue || {};
  const labelTags = (i.labels || []).slice();

  openModal(`
    <div class="modal-head">
      <div style="flex:1">
        <div class="modal-title">${issue ? '작업 수정' : '새 작업'}</div>
        <div class="modal-sub">${issue ? esc(i.key) : '팀 보드에 바로 올라갑니다'}</div>
      </div>
      <button class="icon-btn" data-close="1">${icon('close', 18)}</button>
    </div>
    <div class="modal-body">
      <div id="issueFormAlert"></div>
      <div class="field">
        <label for="iTitle">제목<span class="req-star">*</span></label>
        <input class="input" id="iTitle" value="${esc(i.title || '')}" placeholder="무엇을 해야 하나요">
      </div>
      <div class="field">
        <label for="iDesc">설명</label>
        ${mdToolbar('iDesc')}
        <textarea class="textarea md-editor" id="iDesc" placeholder="배경, 완료 조건, 참고 링크">${esc(i.description || '')}</textarea>
      </div>
      <div class="two">
        <div class="field">
          <label for="iType">유형</label>
          <select class="select" id="iType">${TYPES.map(t => `<option ${t === (i.type || '작업') ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="iPri">우선순위</label>
          <select class="select" id="iPri">${PRIORITIES.map(p => `<option ${p === (i.priority || '보통') ? 'selected' : ''}>${p}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="iStatus">상태</label>
          <select class="select" id="iStatus">${STATUSES.map(s => `<option ${s === (i.status || '할 일') ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="iAssignee">담당자</label>
          <select class="select" id="iAssignee">${userOptions(i.assigneeId)}</select>
        </div>
        <div class="field">
          <label for="iDue">마감일</label>
          <input class="input" id="iDue" type="date" value="${esc(i.dueDate || '')}">
        </div>
        <div class="field">
          <label for="iPoints">스토리 포인트</label>
          <input class="input" id="iPoints" type="number" min="0" max="99" value="${i.storyPoints || 0}">
        </div>
        <div class="field">
          <label for="iSprint">스프린트</label>
          <select class="select" id="iSprint">${sprintOptions(i.sprintId)}</select>
        </div>
        <div class="field">
          <label for="iLabelsInput">라벨</label>
          <div class="tag-input" id="iLabelsBox">
            <div class="tag-list" id="iLabelsList"></div>
            <input type="text" id="iLabelsInput" placeholder="입력 후 Enter 또는 ,">
          </div>
        </div>
      </div>
      <div class="field">
        <label>작업자 (다중 선택)</label>
        <div class="attendee-picker">
          ${S.users.map(u => `
            <label class="attendee-check">
              <input type="checkbox" class="iw-check" value="${u.id}" ${(i.workerIds || []).includes(u.id) ? 'checked' : ''}>
              <span>${esc(u.name)}</span>
            </label>`).join('')}
        </div>
      </div>
      <div class="field">
        <label for="iBlocked">선행 작업 (Blocked by)</label>
        <select class="select" id="iBlocked">
          <option value="">선행 작업 없음</option>
          ${S.issues.filter(x => x.id !== i.id).map(x =>
            `<option value="${x.id}" ${(i.blockedBy || []).includes(x.id) ? 'selected' : ''}>${esc(x.key)} · ${esc(x.title)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-soft" data-close="1">취소</button>
      <button class="btn btn-primary" id="issueSave">${issue ? '변경 저장' : '작업 만들기'}</button>
    </div>`, true, 'flex-modal');

  attachSlashMenu($('#iDesc'));

  const labelsList = $('#iLabelsList');
  const labelsInput = $('#iLabelsInput');

  function renderLabelTags() {
    labelsList.innerHTML = labelTags.map((t, idx) => `
      <span class="tag-chip">${esc(t)}<button type="button" class="tag-chip-x" data-tag-del="${idx}">${icon('close', 10)}</button></span>`).join('');
  }
  renderLabelTags();

  function commitLabel() {
    const v = labelsInput.value.trim();
    if (v && !labelTags.includes(v)) { labelTags.push(v); renderLabelTags(); }
    labelsInput.value = '';
  }

  labelsInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitLabel(); }
    else if (e.key === 'Backspace' && !labelsInput.value && labelTags.length) {
      labelTags.pop();
      renderLabelTags();
    }
  });
  labelsInput.addEventListener('blur', commitLabel);
  $('#iLabelsBox').addEventListener('click', e => {
    const delBtn = e.target.closest('[data-tag-del]');
    if (delBtn) { labelTags.splice(Number(delBtn.dataset.tagDel), 1); renderLabelTags(); return; }
    labelsInput.focus();
  });

  $('#issueSave').addEventListener('click', async () => {
    commitLabel();
    const payload = {
      title: $('#iTitle').value.trim(),
      description: $('#iDesc').value,
      type: $('#iType').value,
      priority: $('#iPri').value,
      status: $('#iStatus').value,
      assigneeId: $('#iAssignee').value || null,
      workerIds: $$('.iw-check:checked').map(cb => cb.value),
      dueDate: $('#iDue').value || null,
      storyPoints: Number($('#iPoints').value) || 0,
      sprintId: $('#iSprint').value || null,
      labels: labelTags,
      blockedBy: $('#iBlocked').value ? [$('#iBlocked').value] : []
    };
    if (!payload.title) {
      $('#issueFormAlert').innerHTML = '<div class="alert">작업 제목을 입력하세요.</div>';
      return;
    }
    try {
      if (issue) await api('PATCH', '/api/issues/' + issue.id, payload);
      else await api('POST', '/api/issues', payload);
      closeModal();
      toast(issue ? '작업을 수정했습니다.' : '작업을 만들었습니다.');
    } catch (err) {
      $('#issueFormAlert').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    }
  });
}

/* 작업 상세 */

let openIssueId = null;

async function openIssueDetail(id) {
  const i = S.issues.find(x => x.id === id);
  if (!i) return;
  openIssueId = id;
  const reporter = userById(i.reporterId);
  const sprint = S.sprints.find(s => s.id === i.sprintId);
  const blockers = (i.blockedBy || []).map(bid => S.issues.find(x => x.id === bid)).filter(Boolean);
  const late = i.dueDate && i.dueDate < todayISO() && i.status !== '완료';
  const canDelete = i.reporterId === S.me.id || S.me.role === 'PM';

  openModal(`
    <div class="modal-head">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">
          <span style="color:${PRI_TONE[i.priority]}">${icon(TYPE_ICON[i.type], 16)}</span>
          <span class="tkt-key">${esc(i.key)}</span>
          <span class="chip plain">${esc(i.type)}</span>
        </div>
        <div class="modal-title">${esc(i.title)}</div>
      </div>
      <button class="icon-btn" data-close="1">${icon('close', 18)}</button>
    </div>

    <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px">
      <span class="chip" style="background:${STATUS_TONE[i.status]}33;color:var(--ink-2)">${esc(i.status)}</span>
      <span class="chip plain"><span class="pri-dot" style="background:${PRI_TONE[i.priority]};display:inline-block;margin-right:4px"></span>${esc(i.priority)}</span>
      ${i.dueDate ? `<span class="chip ${late ? 'late' : 'plain'}">마감 ${fmtDate(i.dueDate)}</span>` : ''}
      ${i.storyPoints ? `<span class="chip plain">${i.storyPoints}P</span>` : ''}
      ${sprint ? `<span class="chip">${esc(sprint.name)}</span>` : ''}
      ${(i.labels || []).map(l => `<span class="chip pink">${esc(l)}</span>`).join('')}
    </div>

    ${i.description ? `<div class="md-render issue-desc-box">${renderMarkdown(i.description)}</div>` : ''}

    ${blockers.length ? `<div class="alert" style="display:flex;align-items:center;gap:8px">${icon('link', 16)}<span>${blockers.map(b => esc(b.key)).join(', ')} 작업이 끝나야 진행할 수 있습니다.</span></div>` : ''}

    <div class="two" style="margin-bottom:16px">
      <div class="field" style="margin-bottom:0">
        <label for="dAssignee">담당자 지정</label>
        <select class="select" id="dAssignee">${userOptions(i.assigneeId)}</select>
      </div>
      <div>
        <div style="font-size:11.5px;color:var(--ink-3);font-weight:650;margin-bottom:6px">등록자</div>
        <div style="display:flex;align-items:center;gap:8px">${avatar(reporter, 'sm')}<span style="font-size:13.5px;font-weight:600">${esc(reporter ? reporter.name : '알 수 없음')}</span></div>
      </div>
    </div>

    <div class="field">
      <label>작업자 지정 (다중 선택)</label>
      <div class="attendee-picker" id="dWorkers">
        ${S.users.map(u => `
          <label class="attendee-check">
            <input type="checkbox" class="dw-check" value="${u.id}" ${(i.workerIds || []).includes(u.id) ? 'checked' : ''}>
            <span>${esc(u.name)}</span>
          </label>`).join('')}
      </div>
    </div>

    <div class="field">
      <label for="dStatus">상태 바꾸기</label>
      <select class="select" id="dStatus">${STATUSES.map(s => `<option ${s === i.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
    </div>

    <div class="card-title" style="margin-top:20px">${icon('comment', 18)}댓글</div>
    <div id="cmtList"><div class="empty" style="padding:18px">불러오는 중</div></div>

    <div style="display:flex;gap:8px;margin-top:12px">
      <input class="input" id="cmtInput" placeholder="댓글 입력 · @이름으로 팀원을 부를 수 있습니다" style="flex:1">
      <button class="btn btn-primary" id="cmtSend">등록</button>
    </div>

    <div class="modal-foot">
      <button class="btn btn-soft" id="issueEdit">${icon('edit', 16)}수정</button>
      ${canDelete ? `<button class="btn btn-danger narrow" id="issueDel">${icon('trash', 16)}삭제</button>` : ''}
    </div>`, true);

  loadComments(id);
  attachMentionMenu($('#cmtInput'));

  $('#dStatus').addEventListener('change', async e => {
    try {
      await api('PATCH', '/api/issues/' + id, { status: e.target.value });
      toast('상태를 변경했습니다.');
      announceStatusChange(i.title, e.target.value);
    } catch (err) { toast(err.message, 'warn'); }
  });

  $('#dAssignee').addEventListener('change', async e => {
    try {
      await api('PATCH', '/api/issues/' + id, { assigneeId: e.target.value || null });
      const newAssignee = userById(e.target.value);
      toast(newAssignee ? `${newAssignee.name}님에게 배정했습니다.` : '담당자를 미지정으로 바꿨습니다.');
    } catch (err) { toast(err.message, 'warn'); }
  });

  $('#dWorkers').addEventListener('change', async e => {
    if (!e.target.classList.contains('dw-check')) return;
    const workerIds = $$('.dw-check:checked').map(cb => cb.value);
    try {
      await api('PATCH', '/api/issues/' + id, { workerIds });
      toast('작업자를 변경했습니다.');
    } catch (err) { toast(err.message, 'warn'); }
  });

  $('#issueEdit').addEventListener('click', () => {
    const fresh = S.issues.find(x => x.id === id);
    closeModal();
    openIssueForm(fresh);
  });

  const delBtn = $('#issueDel');
  if (delBtn) delBtn.addEventListener('click', async () => {
    if (!confirm('이 작업을 삭제할까요?')) return;
    try {
      await api('DELETE', '/api/issues/' + id);
      closeModal();
      toast('작업을 삭제했습니다.');
    } catch (err) { toast(err.message, 'warn'); }
  });

  const send = async () => {
    const body = $('#cmtInput').value.trim();
    if (!body) return;
    try {
      await api('POST', `/api/issues/${id}/comments`, { body });
      $('#cmtInput').value = '';
      loadComments(id);
    } catch (err) { toast(err.message, 'warn'); }
  };

  $('#cmtSend').addEventListener('click', send);
  $('#cmtInput').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
}

let editingCommentId = null;

async function loadComments(issueId) {
  const box = $('#cmtList');
  if (!box) return;
  const { comments } = await api('GET', `/api/issues/${issueId}/comments`);
  if (!comments.length) {
    box.innerHTML = `<div class="empty" style="padding:20px">${icon('comment', 26)}<strong>첫 댓글을 남겨보세요</strong>진행 상황이나 막힌 부분을 공유하면 팀이 바로 확인합니다.</div>`;
    return;
  }
  box.innerHTML = comments.map(c => {
    const author = userById(c.authorId);
    const canDel = c.authorId === S.me.id || S.me.role === 'PM';
    const canEdit = c.authorId === S.me.id;

    if (editingCommentId === c.id) {
      return `<div class="cmt">
        ${avatar(author, 'sm')}
        <div class="cmt-body">
          <div class="cmt-head"><span class="cmt-name">${esc(author ? author.name : '알 수 없음')}</span></div>
          <textarea class="textarea" id="cmtEdit-${c.id}" style="min-height:60px">${esc(c.body)}</textarea>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn btn-soft narrow" data-cmt-edit-cancel="${c.id}" style="padding:6px 13px;font-size:12.5px">취소</button>
            <button class="btn btn-primary narrow" data-cmt-edit-save="${c.id}" style="padding:6px 13px;font-size:12.5px">저장</button>
          </div>
        </div>
      </div>`;
    }

    let text = esc(c.body);
    S.users.forEach(u => {
      text = text.split('@' + esc(u.name)).join(`<span class="mention">@${esc(u.name)}</span>`);
    });
    return `<div class="cmt">
      ${avatar(author, 'sm')}
      <div class="cmt-body">
        <div class="cmt-head">
          <span class="cmt-name">${esc(author ? author.name : '알 수 없음')}</span>
          <span class="cmt-time">${fmtRelative(c.createdAt)}${c.editedAt ? ' · 수정됨' : ''}</span>
          <span style="margin-left:auto;display:flex;gap:2px">
            ${canEdit ? `<button class="cmt-action" data-cmt-edit="${c.id}" title="수정">${icon('edit', 14)}</button>` : ''}
            ${canDel ? `<button class="cmt-action danger" data-cmt-del="${c.id}" title="삭제">${icon('trash', 14)}</button>` : ''}
          </span>
        </div>
        <div class="cmt-text">${text}</div>
      </div>
    </div>`;
  }).join('');
}

document.addEventListener('click', async e => {
  const del = e.target.closest('[data-cmt-del]');
  if (del) {
    if (!confirm('이 댓글을 삭제할까요?')) return;
    await api('DELETE', '/api/comments/' + del.dataset.cmtDel);
    if (openIssueId) loadComments(openIssueId);
    return;
  }

  const editBtn = e.target.closest('[data-cmt-edit]');
  if (editBtn) {
    editingCommentId = editBtn.dataset.cmtEdit;
    if (openIssueId) loadComments(openIssueId);
    return;
  }

  const editCancel = e.target.closest('[data-cmt-edit-cancel]');
  if (editCancel) {
    editingCommentId = null;
    if (openIssueId) loadComments(openIssueId);
    return;
  }

  const editSave = e.target.closest('[data-cmt-edit-save]');
  if (editSave) {
    const id = editSave.dataset.cmtEditSave;
    const ta = $('#cmtEdit-' + id);
    const body = ta ? ta.value.trim() : '';
    if (!body) return;
    try {
      await api('PATCH', '/api/comments/' + id, { body });
      editingCommentId = null;
      if (openIssueId) loadComments(openIssueId);
    } catch (err) { toast(err.message, 'warn'); }
    return;
  }

  if (e.target.closest('[data-close]')) closeModal();
});

/* 일정 폼 */

function timeStrToParts(t) {
  if (!t) return null;
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  let hour = h % 12;
  if (hour === 0) hour = 12;
  return { period, hour, minute: m };
}

function partsToTimeStr(period, hour, minute) {
  if (hour === '' || hour == null || minute === '' || minute == null) return null;
  let h = parseInt(hour, 10);
  let m = parseInt(minute, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  h = Math.min(Math.max(h, 1), 12);
  m = Math.min(Math.max(m, 0), 59);
  if (period === 'PM') { if (h !== 12) h += 12; }
  else if (h === 12) h = 0;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function timeUnitOptionsHtml(unit, selected) {
  const min = unit === 'hour' ? 1 : 0;
  const max = unit === 'hour' ? 12 : 59;
  let html = '';
  for (let v = min; v <= max; v++) {
    html += `<button type="button" data-value="${v}" class="${v === selected ? 'on' : ''}">${String(v).padStart(2, '0')}</button>`;
  }
  return html;
}

function renderTimeUnit(unit, value) {
  const label = value === '' ? (unit === 'hour' ? '시' : '분') : String(value).padStart(2, '0');
  return `
    <div class="time-select" data-unit="${unit}" data-value="${value === '' ? '' : value}">
      <button type="button" class="time-select-btn" data-time-toggle>${label}</button>
      <div class="time-select-list" data-time-list>${timeUnitOptionsHtml(unit, value)}</div>
    </div>`;
}

function renderTimePicker(name, value) {
  const parts = timeStrToParts(value) || { period: 'AM', hour: '', minute: '' };
  return `
    <div class="time-picker" data-time-picker="${name}">
      <div class="seg time-ampm">
        <button type="button" data-period="AM" class="${parts.period === 'AM' ? 'on' : ''}">오전</button>
        <button type="button" data-period="PM" class="${parts.period === 'PM' ? 'on' : ''}">오후</button>
      </div>
      <div class="time-hm">
        ${renderTimeUnit('hour', parts.hour)}
        <span class="time-colon">:</span>
        ${renderTimeUnit('minute', parts.minute)}
      </div>
    </div>`;
}

function timePickerEl(name) {
  return $(`.time-picker[data-time-picker="${name}"]`);
}

function getTimePickerValue(name) {
  const root = timePickerEl(name);
  if (!root) return null;
  const onBtn = root.querySelector('.time-ampm button.on');
  const period = onBtn ? onBtn.dataset.period : 'AM';
  const hourSel = root.querySelector('.time-select[data-unit="hour"]');
  const minSel = root.querySelector('.time-select[data-unit="minute"]');
  return partsToTimeStr(period, hourSel.dataset.value, minSel.dataset.value);
}

function clearTimePicker(name) {
  const root = timePickerEl(name);
  if (!root) return;
  root.querySelectorAll('.time-select').forEach(sel => {
    sel.dataset.value = '';
    sel.classList.remove('open');
    sel.querySelector('[data-time-toggle]').textContent = sel.dataset.unit === 'hour' ? '시' : '분';
    sel.querySelectorAll('[data-time-list] button').forEach(b => b.classList.remove('on'));
  });
  root.querySelectorAll('.time-ampm button').forEach(b => b.classList.toggle('on', b.dataset.period === 'AM'));
}

function setTimePickerDisabled(name, disabled) {
  const root = timePickerEl(name);
  if (!root) return;
  root.classList.toggle('disabled', disabled);
  root.querySelectorAll('button').forEach(el => { el.disabled = disabled; });
  if (disabled) root.querySelectorAll('.time-select.open').forEach(sel => sel.classList.remove('open'));
}

let timeSelectDocListenerAdded = false;
function ensureTimeSelectDocListener() {
  if (timeSelectDocListenerAdded) return;
  timeSelectDocListenerAdded = true;
  document.addEventListener('click', e => {
    if (e.target.closest('.time-select')) return;
    $$('.time-select.open').forEach(sel => sel.classList.remove('open'));
  });
}

function wireTimePicker(name, onChange) {
  ensureTimeSelectDocListener();
  const root = timePickerEl(name);
  if (!root) return;
  root.querySelectorAll('.time-ampm button').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.time-ampm button').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      if (onChange) onChange();
    });
  });
  root.querySelectorAll('.time-select').forEach(sel => {
    const toggleBtn = sel.querySelector('[data-time-toggle]');
    const list = sel.querySelector('[data-time-list]');
    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      const willOpen = !sel.classList.contains('open');
      $$('.time-select.open').forEach(other => { if (other !== sel) other.classList.remove('open'); });
      sel.classList.toggle('open', willOpen);
      if (willOpen) {
        const onOpt = list.querySelector('button.on');
        if (onOpt) onOpt.scrollIntoView({ block: 'center' });
      }
    });
    list.querySelectorAll('button').forEach(opt => {
      opt.addEventListener('click', e => {
        e.stopPropagation();
        sel.dataset.value = opt.dataset.value;
        toggleBtn.textContent = opt.textContent;
        list.querySelectorAll('button').forEach(b => b.classList.remove('on'));
        opt.classList.add('on');
        sel.classList.remove('open');
        if (onChange) onChange();
      });
    });
  });
}

function openEventForm(event, forceShared) {
  const ev = event || {};
  const canEdit = !event || event.ownerId === S.me.id || S.me.role === 'PM';

  openModal(`
    <div class="modal-head">
      <div style="flex:1">
        <div class="modal-title">${event ? '일정 수정' : '새 일정'}</div>
        <div class="modal-sub">${event ? fmtDate(ev.date) : fmtDate(S.calSelected) + '에 등록됩니다'}</div>
      </div>
      <button class="icon-btn" data-close="1">${icon('close', 18)}</button>
    </div>
    <div id="eventAlert"></div>
    <div class="field">
      <label for="eTitle">일정 제목</label>
      <input class="input" id="eTitle" value="${esc(ev.title || '')}" placeholder="회의, 발표, 제출 등">
    </div>
    <div class="field">
      <label for="eDate">날짜</label>
      <input class="input" id="eDate" type="date" value="${esc(ev.date || S.calSelected)}">
    </div>
    <div class="two">
      <div class="field">
        <label>시작 시간</label>
        ${renderTimePicker('start', ev.time || '')}
      </div>
      <div class="field">
        <label>끝나는 시간</label>
        ${renderTimePicker('end', ev.endTime || '')}
      </div>
    </div>
    <div class="field">
      <label for="eDesc">메모</label>
      <textarea class="textarea" id="eDesc" placeholder="장소, 준비물, 참여 대상">${esc(ev.description || '')}</textarea>
    </div>
    <div class="field">
      <label for="eShared">공유 범위</label>
      <select class="select" id="eShared">
        <option value="private" ${!(forceShared || ev.shared) ? 'selected' : ''}>나만 보기</option>
        <option value="shared" ${(forceShared || ev.shared) ? 'selected' : ''}>팀 전체 공유</option>
      </select>
    </div>
    <div class="modal-foot">
      ${event && canEdit ? `<button class="btn btn-danger narrow" id="eventDel">${icon('trash', 16)}</button>` : ''}
      <button class="btn btn-soft" data-close="1">취소</button>
      ${canEdit ? `<button class="btn btn-primary" id="eventSave">${event ? '변경 저장' : '일정 등록'}</button>` : ''}
    </div>`);

  wireTimePicker('start', () => {
    const startVal = getTimePickerValue('start');
    setTimePickerDisabled('end', !startVal);
    if (!startVal) clearTimePicker('end');
  });
  wireTimePicker('end', () => {});
  setTimePickerDisabled('end', !ev.time);

  const saveBtn = $('#eventSave');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const timeStart = getTimePickerValue('start');
    const timeEnd = getTimePickerValue('end');
    const payload = {
      title: $('#eTitle').value.trim(),
      date: $('#eDate').value,
      time: timeStart,
      endTime: timeStart ? timeEnd : null,
      description: $('#eDesc').value,
      shared: $('#eShared').value === 'shared'
    };
    if (!payload.title || !payload.date) {
      $('#eventAlert').innerHTML = '<div class="alert">일정 제목과 날짜를 입력하세요.</div>';
      return;
    }
    if (timeEnd && timeStart && timeEnd <= timeStart) {
      $('#eventAlert').innerHTML = '<div class="alert">끝나는 시간은 시작 시간보다 늦어야 합니다.</div>';
      return;
    }
    try {
      if (event) await api('PATCH', '/api/events/' + event.id, payload);
      else await api('POST', '/api/events', payload);
      S.calSelected = payload.date;
      closeModal();
      toast(event ? '일정을 수정했습니다.' : '일정을 등록했습니다.');
    } catch (err) {
      $('#eventAlert').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    }
  });

  const delBtn = $('#eventDel');
  if (delBtn) delBtn.addEventListener('click', async () => {
    if (!confirm('이 일정을 삭제할까요?')) return;
    await api('DELETE', '/api/events/' + event.id);
    closeModal();
    toast('일정을 삭제했습니다.');
  });
}

/* 스프린트 폼 */

function openSprintForm(sprint) {
  const s = sprint || {};
  const start = s.startDate || todayISO();
  const end = s.endDate || isoOf(new Date(Date.now() + 13 * 86400000));
  openModal(`
    <div class="modal-head">
      <div style="flex:1">
        <div class="modal-title">${sprint ? '스프린트 수정' : '새 스프린트'}</div>
        <div class="modal-sub">기간을 정하고 작업을 묶어 진행률을 봅니다</div>
      </div>
      <button class="icon-btn" data-close="1">${icon('close', 18)}</button>
    </div>
    <div id="sprintAlert"></div>
    <div class="field">
      <label for="sName">스프린트 이름</label>
      <input class="input" id="sName" placeholder="스프린트 1" value="${esc(s.name || '')}">
    </div>
    <div class="field">
      <label for="sGoal">목표</label>
      <textarea class="textarea" id="sGoal" placeholder="이번 주기에 무엇을 끝낼지">${esc(s.goal || '')}</textarea>
    </div>
    <div class="two">
      <div class="field"><label for="sStart">시작일</label><input class="input" id="sStart" type="date" value="${start}"></div>
      <div class="field"><label for="sEnd">종료일</label><input class="input" id="sEnd" type="date" value="${end}"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-soft" data-close="1">취소</button>
      <button class="btn btn-primary" id="sprintSave">${sprint ? '변경 저장' : '스프린트 만들기'}</button>
    </div>`);

  $('#sprintSave').addEventListener('click', async () => {
    const name = $('#sName').value.trim();
    if (!name) {
      $('#sprintAlert').innerHTML = '<div class="alert">스프린트 이름을 입력하세요.</div>';
      return;
    }
    const payload = {
      name,
      goal: $('#sGoal').value,
      startDate: $('#sStart').value,
      endDate: $('#sEnd').value
    };
    try {
      if (sprint) await api('PATCH', '/api/sprints/' + sprint.id, payload);
      else await api('POST', '/api/sprints', payload);
      closeModal();
      toast(sprint ? '스프린트를 수정했습니다.' : '스프린트를 만들었습니다.');
    } catch (err) {
      $('#sprintAlert').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    }
  });
}

/* ========================= 오전 9시 브리핑 안내 ========================= */

function checkMorningBrief(force) {
  const stamp = 'b1h4.brief.' + todayISO();
  if (!force && localStorage.getItem(stamp)) return;
  const hour = new Date().getHours();
  if (!force && hour < 9) return;

  const today = todayISO();
  const events = S.events.filter(e => e.date === today);
  const dues = S.issues.filter(i => i.assigneeId === S.me.id && i.dueDate === today && i.status !== '완료');
  if (!events.length && !dues.length) return;

  localStorage.setItem(stamp, '1');
  setTimeout(() => {
    openModal(`
      <div class="modal-head">
        <div style="flex:1">
          <div class="modal-title">오늘의 브리핑</div>
          <div class="modal-sub">${fmtDate(today)} · ${esc(S.me.name)}님</div>
        </div>
        <button class="icon-btn" data-close="1">${icon('close', 18)}</button>
      </div>
      ${events.length ? `<div class="card-title">${icon('calendar', 18)}오늘 일정 ${events.length}건</div>
        <div class="row-list" style="margin-bottom:16px">${events.map(e => `
          <div class="row"><span class="row-bar ${e.shared ? 'pink' : ''}"></span>
            <div class="row-main"><div class="row-title">${esc(e.title)}</div>
            <div class="row-meta">${esc(fmtEventTime(e))}${e.shared ? ' · 팀 공유' : ''}</div></div>
          </div>`).join('')}</div>` : ''}
      ${dues.length ? `<div class="card-title">${icon('clock', 18)}오늘 마감 작업 ${dues.length}건</div>
        <div class="row-list">${dues.map(issueRow).join('')}</div>` : ''}
      <div class="modal-foot"><button class="btn btn-primary" data-close="1">확인했습니다</button></div>`);
  }, 900);
}

/* ================================ 챗봇 ================================ */

const CHATBOT_TOPICS = ['작업', '스프린트', '공유메모', '회의록', '캘린더', '조직도', '댓글', '대시보드', '알림', '워크스페이스'];

function lizardBotReply(msg) {
  const m = msg.toLowerCase();
  if (/안녕|hi\b|hello|반가/.test(m)) return '안녕하세요! 저는 챗봇이에요 🦎 B1H4 워크스페이스 사용법을 도와드릴게요.';
  if (/너\s*(누구|이름)|이름이 뭐|넌 뭐/.test(m)) return '저는 B1H4 워크스페이스 안내를 도와주는 챗봇이에요.';
  if (/도움말|help|뭐 할 수|기능 알려/.test(m)) return `이런 것들을 물어보실 수 있어요: ${CHATBOT_TOPICS.map(t => `"${t}"`).join(', ')}`;
  if (/작업.*(만들|추가|생성)|new task/.test(m)) return '오른쪽 위 "새 작업" 버튼을 누르면 새 작업을 만들 수 있어요. 대시보드에서 상태별로 끌어다 옮길 수도 있어요.';
  if (/작업목록|미완료/.test(m)) return '작업목록 메뉴에서 전체 작업을 우선순위순으로 볼 수 있고, 필터로 내 작업이나 미배정 작업만 골라볼 수 있어요.';
  if (/스프린트/.test(m)) return '스프린트 메뉴에서 기간을 정해 작업을 묶고 진행률을 볼 수 있어요. 새 스프린트 만들기는 팀장만 할 수 있어요.';
  if (/공유메모|메모|위키/.test(m)) return '공유메모 메뉴에서 자유롭게 메모를 만들고 팀과 공유할 수 있어요. "/"를 입력하면 서식 메뉴가 열려요.';
  if (/회의록|회의/.test(m)) return '회의록 메뉴에서 날짜, 참석자, 회의 내용을 기록할 수 있어요. "- [ ] "로 액션 아이템도 체크박스로 남길 수 있어요.';
  if (/캘린더|일정/.test(m)) return '캘린더에서 날짜를 눌러 일정을 추가하거나, 마감일이 있는 작업을 함께 볼 수 있어요.';
  if (/조직도|역할|팀장/.test(m)) return '워크스페이스 패널 아래쪽이나 팀 메뉴에서 팀 조직도를 보고 누구나 역할을 바꿀 수 있어요.';
  if (/댓글|멘션|@/.test(m)) return '작업 상세의 댓글창에서 "@"를 입력하면 팀원 이름이 자동으로 떠요. 내가 쓴 댓글은 수정도 가능해요.';
  if (/대시보드|보드|칸반/.test(m)) return '대시보드에서 작업 보드를 끌어다 상태를 바꾸고, 통계도 함께 볼 수 있어요.';
  if (/알림/.test(m)) return '오른쪽 위 종 모양 아이콘에서 알림을 확인할 수 있고, 새 알림이 뜨면 클릭해서 바로 이동할 수도 있어요.';
  if (/워크스페이스|사이드바/.test(m)) return '왼쪽 가장자리의 탭을 클릭하면 워크스페이스가 열리고 닫혀요. 메뉴 안 접기 버튼으로 좁게 줄일 수도 있어요.';
  if (/고마워|감사/.test(m)) return '천만에요! 언제든 또 물어보세요 🦎';
  if (/잘가|바이|bye/.test(m)) return '안녕히 가세요! 필요하면 또 불러주세요 🦎';
  return `음... 아직 배우고 있는 질문이에요! ${CHATBOT_TOPICS.slice(0, 5).map(t => `"${t}"`).join(', ')} 같은 걸 물어보시면 도와드릴 수 있어요.`;
}

const LIZARD_GLASS_IMG = `<img class="glass-lizard-svg" src="/img/chatbot-lizard.png" alt="챗봇" draggable="false">`;

const CHATBOT_FAB_HTML = `<span class="glass-figure"><span class="glass-figure-blur"></span>${LIZARD_GLASS_IMG}</span>`;

const LIZARD_AVATAR = `<span class="chat-msg-avatar">${LIZARD_GLASS_IMG}</span>`;
const CHATBOT_TYPING = `<div class="chat-msg bot" id="chatbotTyping">${LIZARD_AVATAR}<div class="chat-bubble chat-typing"><span></span><span></span><span></span></div></div>`;

function renderChatbot() {
  const box = $('#chatbotMessages');
  if (!box) return;
  if (!S.chatMessages.length) {
    box.innerHTML = `<div class="chat-msg bot">${LIZARD_AVATAR}<div class="chat-bubble">안녕하세요! 저는 챗봇이에요<br>B1H4 워크스페이스 사용이 궁금하면 물어보세요.</div></div>`;
    return;
  }
  box.innerHTML = S.chatMessages.map(m => `
    <div class="chat-msg ${m.from}">${m.from === 'bot' ? LIZARD_AVATAR : ''}<div class="chat-bubble">${esc(correctSpelling(m.text))}</div></div>`).join('');
  box.scrollTop = box.scrollHeight;
}

const STATUS_ANNOUNCE = {
  '할 일': '할 일 상태예요',
  '진행 중': '진행중입니다',
  '검토': '검토중입니다',
  '완료': '완료됐습니다'
};

function announceStatusChange(title, status) {
  const phrase = STATUS_ANNOUNCE[status] || `'${status}' 상태예요`;
  S.chatMessages.push({ from: 'bot', text: `'${title}' 작업이 ${phrase}.` });
  if ($('#chatbotPanel').classList.contains('on') && S.chatbotTab === 'bot') renderChatbot();
}

function sendChatMessage() {
  const input = $('#chatbotInput');
  const text = input.value.trim();
  if (!text) return;
  S.chatMessages.push({ from: 'user', text });
  input.value = '';
  input.disabled = true;
  renderChatbot();
  const box = $('#chatbotMessages');
  if (box) { box.insertAdjacentHTML('beforeend', CHATBOT_TYPING); box.scrollTop = box.scrollHeight; }
  setTimeout(() => {
    S.chatMessages.push({ from: 'bot', text: lizardBotReply(text) });
    renderChatbot();
    input.disabled = false;
    input.focus();
  }, 500 + Math.random() * 300);
}

/* ------------------------------ 팀원 메시지 ------------------------------ */

async function loadDmThreads() {
  S.dmThreads = (await api('GET', '/api/messages/threads')).threads;
  renderChatbotFabBadge();
}

async function loadDmMessages(userId) {
  S.dmMessages = (await api('GET', '/api/messages/' + userId)).messages;
}

function renderChatbotFabBadge() {
  const totalUnread = S.dmThreads.reduce((sum, t) => sum + t.unread, 0);
  const fab = $('#chatbotToggle');
  if (!fab) return;
  let badge = fab.querySelector('.fab-badge');
  if (totalUnread > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'fab-badge';
      fab.appendChild(badge);
    }
    badge.textContent = totalUnread > 9 ? '9+' : String(totalUnread);
  } else if (badge) {
    badge.remove();
  }
}

function renderChatbotTabs() {
  $$('#chatbotTabs .chatbot-tab').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.chatbotTab === S.chatbotTab);
  });
  const totalUnread = S.dmThreads.reduce((sum, t) => sum + t.unread, 0);
  const badge = $('#dmUnreadBadge');
  if (badge) {
    badge.textContent = totalUnread > 9 ? '9+' : String(totalUnread);
    badge.style.display = totalUnread ? 'inline-flex' : 'none';
  }
  $('#chatbotTitle').textContent = S.chatbotTab === 'dm' ? '팀원 메시지' : S.chatbotTab === 'team' ? '팀 채팅' : '챗봇';
  $('#chatbotSub').textContent = S.chatbotTab === 'dm' ? '팀원과 1:1로 대화해 보세요' : S.chatbotTab === 'team' ? '팀원 전체와 함께 대화해 보세요' : '무엇이든 물어보세요';
}

function renderDmList() {
  const box = $('#chatbotMessages');
  if (!box) return;
  if (!S.dmThreads.length) {
    box.innerHTML = `<div class="empty" style="padding:24px">${icon('team', 28)}<strong>팀원이 없습니다</strong>다른 팀원이 합류하면 메시지를 보낼 수 있어요.</div>`;
    return;
  }
  const sorted = S.dmThreads.slice().sort((a, b) => {
    const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return tb - ta;
  });
  box.innerHTML = sorted.map(t => {
    const u = userById(t.userId);
    if (!u) return '';
    const preview = t.lastMessage
      ? (t.lastMessage.fromId === S.me.id ? '나: ' : '') + esc(t.lastMessage.body).slice(0, 36)
      : '아직 메시지가 없어요';
    return `<button class="dm-contact" data-dm-open="${u.id}">
      ${avatar(u, 'sm')}
      <div class="dm-contact-body">
        <div class="dm-contact-name">${esc(u.name)}</div>
        <div class="dm-contact-preview">${preview}</div>
      </div>
      ${t.unread ? `<span class="dm-unread-dot">${t.unread}</span>` : ''}
    </button>`;
  }).join('');
}

function renderDmThread() {
  const box = $('#chatbotMessages');
  if (!box) return;
  if (!S.dmMessages.length) {
    box.innerHTML = `<div class="empty" style="padding:24px">${icon('comment', 26)}<strong>대화를 시작해 보세요</strong></div>`;
    return;
  }
  box.innerHTML = S.dmMessages.map(m => `
    <div class="chat-msg ${m.fromId === S.me.id ? 'user' : 'bot'}">
      <div class="chat-bubble">${esc(correctSpelling(m.body))}</div>
      <button type="button" class="chat-scrap-btn" data-dm-scrap="${m.id}" title="회의록에 추가">${icon('story', 13)}</button>
    </div>`).join('');
  box.scrollTop = box.scrollHeight;
}

function renderChatbotBody() {
  const head = $('#dmThreadHead');
  const inputRow = $('#chatbotInputRow');
  if (!head || !inputRow) return;

  if (S.chatbotTab === 'bot') {
    head.style.display = 'none';
    inputRow.style.display = 'flex';
    renderChatbot();
    return;
  }

  if (S.chatbotTab === 'team') {
    head.style.display = 'none';
    inputRow.style.display = 'flex';
    renderTeamChatThread();
    return;
  }

  if (S.dmActiveUserId) {
    const partner = userById(S.dmActiveUserId);
    head.style.display = 'flex';
    head.innerHTML = `<button class="dm-back" data-dm-back="1">${icon('chevronLeft', 16)}</button>${avatar(partner, 'sm')}<span class="dm-thread-name">${esc(partner ? partner.name : '알 수 없음')}</span>`;
    inputRow.style.display = 'flex';
    renderDmThread();
  } else {
    head.style.display = 'none';
    inputRow.style.display = 'none';
    renderDmList();
  }
}

async function sendDmMessage() {
  const input = $('#chatbotInput');
  const text = input.value.trim();
  if (!text || !S.dmActiveUserId) return;
  input.value = '';
  input.disabled = true;
  try {
    await api('POST', '/api/messages', { toId: S.dmActiveUserId, body: text });
    await loadDmMessages(S.dmActiveUserId);
    renderDmThread();
  } catch (err) {
    toast(err.message, 'warn');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

/* ------------------------------ 팀 단체 채팅 ------------------------------ */

async function loadTeamChat() {
  S.teamChatMessages = (await api('GET', '/api/team-chat')).messages;
}

function renderTeamChatThread() {
  const box = $('#chatbotMessages');
  if (!box) return;
  if (!S.teamChatMessages.length) {
    box.innerHTML = `<div class="empty" style="padding:24px">${icon('team', 26)}<strong>아직 메시지가 없어요</strong>팀원들과 대화를 시작해 보세요.</div>`;
    return;
  }
  box.innerHTML = S.teamChatMessages.map(m => {
    const u = userById(m.userId);
    const mine = m.userId === S.me.id;
    return `<div class="chat-msg ${mine ? 'user' : 'bot'} team-chat-msg">
      ${!mine ? avatar(u, 'sm') : ''}
      <div class="team-chat-bubble-wrap">
        ${!mine ? `<div class="team-chat-name">${esc(u ? u.name : '알 수 없음')}</div>` : ''}
        <div class="chat-bubble">${esc(correctSpelling(m.body))}</div>
      </div>
      <button type="button" class="chat-scrap-btn" data-team-scrap="${m.id}" title="회의록에 추가">${icon('story', 13)}</button>
    </div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

async function sendTeamChatMessage() {
  const input = $('#chatbotInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.disabled = true;
  try {
    await api('POST', '/api/team-chat', { body: text });
  } catch (err) {
    toast(err.message, 'warn');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function sendActiveMessage() {
  if (S.chatbotTab === 'dm') sendDmMessage();
  else if (S.chatbotTab === 'team') sendTeamChatMessage();
  else sendChatMessage();
}

/* --------------------------- 챗봇 아이콘 자유 이동 --------------------------- */

const FAB_DRAG_THRESHOLD = 4;
let fabDragState = null;
let fabDragMoved = false;

function fabPosKey() {
  return 'b1h4.fabPos.' + (S.me ? S.me.id : 'anon');
}

function clampFabPosition(x, y, w, h) {
  const maxX = Math.max(6, window.innerWidth - (w || 66) - 6);
  const maxY = Math.max(6, window.innerHeight - (h || 66) - 6);
  return { x: Math.min(Math.max(x, 6), maxX), y: Math.min(Math.max(y, 6), maxY) };
}

function applyFabPosition(x, y) {
  const fab = $('#chatbotToggle');
  if (!fab) return;
  const p = clampFabPosition(x, y, fab.offsetWidth, fab.offsetHeight);
  fab.style.left = p.x + 'px';
  fab.style.top = p.y + 'px';
  fab.style.right = 'auto';
  fab.style.bottom = 'auto';
}

function loadFabPosition() {
  const fab = $('#chatbotToggle');
  if (!fab) return;
  try {
    const saved = JSON.parse(localStorage.getItem(fabPosKey()) || 'null');
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') applyFabPosition(saved.x, saved.y);
  } catch (e) { /* noop */ }
}

function saveFabPosition(x, y) {
  try { localStorage.setItem(fabPosKey(), JSON.stringify({ x, y })); } catch (e) { /* noop */ }
}

function initFabDrag() {
  const fab = $('#chatbotToggle');
  if (!fab || fab.dataset.dragBound) return;
  fab.dataset.dragBound = '1';

  fab.addEventListener('dragstart', e => e.preventDefault());

  let dragW = 66;
  let dragH = 66;
  let pendingX = 0;
  let pendingY = 0;
  let rafId = null;

  function flushPosition() {
    rafId = null;
    const p = clampFabPosition(pendingX, pendingY, dragW, dragH);
    fab.style.left = p.x + 'px';
    fab.style.top = p.y + 'px';
  }

  fab.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const rect = fab.getBoundingClientRect();
    dragW = rect.width;
    dragH = rect.height;
    fabDragState = {
      startX: e.clientX, startY: e.clientY,
      originX: rect.left, originY: rect.top,
      hadPosition: !!fab.style.left
    };
    fabDragMoved = false;
    fab.classList.add('picked');
    fab.setPointerCapture(e.pointerId);
  });

  fab.addEventListener('pointermove', e => {
    if (!fabDragState) return;
    const dx = e.clientX - fabDragState.startX;
    const dy = e.clientY - fabDragState.startY;
    if (!fabDragMoved && Math.hypot(dx, dy) >= FAB_DRAG_THRESHOLD) {
      fabDragMoved = true;
      fab.classList.add('dragging');
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
    }
    // 드래그로 확정되기 전에도 좌표를 바로 추적해서, 문턱값을 넘는 순간
    // 위치가 툭 튀지 않고 커서를 따라 처음부터 자연스럽게 붙어오게 한다.
    pendingX = fabDragState.originX + dx;
    pendingY = fabDragState.originY + dy;
    if (rafId === null) rafId = requestAnimationFrame(flushPosition);
  });

  const endDrag = e => {
    if (!fabDragState) return;
    fab.classList.remove('dragging');
    fab.classList.remove('picked');
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    if (fabDragMoved) {
      flushPosition();
      saveFabPosition(pendingX, pendingY);
    } else if (fabDragState.hadPosition) {
      // 이전에 옮겨둔 적이 있으면, 잠깐 따라온 좌표를 원래 위치로 되돌린다.
      fab.style.left = fabDragState.originX + 'px';
      fab.style.top = fabDragState.originY + 'px';
    } else {
      // 아직 한 번도 옮긴 적 없는 기본 위치라면, 문턱값 이하의 흔들림으로
      // 생긴 인라인 좌표를 지우고 원래 CSS(right/bottom) 배치로 되돌린다.
      fab.style.left = '';
      fab.style.top = '';
    }
    fabDragState = null;
    try { fab.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
  };
  fab.addEventListener('pointerup', endDrag);
  fab.addEventListener('pointercancel', endDrag);

  fab.addEventListener('click', e => {
    if (fabDragMoved) {
      e.preventDefault();
      e.stopImmediatePropagation();
      fabDragMoved = false;
    }
  }, true);

  window.addEventListener('resize', () => {
    if (!fab.style.left) return;
    const rect = fab.getBoundingClientRect();
    applyFabPosition(rect.left, rect.top);
  });
}

function positionChatbotPanel() {
  const fab = $('#chatbotToggle');
  const panel = $('#chatbotPanel');
  if (!fab || !panel) return;
  const rect = fab.getBoundingClientRect();
  const panelW = panel.offsetWidth || 320;
  const panelH = Math.min(panel.offsetHeight || 460, window.innerHeight - 24);

  let left = rect.left + rect.width / 2 - panelW / 2;
  left = Math.min(Math.max(left, 12), window.innerWidth - panelW - 12);

  let top = rect.top - panelH - 12;
  if (top < 12) top = Math.min(rect.bottom + 12, window.innerHeight - panelH - 12);

  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
}

/* --------------------------- 챗봇 창 자유 이동 --------------------------- */

const PANEL_DRAG_THRESHOLD = 4;
let panelDragState = null;
let panelDragMoved = false;

function chatbotPanelPosKey() {
  return 'b1h4.chatbotPanelPos.' + (S.me ? S.me.id : 'anon');
}

function clampPanelPosition(x, y, w, h) {
  const maxX = Math.max(6, window.innerWidth - (w || 320) - 6);
  const maxY = Math.max(6, window.innerHeight - (h || 460) - 6);
  return { x: Math.min(Math.max(x, 6), maxX), y: Math.min(Math.max(y, 6), maxY) };
}

function applyChatbotPanelPosition(x, y) {
  const panel = $('#chatbotPanel');
  if (!panel) return;
  const p = clampPanelPosition(x, y, panel.offsetWidth, panel.offsetHeight);
  panel.style.left = p.x + 'px';
  panel.style.top = p.y + 'px';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
}

// 사용자가 예전에 창을 직접 옮겨둔 적이 있으면 그 자리를 복원하고, 없으면
// positionChatbotPanel()의 FAB 기준 자동 배치를 그대로 쓰도록 false를 반환한다.
function restoreChatbotPanelPosition() {
  if (window.innerWidth <= 780) return false;
  try {
    const saved = JSON.parse(localStorage.getItem(chatbotPanelPosKey()) || 'null');
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      applyChatbotPanelPosition(saved.x, saved.y);
      return true;
    }
  } catch (e) { /* noop */ }
  return false;
}

function saveChatbotPanelPosition(x, y) {
  try { localStorage.setItem(chatbotPanelPosKey(), JSON.stringify({ x, y })); } catch (e) { /* noop */ }
}

function initChatbotPanelDrag() {
  const panel = $('#chatbotPanel');
  const handle = panel && panel.querySelector('.chatbot-head');
  if (!panel || !handle || handle.dataset.dragBound) return;
  handle.dataset.dragBound = '1';

  let dragW = 320, dragH = 460, pendingX = 0, pendingY = 0, rafId = null;

  function flushPosition() {
    rafId = null;
    const p = clampPanelPosition(pendingX, pendingY, dragW, dragH);
    panel.style.left = p.x + 'px';
    panel.style.top = p.y + 'px';
  }

  handle.addEventListener('pointerdown', e => {
    if (window.innerWidth <= 780) return;
    if (e.target.closest('.icon-btn')) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const rect = panel.getBoundingClientRect();
    dragW = rect.width;
    dragH = rect.height;
    panelDragState = { startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top };
    panelDragMoved = false;
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', e => {
    if (!panelDragState) return;
    const dx = e.clientX - panelDragState.startX;
    const dy = e.clientY - panelDragState.startY;
    if (!panelDragMoved && Math.hypot(dx, dy) >= PANEL_DRAG_THRESHOLD) {
      panelDragMoved = true;
      panel.classList.add('dragging');
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
    pendingX = panelDragState.originX + dx;
    pendingY = panelDragState.originY + dy;
    if (rafId === null) rafId = requestAnimationFrame(flushPosition);
  });

  const endDrag = e => {
    if (!panelDragState) return;
    panel.classList.remove('dragging');
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    if (panelDragMoved) {
      flushPosition();
      saveChatbotPanelPosition(pendingX, pendingY);
    } else {
      panel.style.left = panelDragState.originX + 'px';
      panel.style.top = panelDragState.originY + 'px';
    }
    panelDragState = null;
    try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', () => {
    if (!panel.classList.contains('on') || !panel.style.left) return;
    const rect = panel.getBoundingClientRect();
    applyChatbotPanelPosition(rect.left, rect.top);
  });
}

async function toggleChatbot(force) {
  const panel = $('#chatbotPanel');
  const opening = typeof force === 'boolean' ? force : !panel.classList.contains('on');
  if (opening) {
    renderChatbotTabs();
    renderChatbotBody();
  }
  panel.classList.toggle('on', opening);
  if (opening) {
    if (!restoreChatbotPanelPosition()) positionChatbotPanel();
    await loadDmThreads();
    renderChatbotTabs();
    if (S.chatbotTab === 'dm' && !S.dmActiveUserId) renderDmList();
    if (S.chatbotTab === 'team') { await loadTeamChat(); renderTeamChatThread(); }
    if (!restoreChatbotPanelPosition()) positionChatbotPanel();
  } else {
    $('#cursorPet').classList.remove('on');
  }
}

function getLizardPetEnabled() {
  try { return localStorage.getItem('b1h4.lizardPet') !== '0'; } catch (e) { return true; }
}

function setLizardPetEnabled(enabled) {
  try { localStorage.setItem('b1h4.lizardPet', enabled ? '1' : '0'); } catch (e) { /* noop */ }
  if (!enabled) {
    const pet = $('#cursorPet');
    if (pet) pet.classList.remove('on');
  }
}

function initCursorPet() {
  const panel = $('#chatbotPanel');
  const pet = $('#cursorPet');
  if (!panel || !pet) return;
  let lastX = null;

  panel.addEventListener('mousemove', e => {
    if (!getLizardPetEnabled()) {
      pet.classList.remove('on');
      return;
    }
    const rect = panel.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pet.style.left = x + 'px';
    pet.style.top = (y + 16) + 'px';
    pet.classList.add('on');
    if (lastX !== null && Math.abs(e.clientX - lastX) > 1) {
      pet.classList.toggle('flip', e.clientX < lastX);
    }
    lastX = e.clientX;
  });

  panel.addEventListener('mouseleave', () => {
    pet.classList.remove('on');
    lastX = null;
  });
}

document.addEventListener('click', async e => {
  if (e.target.closest('#chatbotToggle')) { toggleChatbot(); return; }
  if (e.target.closest('#chatbotClose')) { toggleChatbot(false); return; }

  const tabBtn = e.target.closest('[data-chatbot-tab]');
  if (tabBtn) {
    S.chatbotTab = tabBtn.dataset.chatbotTab;
    renderChatbotTabs();
    renderChatbotBody();
    if (S.chatbotTab === 'dm') { await loadDmThreads(); renderChatbotTabs(); if (!S.dmActiveUserId) renderDmList(); }
    if (S.chatbotTab === 'team') { await loadTeamChat(); renderTeamChatThread(); }
    return;
  }

  const dmOpen = e.target.closest('[data-dm-open]');
  if (dmOpen) {
    S.dmActiveUserId = dmOpen.dataset.dmOpen;
    await loadDmMessages(S.dmActiveUserId);
    await loadDmThreads();
    renderChatbotBody();
    renderChatbotTabs();
    return;
  }

  const dmBack = e.target.closest('[data-dm-back]');
  if (dmBack) {
    S.dmActiveUserId = null;
    S.dmMessages = [];
    renderChatbotBody();
    return;
  }

  const dmScrap = e.target.closest('[data-dm-scrap]');
  if (dmScrap) {
    const msg = S.dmMessages.find(x => x.id === dmScrap.dataset.dmScrap);
    if (!msg) return;
    if (S.view === 'meetings' && S.meetingEditing && $('#mBody')) {
      const body = $('#mBody');
      body.value = body.value ? body.value.replace(/\n*$/, '\n') + `- ${msg.body}\n` : `- ${msg.body}\n`;
      toast('회의록에 추가했습니다.');
    } else {
      toast('회의록 편집 화면을 먼저 열어주세요.', 'warn');
    }
    return;
  }

  const teamScrap = e.target.closest('[data-team-scrap]');
  if (teamScrap) {
    const msg = S.teamChatMessages.find(x => x.id === teamScrap.dataset.teamScrap);
    if (!msg) return;
    if (S.view === 'meetings' && S.meetingEditing && $('#mBody')) {
      const body = $('#mBody');
      const u = userById(msg.userId);
      const line = `${u ? u.name + ': ' : ''}${msg.body}`;
      body.value = body.value ? body.value.replace(/\n*$/, '\n') + `- ${line}\n` : `- ${line}\n`;
      toast('회의록에 추가했습니다.');
    } else {
      toast('회의록 편집 화면을 먼저 열어주세요.', 'warn');
    }
    return;
  }
});

$('#chatbotSend').addEventListener('click', sendActiveMessage);
$('#chatbotInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) sendActiveMessage(); });

/* ================================ 시작 ================================ */

bootAuth().catch(() => {
  $('#authScreen').style.display = 'grid';
});
