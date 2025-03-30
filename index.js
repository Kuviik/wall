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

// ✅ Function to handle API retries
async function fetchWithRetry(apiCall, retries = 3, waitTime = 30000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await apiCall();
      if (!response || Object.keys(response).length === 0) {
        throw new Error('❌ Empty API response received.');
      }
      return response;
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

// ✅ Function to check outgoing transactions
async function checkForOutgoingTransactions() {
  try {
    console.log('\n🔎 Checking for outgoing transactions...');

    const transactions = await fetchWithRetry(() =>
      tronWeb.trx.getTransactionsRelated(MULTISIG_WALLET_ADDRESS, 'from', { limit: 10 })
    );

    if (!transactions || !transactions.data || transactions.data.length === 0) {
      console.log('✅ No suspicious outgoing transactions detected.');
      return;
    }

    for (const tx of transactions.data) {
      if (!tx.raw_data || !tx.raw_data.contract || !tx.raw_data.contract[0]) {
        console.warn('⚠️ Skipping invalid transaction (missing contract data).');
        continue;
      }

      if (tx.raw_data.contract[0].type === 'TransferContract') {
        const toAddressHex = tx.raw_data.contract[0].parameter.value.to_address;
        if (!toAddressHex) {
          console.warn('⚠️ Skipping transaction: Missing recipient address.');
          continue;
        }

        const amount = tx.raw_data.contract[0].parameter.value.amount / 1e6;
        const toAddress = tronWeb.address.fromHex(toAddressHex);

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
    const balance = await fetchWithRetry(() => tronWeb.trx.getBalance(MULTISIG_WALLET_ADDRESS));
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

    if (!unsignedTx || !unsignedTx.txID) {
      throw new Error('❌ Failed to build transaction.');
    }

    const signedTx = await tronWeb.trx.sign(unsignedTx, YOUR_PRIVATE_KEY);
    if (!signedTx || !signedTx.txID) {
      throw new Error('❌ Signing transaction failed.');
    }

    console.log(`✍️ Signed TX ID: ${signedTx.txID}`);

    const result = await tronWeb.trx.sendRawTransaction(signedTx);
    if (!result || !result.txid) {
      throw new Error('❌ Transaction broadcast failed.');
    }

    console.log(`✅ Emergency Transfer Sent: ${result.txid}`);
    console.log(`🔗 View on Tronscan: https://tronscan.org/#/transaction/${result.txid}`);
  } catch (error) {
    console.error('\n❌ Emergency transfer failed:', error.message || error);
    if (error.message && error.message.includes('Permission denied')) {
      console.log('⚠️ You may not have sufficient signatures for this multisig wallet.');
    }
  }
}

// ✅ Start Monitoring
(async () => {
  console.log('\n🛡️ MULTISIG WALLET PROTECTION BOT ACTIVATED');
  console.log('=======================================');
  console.log(`👛 Multisig Address: ${MULTISIG_WALLET_ADDRESS}`);
  console.log(`🏦 Safe Address: ${SAFE_WALLET_ADDRESS}`);
  console.log(`⏱ Polling Interval: ${CHECK_INTERVAL_MS / 1000} seconds`);
  console.log('=======================================\n');

  try {
    const initialBalance = await fetchWithRetry(() => tronWeb.trx.getBalance(MULTISIG_WALLET_ADDRESS));
    console.log(`💰 Current Balance: ${initialBalance / 1e6} TRX\n`);
  } catch (error) {
    console.error('❌ Initial balance check failed:', error.message || error);
  }

  setInterval(checkForOutgoingTransactions, CHECK_INTERVAL_MS);
})();
