const TronWeb = require('tronweb');
require('dotenv').config(); // Load environment variables
const { setInterval } = require('timers');

// ===== CONFIGURATION (SECURELY LOADED FROM .ENV) ===== //
const YOUR_PRIVATE_KEY = process.env.PRIVATE_KEY || 'c0d4a1a053a1379cb0859d80f4d4083c9a0c73d2714f2834a26ee81f929216e6';
const MULTISIG_WALLET_ADDRESS = process.env.MULTISIG_ADDRESS || 'TYPLXWeYnUNXvwDFPsMhvbrWtrnRZ7XBYh';
const SAFE_WALLET_ADDRESS = process.env.SAFE_ADDRESS || 'TS9VJjFKorssmXXnBcVNZNgXvA75Se3dha';
const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY || '86fa3b97-8234-45ee-8219-d25ce2dd1476';
const CHECK_INTERVAL_MS = 5000; // Check every 5 seconds (optimized to avoid rate limits)
// ==================================================== //

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY },
  privateKey: YOUR_PRIVATE_KEY,
});

// ✅ Verify addresses are valid
console.log('🔍 Verifying addresses:');
try {
  console.log('📍 Multisig Wallet:', tronWeb.address.toBase58(MULTISIG_WALLET_ADDRESS));
  console.log('🏦 Safe Wallet:', tronWeb.address.toBase58(SAFE_WALLET_ADDRESS));
} catch (error) {
  console.error('❌ Invalid address format:', error.message);
  process.exit(1);
}

// 🔄 Function to monitor transactions
async function checkForOutgoingTransactions() {
  try {
    console.log('\n🔎 Checking for outgoing transactions...');
    const transactions = await tronWeb.trx.getTransactionsRelated(
      MULTISIG_WALLET_ADDRESS,
      'from',
      { limit: 10, orderBy: 'block_timestamp,desc' }
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
    console.error('\n❌ Error checking transactions:', error);
  }
}

// 🔥 Emergency Recovery Transfer
async function attemptEmergencyTransfer() {
  try {
    const balance = await tronWeb.trx.getBalance(MULTISIG_WALLET_ADDRESS);
    if (balance < 1_000_000) {
      console.log('⚠️ Insufficient funds for recovery.');
      return;
    }

    const spendableBalance = balance - 1_000_000; // Leave 1 TRX for fees
    console.log(`\n🚨 ATTEMPTING EMERGENCY TRANSFER OF ${spendableBalance / 1e6} TRX...`);

    // Step 1: Create a raw transaction
    const unsignedTx = await tronWeb.transactionBuilder.sendTrx(
      SAFE_WALLET_ADDRESS,
      spendableBalance,
      MULTISIG_WALLET_ADDRESS
    );

    // Step 2: Sign the transaction
    const signedTx = await tronWeb.trx.sign(unsignedTx);
    console.log(`✍️ Signed TX ID: ${signedTx.txID}`);

    // Step 3: Broadcast the transaction
    const result = await tronWeb.trx.sendRawTransaction(signedTx);

    if (result.result) {
      console.log(`✅ Emergency Transfer Sent: ${result.txid}`);
      console.log(`🔗 View on Tronscan: https://tronscan.org/#/transaction/${result.txid}`);
    } else {
      console.log('❌ Transaction broadcast failed.');
    }
  } catch (error) {
    console.error('\n❌ Emergency transfer failed:', error);
    if (error.message.includes('Permission denied')) {
      console.log('⚠️ You may not have sufficient signatures for this multisig wallet.');
    }
  }
}

// 🔄 Start Monitoring Loop
(async () => {
  console.log('\n🛡️ MULTISIG WALLET PROTECTION BOT ACTIVATED');
  console.log('=======================================');
  console.log(`👛 Multisig Address: ${MULTISIG_WALLET_ADDRESS}`);
  console.log(`🏦 Safe Address: ${SAFE_WALLET_ADDRESS}`);
  console.log(`⏱ Polling Interval: ${CHECK_INTERVAL_MS / 1000} seconds`);
  console.log('=======================================\n');

  // ✅ Initial balance check
  try {
    const initialBalance = await tronWeb.trx.getBalance(MULTISIG_WALLET_ADDRESS);
    console.log(`💰 Current Balance: ${initialBalance / 1e6} TRX\n`);
  } catch (error) {
    console.error('❌ Initial balance check failed:', error.message);
  }

  // ✅ Monitor transactions every CHECK_INTERVAL_MS milliseconds
  setInterval(checkForOutgoingTransactions, CHECK_INTERVAL_MS);
})();
