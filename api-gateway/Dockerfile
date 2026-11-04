FROM node:20-alpine
WORKDIR /app
COPY api-gateway/package*.json ./
RUN npm install --omit=dev
COPY api-gateway/src ./src
COPY proto ./proto
ENV PROTO_DIR=/app/proto
EXPOSE 8080
CMD ["node", "src/index.js"]