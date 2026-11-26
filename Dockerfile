FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NODE_NO_WARNINGS=1
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 8080
CMD ["node", "server.js"]
