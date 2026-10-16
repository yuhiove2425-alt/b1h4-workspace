# 인수인계 — 산출물(deliverables) 모듈

이 폴더 하나가 기능 전체입니다. 폴더를 통째로 복사하고 **아래 3단계**만 하면 붙습니다.
외부 npm 패키지를 하나도 쓰지 않습니다(`express` 는 호스트가 이미 씁니다).

- 기능 설명 · 양식 JSON 스키마 · API 목록 → [`README.md`](README.md)
- 이 문서는 **붙이는 절차**만 다룹니다.

---

## 이 모듈이 하는 일

사이드바 `산출물` 메뉴에서

1. 왼쪽에서 양식을 고르고 (현재 9종)
2. 파일을 올리면 (`pdf, docx, hwp, hwpx, xlsx, pptx, txt, md, csv`)
3. 내용이 **원본 양식 그대로의 표**에 자동으로 채워지고
4. 미리보기에서 고친 뒤 **PDF / HWP(.hml) / DOCX** 로 저장합니다.

---

## 붙이는 법 (3단계)

### 0. 폴더 복사

받은 `deliverables/` 폴더를 **서버 진입점(`server.js`)과 같은 위치**에 둡니다.

```
프로젝트루트/
  server.js
  public/
  deliverables/     ← 여기
```

### 1. 서버 — `server.js` 에 두 줄

`app.use(express.static(...))` 아래, `app.get('*')` 같은 catch-all 라우트보다 **위**에 넣습니다.

```js
/* === 산출물 모듈 연결 시작 (deliverables) === */
require('./deliverables')(app, { requireAuth: (req, res, next) => requireAuth(req, res, next) });
/* === 산출물 모듈 연결 끝 === */
```

- `requireAuth` 는 **안 넘겨도 됩니다.** 없으면 로그인 검사 없이 동작합니다.
- 업로드는 `application/octet-stream` 으로 받으므로 호스트의 `express.json({limit:'1mb'})` 와 부딪히지 않습니다.

### 2. 화면 — `public/index.html` 에 두 줄

```html
<link rel="stylesheet" href="/deliverables/deliverables.css">
...
<script src="/js/app.js"></script>
<script src="/deliverables/deliverables.js"></script>   <!-- 반드시 app.js 뒤 -->
```

### 3. 메뉴 자리 — `public/js/app.js` 에 두 군데

**(3-1)** `NAV` 배열 선언 **뒤**에 모듈 레지스트리를 넣습니다.

```js
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
```

**(3-2)** 화면 분기 `render()` 의 `else if` 사슬 **맨 끝**에 붙입니다.

```js
  else {
    /* === 확장 모듈 화면 (산출물 등) === */
    const mod = MODULES.find(m => m.id === S.view);
    if (mod) {
      view.innerHTML = mod.view();
      if (mod.bind) mod.bind();
    }
  }
```

---

## 호스트에 요구하는 것 (다른 앱에 붙일 때 확인)

모듈이 호스트에서 빌려 쓰는 전역은 **다섯 개뿐**입니다.

| 이름 | 쓰임 |
| --- | --- |
| `esc(str)` | HTML 이스케이프 |
| `icon(name, size)` | SVG 아이콘 문자열 |
| `api(method, url, body)` | fetch 래퍼 (JSON 반환, 실패 시 throw) |
| `toast(msg, kind)` | 알림 표시 (`kind === 'warn'` 이면 경고) |
| `S` | `S.me`(로그인 사용자), `S.roster`(팀 조직도), `S.view`(현재 화면) |

이름이 다른 앱에 붙일 때는 `public/deliverables.js` 맨 위에서 같은 역할을 하는 함수로 바꿔주면 됩니다.
`S.roster` 는 **자동 채우기에서 담당자 열을 찾는 데** 쓰이므로 가능하면 연결해 주세요(없어도 동작합니다).

서버 쪽은 Node 16+ 표준 모듈(`fs`, `zlib`, `path`)과 `express` 만 씁니다.

---

## 붙인 뒤 확인 (2분)

```bash
npm start
```

