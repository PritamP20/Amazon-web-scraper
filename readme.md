# Web Scraper with Puppeteer & Redis

A scalable web scraping tool built with Node.js, Puppeteer, Redis, and PostgreSQL. Features proxy support, job queuing, and containerized deployment.

## 🏗️ Architecture

- **Node.js + Puppeteer**: Core scraping engine with headless browser automation
- **Redis**: Job queue management and logging system
- **PostgreSQL**: Data persistence with Prisma ORM
- **Bull**: Redis-based job queue monitoring and processing
- **Docker**: Containerized deployment with multi-service orchestration

## 📁 Project Structure

```
├── docker/
│   └── redis-docker.yml          # Redis container for local testing
├── src/
│   ├── crawler/
│   │   └── scraperProduct.js     # Main scraping logic with proxy support
│   ├── database/
│   │   ├── redis/
│   │   │   └── redisfunction.js  # Redis utility functions
│   │   ├── bull/
│   │   │   └── bull.js           # Redis job queue & monitoring
│   │   └── postgres/             # Prisma ORM schema & client
├── index.js                      # Main API server
├── Dockerfile                    # Application container
├── docker-compose.yaml           # Multi-service orchestration
├── app-deployment.yaml           # Kubernetes pod deployment
├── app-service.yaml              # Kubernetes app services
├── redis-deployment.yaml         # Kubernetes Redis deployment
└── redis-service-nodeport.yaml   # Kubernetes Redis service
```

## 🚀 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/scrape` | POST | Scrape with proxy using Bright Data |
| `/noproxy/scrape` | POST | Scrape with local proxy |
| `/testing` | GET | Health check endpoint |

## 🔧 Key Features

### Redis Functions (`redisfunction.js`)
- **`log(message)`**: Stores timestamped log messages in Redis list for debugging and monitoring
- **`addToQueue(url)`**: Adds scraping jobs to Bull queue and logs the operation
- **`processQueue(concurrency, scrapeFunction)`**: Processes queued jobs with specified concurrency and custom scrape function

### Proxy Support
- **Bright Data Integration**: Professional proxy service for large-scale scraping
- **Local Proxy Fallback**: Alternative scraping method without external proxies
- **Error Handling**: Robust error management with Redis logging

## 🐳 Deployment Options

### Local Development
```bash
# Using Docker Compose
docker-compose up -d

# Local Redis only
docker-compose -f docker/redis-docker.yml up -d
```

### Kubernetes
```bash
# Deploy application
kubectl apply -f app-deployment.yaml
kubectl apply -f app-service.yaml

# Deploy Redis
kubectl apply -f redis-deployment.yaml
kubectl apply -f redis-service-nodeport.yaml
```

## 🛠️ Setup & Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd AMAZON_SCRAPER
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Database setup**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Start the application**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   
   # Docker
   docker-compose up
   ```

## 📊 Monitoring & Logging

- **Bull Dashboard**: Monitor job queues and processing status
- **Redis Logs**: Centralized logging system with timestamped entries
- **Health Checks**: `/testing` endpoint for service monitoring

## 🔒 Security Features

- Proxy rotation and management
- Rate limiting through job queues
- Error handling and retry mechanisms
- Containerized isolation