# 산출물 모듈 (deliverables)

양식을 고르고 파일(pdf, md, txt, docx, hwp, xlsx …)을 올리면 **내용이 양식의 각 칸에 자동으로 들어가고**,
미리보기에서 바로 고친 뒤 **PDF / HWP / DOCX 로 저장**하는 기능입니다.

이 폴더 하나가 기능 전체입니다. 폴더를 통째로 복사하고 아래 **"다른 프로젝트에 붙이는 법"** 3단계만
따라 하면 그대로 동작합니다. 외부 npm 패키지를 하나도 쓰지 않습니다(`express` 는 호스트가 이미 씁니다).

---

## 폴더 구조

```
deliverables/
  index.js              ← 진입점. mountDeliverables(app, { requireAuth })
  lib/
    extract.js          확장자별 텍스트 추출 (txt/md/csv/docx/xlsx/pptx/hwp/hwpx/pdf)
    pdf.js              PDF 텍스트 추출기 (직접 구현)
    cfb.js              한글(.hwp)이 쓰는 OLE 복합문서 리더
    zip.js              ZIP 읽기/쓰기 (docx·xlsx·hwpx 읽기 + docx 쓰기)
    xml.js              XML 도우미
    structure.js        추출한 글을 "제목 붙은 덩어리"로 정리
    autofill.js         정리된 내용을 양식 칸에 배치
    render.js           입력값 → docx / hml 파일 생성 (양식 틀 그대로)
    templates.js        templates/*.json 로딩
    store.js            작성한 산출물 저장 (deliverables/data/documents.json)
  tools/
    pdf-grid.js         [개발용] PDF 원본에서 표 격자(열/행/병합) 좌표 추출
  templates/            ★ 양식 정의 JSON (여기에 파일을 넣으면 목록이 늘어남)
    samples/            받은 양식 원본(pdf/pptx/xlsx)을 참고용으로 두는 자리
  public/
    deliverables.js     화면 (app.js 의 registerModule 로 스스로 등록)
    deliverables.css    스타일 (클래스는 전부 .dv- 로 시작)
  data/                 저장한 산출물 (호스트의 data/db.json 은 건드리지 않음)
```

---

## 다른 프로젝트에 붙이는 법 (3단계)

### 1. 서버 — `server.js` 에 두 줄

`app.use(express.static(...))` 아래에 넣습니다.

```js
/* === 산출물 모듈 연결 시작 (deliverables) === */
require('./deliverables')(app, { requireAuth: (req, res, next) => requireAuth(req, res, next) });
/* === 산출물 모듈 연결 끝 === */
```

- `requireAuth` 는 **넘기지 않아도 됩니다.** 없으면 로그인 검사 없이 동작합니다.
- 반드시 `app.get('*')` 같은 catch-all 라우트보다 **위**에 있어야 합니다.
- 업로드는 `application/octet-stream` 으로 받기 때문에 호스트의 `express.json({limit:'1mb'})` 와 부딪히지 않습니다.

### 2. 화면 — `index.html` 에 두 줄

```html
<link rel="stylesheet" href="/deliverables/deliverables.css">
...
<script src="/js/app.js"></script>
<script src="/deliverables/deliverables.js"></script>   <!-- app.js 뒤 -->
```

### 3. 메뉴 자리 — `app.js` 에 모듈 레지스트리

이 프로젝트에는 이미 들어가 있습니다(`=== 확장 모듈 레지스트리 ===` 주석). 다른 앱에 붙일 때는
NAV 배열 선언 뒤에 이 블록을 넣고,

```js
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
```

화면 분기(`render()`)의 마지막에 이 한 덩어리를 더합니다.

```js
else {
  const mod = MODULES.find(m => m.id === S.view);
  if (mod) { view.innerHTML = mod.view(); if (mod.bind) mod.bind(); }
}
```

**호스트에서 빌려 쓰는 것은 `esc / icon / api / toast / S` 다섯 개뿐입니다.** 이 이름이 없는 앱에 붙일 때는
`public/deliverables.js` 맨 위에서 같은 역할을 하는 함수로 바꿔주면 됩니다.

떼어낼 때는 위 세 곳의 표시된 블록을 지우고 `deliverables/` 폴더를 삭제하면 흔적이 남지 않습니다.

---

## 현재 등록된 양식 (9종)

원본은 `templates/samples/` 에 함께 넣어두었습니다.

