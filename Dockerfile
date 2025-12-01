FROM node:22

RUN mkdir -p /opt/caskfs
WORKDIR /opt/caskfs

COPY package.json package-lock.json ./
RUN npm install

COPY src ./src

RUN cd src/client
RUN npm run client-build-dist
RUN npm install -g .
RUN npm link

CMD ["cask", "serve"]