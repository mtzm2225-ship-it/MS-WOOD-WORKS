FROM node:24-alpine

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY server.js ./
COPY public ./public

EXPOSE 3000
USER node
CMD ["node", "server.js"]