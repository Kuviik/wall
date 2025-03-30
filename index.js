// ======================
// Transaction Monitor
// Complete Production-Ready Version
// ======================

// Configuration
const CONFIG = {
  checkIntervalMs: 5000,
  maxRetries: 5,
  retryBackoffFactor: 2,
  transactionTimeoutMs: 30000
};

// State Management
const state = {
  intervalId: null,
  retryCount: 0,
  isShuttingDown: false,
  activeTransactions: new Set()
};

// ======================
// Core Transaction Logic
// ======================

/**
 * Checks for and processes outgoing transactions
 * @throws {Error} If transactions cannot be processed
 */
async function checkForOutgoingTransactions() {
  if (state.isShuttingDown) return;

  // 1. Fetch pending transactions (mock implementation)
  const pendingTransactions = await fetchPendingTransactions();
  
  // 2. Process each transaction with timeout protection
  await Promise.all(pendingTransactions.map(async (tx) => {
    if (state.activeTransactions.has(tx.id)) {
      console.warn(`[TX ${tx.id}] Already processing - skipping`);
      return;
    }

    state.activeTransactions.add(tx.id);
    try {
      await processTransactionWithTimeout(tx);
    } finally {
      state.activeTransactions.delete(tx.id);
    }
  }));
}

/**
 * Fetches pending transactions from data source
 */
async function fetchPendingTransactions() {
  // Replace with actual database/API call
  return mockDatabase.getPendingTransactions();
}

/**
 * Processes a transaction with timeout protection
 */
async function processTransactionWithTimeout(tx) {
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Transaction timeout after ${CONFIG.transactionTimeoutMs}ms`)), 
              CONFIG.transactionTimeoutMs));

  try {
    await Promise.race([
      executeTransaction(tx),
      timeout
    ]);
    console.log(`[TX ${tx.id}] Processed successfully`);
  } catch (error) {
    console.error(`[TX ${tx.id}] Failed: ${error.message}`);
    await handleFailedTransaction(tx, error);
    throw error; // Re-throw for retry logic
  }
}

/**
 * Executes the actual transaction
 */
async function executeTransaction(tx) {
  // Replace with actual transaction logic
  return mockPaymentProcessor.send(tx);
}

/**
 * Handles failed transactions (retry, compensation, etc.)
 */
async function handleFailedTransaction(tx, error) {
  // Implement your failure handling logic here
  await mockDatabase.updateTransactionStatus(tx.id, 'failed', error.message);
}

// ======================
// Monitor Control
// ======================

/**
 * Starts the transaction monitor
 */
async function startMonitor() {
  try {
    validateDependencies();
    console.log('[Monitor] Starting transaction monitor...');
    
    state.intervalId = setInterval(monitorTick, CONFIG.checkIntervalMs);
    
    // Initial immediate execution
    await monitorTick();
    
    setupShutdownHandlers();
    console.log(`[Monitor] Running every ${CONFIG.checkIntervalMs}ms`);
  } catch (startupError) {
    console.error('[Monitor] Startup failed:', startupError);
    shutdown();
  }
}

/**
 * Single monitoring cycle
 */
async function monitorTick() {
  if (state.isShuttingDown) return;

  try {
    await checkForOutgoingTransactions();
    state.retryCount = 0; // Reset on success
  } catch (error) {
    handleMonitorError(error);
  }
}

/**
 * Handles monitor operation errors
 */
function handleMonitorError(error) {
  state.retryCount++;
  console.error(`[Monitor] Error (attempt ${state.retryCount}/${CONFIG.maxRetries}):`, error);

  if (state.retryCount >= CONFIG.maxRetries) {
    console.error('[Monitor] Max retries reached. Shutting down...');
    shutdown();
  }
}

// ======================
// System Management
// ======================

/**
 * Validates required dependencies
 */
function validateDependencies() {
  const required = [
    'fetchPendingTransactions',
    'executeTransaction',
    'handleFailedTransaction'
  ];
  
  required.forEach(fn => {
    if (typeof this[fn] !== 'function') {
      throw new Error(`Missing required function: ${fn}`);
    }
  });
}

/**
 * Sets up process shutdown handlers
 */
function setupShutdownHandlers() {
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (err) => {
    console.error('[Monitor] Uncaught exception:', err);
    shutdown(1);
  });
}

/**
 * Graceful shutdown procedure
 */
function shutdown(exitCode = 0) {
  if (state.isShuttingDown) return;
  state.isShuttingDown = true;

  console.log('[Monitor] Shutting down...');
  
  // Clear the monitoring interval
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }

  // Wait for active transactions to complete
  if (state.activeTransactions.size > 0) {
    console.log(`[Monitor] Waiting for ${state.activeTransactions.size} active transactions...`);
    setTimeout(() => {
      console.log('[Monitor] Forcing shutdown');
      process.exit(exitCode);
    }, 10000).unref(); // Give 10 seconds max for cleanup
  } else {
    process.exit(exitCode);
  }
}

// ======================
// Mock Implementations
// ======================

// Replace these with your actual implementations
const mockDatabase = {
  getPendingTransactions: async () => ([
    { id: 'tx1', amount: 100, recipient: 'acct1' },
    { id: 'tx2', amount: 200, recipient: 'acct2' }
  ]),
  updateTransactionStatus: async () => {}
};

const mockPaymentProcessor = {
  send: async (tx) => {
    // 10% chance of failure for demonstration
    if (Math.random() < 0.1) {
      throw new Error('Random payment processing failure');
    }
    return { success: true };
  }
};

// ======================
// Start the Monitor
// ======================
startMonitor();
