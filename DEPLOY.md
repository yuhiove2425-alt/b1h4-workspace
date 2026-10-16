# 클라우드 배포 가이드

로컬(`start.bat`) 실행 방식은 그대로 두고, 같은 코드를 서버에 올려
팀원이 어디서든 접속할 수 있게 하는 방법입니다.

---

## 왜 Cloudflare Workers가 아닌가

앞서 Workers + D1을 검토했지만, 이 앱은 그 위에서 돌지 않습니다. 이유는 네 가지입니다.

| 이 앱이 쓰는 것 | Workers에서 |
| --- | --- |
| `socket.io` (실시간 접속·알림·팀채팅) | 지원 안 됨. Durable Objects로 전면 재작성 필요 |
| `fs`로 `db.json` 읽고 쓰기 | 파일시스템 자체가 없음. D1(SQL)로 전면 이관 필요 |
| `bcryptjs` 해싱 | 무료 플랜 요청당 CPU 10ms를 초과함 |
| `deliverables` 모듈의 PDF·HWP 생성 | 파일 생성·저장 경로가 없음. R2로 재설계 필요 |

즉 Workers로 가는 건 "배포"가 아니라 **재작성**입니다.
지금 코드를 그대로 살리는 길은 **서버(VM)에 Docker로 올리는 것**이고,
Oracle Cloud의 무료 A1 인스턴스가 정확히 그 용도에 맞습니다.

Cloudflare 계정은 버리지 않습니다. **Tunnel**로 도메인과 HTTPS를 무료로 붙입니다.

---

## 전체 구조

```
팀원 브라우저
   ↓ HTTPS (무료 인증서)
Cloudflare Tunnel
   ↓ 암호화 터널 (서버 포트를 외부에 열지 않음)
Oracle A1 : Docker 컨테이너 (Node + socket.io)
   ↓
./data 볼륨 : db.json + 매일 백업
```

포트를 인터넷에 직접 열지 않기 때문에, 방화벽 설정 실수로 서버가 노출될 위험이 없습니다.

---

## 1. 서버에 코드 올리기

```bash
# Oracle A1에 접속한 뒤
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER    # 적용하려면 한 번 재접속

git clone <저장소 주소> b1h4-workspace
cd b1h4-workspace
```

깃을 안 쓴다면 압축해서 `scp`로 올려도 됩니다.

## 2. 환경변수 설정

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 출력된 값을 .env의 SESSION_SECRET에 붙여 넣기
nano .env
```

`SESSION_SECRET`을 기본값으로 두면 서버가 경고를 찍습니다. 반드시 바꾸세요.

## 3. 실행

```bash
docker compose up -d --build
docker compose logs -f          # 로그 확인, Ctrl+C로 빠져나오기
curl localhost:4000/healthz     # {"ok":true,...} 나오면 정상
```

## 4. Cloudflare Tunnel 연결

Cloudflare 대시보드 → Zero Trust → Networks → Tunnels → Create a tunnel
→ Cloudflared 선택 → 서버에 붙여 넣을 설치 명령이 나옵니다. 그대로 실행하세요.

그다음 Public Hostname을 추가합니다.

| 항목 | 값 |
| --- | --- |
| Subdomain | `planner` 등 원하는 이름 |
| Domain | Cloudflare에 연결한 도메인 |
| Service Type | HTTP |
| URL | `localhost:4000` |

저장하면 `https://planner.도메인` 으로 바로 열립니다. 인증서는 자동입니다.

> 도메인이 없다면 Tunnel 생성 시 나오는 `*.trycloudflare.com` 임시 주소로도 됩니다.
> 다만 재시작할 때마다 주소가 바뀌니, 팀에 계속 쓸 거면 도메인 하나를 붙이는 편이 낫습니다.

## 5. 팀 만들기

배포된 주소로 처음 접속하면 **팀 설정 화면**이 뜹니다.

1. 팀 이름에 `B1H4` (기본값으로 채워져 있음)
2. 팀장 계정(아이디·이름·비밀번호) 입력 → 이 계정이 PM이 됩니다
3. 설정 화면에서 **초대 코드 8자리**를 확인해 팀원에게 전달
4. 팀원은 같은 주소에서 "팀 합류"를 눌러 코드를 입력

기존 `data/db.json`을 서버로 함께 옮긴 경우에는 이 화면이 나오지 않고,
기존 6명이 자동으로 B1H4 팀에 배정된 채로 로그인 화면이 뜹니다.

---

## 운영 메모

**데이터 위치** — `./data/db.json` 하나가 전부입니다. 매일 자동 백업되고 최근 7개가 남습니다.
서버를 옮기거나 되돌릴 때는 이 폴더만 복사하면 됩니다.

```bash
# 로컬 PC로 백업 내려받기
scp -r ubuntu@서버IP:~/b1h4-workspace/data ./백업
```

**업데이트**

```bash
git pull && docker compose up -d --build
```

**세션** — 서버를 다시 시작하면 로그인 세션이 초기화되어 팀원이 한 번씩 다시 로그인해야 합니다.
계정과 데이터는 그대로입니다. 재시작이 잦지 않으면 그대로 두어도 되고,
거슬리면 나중에 세션 저장소를 파일 기반으로 바꾸면 됩니다.

**용량** — 이 앱은 램 200~300MB 수준입니다. A1 무료 범위(2 OCPU / 12GB)에서
기존 워크로드와 함께 돌리기에 충분합니다.

---

## 다른 곳에 올릴 경우

Dockerfile이 표준이라 다른 플랫폼에도 그대로 올라갑니다. 다만 주의할 점이 있습니다.

- **Render** — 무료 플랜은 파일시스템이 비휘발성이 아니어서 재배포마다 `db.json`이 날아갑니다.
  유료 디스크(월 $1~)를 붙여 `DATA_DIR`을 그 경로로 지정해야 데이터가 남습니다.
- **Fly.io** — Volume을 붙이면 동작합니다. 신규 계정은 무료 플랜이 없습니다.
- **Railway** — Volume 지원. 무료 크레딧이 적어 상시 구동은 어렵습니다.

무료로 상시 구동 + 데이터 보존을 동시에 만족하는 건 결국 **본인 소유 VM(A1)** 입니다.
