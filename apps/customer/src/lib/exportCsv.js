// Builds a CSV of wallet transactions and opens the share sheet.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const cell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';

export async function exportCsv(tx) {
  const head = ['Date', 'Time', 'Type', 'Description', 'Amount (NGN)', 'Status', 'Reference'];
  const rows = (tx || []).map((t) => {
    const d = new Date(t.created_at);
    return [d.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos' }), d.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos' }),
      t.type, t.label || '', Number(t.amount).toFixed(2), t.status || 'completed', t.id];
  });
  const csv = [head, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  const file = new File(Paths.cache, 'poultry360-transactions-' + new Date().toISOString().slice(0, 10) + '.csv');
  file.create({ overwrite: true });
  file.write(csv);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export transactions', UTI: 'public.comma-separated-values-text' });
}
