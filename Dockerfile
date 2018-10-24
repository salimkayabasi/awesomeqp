FROM node:alpine

ENV APP /app/
WORKDIR $APP

ADD ./package*.json $APP
RUN npm i --no-audit

ADD . $APP
