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
      return await apiCall();
    } catch (error) {
      if (error.response && error.response.status === 403) {
        console.warn(`🚨 API rate limit hit! Waiting ${waitTime / 1000}s before retrying...`);
        await setTimeout(waitTime);
      } else {
        console.error(`⚠️ Fetch attempt ${i + 1} failed:`, error.message || error);
        await setTimeout(waitTime);
      }
    }
  }
  throw new Error('❌ Failed to fetch data after multiple attempts.');
}

// ✅ Corrected function to check outgoing transactions
async function checkForOutgoingTransactions() {
  try {
    console.log('\n🔎 Checking for outgoing transactions...');

    // ✅ Corrected: Ensuring 'limit' is within valid range (between 1 and 200)
    const transactions = await fetchWithRetry(() =>
      tronWeb.trx.getTransactionsRelated(MULTISIG_WALLET_ADDRESS, 'from', { limit: 10 })
    );

    if (!transactions || !transactions.data || transactions.data.length === 0) {
      console.log('✅ No suspicious outgoing transactions detected.');
      return;
    }

    for (const tx of transactions.data) {
      if (tx.raw_data?.contract?.[0]?.type === 'TransferContract') {
        const amount = tx.raw_data.contract[0].parameter.value.amount / 1e6;
        const toAddress = tronWeb.address.fromHex(tx.raw_data.contract[0].parameter.value.to_address);

        console.log(`\n⚠️ DETECTED OUTGOING TRANSACTION:`);
        console.log(`🆔 TX Hash: ${tx.txID}`);
        console.log(`💸 Amount: ${amount} TRX`);
        console.log(`📤 Recipient: ${toAddress}`);
        console.log(`⏳ Timestamp: ${new Date(tx.raw_data.timestamp).toLocaleString()}`);

        if (toAddress !== SAFE_WALLET_ADDRESS) {
          console.log(`🚨 Unauthorized transfer detected! Attempting recovery...`);
          await attemptEmergencyTransfer();
        } else {
          console.log(`✅ Funds are already going to the safe wallet.`);
        }
      }
    }
  } catch (error) {
    console.error('\n❌ Error checking transactions:', error.message || error);
  }
}

// ✅ Function to attempt emergency transfer
async function attemptEmergencyTransfer() {
  try {
    const balance = await tronWeb.trx.getBalance(MULTISIG_WALLET_ADDRESS);
    if (balance < 1_000_000) {
      console.log('⚠️ Insufficient funds for recovery.');
      return;
    }

    const spendableBalance = balance - 1_000_000;
    console.log(`\n🚨 ATTEMPTING EMERGENCY TRANSFER OF ${spendableBalance / 1e6} TRX...`);

    const unsignedTx = await tronWeb.transactionBuilder.sendTrx(
      SAFE_WALLET_ADDRESS,
      spendableBalance,
      MULTISIG_WALLET_ADDRESS
    );

    const signedTx = await tronWeb.trx.sign(unsignedTx, YOUR_PRIVATE_KEY);
    if (!signedTx || !signedTx.txID) {
      throw new Error('❌ Signing transaction failed. SignedTx is undefined.');
    }

    console.log(`✍️ Signed TX ID: ${signedTx.txID}`);

    const result = await tronWeb.trx.sendRawTransaction(signedTx);
    if (!result || !result.result) {
      throw new Error('❌ Transaction broadcast failed.');
    }

    console.log(`✅ Emergency Transfer Sent: ${result.txid}`);
    console.log(`🔗 View on Tronscan: https://tronscan.org/#
