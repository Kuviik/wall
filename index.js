const TronWeb = require('tronweb');
const { setInterval } = require('timers/promises');

// ===== CONFIGURATION (YOUR VALUES) ===== //
const YOUR_PRIVATE_KEY = 'c0d4a1a053a1379cb0859d80f4d4083c9a0c73d2714f2834a26ee81f929216e6'; // One of the multisig keys
const MULTISIG_WALLET_ADDRESS = 'TYPLXWeYnUNXvwDFPsMhvbrWtrnRZ7XBYh'; // Your compromised multisig address
const SAFE_WALLET_ADDRESS = 'TS9VJjFKorssmXXnBcVNZNgXvA75Se3dha'; // Destination
const TRONGRID_API_KEY = '86fa3b97-8234-45ee-8219-d25ce2dd1476'; // Your API key
const CHECK_INTERVAL_MS = 3000; // Check every 3 seconds
// ====================================== //

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY },
  privateKey: YOUR_PRIVATE_KEY
});

// ✅ Define `fetchWithRetry` to handle temporary API failures
async function fetchWithRetry(apiCall, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      console.warn(`⚠️ Fetch attempt ${attempt} failed: ${error.message || error}`);
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 sec before retrying
    }
  }
}

// ✅ Get and log initial balance
(async () => {
  console.log('\n🛡️ MULTISIG WALLET PROTECTION BOT ACTIVATED');
  console.log('=======================================');
  console.log(`👛 Multisig Address: ${MULTISIG_WALLET_ADDRESS}`);
  console.log(`🏦 Safe Address: ${SAFE_WALLET_ADDRESS}`);
  console.log(`⏱ Polling Interval: ${CHECK_INTERVAL_MS / 1000} seconds`);
  console.log('=======================================\n');

  try {
    const balance = await fetchWithRetry(() => tronWeb.trx.getBalance(MULTISIG_WALLET_ADDRESS));
    console.log(`💰 Current Balance: ${balance / 1e6} TRX\n`);
  } catch (error) {
    console.error('❌ Initial balance check failed:', error.message || error);
  }

  for await (const _ of setInterval(CHECK_INTERVAL_MS)) {
    await checkForOutgoingTransactions();
  }
})();

// ✅ Fix the API call for fetching transactions
async function checkForOutgoingTransactions() {
  try {
    console.log('\n🔎 Checking for outgoing transactions...');

    // Use `getTransactionList` instead of `getTransactionsRelated`
    const response = await fetchWithRetry(() => 
      tronWeb.trx.getTransactionList(MULTISIG_WALLET_ADDRESS, 0, 10) // No `limit` parameter
    );

    if (!response || !response.length) {
      console.log('✅ No outgoing transactions detected.');
      return;
    }

    for (const tx of response) {
      if (!tx.raw_data || !tx.raw_data.contract || !tx.raw_data.contract[0]) {
        console.warn('⚠️ Skipping invalid transaction (missing contract data).');
        continue;
      }

      if (tx.raw_data.contract[0].type === 'TransferContract') {
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

// ✅ Fix the emergency transfer function
async function attemptEmergencyTransfer() {
  try {
    const balance = await fetchWithRetry(() => tronWeb.trx.getBalance(MULTISIG_WALLET_ADDRESS));
    const spendableBalance = balance - 1_000_000; // Leave 1 TRX for fees

    if (spendableBalance > 0) {
      console.log(`\n🚨 ATTEMPTING EMERGENCY TRANSFER OF ${spendableBalance / 1e6} TRX...`);

      const unsignedTx = await tronWeb.transactionBuilder.sendTrx(
        SAFE_WALLET_ADDRESS,
        spendableBalance,
        MULTISIG_WALLET_ADDRESS
      );

      const signedTx = await tronWeb.trx.sign(unsignedTx);
      console.log(`✍️ Signed TX ID: ${signedTx.txID}`);

      const result = await fetchWithRetry(() => tronWeb.trx.sendRawTransaction(signedTx));
      console.log('✅ Transaction Broadcasted:', result.txid);
      console.log('🔗 View on Tronscan:', `https://tronscan.org/#/transaction/${result.txid}`);
    } else {
      console.log('\nℹ️ No spendable balance left in the wallet.');
    }
  } catch (error) {
    console.error('\n❌ Emergency transfer failed:', error.message || error);
    if (error.message.includes('Permission denied')) {
      console.log('⚠️ You may not have sufficient signatures for this multisig wallet.');
    }
  }
}
