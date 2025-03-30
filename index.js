(async () => {
  const CHECK_INTERVAL_MS = 5000; // Define this if not already defined
  let intervalId;
  
  try {
    intervalId = setInterval(async () => {
      try {
        await checkForOutgoingTransactions();
      } catch (error) {
        console.error('Error in transaction check:', error);
        // Consider clearing interval if errors persist
        // clearInterval(intervalId);
      }
    }, CHECK_INTERVAL_MS);
    
    // Store intervalId if you need to clear it later
    process.on('SIGINT', () => clearInterval(intervalId));
    process.on('SIGTERM', () => clearInterval(intervalId));
  } catch (startupError) {
    console.error('Failed to start transaction monitor:', startupError);
    if (intervalId) clearInterval(intervalId);
  }
})();
