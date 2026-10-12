// SIMULATED Paystack. Swap for the Paystack SDK + server-side verification in production.
export const TEST_CARDS = [
  { id: 'ok', label: 'Verve •••• 4081', note: 'Test card · succeeds' },
  { id: 'insufficient', label: 'Mastercard •••• 0002', note: 'Test card · insufficient funds' },
  { id: 'declined', label: 'Visa •••• 0003', note: 'Test card · declined by bank' },
  { id: 'timeout', label: 'Visa •••• 0004', note: 'Test card · times out' },
];
const REASONS = {
  insufficient: 'Your bank declined this payment: insufficient funds. You have not been charged.',
  declined: 'Your bank declined this card. Try another card or pay from your wallet.',
  timeout: 'The payment timed out before your bank responded. You have not been charged.',
};
export function chargeCard(cardId, amount) {
  return new Promise((resolve) => setTimeout(() => {
    if (REASONS[cardId]) resolve({ ok: false, reason: REASONS[cardId] });
    else resolve({ ok: true, ref: 'PSK_' + Date.now().toString(36).toUpperCase() + '_' + Math.round(amount) });
  }, cardId === 'timeout' ? 3500 : 1600));
}
