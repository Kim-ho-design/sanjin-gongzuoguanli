# 构建阶段
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 在 alpine 无预编译包，需编译工具链
RUN apk add --no-cache python3 make g++ && npm ci
COPY . .
# 构建时不需要真实环境变量（运行时注入）
RUN npm run build

# 运行阶段
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && apk del python3 make g++
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/middleware.ts ./
RUN mkdir -p /app/data
EXPOSE 3000
# 数据文件在 /app/data，建议挂卷：-v work-os-data:/app/data
CMD ["npm", "start"]
