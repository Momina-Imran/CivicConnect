FROM node:20-alpine
WORKDIR /app

# install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# copy application code (public/, server.js, ...)
COPY . .
RUN mkdir -p /app/uploads

EXPOSE 3000
CMD ["node", "server.js"]