| 번호 | 양식 | 정의 파일 | 원본 |
| --- | --- | --- | --- |
| 1 | 1.1 브레인 스토밍 | `01-brainstorming.json` | pdf |
| 2 | 1.2 프로젝트 기획서 | `02-project-proposal.json` | pdf |
| 3 | 1.3 요구사항 정의서 | `03-requirements.json` | pdf |
| 4 | 2.1 데이터베이스 요구사항 분석서 | `04-db-requirements.json` | pdf |
| 5 | 2.2 화면 설계서 | `05-screen-design.json` | pptx + pdf |
| 6 | 2.3 빅데이터 분석 정의서 | `06-bigdata-analysis.json` | pdf |
| 7 | 3.1 WBS | `07-wbs.json` | xlsx |
| 8 | 3.2 프로젝트 진행일지 | `08-progress-log.json` | pdf |
| 9 | 3.3 멘토링 일지 | `09-mentoring-log.json` | xlsx |

## 양식 추가하기 (가장 자주 하게 될 작업)

`templates/` 에 JSON 파일 하나를 넣으면 **서버를 껐다 켜지 않아도** 목록에 나타납니다.
파일 이름 순서가 곧 화면의 목록 순서입니다(`10-...json` 처럼 번호를 붙이세요).

양식은 **원본 문서의 표 틀을 그대로 옮긴 `layout`** 으로 씁니다.
화면 미리보기 · PDF 인쇄 · docx · hwp 가 전부 이 하나의 정의를 보고 그리기 때문에,
어느 쪽으로 저장해도 원본 양식과 같은 모양이 나옵니다.

```jsonc
{
  "id": "weekly-report",            // 겹치면 안 됨
  "name": "3.4 주간 업무 보고서",     // 목록에 보이는 이름
  "desc": "금주 실적 · 차주 계획",    // 목록의 설명 한 줄
  "source": "3.4._주간보고.pdf",     // 참고한 원본 (samples/ 안의 파일명)

  "layout": {
    "title": "주간 업무 보고서",       // 표 위에 인쇄되는 문서 제목
    "columns": [80, 120, 100, 160],  // 열 너비 — 원본 pt 값을 그대로 쓰면 비율이 같아집니다
    "rows": [
      { "h": 26, "cells": [                      // h = 행 높이(pt)
        { "label": "작성자", "span": 1 },         // 회색 항목명 칸 (고정 인쇄)
        { "key": "author", "span": 3,            // 사용자가 채우는 칸
          "context": "author",                   // author | today | projectName | teamName
          "keywords": ["작성자", "보고자"] }       // 업로드 문서에서 찾을 말
      ]},

      { "h": 90, "cells": [
        { "label": "개요", "span": 1 },
        { "key": "overview", "span": 3, "multiline": true }   // 여러 줄 입력
      ]},

      { "title": "금주 수행 업무" },               // 표를 끊고 들어가는 소제목

      { "h": 20, "header": true, "cells": [       // 표 머리글 줄
        { "label": "업무", "span": 2 },
        { "label": "담당", "span": 1 },
        { "label": "진행률", "span": 1 }
      ]},
      { "h": 24, "repeat": "tasks", "minRows": 5, "cells": [   // 행이 늘어나는 표
        { "key": "task",  "span": 2, "for": "업무" },
        { "key": "owner", "span": 1, "for": "담당", "context": "roster" },
        { "key": "rate",  "span": 1, "for": "진행률" }
      ]}
    ]
  }
}
```

### 칸(cell) 속성

| 속성 | 뜻 |
| --- | --- |
| `label` | 고정으로 인쇄되는 항목명. 기본으로 회색 배경(`"head": false` 로 끌 수 있음) |
| `key` | 사용자가 채우는 칸. 값이 이 이름으로 저장됨 |
| `span` / `rowSpan` | 가로 / 세로 병합 |
| `rowSpanOf` | 아래 반복 표의 행 수만큼 자동으로 세로 병합 (예: 진행일지의 "팀구성원") |
| `multiline` | 여러 줄 입력칸 |
| `align` | `center`(기본) / `left` / `right` |
| `for` | 자동 채우기에서 쓸 항목 이름 (표 안처럼 왼쪽에 라벨이 없을 때) |
| `context` | 앱이 아는 값으로 먼저 채움: `author` `today` `projectName` `teamName` `roster` |
| `keywords` | 업로드 문서에서 찾을 말 (없으면 왼쪽 `label` 을 씀) |
| `fallback` | `"firstLine"` — 못 찾으면 문서 첫 줄을 씀 (제목 칸에 유용) |
| `maxLines` | 자동 채우기에서 가져올 최대 줄 수 (표지 제목처럼 2줄까지만 받고 싶을 때) |
| `catchAll` | 어디에도 못 넣은 내용을 모두 받아 적는 칸. **양식당 하나만** |
| `placeholder` | 빈 칸에 흐리게 보이는 안내문 |

### 행(row) 속성

