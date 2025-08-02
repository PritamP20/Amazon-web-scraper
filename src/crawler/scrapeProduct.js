require('dotenv').config();
const puppeteer = require('puppeteer-core');
const puppeteerLocal = require("puppeteer");
const axios = require('axios');
const cheerio = require('cheerio');
const client = require('../database/postgres/db');
const { log, addToQueue, processQueue, closeRedis } = require('../database/redis/redisFunction');
const retry = require('async-retry');

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
];
const BROWSER_WS = process.env.BRIGHT_DATA;
const BASE_URL = 'https://www.amazon.in';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeAmazonProduct(url) {
  await log(`Starting scrape for ${url}`);
  let productData = null;
  await retry(
    async () => {
      const browser = await puppeteer.connect({ browserWSEndpoint: BROWSER_WS });
      const page = await browser.newPage();
      const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
      await page.setUserAgent(userAgent);

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const content = await page.content();
        if (content.includes('Enter the characters you see below')) {
          await log(`CAPTCHA triggered for ${url} - skipping`);
          return;
        }

        const data = await page.evaluate(() => {
          const getText = (selector) => document.querySelector(selector)?.innerText?.trim() || 'N/A';
          return {
            title: getText('#productTitle'),
            price: getText('.a-price .a-offscreen'),
            rating: getText('span.a-icon-alt'),
            reviews: getText('#acrCustomerReviewText'),
            url: window.location.href
          };
        });

        productData = data;

        try {
          const existingProduct = await client.product.findUnique({ where: { url } });
          if (!existingProduct) {
            const response = await client.product.create({
              data: { ...data, url }
            });
            await log(`Saved product for ${url}: ${response.id}`);
            console.log('✅ Saved Product:', response);
          } else {
            await log(`Product already exists for ${url}`);
          }
        } catch (error) {
          await log(`Failed to save product for ${url}: ${error.message}`);
          console.error('❌ Error saving product:', error);
          throw error;
        }

        console.log('✅ Scraped Product:', data);
      } catch (error) {
        await log(`Failed to scrape ${url}: ${error.message}`);
        console.error('❌ Error:', error);
        throw error;
      } finally {
        await page.close();
        await browser.disconnect();
      }
    },
    {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 5000,
      onRetry: (error) => log(`Retrying ${url}: ${error.message}`),
    }
  );
  return productData;
}

async function getProductLinksFromSearch(searchUrl) {
  try {
    const { data } = await axios.get(searchUrl, {
      headers: {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
      },
    });
    const $ = cheerio.load(data);
    const productLinks = [];
    $('a.a-link-normal.s-faceout-link, a.a-link-normal.s-no-outline').each((_, element) => {
      const relativeLink = $(element).attr('href');
      if (relativeLink && relativeLink.includes('/dp/')) {
        const fullLink = BASE_URL + relativeLink.split('?')[0];
        if (!productLinks.includes(fullLink)) {
          productLinks.push(fullLink);
        }
      }
    });
    await log(`Fetched ${productLinks.length} links from ${searchUrl}`);
    return productLinks;
  } catch (err) {
    await log(`Failed to fetch links from ${searchUrl}: ${err.message}`);
    console.error('Error fetching links:', err);
    return [];
  }
}

const scraper = async (product) => {
  const results = [];
  try {
    const links = await getProductLinksFromSearch(`https://www.amazon.in/s?k=${product}`);
    console.log('Total product links found:', links.length);
    const maxLinks = 3;
    const selectedLinks = links.slice(0, maxLinks);

    processQueue(5, async (url) => {
      const data = await scrapeAmazonProduct(url);
      if (data) results.push(data);
    });

    for (let link of selectedLinks) {
      await addToQueue(link);
      await delay(1000 + Math.random() * 2000);
    }

    await delay(10000);
    return results;
  } catch (error) {
    await log(`Main loop error: ${error.message}`);
    console.error('Main loop error:', error);
    return results;
  } finally {
    await closeRedis();
    await client.$disconnect();
  }
};

async function scrapeAmazonProductLocal(url) {
  await log(`Starting local scrape for ${url}`);
  let productData = null;
  await retry(
    async () => {
      const browser = await puppeteerLocal.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
      await page.setUserAgent(userAgent);

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const content = await page.content();
        if (content.includes('Enter the characters you see below')) {
          await log(`CAPTCHA triggered for ${url} - skipping`);
          return;
        }

        const data = await page.evaluate(() => {
          const getText = (selector) => document.querySelector(selector)?.innerText?.trim() || 'N/A';
          return {
            title: getText('#productTitle'),
            price: getText('.a-price .a-offscreen'),
            rating: getText('span.a-icon-alt'),
            reviews: getText('#acrCustomerReviewText'),
            url: window.location.href
          };
        });

        productData = data;

        try {
          const existingProduct = await client.product.findUnique({ where: { url } });
          if (!existingProduct) {
            const response = await client.product.create({
              data: { ...data, url }
            });
            await log(`Saved product for ${url}: ${response.id}`);
            console.log('✅ Saved Product:', response);
          } else {
            await log(`Product already exists for ${url}`);
          }
        } catch (error) {
          await log(`Failed to save product for ${url}: ${error.message}`);
          console.error('❌ Error saving product:', error);
          throw error;
        }

        console.log('✅ Scraped Product:', data);
      } catch (error) {
        await log(`Failed to scrape ${url}: ${error.message}`);
        console.error('❌ Error:', error);
        throw error;
      } finally {
        await page.close();
        await browser.close();
      }
    },
    {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 5000,
      onRetry: (error) => log(`Retrying ${url}: ${error.message}`),
    }
  );
  return productData;
}

const scraperLocal = async (product) => {
  const results = [];
  try {
    const links = await getProductLinksFromSearch(`https://www.amazon.in/s?k=${product}`);
    console.log('Total product links found:', links.length);
    const maxLinks = 10;
    const selectedLinks = links.slice(0, maxLinks);

    for (let link of selectedLinks) {
      console.log(`Directly scraping: ${link}`);
      const data = await scrapeAmazonProductLocal(link);
      if (data) results.push(data);
      await delay(1000 + Math.random() * 2000);
    }

    console.log('ended');
    return results;
  } catch (error) {
    await log(`Main loop error: ${error.message}`);
    console.error('Main loop error:', error);
    return results;
  } finally {
    // await closeRedis();
    // await client.$disconnect();
  }
};

module.exports = {
  scraper,
  scraperLocal
};