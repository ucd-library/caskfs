FROM node:22

RUN mkdir -p /opt/caskfs
WORKDIR /opt/caskfs

COPY package.json package-lock.json ./
RUN npm install --production
RUN npm install -g
RUN npm link

COPY bin ./bin
COPY lib ./lib
COPY controllers ./controllers
COPY schema ./schema
COPY index.js ./