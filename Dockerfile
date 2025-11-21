FROM node:22

RUN mkdir -p /opt/caskfs
WORKDIR /opt/caskfs

COPY package.json package-lock.json ./
RUN npm install --production

COPY src ./src

RUN npm install -g .
RUN npm link

CMD ["cask", "serve"]