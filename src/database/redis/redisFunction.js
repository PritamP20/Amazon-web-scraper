const { Redis } = require('ioredis');
const Queue = require('bull');
require('dotenv').config();

const redis = new Redis({
  host:'redis',
  port: 6379
});
// const redis = new Redis({
//   host:'localhost',
//   port: 6379
// });

redis.on('error', (err) => console.error('Redis connection error:', err));
redis.on('connect', () => console.log('Connected to Redis'));

const scrapeQueue = new Queue('scrape-queue', { redis });

async function log(message) {
  try {
    await redis.lpush('scraper:logs', `${new Date().toISOString()} - ${message}`);
  } catch (error) {
    console.error('Redis logging error:', error);
  }
}

async function addToQueue(url) {
  try {
    await scrapeQueue.add({ url });
    await log(`Added ${url} to scrape queue`);
  } catch (error) {
    console.error('Queue error:', error);
    await log(`Failed to add ${url} to queue: ${error.message}`);
  }
}

async function processQueue(concurrency, scrapeFunction) {
  scrapeQueue.process(concurrency, async (job) => {
    try {
      await scrapeFunction(job.data.url);
    } catch (error) {
      await log(`Queue job failed for ${job.data.url}: ${error.message}`);
      throw error;
    }
  });
}

async function closeRedis() {
  try {
    await scrapeQueue.close();
    await redis.quit();
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
  processQueue,
  closeRedis,
  getQueue
};