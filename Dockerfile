FROM node:22
RUN apt-get update -qq && \
    apt-get install -y python3 python3-pip python-is-python3 && \
    npm install -g pnpm
RUN apt-get install -y libpango1.0-dev && \
    pip3 install moviepy==1.0.3 --break-system-packages && \
    rm -rf /root/.cache
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm i --frozen-lockfile --prod=false && \
    pnpx playwright install --with-deps --only-shell chromium-headless-shell
COPY . .
RUN pnpm build && pnpm prune --prod && rm -rf src
EXPOSE 3000
CMD ["pnpm", "fast-start"]
