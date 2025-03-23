import inquirer from "inquirer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import csvParser from "csv-parser";
import { createObjectCsvWriter } from "csv-writer";

/********************************************************************
 * Global Variables and Configuration
 *********************************************************** *********/

// Generate today's date in YYYY-MM-DD format
const today = new Date();
const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

/**
 * URLs list with metadata for scraping:
 * Each entry contains:
 *  - id: Unique identifier
 *  - name: Human-friendly name for the URL category
 *  - url: The actual webpage to scrape
 *  - csv: The output CSV filename where scraped data will be stored
 */
const urls = [
  {
    id: 1,
    name: "Dimensional Lumber & Studs",
    url: "https://www.homedepot.ca/en/home/categories/building-materials/lumber-and-composites/dimensional-lumber-and-studs.html",
    csv: `CSVs/Unsorted/SPF_${formattedDate}.csv`
  },
  {
    id: 2,
    name: "Pressure Treated Lumber",
    url: "https://www.homedepot.ca/en/home/categories/building-materials/lumber-and-composites/pressure-treated-lumber.html",
    csv: `CSVs/Unsorted/PT_${formattedDate}.csv`
  },
  {
    id: 3,
    name: "Plywood",
    url: "https://www.homedepot.ca/en/home/categories/building-materials/lumber-and-composites/plywood.html",
    csv: `CSVs/Unsorted/PLY_${formattedDate}.csv`
  }
];

// The worker script that will be spawned in separate processes
const workerScript = path.resolve("scraperWorker.js");


/********************************************************************
 * Function: runWorker
 * Spawns a single worker process to scrape a given URL.
 *
 * @param {number} workerId - The unique identifier for the worker
 * @param {string} url - The URL to be scraped
 * @param {string} csv - The CSV file path where results will be stored
 * @param {boolean} verbose - If true, runs the worker in verbose mode
 * @returns {Promise<number>} Resolves when the worker exits (exit code)
 ********************************************************************/
function runWorker(workerId, url, csv, verbose) {
  console.log(`🚀 Starting worker ${workerId} for: ${url}`);

  return new Promise((resolve) => {
    // Spawn a new Node.js process that runs the 'scraperWorker.js' script
    // We pass workerId, url, csv, and verbose as command-line arguments
    const worker = spawn("node", [workerScript, workerId, url, csv, verbose.toString()], {
      stdio: ["inherit", "pipe", "inherit"], // Capture stdout (product data)
    });

  
    // Capture the worker's output (product data)
    let scrapedData = "";
    worker.stdout.on("data", (data) => {
      scrapedData += data.toString();
    });


    worker.on("exit", (code) => {
      if (code === 0) {
        console.log(`✅ Worker ${workerId} completed successfully.`);
        
        try {
          // Parse scraped JSON data and return it
          const products = JSON.parse(scrapedData.trim());
          resolve(products)          
        } catch (error) {
          console.error(`❌ Error parsing worker ${workerId} output:`, error);
          resolve([]);          
        }

      } else {
        console.error(`❌ Worker ${workerId} failed with exit code ${code}.`);
      }
        // Resolve the promise so the caller knows the worker is done
      resolve(code);
    });
  });
}


/********************************************************************
 * Function: runAllUrls
 * Spawns multiple workers (one per URL in the 'urls' array) in parallel.
 * Waits for all to finish, then optionally merges the sorted CSVs.
 *
 * @param {boolean} verboseAll - If true, all scrapers run in verbose mode
 * @returns {Promise<void>}
 ********************************************************************/
async function runAllUrls(verboseAll) {
  console.log("🔄 Scraping all URLs...");

  const allProducts = [];
  
  // Map over 'urls' array and create a list of Promises from runWorker calls
  const promises = urls.map(({ id, url, csv }) => 
    runWorker(id, url, csv, verboseAll)
  );
  
  const results = await Promise.all(promises);
  
  results.forEach((products) => allProducts.push(...products))

  console.log(`📂 All scraping completed. Collected ${allProducts.length} products.`);

  // Write final data to CSV
  const mergedCsvPath = `CSVs/Merged/Merged_${formattedDate}.csv`;
  writeToCSV(allProducts, mergedCsvPath);

  console.log(`✅ Merged CSV saved to ${mergedCsvPath}`);

  
}


/********************************************************************
 * Function: mergeCSVs
 * Reads all CSV files in 'CSVs/Sorted' and merges them into a single
 * CSV file in 'CSVs/Merged', named "Merged_<formattedDate>.csv".
 *
 * For each row in each CSV:
 *  - The first column becomes "Product Name"
 *  - The second column becomes "Price"
 *  - Extra columns are ignored
 *
 * @returns {Promise<void>}
 ********************************************************************/
