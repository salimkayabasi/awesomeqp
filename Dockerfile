FROM node:alpine

ENV NODE_ENV production
ENV APP /app/
WORKDIR $APP

ADD ./package*.json $APP
RUN npm i --no-audit

ADD . $APP
