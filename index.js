const TronWeb = require('tronweb');
const { setTimeout } = require('timers/promises');

// ===== CONFIGURATION ===== //
const YOUR_PRIVATE_KEY = 'c0d4a1a053a1379cb0859d80f4d4083c9a0c73d2714f2834a26ee81f929216e6';
const MULTISIG_WALLET_ADDRESS = 'TYPLXWeYnUNXvwDFPsMhvbrWtrnRZ7XBYh';
const SAFE_WALLET_ADDRESS = 'TS9VJjFKorssmXXnBcVNZNgXvA75Se3dha';
const TRONGRID_API_KEY = '86fa3b97-8234-45ee-8219-d25ce2dd1476';
const CHECK_INTERVAL_MS = 10000; // Check every 10 seconds

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY },
});

// ✅ Function to handle API rate limits
async function fetchWithRetry(apiCall, retries = 3, waitTime = 30000) {
  for (let i = 0; i < retries; i++) {
    try {
