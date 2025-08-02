const { Redis } = require('ioredis');
const Queue = require('bull');
require('dotenv').config();

const redis = new Redis({
  host:'redis',
  port: 6379
});