const TronWeb = require('tronweb');
const { setInterval } = require('timers/promises');

// ===== CONFIGURATION ===== //
const config = {
  PRIVATE_KEY: 'c0d4a1a053a1379cb0859d80f4d4083c9a0c73d2714f2834a26ee81f929216e6',
  MULTISIG_ADDRESS: 'TYPLXWeYnUNXvwDFPsMhvbrWtrnRZ7XBYh',
  SAFE_ADDRESS: 'TS9VJjFKorssmXXnBcVNZNgXvA75Se3dha',
  TRONGRID_KEY: '86fa3b97-8234-45ee-8219-d25ce2dd1476',
  POLL_INTERVAL: 5000, // 5 seconds
  MIN_FEE: 1_000_000 // 1 TRX
};

// ===== INITIALIZATION ===== //
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': config.TRONGRID_KEY },
  privateKey: config.PRIVATE_KEY
});

// ===== DEBUGGING UTILS ===== //
function debugLog(...messages) {
  console.log('[DEBUG]', new Date().toISOString(), ...messages);
}

function errorHandler(context, error) {
  console.error(
    [ERROR] ${new Date().toISOString()}\n,
    Context: ${context}\n,
    Error: ${error.message}\n,
    Stack: ${error.stack || 'No stack trace'}
  );
}

// ===== CORE FUNCTION ===== //
async function checkTransactions() {
  try {
    debugLog(`Checking transactions for ${config.MULTISIG_ADDRESS}`);
    
    const response = await tronWeb.trx.getTransactionsRelated(
      config.MULTISIG_ADDRESS,
      'from',
      {
        limit: 5,
        orderBy: 'block_timestamp,desc',
        onlyConfirmed: false
      }
    );

    if (!response || !response.data) {
      debugLog('No transaction data received');
      return;
    }

    for (const tx of response.data) {
      try {
        if (!tx.raw_data?.contract?.[0]) continue;
        
        const contract = tx.raw_data.contract[0];
        if (contract.type === 'TransferContract') {
          const value = contract.parameter.value;
          debugLog(`Found transfer: ${value.amount / 1e6} TRX to ${tronWeb.address.fromHex(value.to_address)}`);
          
          await attemptRecovery();
        }
      } catch (txError) {
        errorHandler('Processing transaction', txError);
      }
    }
  } catch (mainError) {
    errorHandler('Main transaction check', mainError);
  }
}

async function attemptRecovery() {
  try {
    const balance = await tronWeb.trx.getBalance(config.MULTISIG_ADDRESS);
    const recoverable = balance - config.MIN_FEE;
    
    if (recoverable <= 0) {
      debugLog(`Insufficient balance for recovery (Current: ${balance / 1e6} TRX)`);
      return;
    }

    debugLog(`Attempting recovery transfer of ${recoverable / 1e6} TRX`);
    
    const tx = await tronWeb.transactionBuilder.sendTrx(
      config.SAFE_ADDRESS,
      recoverable,
      config.MULTISIG_ADDRESS
    );

    const signedTx = await tronWeb.trx.sign(tx);
    const result = await tronWeb.trx.sendRawTransaction(signedTx);
    
    debugLog(`Recovery TX broadcasted: ${result.txid}`);
  } catch (recoveryError) {
    errorHandler('Funds recovery', recoveryError);
    
    // Specific handling for common cases
    if (recoveryError.message.includes('signature')) {
      debugLog('Multisig requirement not met - need additional signatures');
    } else if (recoveryError.message.includes('balance')) {
      debugLog('Balance changed during recovery attempt');
    }
  }
}

// ===== MAIN EXECUTION ===== //
(async () => {
  debugLog('Starting Multisig Protection Bot');
  debugLog(`Monitoring: ${config.MULTISIG_ADDRESS}`);
  debugLog(`Safe Address: ${config.SAFE_ADDRESS}`);

  try {
    // Initial balance check
    const balance = await tronWeb.trx.getBalance(config.MULTISIG_ADDRESS);
    debugLog(`Initial balance: ${balance / 1e6} TRX`);

    // Start monitoring loop
    for await (const _ of setInterval(config.POLL_INTERVAL)) {
      await checkTransactions();
    }
  } catch (startupError) {
    errorHandler('Bot startup', startupError);
    process.exit(1);
  }
})();
