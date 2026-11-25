FROM caddy:2-alpine

RUN apk add --no-cache python3 tzdata \
 && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
 && echo "Asia/Shanghai" > /etc/timezone

WORKDIR /opt/ai-nav-hub
COPY crawler ./crawler
COPY deploy ./deploy
COPY web ./web

RUN chmod +x ./crawler/fetch_all.py ./deploy/run_weekly_crawl.sh \
 && cp ./deploy/Caddyfile /etc/caddy/Caddyfile
