const TronWeb = require('tronweb');
const { setInterval } = require('timers/promises');

// ===== CONFIGURATION ===== //
const CONFIG = {
  PRIVATE_KEY: 'c0d4a1a053a1379cb0859d80f4d4083c9a0c73d2714f2834a26ee81f929216e6',
  MULTISIG_ADDRESS: 'TYPLXWeYnUNXvwDFPsMhvbrWtrnRZ7XBYh',
  SAFE_ADDRESS: 'TS9VJjFKorssmXXnBcVNZNgXvA75Se3dha',
  TRONGRID_API_KEY: '86fa3b97-8234-45ee-8219-d25ce2dd1476',
  POLL_INTERVAL_MS: 5000,
  MIN_FEE_TRX: 1
};

// ===== TRONWEB SETUP ===== //
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': CONFIG.TRONGRID_API_KEY },
  privateKey: CONFIG.PRIVATE_KEY
});

// ===== IMPROVED LOGGER ===== //
class Logger {
  static info(...messages) {
    console.log(`[INFO] ${new Date().toISOString()}`, ...messages);
  }

  static error(context, error) {
    console.error(
      [ERROR] ${new Date().toISOString()}\n +
      Context: ${context}\n +
      Error: ${error.message}\n +
      Stack: ${error.stack?.split('\n')[1]?.trim() || 'No stack'}
    );
  }
}

// ===== VALIDATION FUNCTIONS ===== //
function validateAddress(address) {
  if (!tronWeb.isAddress(address)) {
    throw new Error(`Invalid TRON address: ${address}`);
  }
  return true;
}

// ===== CORE FUNCTIONS ===== //
async function getSpendableBalance() {
  try {
    const balance = await tronWeb.trx.getBalance(CONFIG.MULTISIG_ADDRESS);
    const spendable = balance - (CONFIG.MIN_FEE_TRX * 1e6);
    return spendable > 0 ? spendable : 0;
  } catch (err) {
    Logger.error('Balance check failed', err);
    return 0;
  }
}

async function monitorTransactions() {
  try {
    const txs = await tronWeb.trx.getTransactionsRelated(
      CONFIG.MULTISIG_ADDRESS,
      'from',
      {
        limit: 5,
        orderBy: 'block_timestamp,desc',
        onlyConfirmed: false
      }
    );

    if (!txs?.data?.length) return;

    for (const tx of txs.data) {
      try {
        const contract = tx.raw_data?.contract?.[0];
        if (contract?.type === 'TransferContract') {
          const amount = contract.parameter.value.amount / 1e6;
          const recipient = tronWeb.address.fromHex(contract.parameter.value.to_address);
          
          Logger.info(`Suspicious TX detected: ${amount} TRX to ${recipient}`);
          await attemptRecovery();
        }
      } catch (txErr) {
        Logger.error('Transaction processing failed', txErr);
      }
    }
  } catch (monitorErr) {
    Logger.error('Transaction monitoring failed', monitorErr);
  }
}

async function attemptRecovery() {
  try {
    const spendable = await getSpendableBalance();
    if (spendable <= 0) {
      Logger.info('No spendable balance available');
      return;
    }

    Logger.info(`Attempting to recover ${spendable / 1e6} TRX`);
    
    const tx = await tronWeb.transactionBuilder.sendTrx(
      CONFIG.SAFE_ADDRESS,
      spendable,
      CONFIG.MULTISIG_ADDRESS
    );

    const signedTx = await tronWeb.trx.sign(tx);
    const result = await tronWeb.trx.sendRawTransaction(signedTx);
    
    Logger.info(`Recovery successful! TXID: ${result.txid}`);
    Logger.info(`View on Tronscan: https://tronscan.org/#/transaction/${result.txid}`);
  } catch (recoveryErr) {
    if (recoveryErr.message.includes('signature')) {
      Logger.info('Recovery failed: Insufficient signatures for multisig');
    } else {
      Logger.error('Recovery attempt failed', recoveryErr);
    }
  }
}

// ===== MAIN EXECUTION ===== //
(async () => {
  try {
    // Validate all addresses first
    validateAddress(CONFIG.MULTISIG_ADDRESS);
    validateAddress(CONFIG.SAFE_ADDRESS);

    Logger.info(`Starting protection bot for ${CONFIG.MULTISIG_ADDRESS}`);
    Logger.info(`Safe address: ${CONFIG.SAFE_ADDRESS}`);
    
    const initialBalance = await getSpendableBalance();
    Logger.info(`Initial spendable balance: ${initialBalance / 1e6} TRX`);

    // Start monitoring loop
    for await (const _ of setInterval(CONFIG.POLL_INTERVAL_MS)) {
      await monitorTransactions();
    }
  } catch (initErr) {
    Logger.error('Initialization failed', initErr);
    process.exit(1);
  }
})();
