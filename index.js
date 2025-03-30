const TronWeb = require('tronweb');
const { setInterval } = require('timers/promises');

// ===== CONFIGURATION ===== //
const config = {
  YOUR_PRIVATE_KEY: 'c0d4a1a053a1379cb0859d80f4d4083c9a0c73d2714f2834a26ee81f929216e6',
  MULTISIG_WALLET_ADDRESS: 'TYPLXWeYnUNXvwDFPsMhvbrWtrnRZ7XBYh',
  SAFE_WALLET_ADDRESS: 'TS9VJjFKorssmXXnBcVNZNgXvA75Se3dha',
  TRONGRID_API_KEY: '86fa3b97-8234-45ee-8219-d25ce2dd1476',
  CHECK_INTERVAL_MS: 3000,
  MIN_RESERVE_TRX: 1000000 // 1 TRX reserve for fees (changed from 1_000_000 for Node.js compatibility)
};

// ===== VALIDATION ===== //
function validateConfig() {
  if (!TronWeb.isAddress(config.MULTISIG_WALLET_ADDRESS)) {
    throw new Error('Invalid MULTISIG_WALLET_ADDRESS');
  }
  if (!TronWeb.isAddress(config.SAFE_WALLET_ADDRESS)) {
    throw new Error('Invalid SAFE_WALLET_ADDRESS');
  }
  if (!/^[a-fA-F0-9]{64}$/.test(config.YOUR_PRIVATE_KEY)) {
    throw new Error('Invalid private key format');
  }
}

// ===== TRONWEB SETUP ===== //
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': config.TRONGRID_API_KEY },
  privateKey: config.YOUR_PRIVATE_KEY
});

// ===== CORE FUNCTIONS ===== //
async function getWalletBalance(address) {
  try {
    return await tronWeb.trx.getBalance(address);
  } catch (error) {
    console.error(`Balance check failed for ${address}:`, error.message);
    return 0;
  }
}

async function monitorMultisig() {
  try {
    const transactions = await tronWeb.trx.getTransactionsRelated(
      config.MULTISIG_WALLET_ADDRESS,
      'from',
      { 
        limit: 10,
        orderBy: 'block_timestamp,desc',
        onlyConfirmed: false,
        onlyUnconfirmed: true
      }
    );

    if (!transactions  !transactions.data  !transactions.data.length) return;

    for (const tx of transactions.data) {
      if (tx && tx.raw_data && tx.raw_data.contract && tx.raw_data.contract[0] && 
          tx.raw_data.contract[0].type === 'TransferContract') {
        await handleSuspiciousTransaction(tx);
      }
    }
  } catch (error) {
    console.error('Monitoring error:', error.message);
  }
}

async function handleSuspiciousTransaction(tx) {
  const txInfo = {
    id: tx.txID,
    amount: tx.raw_data.contract[0].parameter.value.amount / 1000000,
    to: tronWeb.address.fromHex(tx.raw_data.contract[0].parameter.value.to_address),
    timestamp: new Date(tx.raw_data.timestamp)
  };

  console.log('\n🚨 Suspicious Transaction Detected:');
  console.log('  TX ID:', txInfo.id);
  console.log('  Amount:', txInfo.amount, 'TRX');
  console.log('  Recipient:', txInfo.to);
  console.log('  Time:', txInfo.timestamp);

  await attemptRecovery();
}

async function attemptRecovery() {
  try {
    const balance = await getWalletBalance(config.MULTISIG_WALLET_ADDRESS);
    const recoverableAmount = balance - config.MIN_RESERVE_TRX;

    if (recoverableAmount <= 0) {
      console.log('No recoverable funds remaining');
      return;
    }

    console.log('Attempting to recover', recoverableAmount / 1000000, 'TRX...');

    const tx = await tronWeb.transactionBuilder.sendTrx(
      config.SAFE_WALLET_ADDRESS,
      recoverableAmount,
      config.MULTISIG_WALLET_ADDRESS
    );

    const signedTx = await tronWeb.trx.sign(tx, config.YOUR_PRIVATE_KEY);
    const result = await tronWeb.trx.sendRawTransaction(signedTx);

    console.log('✅ Recovery TX Broadcasted:');
    console.log('  TX Hash:', result.txid);
    console.log('  View on Tronscan:', `https://tronscan.org/#/transaction/${result.txid}`);
  } catch (error) {
    console.error('Recovery attempt failed:', error.message);
    if (error.message.includes('signature')) {
      console.log('⚠️ Insufficient signatures for multisig transaction');
    }
  }
}

// ===== MAIN EXECUTION ===== //
(async () => {
  try {
    validateConfig();
    
    console.log('🔒 Multisig Protection Bot Activated');
    console.log('    Monitoring:', config.MULTISIG_WALLET_ADDRESS);
    console.log('    Safe Address:', config.SAFE_WALLET_ADDRESS);
    console.log('');

    const initialBalance = await getWalletBalance(config.MULTISIG_WALLET_ADDRESS);
    console.log('Initial Balance:', initialBalance / 1000000, 'TRX');

    setInterval(async () => {
      await monitorMultisig();
    }, config.CHECK_INTERVAL_MS);

  } catch (startupError) {
    console.error('Bot startup failed:', startupError.message);
    process.exit(1);
  }
})();
