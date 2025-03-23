import puppeteer from "puppeteer-core";
import fs from "fs"; // For CSV
import AUTH from "./auth.js";
import { exec } from "child_process";


/*******************************************************************************************
 * --------------------SCRAPERWORKER.JS-------------------------------
 *******************************************************************************************
 */

// Retrieve arguments from cli.js

const workerId = process.argv[2]; // New worker ID
const url = process.argv[3];
const csvName = process.argv[4];
const verbose = process.argv[5] === "true"; // Convert string argument to boolean


/**
 * Delay helper: Pauses execution for `time` milliseconds.
 */
function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

/**
 * Scrolls the page downward in increments until the document height stops
 * growing. This is typically the first step in loading all lazy-loaded products.
 */
async function scrollUntilNoChange(page, scrollStep = 500, scrollDelay = 1500) {
  let previousHeight = await page.evaluate("document.body.scrollHeight");
  while (true) {
    await page.evaluate((step) => {
      window.scrollBy(0, step);
    }, scrollStep);

    await delay(scrollDelay);

    const currentHeight = await page.evaluate("document.body.scrollHeight");
    if (currentHeight === previousHeight) break;
    previousHeight = currentHeight;
  }
}

/**
 * Repeatedly scrolls the page, checking how many product cards are present.
 * Stops once the count doesn't increase for several consecutive attempts,
 * or after hitting a max iteration limit.
 *
 * This approach helps catch sites that load products in multiple bursts of
 * lazy-loading or partial increments.
 */
async function scrollAndWaitForStability(page, maxRepeats = 5, verbose=false) {
  let stableCountRepeats = 0;
  let lastCount = 0;

  // We'll allow up to `maxRepeats` consecutive checks where the product count
  // does not change. If it never stabilizes fully, we stop to avoid infinite loops.
  while (stableCountRepeats < maxRepeats) {
    // 1) Scroll until no immediate change in body height
    await scrollUntilNoChange(page, 1000, 500);

    // 2) Wait a bit to see if new products appear
    await delay(2000);

    // 3) Check how many product cards we have
    const currentCount = await page.$$eval("article[acl-product-card]", (cards) => cards.length);

    if (verbose) {
      console.log(`[Worker ${workerId}] Currently detected ${currentCount} product cards.`);
    }


    // 4) Compare to last iteration
    if (currentCount === lastCount) {
      stableCountRepeats++;
    } else {
      stableCountRepeats = 0;
      lastCount = currentCount;
    }
  }

  if (verbose) {
    console.log(`[Worker ${workerId}] Final stable product card count: ${lastCount}`);
  }


}

/**
 * Connects Puppeteer to a remote browser instance with the provided credentials.
 */
async function connectToBrowser(auth, verbose=false) {
  if (verbose){
    console.log(`[Worker ${workerId}] Connecting to remote browser...`);
  }
  const browser = await puppeteer.connect({
    browserWSEndpoint: `wss://${auth}@brd.superproxy.io:9222`,
    protocolTimeout: 10*60*1000, // 10 minute timeout
  });
  if (verbose){
    console.log(`[Worker ${workerId}] Successfully connected to remote browser.`);
  }
  return browser;
}

/**
 * Changes the store location (e.g., city or postal code).
 * Adjust selectors if the site updates.
 */
async function changeStore(page, location) {

  if(verbose){
    console.log(`[Worker ${workerId}] Attempting to change store to location: ${location}...`);
  }

  await page.waitForSelector('acl-store-hours-menu[role="button"]');

  if(verbose){
    console.log(`[Worker ${workerId}] Found 'Change Store' button. Clicking...`);
  }

  await page.click('acl-store-hours-menu[role="button"]');


  if(verbose){
    console.log(`[Worker ${workerId}] Typing location: ${location}...`);
  }

  await page.waitForSelector('input.hdca-input[placeholder="Postal Code, City, or Store Number"]');
  await page.type('input.hdca-input[placeholder="Postal Code, City, or Store Number"]', location);

  if(verbose){
    console.log(`[Worker ${workerId}] Location typed. Pressing 'Enter'...`);
  }

  await page.keyboard.press("Enter");

  // Wait for the search results, then click the primary button
  if(verbose){
    console.log(`[Worker ${workerId}] Waiting for results to load...`);
  }

  await delay(5000);

  if(verbose){
    console.log(`[Worker ${workerId}] Attempting to click primary 'Set Store' button...`);
  }

  await page.waitForSelector("button.acl-button--theme--primary");
  await page.click("button.acl-button--theme--primary");

  // Extra wait for the store to be confirmed
  if(verbose){
    console.log(`[Worker ${workerId}] Store change request submitted. Waiting a few seconds...`);
  }

  await delay(5000);
  if(verbose){
    console.log(`[Worker ${workerId}] Store successfully changed.`);
  }
}

/**
 * Writes an array of product objects to a CSV file without quotes around values.
 */
