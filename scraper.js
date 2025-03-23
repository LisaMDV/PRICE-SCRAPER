import { spawn } from "child_process";
import path from "path";

// Define URLs and output CSV names
const today = new Date();
const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

const urls = [
  { id: 1, url: "https://www.homedepot.ca/en/home/categories/building-materials/lumber-and-composites/dimensional-lumber-and-studs.html", csv: `CSVs/Unsorted/SPF_${formattedDate}.csv` },
  { id: 2, url: "https://www.homedepot.ca/en/home/categories/building-materials/lumber-and-composites/pressure-treated-lumber.html", csv: `CSVs/Unsorted/PT_${formattedDate}.csv` },
  { id: 3, url: "https://www.homedepot.ca/en/home/categories/building-materials/lumber-and-composites/plywood.html", csv: `CSVs/Unsorted/PLY_${formattedDate}.csv` }
];

// Path to the worker script
const workerScript = path.resolve("scraperWorker.js");
const verbose = false;

/**
 * Runs a worker process for scraping a single URL.
 */
function runWorker(workerId, url, csv, verbose) {
  console.log(`🚀 Starting Worker ${workerId} for: ${url}`);


  const worker = spawn("node", [workerScript, workerId, url, csv,verbose.toString()], { stdio: "inherit" });

  worker.on("exit", (code) => {
    if (code === 0) {
      console.log(`✅ Worker ${workerId} completed successfully.`);
    } else {
      console.error(`❌ Worker ${workerId} failed with exit code ${code}.`);
    }
  });
}

// Start workers for each URL
urls.forEach(({ id, url, csv}) => runWorker(id, url, csv,verbose));
