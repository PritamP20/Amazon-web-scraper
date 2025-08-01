const express = require('express');
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { getQueue } = require('../redis/redisFunction');

const app = express();
const port = process.env.PORT || 3001;

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/bull-board');

createBullBoard({
  queues: [new BullAdapter(getQueue())],
  serverAdapter
});

app.use('/bull-board', serverAdapter.getRouter());

app.get('/', (req, res) => {
  res.send('Bull Board is running. Visit /bull-board to view the queue dashboard.');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Bull Board available at http://localhost:${port}/bull-board`);
});