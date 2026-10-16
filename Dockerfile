FROM node:20-slim

WORKDIR /app

# 의존성만 먼저 복사해 두면, 코드만 바뀌었을 때 재설치를 건너뛰어 빌드가 빨라집니다.
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

# 데이터는 컨테이너 안이 아니라 마운트한 볼륨에 저장합니다.
# 이렇게 해야 컨테이너를 지우고 다시 만들어도 팀 데이터가 남습니다.
ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
