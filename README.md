# Home Depot Product Scraper CLI

## 📌 Overview
This is a **Node.js CLI application** that scrapes product listings from Home Depot's website using **Puppeteer**. The extracted data is saved in **CSV format**, allowing for further processing and analysis. The CLI provides a user-friendly interface to:
- **Get an explanation of the scraper**
- **List all available URLs**
- **Scrape a specific URL**
- **Scrape all URLs**
- **Enable or disable verbose mode for debugging**



https://github.com/user-attachments/assets/cfc76086-76e8-4754-8475-9cdf3b0e1f1a





### **CLI Options**
When you run the script, you will see the following interactive menu:
```
📌 Welcome to the Home Depot Scraper CLI

? What would you like to do?
  ℹ️  Explanation of the script
  📋 List all available URLs
  🚀 Run a specific URL
  🔄 Run all URLs
  ❌ Exit
```

#### **1️⃣ Explanation of the script**
Provides a brief overview of what the scraper does.

#### **2️⃣ List all available URLs**
Displays all the product pages that can be scraped. (all currently only from Home Depot) 

#### **3️⃣ Run a specific URL**
- Allows the user to select one URL from the list.
- Asks whether to **enable verbose mode** for detailed logs.
- Starts scraping the selected page.

#### **4️⃣ Run all URLs**
- Scrapes **all available URLs** in parallel.
- Asks whether to **enable verbose mode** for all workers.

#### **5️⃣ Exit**
Closes the application.

---

## 🛠️ Configuration
The scraper script automatically generates **CSV files** named by date, stored in the `CSVs/Unsorted/` directory.

### **Modify URLs**
You can change or add new URLs inside `cli.js`:
```javascript
const urls = [
  { id: 1, name: "Dimensional Lumber & Studs", url: "https://www.homedepot.ca/...", csv: `CSVs/Unsorted/SPF_${formattedDate}.csv` },
  { id: 2, name: "Pressure Treated Lumber", url: "https://www.homedepot.ca/...", csv: `CSVs/Unsorted/PT_${formattedDate}.csv` }
];
```

## 📂 File Structure
```
/home-depot-scraper
│── CSVs/                # CSV output files
  |── Unsorted
  |── Sorted             # Final version of the CSVs HERE. Combine later to paste into Google sheets
  |── Merged
│── cli.js               # Command-line interface script
│── scraperWorker.js     # Puppeteer worker script
│── sortProducts.py      # Used to sort PT and SPF names in csv from home depot
│── README.md            # Documentation
```

