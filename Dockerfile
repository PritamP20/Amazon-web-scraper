# Stage 1 - Build with Prisma
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .    

RUN npx prisma generate --schema=./src/database/postgres/prisma/schema.prisma

# Final image
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app /app

EXPOSE 3000 3001

CMD ["npm", "start"]
