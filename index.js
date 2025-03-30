const TronWeb = require('tronweb');
const { setInterval } = require('timers/promises');

// ===== CONFIG ===== //
const YOUR_PRIVATE_KEY = 'c0d4a1a053a1379cb0859d80f4d4083c9a0c73d2714f2834a26ee81f929216e6'; // One of the multisig keys
const MULTISIG_WALLET_ADDRESS = 'TYPLXWeYnUNXvwDFPsMhvbrWtrnRZ7XBYh'; // Compromised multisig address
const SAFE_WALLET_ADDRESS = 'TS9VJjFKorssmXXnBcVNZNgXvA75Se3dha'; // Destination
const TRONGRID_API_KEY = '86fa3b97-8234-45ee-8219-d25ce2dd1476'; // Get at https://trongrid.io/
const CHECK_INTERVAL_MS = 3000; // Check every 3 seconds
// ================= //

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY },
});

async function checkForOutgoingTransactions() {
  try {
    // Fetch recent transactions FROM the multisig wallet
    const transactions = await tronWeb.trx.getTransactionsRelated(
      MULTISIG_WALLET_ADDRESS,
      'from',
      { limit: 10, orderBy: 'block_timestamp,desc' }
    );

    for (const tx of transactions.data) {
      if (tx.raw_data.contract[0].type === 'TransferContract') {
        console.log(`⚠️ Outgoing TX detected: ${tx.txID}`);
        console.log(`💸 Amount: ${tx.raw_data.contract[0].parameter.value.amount / 1e6} TRX`);
        console.log(`📤 To: ${tronWeb.address.fromHex(tx.raw_data.contract[0].parameter.value.to_address)}`);

        // Try to send remaining balance to a safe wallet (if you have enough signatures)
        await attemptEmergencyTransfer();
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function attemptEmergencyTransfer() {
  try {
    const balance = await tronWeb.trx.getBalance(MULTISIG_WALLET_ADDRESS);
    if (balance > 1_000_000) { // Leave 1 TRX for fees
      const tx = await tronWeb.transactionBuilder.sendTrx(
        SAFE_WALLET_ADDRESS,
        balance - 1_000_000,
        MULTISIG_WALLET_ADDRESS
      );
      
      // Sign with your key (but it won't execute unless all signers approve)
      const signedTx = await tronWeb.trx.sign(tx, YOUR_PRIVATE_KEY);
      console.log(`✍️ Signed emergency TX: ${signedTx.txID}`);
      
      // Broadcast (will only execute if all parties sign)
      const result = await tronWeb.trx.sendRawTransaction(signedTx);
      console.log('📤 Emergency TX sent:', result.txid);
    } else {
      console.log('No funds left to save.');
    }
  } catch (error) {
    console.error('Transfer failed:', error.message);
  }
}

// Run every CHECK_INTERVAL_MS
(async () => {
  console.log(`🛡️ Monitoring multisig wallet for unauthorized transfers...`);
  for await (const _ of setInterval(CHECK_INTERVAL_MS)) {
    await checkForOutgoingTransactions();
  }
})();