1. 브라우저에서 접속 → 로그인 → 사이드바에 **`산출물`** 메뉴가 보이는지
2. 눌렀을 때 왼쪽에 양식 9개가 뜨는지
3. 아무 PDF 나 올려서 미리보기 표가 채워지는지
4. `DOCX 저장` 눌러서 파일이 열리는지

콘솔에 `[산출물] app.js 의 registerModule 을 찾지 못했습니다` 가 뜨면 → **3단계(3-1)** 가 빠졌거나 `deliverables.js` 가 `app.js` 보다 먼저 로드된 경우입니다.

API 직접 확인:

```bash
curl http://localhost:4000/api/deliverables/templates
```

---

## 떼어낼 때

위 3곳의 표시된 블록을 지우고 `deliverables/` 폴더를 삭제하면 흔적이 남지 않습니다.
호스트의 `data/db.json` 은 건드리지 않습니다(산출물 데이터는 `deliverables/data/documents.json` 에만 쌓입니다).

---

## 폴더 구성

```
deliverables/
  index.js              진입점. mountDeliverables(app, { requireAuth })
  lib/
    extract.js          확장자별 텍스트 추출 라우팅
    pdf.js              PDF 텍스트 추출기 (텍스트 행렬·CTM 직접 계산)
    cfb.js              한글(.hwp)이 쓰는 OLE 복합문서 리더
    zip.js              ZIP 읽기/쓰기 (docx·xlsx·hwpx 읽기 + docx 쓰기)
    xml.js              XML 도우미
    structure.js        추출한 글을 "제목 붙은 덩어리"로 정리
    autofill.js         내용을 보고 양식 칸·표 열에 배치
    render.js           입력값 → docx / hml 생성 (양식 틀 그대로)
    templates.js        templates/*.json 로딩 + 검증
    store.js            작성한 산출물 저장
  tools/
    pdf-grid.js         [개발용] PDF 원본에서 표 격자 좌표 추출
  templates/            ★ 양식 정의 JSON — 여기에 파일을 넣으면 목록이 늘어남
    samples/            받은 양식 원본 (참고용, 실행에는 쓰이지 않음)
  public/
    deliverables.js     화면 (registerModule 로 스스로 등록)
    deliverables.css    스타일 (클래스는 전부 .dv- 로 시작)
  data/                 작성한 산출물 저장소
```

---

## 자주 하게 될 작업

**양식 추가**: `templates/` 에 JSON 하나를 넣으면 **서버 재시작 없이** 목록에 나타납니다.
스키마와 예시는 [`README.md`](README.md) 의 "양식 추가하기" 절을 보세요.
PDF 원본이 있으면 열 너비·행 높이를 손으로 재지 말고 도구를 쓰세요.

```bash
node deliverables/tools/pdf-grid.js "deliverables/templates/samples/3.2._프로젝트진행일지(예시).pdf" 1
```

**자동 채우기가 이상할 때**: 화면의 `올린 파일에서 읽은 원문 보기` 로 추출 결과를 먼저 확인하세요.
추출이 깨졌으면 `lib/pdf.js`, 배치가 이상하면 `lib/autofill.js` 입니다.

---

## 알아둘 한계

- **PDF 저장**은 브라우저 인쇄창(→ "PDF로 저장")을 씁니다. 팝업 차단을 풀어야 합니다.
- **HWP 저장**은 한글 호환 `.hml` 입니다. 한글에서 열어 `.hwp` 로 다시 저장하면 됩니다(`.hwp` 바이너리는 공개 규격이 아닙니다).
- **DOCX**는 진짜 `.docx` 를 만듭니다(Windows OPC 패키지 검사 통과).
- **PDF 읽기**는 글자가 든 PDF만 됩니다. 스캔 이미지 PDF는 경고를 띄우고 직접 붙여넣도록 안내합니다.
- 원본에 박힌 **이미지·로고·다이어그램**은 재현하지 않고 자리만 비워 둡니다.
- 업로드 한도 25MB (`index.js` 의 `MAX_UPLOAD_BYTES`).
