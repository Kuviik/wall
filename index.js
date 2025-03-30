const TronWeb = require('tronweb');

// === CONFIGURATION ===
const YOUR_PRIVATE_KEY = 'c0d4a1a053a1379cb0859d80f4d4083c9a0c73d2714f2834a26ee81f929216e6';  // Your multisig key
const MULTISIG_WALLET_ADDRESS = 'TYPLXWeYnUNXvwDFPsMhvbrWtrnRZ7XBYh';  // Your multisig wallet address
const SAFE_WALLET_ADDRESS = 'TS9VJjFKorssmXXnBcVNZNgXvA75Se3dha';  // Your safe wallet address
const TRONGRID_API_KEY = '86fa3b97-8234-45ee-8219-d25ce2dd1476';  // Your TronGrid API Key
const CHECK_INTERVAL_MS = 3000; // Check every 3 seconds
// =====================

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY },
  privateKey: YOUR_PRIVATE_KEY,
});

async function checkOutgoingTransactions() {
  try {
    console.log('🔍 Checking for outgoing transactions...');
    const transactions = await tronWeb.trx.getTransactionsRelated(
      MULTISIG_WALLET_ADDRESS,
      'from',
      { limit: 10, orderBy: 'block_timestamp,desc' }
    );

    if (!transactions.data || transactions.data.length === 0) {
      console.log('✅ No outgoing transactions detected.');
      return;
    }

    for (const tx of transactions.data) {
      if (tx.raw_data?.contract?.[0]?.type === 'TransferContract') {
        const amount = tx.raw_data.contract[0].parameter.value.amount / 1e6;
        const toAddress = tronWeb.address.fromHex(tx.raw_data.contract[0].parameter.value.to_address);
        
        console.log(`🚨 Outgoing Transaction Detected!`);
        console.log(`🆔 TX Hash: ${tx.txID}`);
        console.log(`💸 Amount: ${amount} TRX`);
        console.log(`📤 Recipient: ${toAddress}`);
        console.log(`⏳ Timestamp: ${new Date(tx.raw_data.timestamp)}`);

        if (toAddress !== SAFE_WALLET_ADDRESS) {
          console.log(`⚠️ Attempting to replace transaction by sending funds to SAFE wallet instead...`);
          await attemptRecovery();
        } else {
          console.log(`✅ The transaction is already going to your safe wallet.`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error checking transactions:', error.message);
  }
}

async function attemptRecovery() {
  try {
    const balance = await tronWeb.trx.getBalance(MULTISIG_WALLET_ADDRESS);
    if (balance < 1_000_000) {
      console.log('⚠️ Not enough balance to recover.');
      return;
    }

    const spendableBalance = balance - 1_000_000; // Leave 1 TRX for fees

    console.log(`🚨 Attempting emergency recovery transfer of ${spendableBalance / 1e6} TRX...`);

    // Create the replacement transaction
    const unsignedTx = await tronWeb.transactionBuilder.sendTrx(
      SAFE_WALLET_ADDRESS,
      spendableBalance,
      MULTISIG_WALLET_ADDRESS
    );

    // Sign and broadcast the transaction
    const signedTx = await tronWeb.trx.sign(unsignedTx, YOUR_PRIVATE_KEY);
    const result = await tronWeb.trx.sendRawTransaction(signedTx);
    
    console.log(`✅ Emergency Transfer Sent: ${result.txid}`);
    console.log(`🔗 View on Tronscan: https://tronscan.org/#/transaction/${result.txid}`);
  } catch (error) {
    console.error('❌ Recovery transaction failed:', error.message);
    if (error.message.includes('Permission denied')) {
      console.log('⚠️ You may not have sufficient signatures for this multisig wallet.');
    }
  }
}

// === START MONITORING LOOP ===
(async () => {
  console.log('\n🛡️ MULTISIG MONITOR & RECOVERY BOT ACTIVATED');
  console.log('=======================================');
  console.log(`👛 Multisig Address: ${MULTISIG_WALLET_ADDRESS}`);
  console.log(`🏦 Safe Address: ${SAFE_WALLET_ADDRESS}`);
  console.log(`⏱ Polling Interval: ${CHECK_INTERVAL_MS / 1000} seconds`);
  console.log('=======================================\n');

  for await (const _ of setInterval(CHECK_INTERVAL_MS)) {
    await checkOutgoingTransactions();
  }
})();
