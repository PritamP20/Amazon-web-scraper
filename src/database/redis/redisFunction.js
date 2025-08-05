const { Redis } = require('ioredis');
const Queue = require('bull');
require('dotenv').config();

const redisConfig = {
  host: 'localhost',
  port: 6379
};

const redis = new Redis(redisConfig);
const scrapeQueue = new Queue('scrape-queue', { redis: redisConfig });

redis.on('error', (err) => console.error('Redis connection error:', err));
redis.on('connect', () => console.log('Connected to Redis'));

// Queue event listeners for debugging
scrapeQueue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed`);
});

scrapeQueue.on('failed', (job, err) => {
  console.log(`Job ${job.id} failed:`, err.message);
});

scrapeQueue.on('active', (job) => {
  console.log(`Job ${job.id} is now active`);
});

async function log(message) {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}`;
    
    // Store logs with different keys for better organization
    await redis.lpush('scraper:logs', logMessage);
    
    // Optional: Also log to console for immediate feedback
    console.log(`[LOG] ${logMessage}`);
  } catch (error) {
    console.error('Redis logging error:', error);
  }
}

async function addToQueue(url, options = {}) {
  try {
    const job = await scrapeQueue.add('scrape-product', { url }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 10, // Keep last 10 completed jobs
      removeOnFail: 5, // Keep last 5 failed jobs
      ...options
    });
    
    await log(`Added ${url} to scrape queue with job ID: ${job.id}`);
    return job;
  } catch (error) {
    console.error('Queue error:', error);
    await log(`Failed to add ${url} to queue: ${error.message}`);
    throw error;
  }
}

// Setup queue processor
function setupQueueProcessor(concurrency, scrapeFunction) {
  scrapeQueue.process('scrape-product', concurrency, async (job) => {
    try {
      await log(`Processing job ${job.id} for URL: ${job.data.url}`);
      const result = await scrapeFunction(job.data.url);
      await log(`Completed job ${job.id} for URL: ${job.data.url}`);
      return result;
    } catch (error) {
      await log(`Queue job ${job.id} failed for ${job.data.url}: ${error.message}`);
      throw error;
    }
  });
}

// Wait for all jobs in queue to complete
async function waitForQueueCompletion() {
  return new Promise((resolve) => {
    const checkQueue = async () => {
      const waiting = await scrapeQueue.getWaiting();
      const active = await scrapeQueue.getActive();
      
      if (waiting.length === 0 && active.length === 0) {
        resolve();
      } else {
        console.log(`Queue status - Waiting: ${waiting.length}, Active: ${active.length}`);
        setTimeout(checkQueue, 1000);
      }
    };
    checkQueue();
  });
}

// Get queue statistics
async function getQueueStats() {
  try {
    const waiting = await scrapeQueue.getWaiting();
    const active = await scrapeQueue.getActive();
    const completed = await scrapeQueue.getCompleted();
    const failed = await scrapeQueue.getFailed();
    
    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    };
  } catch (error) {
    console.error('Error getting queue stats:', error);
    return null;
  }
}

async function closeRedis() {
  try {
    console.log('Closing queue and Redis connections...');
    await scrapeQueue.close();
    await redis.quit();
    console.log('Redis connections closed successfully');
  } catch (error) {
    console.error('Error closing Redis:', error);
  }
}

function getQueue() {
  return scrapeQueue;
}

module.exports = {
  log,
  addToQueue,
  setupQueueProcessor,
  waitForQueueCompletion,
  getQueueStats,
  closeRedis,
  getQueue
};