async function mergeCSVs() {
  const sortedDir = path.resolve("CSVs/Sorted");
  const outputDir = path.resolve("CSVs/Merged");
  const mergedFilePath = path.join(outputDir, `Merged_${formattedDate}.csv`);

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Get all CSV files from the sorted directory
  const files = fs.readdirSync(sortedDir).filter((file) => file.endsWith(".csv"));
  if (files.length === 0) {
    console.log("❌ No CSV files found in the Sorted directory.");
    return;
  }

  // Accumulate rows in the format { 'Product Name': <val>, 'Price': <val> }
  let allRecords = [];

  // Read each CSV, ignoring original headers and only keeping first two columns
  for (const file of files) {
    const filePath = path.join(sortedDir, file);
    const records = [];

    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        // Setting { headers: false } causes 'csv-parser' to treat the first row as data,
        // and each row will be returned as an object with numeric string keys.
        .pipe(csvParser({ headers: false }))
        .on("data", (rowObj) => {
          // Convert the row object into an array of values, e.g. { '0': 'A', '1': 'B' } -> ['A','B']
          const rowArray = Object.values(rowObj);

          // Safely grab the first two columns. Any extra columns are ignored.
          const col1 = rowArray[0] ?? "";
          const col2 = rowArray[1] ?? "";

          // Push a standardized object to records
          records.push({
            "Product Name": col1,
            Price: col2,
          });
        })
        .on("end", () => {
          allRecords = allRecords.concat(records);
          resolve();
        })
        .on("error", reject);
    });
  }

  // Create a CSV writer with exactly two columns: "Product Name" and "Price"
  const csvWriter = createObjectCsvWriter({
    path: mergedFilePath,
    header: [
      { id: "Product Name", title: "Product Name" },
      { id: "Price", title: "Price" },
    ],
  });

  // Write the accumulated records to the merged CSV
  await csvWriter.writeRecords(allRecords);

  console.log(`✅ Merged CSV saved to ${mergedFilePath}`);
}


/********************************************************************
 * Function: startCLI
 * Starts an interactive command-line interface (CLI) using Inquirer.
 * Prompts the user to choose from several actions, then executes.
 *
 * The available actions are:
 *  1) Explanation of the script
 *  2) List all available URLs
 *  3) Run a specific URL
 *  4) Run all URLs
 *  5) Merge sorted CSVs only
 *  6) Exit
 *
 * @returns {Promise<void>}
 ********************************************************************/
async function startCLI() {
  console.log("\n📌 Welcome to the Home Depot Scraper CLI\n");

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do?",
      choices: [
        { name: "ℹ️  Explanation of the script", value: "explanation" },
        { name: "📋 List all available URLs", value: "list_urls" },
        { name: "🚀 Run a specific URL", value: "run_one" },
        { name: "🔄 Run all URLs", value: "run_all" },
        { name: "🗂 Merge sorted CSVs only", value: "merge_only" },
        { name: "❌ Exit", value: "exit" },
      ],
    },
  ]);

  switch (action) {
    case "explanation":
      console.log(`
🔹 This script scrapes product listings from Home Depot's website.
🔹 It uses Puppeteer to automate browsing and extract product details.
🔹 The extracted data is saved into CSV files for later processing.
🔹 You can choose to scrape all URLs or select a specific one.
      `);
      return startCLI();

    case "merge_only":
      // Merge CSVs without scraping
      console.log("\n🗂 You selected 'Merge Sorted CSVs Only'.\n");
      const { confirmMerge } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmMerge",
          message: "Are you sure you want to merge all CSVs in CSVs/Sorted?",
          default: true,
        },
      ]);
      if (confirmMerge) {
        await mergeCSVs();
      }
      return startCLI();

    case "list_urls":
      console.log("\n📝 Available URLs to scrape:\n");
      urls.forEach(({ id, name, url }) => {
        console.log(`  ${id}. ${name}`);
        console.log(`     ↳ ${url}\n`);
      });
      return startCLI();

    case "run_one": {
      const { chosenId } = await inquirer.prompt([
        {
          type: "list",
          name: "chosenId",
          message: "Which URL would you like to scrape?",
          choices: urls.map(({ id, name }) => ({ name, value: id })),
        },
      ]);

      const selectedURL = urls.find(({ id }) => id === chosenId);
      const { verbose } = await inquirer.prompt([
        {
          type: "confirm",
          name: "verbose",
          message: "Enable verbose mode?",
          default: false,
        },
      ]);

      // Run single worker
      await runWorker(selectedURL.id, selectedURL.url, selectedURL.csv, verbose);

      // After the single worker finishes, show info + prompt
      console.log("\n📂 The sorted CSV is located in CSVs/Sorted.\n");

      /*      
      const { combineSingle } = await inquirer.prompt([
        {
          type: "confirm",
          name: "combineSingle",
          message: "Would you like to combine all sorted CSVs into one file?",
          default: false,
        },
      ]);

      if (combineSingle) {
        await mergeCSVs();
      }
      */
     
      break;
    }

    case "run_all": {
      const { confirmAll } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmAll",
          message: "Are you sure you want to scrape all URLs?",
          default: true,
        },
      ]);
      if (confirmAll) {
        const { verboseAll } = await inquirer.prompt([
          {
            type: "confirm",
            name: "verboseAll",
            message: "Enable verbose mode for all?",
            default: false,
          },
        ]);
        await runAllUrls(verboseAll);
      }
      break;
    }

    case "exit":
      console.log("\n👋 Exiting... Have a great day!\n");
      process.exit(0);

    default:
      console.log("❌ Invalid selection. Please try again.");
      return startCLI();
  }
}

// Start CLI
startCLI();
