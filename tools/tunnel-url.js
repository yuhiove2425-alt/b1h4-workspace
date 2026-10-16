/* cloudflared가 만들어 준 임시 주소를 로그에서 찾아 한 줄로 출력합니다.
   start-cloud.bat이 이 값을 받아 화면에 띄웁니다. */
const fs = require('fs');
const path = require('path');

const LOG = path.join(__dirname, '..', 'tunnel.log');
const PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const TIMEOUT_SEC = 60;

let waited = 0;

const timer = setInterval(() => {
  let text = '';
  try {
    text = fs.readFileSync(LOG, 'utf8');
  } catch (err) {
    // 아직 로그 파일이 안 만들어졌을 수 있습니다. 다음 초에 다시 봅니다.
  }

  const found = text.match(PATTERN);
  if (found) {
    clearInterval(timer);
    console.log(found[0]);
    process.exit(0);
  }

  if (++waited >= TIMEOUT_SEC) {
    clearInterval(timer);
    console.log('TIMEOUT');
    process.exit(1);
  }
}, 1000);
