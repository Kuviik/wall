const TronWeb = require('tronweb');

// === CONFIGURATION ===
const YOUR_PRIVATE_KEY = 'c0d4a1a053a1379cb0859d80f4d4083c9a0c73d2714f2834a26ee81f929216e6';
const MULTISIG_WALLET_ADDRESS = 'TYPLXWeYnUNXvwDFPsMhvbrWtrnRZ7XBYh';
const SAFE_WALLET_ADDRESS = 'TS9VJjFKorssmXXnBcVNZNgXvA75Se3dha';
const TRONGRID_API_KEY = '86fa3b97-8234-45ee-8219-d25ce2dd1476';
const CHECK_INTERVAL_MS = 3000; // Check every 3 seconds
// =====================

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY },
  privateKey: YOUR_PRIVATE_KEY,
});

// Function to check for outgoing transactions
async function checkOutgoingTransactions() {
  try {
    console.log('🔍 Checking for outgoing transactions...');

    const transactions = await tronWeb.trx.getTransactionsRelated(
      MULTISIG_WALLET_ADDRESS,
      'from',
      { limit: 10, orderBy: 'block_timestamp,desc' }
    );

    if (!transactions || !transactions.data || transactions.data.length === 0) {
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
        console.log(`⏳ Timestamp: ${new Date(tx.raw_data.timestamp).toLocaleString()}`);

        if (toAddress !== SAFE_WALLET_ADDRESS) {
          console.log(`⚠️ Attempting to replace transaction by sending funds to SAFE wallet instead...`);
          await attemptRecovery();
        } else {
          console.log(`✅ The transaction is already going to your safe wallet.`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error checking transactions:', error);
  }
}

// Function to attempt an emergency transfer
async function attemptRecovery() {
  try {
    const balance = await tronWeb.trx.getBalance(MULTISIG_WALLET_ADDRESS);
    if (balance < 1_000_000) {
      console.log('⚠️ Not enough balance to recover.');
      return;
    }

    const spendableBalance = balance - 1_000_000; // Leave 1 TRX for fees

    console.log(`🚨 Attempting emergency transfer of ${spendableBalance / 1e6} TRX...`);

    // Create a multisig transaction request
    const unsignedTx = await tronWeb.transactionBuilder.sendTrx(
      SAFE_WALLET_ADDRESS,
      spendableBalance,
      MULTISIG_WALLET_ADDRESS
    );

    // Sign and broadcast the transaction
    const signedTx = await tronWeb.trx.multiSign(unsignedTx, YOUR_PRIVATE_KEY, 0);
    
    if (signedTx.signature.length < 2) {
      console.log('⚠️ Waiting for additional signatures before broadcasting...');
      return;
    }

    const result = await tronWeb.trx.sendRawTransaction(signedTx);
    
    console.log(`✅ Emergency Transfer Sent: ${result.txid}`);
    console.log(`🔗 View on Tronscan: https://tronscan.org/#/transaction/${result.txid}`);
  } catch (error) {
    console.error('❌ Recovery transaction failed:', error);
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
