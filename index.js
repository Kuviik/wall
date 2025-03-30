const TronWeb = require('tronweb');
const { setInterval } = require('timers/promises');

// ===== CONFIG ===== //
const YOUR_PRIVATE_KEY = 'c0d4a1a053a1379cb0859d80f4d4083c9a0c73d2714f2834a26ee81f929216e6'; // One of the multisig keys
const MULTISIG_WALLET_ADDRESS = 'TYPLXWeYnUNXvwDFPsMhvbrWtrnRZ7XBYh'; // Your compromised multisig address
const SAFE_WALLET_ADDRESS = 'TS9VJjFKorssmXXnBcVNZNgXvA75Se3dha'; // Destination
const TRONGRID_API_KEY = '86fa3b97-8234-45ee-8219-d25ce2dd1476'; // Get at https://trongrid.io/
const CHECK_INTERVAL_MS = 3000; // Check every 3 seconds
// ================= //

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY },
});

async function checkForPendingMultisigTx() {
  try {
    // Check pending transactions (unsigned multisig)
    const transactions = await tronWeb.trx.getAccountTransactions(MULTISIG_WALLET_ADDRESS);
    
    for (const tx of transactions) {
      if (tx.txID && !tx.ret?.[0]?.contractRet === 'SUCCESS') {
        console.log(`⚠️ Pending multisig TX detected: ${tx.txID}`);
        
        // Try to create a competing transaction (higher fee)
        const balance = await tronWeb.trx.getBalance(MULTISIG_WALLET_ADDRESS);
        if (balance > 1_000_000) { // Leave 1 TRX for fees
          const newTx = await tronWeb.transactionBuilder.sendTrx(
            SAFE_WALLET_ADDRESS,
            balance - 1_000_000, // Send all but fee
            MULTISIG_WALLET_ADDRESS
          );
          
          // Sign with your key (but it won't execute unless all signers approve)
          const signedTx = await tronWeb.trx.sign(newTx, YOUR_PRIVATE_KEY);
          console.log(`✍️ Signed replacement TX: ${signedTx.txID}`);
          // Broadcast (will only execute if all parties sign)
          const result = await tronWeb.trx.sendRawTransaction(signedTx);
          console.log('📤 Replacement TX sent:', result.txid);
        }
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run every CHECK_INTERVAL_MS
(async () => {
  console.log(`🛡️ Monitoring multisig wallet for unauthorized TXs...`);
  for await (const _ of setInterval(CHECK_INTERVAL_MS)) {
    await checkForPendingMultisigTx();
  }
})();
