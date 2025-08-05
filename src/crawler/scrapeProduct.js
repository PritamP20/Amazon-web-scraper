require('dotenv').config();
const puppeteer = require('puppeteer-core');
const puppeteerLocal = require("puppeteer");
const axios = require('axios');
const cheerio = require('cheerio');
const client = require('../database/postgres/db');
const { 
  log, 
  addToQueue, 
  setupQueueProcessor, 
  waitForQueueCompletion,
  getQueueStats,
  closeRedis 
} = require('../database/redis/redisFunction');
const retry = require('async-retry');

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
];
const BROWSER_WS = process.env.BRIGHT_DATA;
const BASE_URL = 'https://www.amazon.in';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const dataFected = []

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
        dataFected.push(data)
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
  try {
    // Setup the queue processor first
    setupQueueProcessor(5, scrapeAmazonProduct);
    
    const links = await getProductLinksFromSearch(`https://www.amazon.in/s?k=${product}`);
    console.log('Total product links found:', links.length);
    const maxLinks = 3;
    const selectedLinks = links.slice(0, maxLinks);

    console.log('Adding jobs to queue...');
    const jobs = [];
    
    // Add all jobs to queue
    for (let link of selectedLinks) {
      const job = await addToQueue(link);
      jobs.push(job);
      await delay(500); // Small delay between adding jobs
    }

    console.log(`Added ${jobs.length} jobs to queue. Waiting for completion...`);
    
    // Wait for all jobs to complete and get results
    const queueResults = await waitForQueueCompletion();
    
    console.log('All queue jobs completed!');
    console.log(`✅ Completed: ${queueResults} jobs`);
    
    // Get final queue statistics
    const stats = await getQueueStats();
    console.log('Final queue stats:', stats);
    
    return{
      queue: queueResults
    }
    
  } catch (error) {
    await log(`Main loop error: ${error.message}`);
    console.error('Main loop error:', error);
    return {
      success: false,
      error: error.message,
      results: [],
      errors: []
    };
  } finally {
    await closeRedis();
    await client.$disconnect();
  }
};

const scrapeAmazon =async (url)=>{
  console.log('starting scrapoing: ', url);
  let productData = null;
  try {
    let data ;
      const browser = await puppeteerLocal.launch({
      headless:true,
      args:['--no-sandbox', '--disable-setuid-sandbox'],
    })
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    data =await (await page).evaluate(()=>{
          const getText = (selector) => document.querySelector(selector)?.innerText?.trim() || 'N/A';
          return {
            title: getText('#productTitle'),
            price: getText('.a-price .a-offscreen'),
            rating: getText('span.a-icon-alt'),
            reviews: getText('#acrCustomerReviewText'),
            url: window.location.href
          };
        })
    console.log(data)
    
    return data;
  } catch (error) {
    console.log(error);
    return error
  }
}