function writeToCSV(data, outPath) {
  const header = ["product_name", "price"];
  let csvContent = header.join(",") + "\n";

  data.forEach((item) => {
    // Escape commas by replacing them with spaces (or choose another delimiter if necessary)
    const row = [
      item.productName.replace(/,/g, " "), // Remove commas to avoid CSV misinterpretation
      item.price.replace(/,/g, " ")       // Remove commas if present in price
    ];
    csvContent += row.join(",") + "\n"; // No extra quotes added
  });

  fs.writeFileSync(outPath, csvContent, "utf8");

  if(verbose){
    console.log(`[Worker ${workerId}] CSV file written: ${outPath}`);
  }


//-----------------Code For Sorting CSVs------------------
//                * Disabled PLY sort

  


   let pythonScript = null;

  // IF PTurl or SPFurl, use sortProducts.py script to update current CSV
  if (outPath.includes("PT_") || outPath.includes("SPF_")) {
    pythonScript = "sortProducts.py";  // Use general sorting script

  // IF PLYurl, use sortProductsPLY.py script to update current CSV
  } else if (outPath.includes("PLY_")) {
    //pythonScript = "sortProductsPLY.py"; // Use PLY-specific sorting script
  }

  if (pythonScript) {
    if(verbose){
      console.log(`[Worker ${workerId}] Sorting CSV using ${pythonScript}...`);
    }

    exec(`python ${pythonScript} "${outPath}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing Python script: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Python script stderr: ${stderr}`);
        return;
      }
      console.log(`[Worker ${workerId}] Sorting complete: ${stdout}`);
    });
  } else {
      if(verbose){
        console.log(`[Worker ${workerId}] No sorting required for this CSV.`);
      }
  }
}

/**
 * Extracts product data from each card. Extends your logic to capture more fields.
 */
function extractFieldsFromCard(card) {
  const getText = (sel) => {
    const el = card.querySelector(sel);
    return el ? el.textContent.trim() : "";
  };

  const productName = getText(".acl-product-card__title--product-name");

  const rawDollarText = getText(".acl-product-card__price-dollars");
  const rawCentsText = getText(".acl-product-card__price-cents");

  const dollarDigits = rawDollarText.replace(/\D+/g, "") || "0";
  const centsDigits = rawCentsText.replace(/\D+/g, "") || "00";

  const finalPrice = `$${dollarDigits}.${centsDigits}`.trim();

  return {
    productName,
    price: finalPrice,
  };
}

/**
 * Scrolls and waits for product stability, then extracts all products from the current page,
 * then checks if a “Next” page exists. Continues until no next page or max pages is reached.
 */
