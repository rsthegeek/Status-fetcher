// fetchStatus.mjs

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import cliProgress from 'cli-progress';
import pLimit from 'p-limit';

async function processURL(item) {
  try {
    const response = await fetch(item.URL, { redirect: 'follow' });
    const finalURL = response.url;
    const statusCode = response.status;

    // Append the status code to the object
    item.Status = statusCode;

    // Handle redirects (3xx)
    if (statusCode >= 300 && statusCode < 400) {
      item['Redirect to'] = finalURL;

      // Check for trailing slash redirection
      const normalizedOriginalURL = item.URL.endsWith('/')
        ? item.URL.slice(0, -1)
        : item.URL;
      const normalizedFinalURL = finalURL.endsWith('/')
        ? finalURL.slice(0, -1)
        : finalURL;

      if (normalizedOriginalURL === normalizedFinalURL) {
        item.Status = 404;
        delete item['Redirect to']; // Remove redirect information for 404
      }
    }
  } catch (error) {
    console.error(`Error fetching URL ${item.URL}:`, error.message);
    item.Status = 'Error'; // Append error status
  }
}

async function checkURLsFromCSV(inputFilePath, outputFilePath) {
  // Read and parse the input CSV file
  const inputCSV = fs.readFileSync(inputFilePath, 'utf8');
  const records = parse(inputCSV, {
    columns: true,
    skip_empty_lines: true,
  });

  // Set up progress bar
  const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  progressBar.start(records.length, 0);

  // Limit concurrency to 100
  const limit = pLimit(100);

  // Track completed tasks
  let completed = 0;

  // Process URLs with concurrency limit
  const tasks = records.map((item) =>
    limit(async () => {
      await processURL(item);
      completed++;
      progressBar.update(completed);
    })
  );

  // Wait for all tasks to complete
  await Promise.all(tasks);

  progressBar.stop();

  // Write the results to the output CSV file
  const outputCSV = stringify(records, {
    header: true,
    columns: ['URL', 'Last crawled', 'Status', 'Redirect to'],
  });

  fs.writeFileSync(outputFilePath, outputCSV, 'utf8');
}

// Main CLI logic
(async () => {
  const [inputFilePath, outputFilePath] = process.argv.slice(2);

  if (!inputFilePath) {
    console.error('Usage: node fetchStatus.mjs <inputFilePath> [outputFilePath]');
    process.exit(1);
  }

  const resolvedInputPath = path.resolve(inputFilePath);
  const resolvedOutputPath = outputFilePath
    ? path.resolve(outputFilePath)
    : resolvedInputPath;

  console.log(`Reading from: ${resolvedInputPath}`);
  console.log(`Writing to: ${resolvedOutputPath}`);

  await checkURLsFromCSV(resolvedInputPath, resolvedOutputPath);

  console.log('Processing complete!');
})();