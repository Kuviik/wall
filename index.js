async function checkForOutgoingTransactions() {
  try {
    console.log('\n🔎 Checking for outgoing transactions...');
    const transactions = await tronWeb.trx.getTransactionsRelated(
      MULTISIG_WALLET_ADDRESS,
      'from',
      { limit: 10, orderBy: 'block_timestamp,desc' }
    );

    console.log('Raw transaction response:', transactions); // Debugging line

    if (!transactions.data || transactions.data.length === 0) {
      console.log('No recent transactions found.');
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
        console.log(`⏳ Timestamp: ${new Date(tx.raw_data.timestamp)}`);

        await attemptEmergencyTransfer();
      }
    }
  } catch (error) {
    console.error('\n❌ Error checking transactions:', error); // Log full error object
  }
}