async function scrapeAllProducts(page, initialUrl) {
  console.log(`\n[Worker ${workerId}] Navigating to initial URL: ${initialUrl}`);
  const allProducts = [];

  // Go to the page
  await page.goto(initialUrl, { waitUntil: "networkidle2" });
  if (verbose) {
    console.log(`\n[Worker ${workerId}] Page loaded. Waiting 5 seconds for initial content...`);
  }
  await delay(5000);

  const MAX_PAGES = 20;
  let pageCount = 0;

  while (true) {
    pageCount++;

    if (verbose) {
      console.log(`\n[Worker ${workerId}] --- Scraping page #${pageCount} ---`);
    }

    // Thoroughly scroll & wait for product count to stabilize
    await scrollAndWaitForStability(page, 5);

    // Take a screenshot for debugging
    const screenshotPath = `debug_page_${pageCount}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (verbose) {
      console.log(`[Worker ${workerId}] Saved screenshot: ${screenshotPath}`);
    }

    if (verbose) {
      console.log(`[Worker ${workerId}] Extracting product data...`);
    }

    // Retry loop: try to extract product data until all product cards have valid data
    let validDataFound = false;
    let attempts = 0;
    let productData = [];
    while (!validDataFound && attempts < 3) {
      attempts++;

      // Extract data from the product cards using extractFieldsFromCard
      productData = await page.$$eval(
        "article[acl-product-card]",
        (cards, extractFunction) => {
          // Convert the stringified function back to a usable function
          const extractFieldsFromCard = eval(`(${extractFunction})`);
          return cards.map((card) => extractFieldsFromCard(card));
        },
        extractFieldsFromCard.toString() // Pass the function as a string
      );

      // Check for invalid entries: empty product name or price of "$0.00"
      const invalidEntries = productData.filter(
        (p) => !p.productName || p.price === "$0.00"
      );

      if (invalidEntries.length > 0) {
        if (verbose) {
          console.log(
            `
            ERROR: INVALID PRODUCT ENTRIES
            [Worker ${workerId}] Found ${invalidEntries.length} invalid product(s) on page #${pageCount} 
            (attempt ${attempts}).
            
            Retrying...
            
            `
          );
        }
        // Optionally, wait a bit and re-run scrolling to refresh the data before trying again
        await delay(3000);
        await scrollAndWaitForStability(page, 5);
      } else {
        validDataFound = true;
      }
    }

    if (!validDataFound && attempts >= 3) {
      if (verbose) {
        console.log(
          `
          ERROR: INVALID PRODUCT ENTRIES
          [Worker ${workerId}] Page #${pageCount} still has invalid product entries after exceeding max attempts.

          Proceeding with invalid entries...

          `
        );
      }
      // FUTURE UPDATE: add additional logic for dealing with invalid entries after max attempts exceeded.
    }

    // Add scraped data to the overall list
    allProducts.push(...productData);

    if (verbose) {
      console.log(
        `[Worker ${workerId}] Found ${productData.length} product cards on this page. Total so far: ${allProducts.length}`
      );
    }

    // Stop if max pages reached
    if (pageCount >= MAX_PAGES) {
      console.log(`[Worker ${workerId}] Reached max of ${MAX_PAGES} pages, stopping pagination.`);
      break;
    }

    // Check for "Next" button
    const NEXT_BUTTON_SELECTOR = 'a[aria-label="Next Page"]';
    
    if (verbose) {
      console.log(`[Worker ${workerId}] Checking for 'Next' button...`);
    }

    const nextButton = await page.$(NEXT_BUTTON_SELECTOR);

    if (!nextButton) {
      if (verbose) {
        console.log(`[Worker ${workerId}] No 'Next' button found. Last page likely reached.`);
      }
      break;
    }

    // Check if the "Next" button is disabled
    const isDisabled = await page.evaluate((btn) => btn.hasAttribute("disabled"), nextButton);

    if (isDisabled) {
      
      if (verbose) {
        console.log(`[Worker ${workerId}] 'Next' button is disabled. Stopping pagination.`);
      }

      break;

    }

    // Go to the next page
    if (verbose) {
      console.log(`[Worker ${workerId}] Clicking 'Next' and waiting for new page content...`);
    }

    await Promise.all([
      nextButton.click(),
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 60000 }),
    ]);

    // Wait a bit before next iteration
    await delay(3000);
  }

  console.log(`\n[Worker ${workerId}] Finished scraping. Total products scraped: ${allProducts.length}`);
  return allProducts;
}



/***********************************************************************************
 ------------------------------- MAIN FUNCTION --------------------------------
********************************************************************************/

(async function () {

  if(verbose){
    console.log(`\n[Worker ${workerId}] Starting scraping for: ${url}`);
  }

  let browser;
  try {

    // Connect to remote browser
    browser = await connectToBrowser(AUTH);


    
    
    // Open a new page for store selection
    if(verbose){
      console.log(`[Worker ${workerId}] Creating a new page to set store location...`);
    }
    
    const setupPageName = "Home Depot Canada"
    const setupPageLocation = "Collingwood"
    const setupPageUrl = "https://www.homedepot.ca/"
    const setupPage = await browser.newPage();
    setupPage.setDefaultNavigationTimeout(6 * 60 * 1000);

    // Go to setupPageUrl & change store
    if(verbose){
      console.log(`[Worker ${workerId}] Navigating to ${setupPageName} homepage...`);
    }

    await setupPage.goto(`${setupPageUrl}`);
    await delay(5000);

    if(verbose){
      console.log(`[Worker ${workerId}] ${setupPageName} homepage loaded.`);
      console.log(`[Worker ${workerId}] Selecting store location...`);
    }

    await changeStore(setupPage, setupPageLocation);

    if(verbose){
      console.log(`[Worker ${workerId}] Closing the setup page...`);
    }

    await setupPage.close();

    if(verbose){
      console.log(`[Worker ${workerId}] Begin scraping URLs...`);
    }





    const allProducts = [];

    if(verbose){
      console.log(`\n[Worker ${workerId}] ----- Scraping URL: ${url} -----`);
    }


    // Fresh page for each URL
    const scraperPage = await browser.newPage();
    scraperPage.setDefaultNavigationTimeout(6 * 60 * 1000);

    // Scrape
    const products = await scrapeAllProducts(scraperPage, url);
    allProducts.push(...products);

    if(verbose){
      console.log(`[Worker ${workerId}] Finished scraping ${url}. Total products so far: ${allProducts.length}`);
    }

    await scraperPage.close();

    // Output final data to console
    console.log(`\n[Worker ${workerId}] All scraping done! Listing scraped products...\n`);


    if(verbose){
      console.log(`\n[Worker ${workerId}] Listing scraped products...\n`);
      allProducts.forEach((p, i) => {
        console.log(`[Worker ${workerId}] ${i + 1}. ${p.productName} | ${p.price}`);
      });
    }

    console.log(JSON.stringify(allProducts))

    // Write to CSV
    const csvPath = csvName;
    writeToCSV(allProducts, csvPath);

    console.log(`\n[Worker ${workerId}] Scraped a total of ${allProducts.length} products from ${url}.`);


    return allProducts;


  } catch (error) {
    console.error("An error occurred while scraping:", error);
    return [];
  } finally {
    if (browser) {
      console.log(`[Worker ${workerId}] Closing the browser...`);
      await browser.close();
      console.log(`[Worker ${workerId}] Browser closed.`);
    }
    process.exit(0);
  }
})();