const scrapeAdidas = async (url) => {
  console.log('starting scraping: ', url);
  let productData = null;
  let browser = null;
  
  try {
    browser = await puppeteer.connect({ 
      browserWSEndpoint: "wss://brd-customer-hl_7aec92b6-zone-scraping_browser1:4wn49oy1do0d@brd.superproxy.io:9222" 
    });
    
    const page = await browser.newPage();
    
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    await page.setUserAgent(userAgent);
    
    console.log("new page created");
    
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });
    
    console.log("page loaded successfully");
    await page.screenshot({ path: "adidas_debug.png" });
    const pageTitle = await page.title();
    console.log("Page title:", pageTitle);
    
    const data = await page.evaluate(() => {
      const getText = (element) => {
        if (!element) return 'N/A';
        return element.innerText?.trim() || element.textContent?.trim() || 'N/A';
      };
      const titleSelectors = [
        '#product-title span',
        '.product-title',
        '.pdp-product-name',
        'h1[data-testid="product-title"]',
        'h1.product-title',
        '.product-description h1',
        '.gl-heading--size-up-05',
        '.product_information .name',
        'h1.itemTitle___1EXnF',
        '.name___1EKAw',
        '[data-auto-id="product-title"]',
        '.pdp_product-name',
        // Generic fallbacks
        'h1',
        '.product-name',
        '.title'
      ];
      
      const priceSelectors = [
        'a[data-testid="main-price"]',
        '.price-current',
        '.product-price',
        '.price',
        '[data-testid="price"]',
        '.pdp-price',
        '.gl-price',
        '.product_information .price',
        '.currentPrice___23B7V',
        '.price___3DmDE',
        '[data-auto-id="price"]',
        '.pdp_price',
        // Generic fallbacks
        '.price-value',
        '.current-price',
        '[class*="price"]'
      ];
      
      let title = 'N/A';
      let price = 'N/A';
      
      // Try to find title
      for (const selector of titleSelectors) {
        try {
          const element = document.querySelector(selector);
          if (element && getText(element) !== 'N/A') {
            title = getText(element);
            console.log(`Found title with selector: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      // Try to find price
      for (const selector of priceSelectors) {
        try {
          const element = document.querySelector(selector);
          if (element && getText(element) !== 'N/A') {
            price = getText(element);
            console.log(`Found price with selector: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      // If still no luck, try to find any text that looks like a price
      if (price === 'N/A') {
        const allElements = document.querySelectorAll('*');
        for (const element of allElements) {
          const text = getText(element);
          // Look for Indian Rupee symbols or price patterns
          if (text.match(/₹\s*[\d,]+|Rs\.?\s*[\d,]+|\$\s*[\d,]+/)) {
            price = text;
            console.log(`Found price by pattern matching: ${text}`);
            break;
          }
        }
      }
      
      // Debug: Log available classes and IDs
      const debugInfo = {
        availableClasses: Array.from(document.querySelectorAll('[class]')).slice(0, 10).map(el => el.className),
        availableIds: Array.from(document.querySelectorAll('[id]')).slice(0, 10).map(el => el.id),
        bodyClasses: document.body?.className || 'no body classes',
        url: window.location.href
      };
      
      return {
        title,
        price,
        debug: debugInfo,
        timestamp: new Date().toISOString()
      };
    });
    
    console.log('Scraped data:', data);
    
    // If we didn't get good data, let's get more debug info
    if (data.title === 'N/A' && data.price === 'N/A') {
      console.log('No data found, getting page content sample...');
      
      const bodyText = await page.evaluate(() => {
        return document.body?.innerText?.substring(0, 1000) || 'No body text';
      });
      
      console.log('Page content sample:', bodyText);
      
      // Save full page content for debugging
      const content = await page.content();
      require('fs').writeFileSync('adidas_page_content.html', content);
      console.log('Saved page content to adidas_page_content.html for debugging');
    }
    
    return {
      title: data.title,
      price: data.price,
      url: url,
      timestamp: data.timestamp,
      success: data.title !== 'N/A' || data.price !== 'N/A'
    };
    
  } catch (error) {
    console.error('Scraping error:', error);
    return {
      error: error.message,
      url: url,
      timestamp: new Date().toISOString(),
      success: false
    };
  } finally {
    if (browser) {
      try {
        await browser.disconnect();
      } catch (closeError) {
        console.log('Error closing browser:', closeError.message);
      }
    }
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
        await page.setExtraHTTPHeaders({
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
});
        await page.goto(url, {  waitUntil: 'networkidle0', timeout: 60000 });
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
        dataFected.push(data)
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
  try {
    // Setup the queue processor first for local scraping
    setupQueueProcessor(5, scrapeAmazonProductLocal);
    
    const links = await getProductLinksFromSearch(`https://www.amazon.in/s?k=${product}`);
    console.log('Total product links found:', links.length);
    const maxLinks = 10;
    const selectedLinks = links.slice(0, maxLinks);

    console.log('Adding jobs to local scrape queue...');
    const jobs = [];
    
    // Add all jobs to queue
    for (let link of selectedLinks) {
      const job = await addToQueue(link);
      jobs.push(job);
      await delay(500); // Small delay between adding jobs
    }

    console.log(`Added ${jobs.length} jobs to local scrape queue. Waiting for completion...`);
    
    // Wait for all jobs to complete and get results
    const queueResults = await waitForQueueCompletion();
    const stats = await getQueueStats();
    console.log('Final local scrape queue stats:', stats);

    console.log('Local scraping ended');
    console.log(queueResults)

    return dataFected
    
  } catch (error) {
    await log(`Main loop error: ${error.message}`);
    console.error('Main loop error:', error);
    return {
      success: false,
      error: error.message,
      results: [],
      errors: []
    };
  } finally {
    // await closeRedis();
    // await client.$disconnect();
  }
};

module.exports = {
  scraper,
  scraperLocal,
  scrapeAmazon,
  scrapeAdidas
};