| 속성 | 뜻 |
| --- | --- |
| `h` | 행 높이(pt). 원본 값을 그대로 넣으면 됩니다 |
| `header` | 표 머리글 줄 표시 |
| `title` | 이 자리에서 표를 끊고 소제목을 넣음 |
| `repeat` | 행이 늘어나는 표. 값은 `[{칸이름: 값}, …]` 로 저장됨 |
| `minRows` | 비어 있을 때 보여줄 기본 행 수 |
| `block` | 여러 줄이 **한 덩어리로** 반복 (유스케이스 명세처럼 세로로 늘어선 항목) |
| `match` | 자동 채우기에서 이 표를 찾을 때 쓸 다른 이름들 (화면에는 안 보임) |

### 표지 (원본 1쪽이 있는 양식)

```jsonc
"layout": {
  "cover": {
    "title": "프로젝트 기획서",
    "lines": [
      { "label": "과제명 :", "key": "subject", "multiline": true, "maxLines": 2,
        "fallback": "firstLine", "keywords": ["과제명", "주제명"] },
      { "key": "coverDate", "context": "today" }
    ]
  },
  "columns": [ ... ],
  "rows": [ ... ]
}
```

표지가 있으면 PDF 인쇄에서 한 장을 채우고 페이지가 넘어가며, DOCX 에는 페이지 나누기가 들어갑니다.
현재 표지가 있는 양식: 1.2 기획서 · 1.3 요구사항 정의서 · 2.1 DB 요구사항 분석서 · 2.2 화면 설계서 · 2.3 빅데이터 분석 정의서

### 원본 좌표를 뽑는 도구

PDF 원본이 있으면 열 너비·행 높이·병합을 손으로 재지 않아도 됩니다.

```bash
node tools/pdf-grid.js "templates/samples/3.2._프로젝트진행일지(예시).pdf" 1
```

칸마다 `[r행+세로병합 c열+가로병합] (x,y 너비x높이) 글자` 가 나옵니다.
열 경계 x 값의 차이가 곧 `columns`, 높이가 `h` 입니다.

### 자동 채우기가 값을 찾는 순서

1. 같은 줄의 바로 다음 칸 — `제안자 ⇥ 홍길동`
2. 항목명 아래로 이어지는 줄들 — `차별성` 다음 줄부터 다음 항목명 직전까지
3. `키: 값` / `[키] 값` 형태
4. `context` (로그인한 사람, 오늘 날짜, 팀 조직도)
5. `fallback`

`repeat` 표는 문서에서 **열 이름이 여러 개 맞아떨어지는 머리글 줄**을 찾아 그 아래를 행으로 가져옵니다.
`block` 반복은 첫 항목명이 몇 번 나오는지로 항목 수를 셉니다.
끝까지 못 넣은 내용은 화면의 **"자동으로 넣지 못한 내용"** 에 보여주어 직접 옮길 수 있습니다.

> 받은 양식 원본(pdf/pptx/xlsx)은 `templates/samples/` 에 넣어 두었습니다.

## API

전부 `/api/deliverables` 아래에 있습니다.

| 메서드 | 경로 | 하는 일 |
| --- | --- | --- |
| GET | `/templates` | 양식 목록 |
| POST | `/extract?filename=&templateId=&context=` | 파일 바이트를 본문(octet-stream)으로 받아 추출 + 자동 채우기 |
| POST | `/fill` | 이미 읽은 원문을 **다른 양식**에 다시 채움 (재업로드 불필요) |
| POST | `/export/docx`, `/export/hwp` | 입력값으로 파일 생성해 내려줌 |
| GET/POST/PATCH/DELETE | `/documents` | 작성한 산출물 저장·목록·수정·삭제 |

---

## 알아둘 점 / 한계

- **PDF 저장**은 브라우저 인쇄창(→ "PDF로 저장")을 씁니다. 팝업 차단을 풀어야 합니다.
- **HWP 저장**은 한글 호환 형식인 `.hml` 파일입니다. 한글에서 열어 `.hwp` 로 다시 저장하면 됩니다.
  (`.hwp` 바이너리는 공개 규격이 아니라 직접 만들지 않습니다. 기존 회의록 내보내기와 같은 방식입니다.)
- **DOCX 저장**은 진짜 `.docx` 파일을 만듭니다(Windows OPC 패키지 검사 통과).
- **PDF 읽기**는 글자가 들어 있는 PDF만 됩니다. 스캔한 그림 PDF는 글자를 뽑을 수 없어
  경고를 띄우고 사용자가 직접 붙여넣도록 안내합니다.
- 한글 파일은 `.hwp`(구버전 바이너리)와 `.hwpx` 둘 다 읽습니다. 본문을 못 읽으면 미리보기 텍스트로
  대체하고 그 사실을 화면에 알립니다.
- 업로드 한도는 25MB(`index.js` 의 `MAX_UPLOAD_BYTES`)입니다.
- 저장한 산출물은 `deliverables/data/documents.json` 에만 쌓입니다. 호스트의 `data/db.json` 은 건드리지 않습니다.
