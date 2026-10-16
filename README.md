<div align="center">

# B1H4 Workspace

**6인 팀이 서버 한 대로 바로 쓰는 실시간 협업 워크스페이스**<br>
작업 · 스프린트 · 캘린더 · 회의록 · 채팅을 한곳에서 관리하고, 교육 과정 산출물 양식을 자동으로 채웁니다.

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?logo=socketdotio&logoColor=white)
![JavaScript](https://img.shields.io/badge/Vanilla_JS-SPA-F7DF1E?logo=javascript&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Tunnel-F38020?logo=cloudflare&logoColor=white)

<img src="docs/screenshots/hero.png" alt="B1H4 Workspace 대시보드와 모바일 화면" width="100%">

</div>

| 항목 | 내용 |
| --- | --- |
| 기간 | 2026.07.20 ~ 2026.08.25 |
| 형태 | 팀 B1H4(6명) 협업 프로젝트 · 개발 2명(김유현, 방아연) · 팀 내부 실사용 |
| 내 역할 | 풀스택(백엔드 중심) — [자세히](#8-팀과-내-역할) |
| 사용 결과 | 팀원 6명 실사용 · DM 145건 · 팀 채팅 217건 · 회의록 8건 (2026.08.25 기준) |
| 규모 | 약 13,700줄(JS·HTML·CSS) · REST API 65개 · 런타임 의존성 4개 |
| 핵심 기술 | Node.js, Express, Socket.io, express-session, bcryptjs, Vanilla JS, Docker, Cloudflare Tunnel |

> 화면 속 인물·작업·대화는 모두 데모용 가상 데이터입니다. 실제 팀 데이터는 저장소에 포함하지 않았습니다.

## 목차

1. [만든 이유](#1-만든-이유)
2. [주요 기능](#2-주요-기능)
3. [시스템 구조](#3-시스템-구조)
4. [기술 스택과 선택 이유](#4-기술-스택과-선택-이유)
5. [핵심 설계](#5-핵심-설계)
6. [배포와 외부 공유](#6-배포와-외부-공유)
7. [한계와 개선 방향](#7-한계와-개선-방향)
8. [팀과 내 역할](#8-팀과-내-역할)
9. [실행 방법](#9-실행-방법)
10. [프로젝트 구조](#10-프로젝트-구조)

---

## 1. 만든 이유

팀 프로젝트를 하며 작업 관리, 일정, 회의록, 대화를 한곳에서 보고, 교육 과정에서 반복해서 제출하는 산출물 양식 작성을 줄이려고 만들었습니다.

설계 원칙은 세 가지였습니다.

- **설치 없이 바로 실행** — Node.js만 있으면 `start.bat` 더블클릭으로 서버가 뜨고, 같은 와이파이의 팀원은 창에 표시된 주소로 접속합니다.
- **비용 0원, 카드 등록 없이** — 외부 SaaS 대신 팀원 PC 한 대를 서버로 쓰고, 밖에서 접속할 때는 가입 없이 쓰는 Cloudflare 퀵 터널을 붙였습니다.
- **데이터는 팀이 소유** — 모든 데이터는 `data/db.json` 한 파일에 저장되고 매일 자동 백업됩니다. 폴더만 복사하면 이전이 끝납니다.

## 2. 주요 기능

### 팀 만들기와 초대 코드

첫 접속에서 팀을 만들면 그 계정이 팀장(PM)이 되고 8자리 초대 코드가 발급됩니다. 팀원은 코드가 있어야만 가입할 수 있고, 코드가 새면 팀장이 즉시 재발급합니다.

| 첫 접속 — 팀 만들기 | 팀 합류 — 초대 코드 입력 |
| --- | --- |
| <img src="docs/screenshots/00-team-setup.png" alt="팀 만들기 화면"> | <img src="docs/screenshots/01-join-invite-code.png" alt="초대 코드로 팀 합류"> |

### 오늘의 브리핑과 홈

로그인하면 오늘 일정이 브리핑으로 먼저 뜨고(매일 오전 9시에도 알림), 홈에서 내 작업·오늘 일정·마감·기한 초과를 한눈에 봅니다.

| 오늘의 브리핑 | 홈 |
| --- | --- |
| <img src="docs/screenshots/02-daily-briefing.png" alt="오늘의 브리핑"> | <img src="docs/screenshots/03-home.png" alt="홈"> |

### 대시보드와 작업 보드

할 일 → 진행 중 → 검토 → 완료 칸반 보드와 팀 현황 지표를 한 화면에 둡니다. `내 작업` · `높은 우선순위` · `차단됨` · `스프린트` 필터로 좁혀 봅니다.

<img src="docs/screenshots/04-dashboard.png" alt="대시보드와 작업 보드" width="100%">

### 작업 상세 · 작업목록 · 스프린트

작업마다 유형(작업·버그·스토리·에픽), 우선순위, 스토리 포인트, 마감일, 라벨, 선행 작업(차단 관계)을 둡니다. 담당자 한 명과 작업자 여러 명을 지정할 수 있고, 댓글에서 `@이름`으로 팀원을 부릅니다. 작업 키는 `B1H4-12`처럼 자동으로 매겨집니다.

| 작업 상세와 댓글 | 작업목록 |
| --- | --- |
| <img src="docs/screenshots/07-issue-detail.png" alt="작업 상세"> | <img src="docs/screenshots/06-backlog.png" alt="작업목록"> |

스프린트는 기간·목표·포인트를 갖고, 하나를 시작하면 이전 진행 스프린트는 자동으로 완료 처리됩니다.

<img src="docs/screenshots/05-sprint.png" alt="진행 중인 스프린트" width="80%">

### 캘린더

일정을 `팀 공유`로 올리면 팀원 전체에게 보이고 알림이 가며, 공유하지 않은 일정은 본인에게만 보입니다. 가시성 필터는 서버에서 적용합니다.

<img src="docs/screenshots/08-calendar.png" alt="캘린더" width="100%">

### 회의록과 투표

주간회의 · 아이디어 회의 · 긴급 점검 · 자유 회의 템플릿으로 시작해 참석자, 안건, 결정, 액션 아이템(담당자·기한), 이슈를 기록합니다. 회의 중 투표를 열고, 확정하면 수정이 잠깁니다. TXT · HTML · PDF · HWP 호환(.hml) 파일로 내보낼 수 있습니다.

| 회의록 | 투표 결과 |
| --- | --- |
| <img src="docs/screenshots/09-meeting.png" alt="회의록"> | <img src="docs/screenshots/09-poll.png" alt="투표"> |

### 공유메모와 팀 조직도

| 공유메모(마크다운) | 팀 조직도 |
| --- | --- |
| <img src="docs/screenshots/10-wiki.png" alt="공유메모"> | <img src="docs/screenshots/11-team.png" alt="팀 조직도"> |

### 실시간 채팅과 동기화

접속 중인 팀원 표시, 1:1 메시지, 팀 단체 채팅, 알림이 Socket.io로 실시간 반영됩니다. 아래는 팀원이 채팅을 보내고 작업을 완료 처리하자, 팀장 화면의 보드와 지표가 새로고침 없이 바로 바뀌는 모습입니다.

<img src="docs/screenshots/realtime-sync.gif" alt="두 사용자 화면 사이의 실시간 동기화" width="100%">

| 팀 채팅 | 1:1 메시지 |
| --- | --- |
| <img src="docs/screenshots/12-team-chat.png" alt="팀 채팅"> | <img src="docs/screenshots/12-dm.png" alt="1:1 메시지"> |

채팅 말풍선은 자주 틀리는 맞춤법(`안되요` → `안 돼요`, `몇일` → `며칠` 등)을 고쳐 보여 주고, 글을 입력하는 중에는 새 메시지 알림이 화면을 가리지 않게 했습니다.

### 산출물 자동 작성

교육 과정 산출물 양식 9종(브레인스토밍, 프로젝트 기획서, 요구사항 정의서, DB 요구사항 분석서, 화면 설계서, 빅데이터 분석 정의서, WBS, 진행일지, 멘토링 일지) 가운데 하나를 고르고 자료 파일을 올리면, 내용이 양식 칸에 자동으로 들어갑니다. 미리보기에서 고친 뒤 DOCX · HWP 호환(.hml)으로 저장하거나 PDF로 인쇄합니다.

<img src="docs/screenshots/13-deliverables.png" alt="산출물 자동 작성" width="100%">

### 설정 · 다크 모드 · 모바일

팀장은 설정에서 팀 이름을 바꾸고 초대 코드를 재발급합니다. 라이트·다크 테마와 모바일 레이아웃을 지원하고, 사이드바 메뉴 순서와 사용자 링크는 사람마다 따로 저장됩니다.

| 설정(팀장) | 다크 모드 |
| --- | --- |
| <img src="docs/screenshots/14-settings-invite.png" alt="설정과 초대 코드"> | <img src="docs/screenshots/15-dark-dashboard.png" alt="다크 모드"> |

<p align="center">
  <img src="docs/screenshots/16-mobile-home.png" alt="모바일 홈" width="30%">
  &nbsp;&nbsp;
  <img src="docs/screenshots/16-mobile-sprint.png" alt="모바일 스프린트" width="30%">
</p>

## 3. 시스템 구조

```mermaid
flowchart LR
  subgraph Client["브라우저 (Vanilla JS SPA)"]
    UI["index.html · app.js<br/>화면 9종 + 모듈 레지스트리"]
    DV["deliverables.js<br/>산출물 모듈 화면"]
  end

  subgraph Server["Node.js 서버 (server.js)"]
    REST["Express REST API<br/>57개"]
    WS["Socket.io<br/>접속 표시 · 채팅 · 변경 신호"]
    AUTH["express-session + bcryptjs<br/>세션 · 역할(PM/팀원)"]
    MOD["산출물 모듈<br/>/api/deliverables/* 8개"]
    CRON["오전 9시 브리핑 스케줄러"]
  end

  subgraph Storage["파일 저장소"]
    DB[("data/db.json<br/>원자적 쓰기 · 매일 백업 7개")]
    DOCS[("deliverables/data/<br/>documents.json")]
  end

  UI -- "fetch (쿠키 세션)" --> REST
  UI <-- "이벤트" --> WS
  DV --> MOD
  REST --> AUTH
  REST --> DB
  MOD --> DOCS
  CRON --> WS
```

쓰기는 REST로 하고, 서버는 무엇이 바뀌었는지만 Socket.io로 알립니다. 클라이언트는 신호를 받으면 필요한 목록만 다시 불러옵니다. 권한과 가시성 검사를 REST 한곳에 모아 두기 위한 구조입니다.

| 실시간 이벤트 | 용도 |
| --- | --- |
| `presence:join` · `presence:update` · `presence:login` | 접속 중인 팀원 표시 (탭 여러 개는 한 명으로 계산) |
| `dm:new` · `team-chat:new` · `notification:new` | 메시지와 알림 즉시 전달 |
| `issues:changed` · `sprints:changed` · `events:changed` · `wiki:changed` · `meeting:changed` · `comments:changed` | 해당 화면 목록 다시 불러오기 |
| `users:changed` · `team:changed` · `roster:changed` | 팀원·팀 정보 갱신 |
| `morning:brief` | 오전 9시 오늘의 브리핑 |

## 4. 기술 스택과 선택 이유

| 영역 | 기술 | 선택 이유 |
| --- | --- | --- |
| 서버 | Node.js, Express 4 | REST API, 정적 파일, 실시간 통신을 프로세스 하나로 처리 |
| 실시간 | Socket.io 4 | 접속 표시·채팅·변경 신호 브로드캐스트, 재연결 처리 내장 |
| 인증 | express-session, bcryptjs | 쿠키 세션(httpOnly, SameSite=Lax, HTTPS면 Secure)과 비밀번호 해시 |
| 저장소 | JSON 파일 DB | 6인 규모에 설치가 필요 없고, 폴더 복사로 백업·이전 가능 |
| 화면 | Vanilla JS SPA, CSS | 빌드 도구 없이 바로 실행, 라이트·다크 테마와 모바일 레이아웃 |
| 문서 처리 | 직접 구현한 PDF·HWP·ZIP 파서 | 산출물 모듈에 외부 npm 패키지 0개 |
| 배포 | Docker, docker-compose, Cloudflare Tunnel | 같은 코드를 로컬·VM에서 그대로 실행, 포트를 열지 않고 HTTPS 공개 |

런타임 의존성은 `express`, `express-session`, `bcryptjs`, `socket.io` 네 개뿐입니다.

## 5. 핵심 설계

### 5.1 팀 온보딩과 권한

- **초대 코드** — 헷갈리는 글자(0/O, 1/I)를 뺀 32자에서 8자리를 뽑습니다(약 1.1조 가지). 코드는 팀장 화면에만 보이고, 재발급하면 이전 코드는 즉시 막히지만 이미 합류한 팀원은 영향을 받지 않습니다.
- **역할 기반 권한** — 팀 이름 변경, 코드 발급, 스프린트 생성·시작, 권한 변경, 계정 삭제는 `requirePM` 미들웨어로 팀장만 호출합니다. 마지막 팀장은 강등할 수 없고, 본인 계정은 삭제할 수 없습니다.
- **가시성 필터** — 캘린더 일정은 `shared`일 때만 팀 전체에, 아니면 작성자에게만 내려갑니다. 수정·삭제는 작성자나 팀장만 할 수 있습니다.
- **하위 호환** — 팀 개념이 없던 예전 `db.json`을 열면 기존 사용자를 기본 팀에 자동으로 넣어 줍니다.

### 5.2 파일 DB를 안전하게 쓰기

```mermaid
flowchart LR
  W["변경 요청"] --> T["db.json.tmp에 전체 쓰기"] --> R["rename으로 교체<br/>(원자적)"] --> B{"오늘 백업 있음?"}
  B -- 없음 --> BK["backup-YYYY-MM-DD.json<br/>최근 7개만 보관"]
  B -- 있음 --> E["끝"]
```

- 쓰기 도중 전원이 꺼져도 `db.json`이 반쯤 쓰인 상태로 남지 않도록 임시 파일에 쓴 뒤 `rename`으로 교체합니다.
- 읽다가 깨진 파일을 만나면 `db.json.broken-<시각>`으로 보존하고 빈 DB로 시작해 데이터를 덮어쓰지 않습니다.
- `SIGINT` · `SIGTERM`을 받으면 저장한 뒤 종료합니다.
- 알림은 최근 500개, 팀 채팅은 최근 500개만 유지해 파일이 끝없이 커지지 않게 했습니다.

### 5.3 산출물 자동 작성 모듈

```mermaid
flowchart LR
  F["업로드 파일<br/>pdf · docx · hwp · hwpx · xlsx · pptx · md · txt · csv"] --> X["extract.js<br/>형식별 텍스트 추출"]
  X --> S["structure.js<br/>제목 붙은 덩어리로 정리"]
  S --> A["autofill.js<br/>양식 JSON의 keywords로 칸 배치"]
  A --> P["미리보기에서 수정"]
  P --> O["render.js<br/>DOCX · HWP 호환(.hml) 생성, PDF 인쇄"]
```

- 양식은 `templates/*.json`의 표 구조(열 너비, 행, 칸, 키워드)로 정의합니다. 양식을 하나 더하려면 JSON 파일 하나만 넣으면 됩니다.
- PDF 텍스트 추출기(`pdf.js`), 한글 파일이 쓰는 OLE 복합문서 리더(`cfb.js`), ZIP 읽기·쓰기(`zip.js`)를 직접 구현해 외부 패키지 없이 동작합니다.
- 서버 두 줄(`require('./deliverables')(app, { requireAuth })`)과 화면의 `registerModule()`로 붙는 플러그인 구조라, 폴더째 다른 프로젝트에 옮겨 쓸 수 있습니다. 자세한 내용은 [deliverables/README.md](deliverables/README.md)에 있습니다.

## 6. 배포와 외부 공유

```mermaid
flowchart TB
  subgraph L["① 같은 와이파이 — start.bat"]
    L1["팀원 브라우저"] -->|"http://192.168.x.x:4000"| L2["서버 PC"]
  end
  subgraph Q["② 어디서든 임시 공유 — start-cloud.bat"]
    Q1["팀원 브라우저"] -->|"https://*.trycloudflare.com"| Q2["Cloudflare 퀵 터널"] --> Q3["서버 PC<br/>(포트 개방 없음)"]
  end
  subgraph P["③ 상시 운영 설계 — DEPLOY.md"]
    P1["팀원 브라우저"] -->|"https://도메인"| P2["Cloudflare Tunnel"] --> P3["Oracle A1 VM<br/>Docker 컨테이너"]
  end
```

- **퀵 터널** — `start-cloud.bat`이 `cloudflared`를 처음 한 번 내려받고, 서버와 터널을 함께 띄운 뒤 로그에서 `https://…trycloudflare.com` 주소를 찾아 보여 줍니다(`tools/tunnel-url.js`). 가입이나 결제 정보 없이 팀원이 어디서든 접속하며, 2026년 8월 25일 실제로 이 방식으로 팀에 공개해 운영했습니다.
- **Cloudflare Workers를 쓰지 않은 이유** — Socket.io는 Durable Objects로, 파일 저장은 D1으로, 문서 생성은 R2로 다시 짜야 하고, bcrypt 해싱은 무료 플랜의 요청당 CPU 10ms를 넘습니다. 배포가 아니라 재작성이 필요해서 VM에 Docker로 올리는 쪽을 택했습니다.
- **상시 운영 설계** — Docker 이미지(`node:20-slim`, `/healthz` 헬스체크, `/data` 볼륨)를 Oracle A1 VM에 올리고 Cloudflare Tunnel로 도메인과 HTTPS를 붙입니다. 서버 포트를 인터넷에 직접 열지 않고, `SESSION_SECRET`이 없으면 compose가 실행을 거부합니다. 절차는 [DEPLOY.md](DEPLOY.md)에 정리했습니다.

## 7. 한계와 개선 방향

| 현재 | 개선 방향 |
| --- | --- |
| JSON 파일 하나에 동기 쓰기 — 서버 한 대, 팀 하나 기준 | 여러 팀·여러 인스턴스로 키우면 SQLite나 PostgreSQL로 이관 |
| 로그인 세션을 서버 메모리에 저장해 재시작하면 다시 로그인 | 파일 또는 Redis 세션 저장소 |
| 비밀번호 최소 4자 | 길이·복잡도 정책 강화와 로그인 시도 제한 |
| 번다운 계산 API(`/api/burndown`)는 있지만 차트 화면은 없음 | 스프린트 화면에 번다운 차트 추가 |
| 같은 이름의 칸이 반복되는 양식(주제 1·2의 '제안자')은 자동 배치가 겹칠 수 있음 | 칸별 키워드를 위치와 함께 구분 |
| 자동화 테스트 없음 | API 통합 테스트와 실시간 이벤트 테스트 추가 |
| 퀵 터널 주소가 재시작마다 바뀜 | Named Tunnel과 도메인으로 고정(가이드 작성 완료) |

## 8. 팀과 내 역할

팀 B1H4(6명)가 함께 기획하고 실제로 쓰면서 다듬은 프로젝트로, 개발은 두 명이 맡았습니다.

| 이름 | 역할 | 맡은 부분 |
| --- | --- | --- |
| [김유현](https://github.com/yuhiove2425-alt) | 풀스택(백엔드 중심) | 서버 API, 실시간 통신, 인증·권한, 저장·복구, 산출물 모듈, 배포 |
| 방아연 | 프론트엔드 · UI/UX | 화면 설계, 디자인 시스템, 반응형, 인터랙션, 접근성 |

### 김유현 — 풀스택(백엔드 중심)

**서버와 API 설계**

- Express 서버 하나에서 REST API 65개, 정적 파일, Socket.io 실시간 통신을 함께 처리(런타임 의존성 4개)
- 작업 모델: `B1H4-번호` 키, 유형·상태·우선순위는 정해진 값만 받고 담당자 1명과 작업자 여러 명, 상위 작업, 선행 작업(차단 관계), 스토리 포인트, 완료 시각을 기록
- 보드 순서 변경 API: 옮긴 칸의 순서 번호를 서버가 처음부터 다시 매겨 번호가 겹치거나 비지 않음
- 작업을 지우면 댓글과 다른 작업의 상위·선행 작업 연결까지 함께 정리
- 대시보드 요약 API(상태·우선순위·팀원별 진행과 완료·마감 지난 작업·오늘 일정), 스토리 포인트 기준 번다운 계산 API
- 회의록 확정 잠금(확정 후 수정·투표 생성 불가), 투표는 선택지 2~4개·1인 1표·종료 후 투표 불가

**인증과 권한**

- 비밀번호는 bcrypt로 해시하고, 응답에는 해시를 뺀 사용자 정보만 보냄
- 세션 쿠키는 httpOnly·SameSite=Lax, 30일 유지. HTTPS로 공개할 때는 환경변수로 Secure 쿠키와 프록시 신뢰를 켬
- 로그인에 실패해도 아이디가 있는지는 알 수 없게 처리
- 첫 실행 때만 팀을 만들 수 있고(팀장 계정 함께 생성), 그다음 가입은 초대 코드가 있어야 가능
- 초대 코드는 헷갈리는 글자(0·O·1·I)를 뺀 8자리로, 팀장에게만 보이고 새어 나가면 재발급
- 팀장 전용 기능(팀 이름·초대 코드·팀원 역할과 삭제·스프린트)은 `requirePM` 미들웨어로 막고, 글은 작성자나 팀장만 수정·삭제. 팀장은 최소 한 명 남기고 자기 계정은 지울 수 없음
- 프로필 사진은 서버에서 이미지 형식과 용량을 다시 검사하고, 요청 본문은 1MB로 제한

**실시간 통신과 알림**

- 데이터가 바뀌면 종류별 이벤트를 보내 모든 팀원의 화면이 새로고침 없이 바뀜
- 접속 상태는 소켓마다 사용자를 기록해 탭을 여러 개 열어도 한 명으로 세고, 처음 들어올 때만 접속 알림
- 배정, 작업자 지정, `@` 멘션, 댓글, DM, 팀 일정 공유 때 관련된 사람에게 알림(최근 500개 보관), DM은 읽음 처리와 안 읽은 수 계산
- 오전 9시 스케줄러: 30초마다 확인해 하루 한 번만, 사람마다 오늘 일정과 마감 작업 수를 계산해 알림

**데이터 저장과 복구**

- DB 서버 없이 `db.json` 하나로 운영. 임시 파일에 먼저 쓰고 이름을 바꾸는 방식이라 저장 중에 꺼져도 파일이 반쯤 쓰인 채 남지 않음
- 매일 자동 백업하고 최근 7개만 보관
- 파일이 깨져 있으면 `.broken-시각`으로 따로 보존한 뒤 서버를 띄워, 원본을 잃지 않고 원인을 볼 수 있음
- 종료 신호(SIGINT·SIGTERM)를 받으면 저장한 뒤 종료
- 예전 형식의 파일을 열면 빠진 항목을 채우고, 팀 개념이 없던 데이터는 기존 계정을 기본 팀으로 옮기는 마이그레이션

**산출물 자동 작성 모듈(API 8개)**

- 외부 패키지 없이 Node 기본 `zlib`만으로 PDF, ZIP(docx·xlsx·pptx·hwpx), CFB(구버전 hwp) 리더를 직접 만들어 9가지 형식(txt·md·csv·docx·xlsx·pptx·hwp·hwpx·pdf)에서 글과 표를 추출
- PDF는 압축된 객체까지 펼치고, 폰트의 ToUnicode 표로 글자를, 글자 위치 변화로 줄바꿈을 되살림
- 추출한 글을 제목 단위로 묶어 양식 칸에 자동으로 채우고, 같은 표 구조로 미리보기·인쇄(PDF)·DOCX·한글 호환(HML) 파일을 만듦
- 양식 9종(기획서·요구사항·화면 설계·WBS·진행일지 등)은 JSON 파일로 분리해, 파일만 넣으면 서버를 다시 켜지 않아도 목록에 추가
- 모듈은 데이터를 자기 폴더에 따로 저장하고 인증 함수만 주입받게 만들어, 떼어 내 다른 앱에 붙일 수 있음

**배포와 운영**

- `start-cloud.bat` 한 번으로 외부 공유: Node 확인 → 첫 실행 때 패키지 설치 → 세션 키 자동 생성·재사용 → cloudflared 내려받기 → 서버와 터널 실행 → 로그에서 임시 주소를 찾아(`tools/tunnel-url.js`) 화면에 띄우고 브라우저로 열기
- Docker 이미지: node:20-slim에 운영 의존성만 설치하고, 추가 도구 없이 Node `fetch`로 `/healthz` 헬스체크, 데이터는 `/data` 볼륨
- docker-compose: 세션 키가 없으면 실행되지 않게 막고, HTTPS용 쿠키·프록시 설정과 서울 시간대(9시 브리핑 기준)를 지정
- 배포 설계(`DEPLOY.md`): Cloudflare Workers + D1을 검토했지만 소켓 상시 연결, 파일 저장, 무료 플랜 CPU 한도를 넘는 bcrypt 해싱, 파일 생성 때문에 재작성이 필요해 제외. 대신 Oracle A1 VM + Docker + Cloudflare Tunnel로 서버 포트를 열지 않고 HTTPS로 공개하는 구성을 정리
- 시작할 때 내부 IP 주소를 띄워, 같은 와이파이에서는 터널 없이 바로 접속

### 방아연 — 프론트엔드 · UI/UX

**화면 설계와 디자인 시스템**

- 사이드바·상단바·떠 있는 채팅 패널로 이어지는 화면 구조를 잡고, 홈·대시보드·작업목록·스프린트·캘린더·회의록·공유메모·팀 화면을 프레임워크 없이 구현
- 색 팔레트·모서리·그림자·반투명 효과를 CSS 변수 49개로 정리해 화면 전체의 톤을 통일
- 라이트·다크 테마: 처음에는 운영체제 설정을 따르고, 페이지를 그리기 전에 적용해 깜빡임이 없음
- macOS 스타일의 반투명 카드·패널, 외부 라이브러리 없이 정의한 SVG 아이콘 40종

**반응형과 모바일**

- 1100·980·780·480px 네 단계 레이아웃
- 모바일에서는 사이드바가 화면 위로 열리는 서랍이 되고, 접으면 아이콘만 남음

**인터랙션**

- 작업 보드 드래그 앤 드롭: 놓은 위치를 카드 중간선 기준으로 계산해 상태와 순서를 한 번에 변경
- 작업목록의 목록·간트 보기 전환, 간트 막대는 진행 상태만큼 채움
- 사이드바 메뉴 순서 바꾸기(끌어서)·접기·개인 링크 추가, 설정은 사람마다 따로 기억
- 끌어서 옮길 수 있는 채팅 버튼(위치 기억)

**글쓰기와 입력**

- 공유메모·회의록·작업 설명에서 `/`를 입력하면 제목·목록·체크박스·인용구·구분선·코드 메뉴
- `@` 멘션 자동완성: 방향키로 고르고 Enter·Tab으로 넣고 Esc로 닫기
- 라벨 태그 입력: Enter나 쉼표로 추가, 빈 칸에서 Backspace로 마지막 라벨 삭제
- 한글 조합 중 Enter를 눌러도 메시지가 두 번 전송되지 않게 처리
- 프로필 사진 편집: 끌어서 위치를 맞추고 슬라이더로 확대해 자른 뒤 200px JPEG로 줄여 업로드

**실시간 화면과 피드백**

- 서버의 실시간 이벤트 15종을 받아 작업·스프린트·일정·회의록·공유메모·댓글·채팅·알림·접속 상태를 새로고침 없이 갱신
- 접속 중인 팀원, 읽지 않은 알림, DM별 안 읽은 메시지 수 표시
- 글을 입력하는 중에는 새 메시지 알림이 화면을 가리지 않게 하고, 채팅 말풍선은 자주 틀리는 맞춤법을 고쳐 표시
- 저장·삭제 결과를 알려 주는 토스트, 빈 화면 안내, 삭제·확정처럼 되돌리기 어려운 동작 전 확인 창
- 기능 사용법을 안내하는 마스코트 챗봇

**접근성과 안전한 출력**

- 아이콘 버튼의 `aria-label`, 키보드 포커스 표시(`:focus-visible`), Esc로 창 닫기
- 운영체제의 '동작 줄이기'·'투명도 줄이기' 설정을 켜면 애니메이션과 반투명 효과를 끔
- 사용자가 입력한 글은 HTML 이스케이프를 거쳐 화면에 출력(XSS 방지)

## 9. 실행 방법

**Windows에서 바로 실행**

1. [Node.js LTS](https://nodejs.org)를 설치합니다.
2. `start.bat`을 더블클릭합니다. 첫 실행만 패키지 설치로 1~2분 걸립니다.
3. 창에 표시된 `http://192.168.x.x:4000` 주소를 팀원에게 공유합니다.

같은 와이파이가 아니어도 접속하게 하려면 `start-cloud.bat`을 실행하고, 창에 뜬 `https://…trycloudflare.com` 주소를 공유합니다.

**직접 실행 · Docker**

```bash
npm install
npm start                      # http://localhost:4000

# Docker
cp .env.example .env           # SESSION_SECRET을 긴 랜덤 문자열로 바꾸기
docker compose up -d
```

| 환경변수 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `4000` | 서버 포트 |
| `DATA_DIR` | `./data` | `db.json`과 백업 저장 위치 |
| `SESSION_SECRET` | 로컬용 기본값 | 세션 서명 키, 서버에 올릴 때 반드시 지정 |
| `TRUST_PROXY` | 꺼짐 | 프록시(Cloudflare Tunnel 등) 뒤에서 `1` |
| `SECURE_COOKIE` | 꺼짐 | HTTPS로 서비스할 때 `1` |
| `TEAM_NAME` | `B1H4` | 첫 팀 설정 화면의 기본 팀 이름 |

## 10. 프로젝트 구조

```
b1h4-workspace/
├── server.js               # Express REST API · Socket.io · 파일 DB · 스케줄러
├── public/
│   ├── index.html          # 앱 셸
│   ├── js/app.js           # 화면 9종 SPA · 실시간 처리 · 모듈 레지스트리
│   ├── js/icons.js
│   └── css/style.css       # 라이트·다크 테마, 반응형
├── deliverables/           # 산출물 자동 작성 모듈 (외부 패키지 없음)
│   ├── index.js            # /api/deliverables/* 라우터
│   ├── lib/                # extract · pdf · cfb · zip · structure · autofill · render
│   ├── templates/          # 양식 정의 JSON 9종
│   └── public/             # 모듈 화면
├── tools/tunnel-url.js     # 퀵 터널 주소 추출
├── start.bat               # 같은 와이파이 공유
├── start-cloud.bat         # Cloudflare 퀵 터널로 인터넷 공유
├── Dockerfile · docker-compose.yml · .env.example
├── DEPLOY.md               # 상시 운영 배포 가이드
└── docs/screenshots/       # README 화면 (데모 데이터)
```

<details>
<summary><b>REST API 목록 (65개)</b></summary>

| 영역 | 엔드포인트 |
| --- | --- |
| 상태 | `GET /healthz` |
| 인증 | `POST /api/team/setup` · `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` · `POST /api/auth/password` · `POST /api/auth/avatar` |
| 팀·팀원 | `GET·PATCH /api/team` · `POST /api/team/code` · `GET /api/users` · `PATCH·DELETE /api/users/:id` · `GET /api/roster` · `PATCH /api/roster/:id` |
| 작업 | `GET·POST /api/issues` · `PATCH·DELETE /api/issues/:id` · `POST /api/issues/reorder` · `GET·POST /api/issues/:id/comments` · `PATCH·DELETE /api/comments/:id` |
| 스프린트 | `GET·POST /api/sprints` · `PATCH·DELETE /api/sprints/:id` · `GET /api/burndown` |
| 캘린더 | `GET·POST /api/events` · `PATCH·DELETE /api/events/:id` |
| 공유메모 | `GET·POST /api/wiki` · `PATCH·DELETE /api/wiki/:id` |
| 회의록 | `GET·POST /api/meetings` · `PATCH·DELETE /api/meetings/:id` · `POST …/finalize` · `POST …/unfinalize` · `POST …/poll` · `POST …/poll/vote` · `POST …/poll/close` · `GET·POST …/comments` |
| 메시지 | `GET /api/messages/threads` · `GET /api/messages/:userId` · `POST /api/messages` · `GET·POST /api/team-chat` |
| 알림·요약 | `GET /api/notifications` · `POST /api/notifications/read` · `GET /api/summary` |
| 산출물 | `GET /api/deliverables/templates` · `POST /api/deliverables/extract` · `POST /api/deliverables/fill` · `POST /api/deliverables/export/:format` · `GET·POST /api/deliverables/documents` · `PATCH·DELETE /api/deliverables/documents/:id` |

</details>
