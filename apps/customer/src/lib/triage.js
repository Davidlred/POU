// Rule-based PRELIMINARY TRIAGE. Never a diagnosis (PRD §11 RISK). Replace with a reviewed model later.
const RULES = [
  { signs: ['Sneezing', 'Watery eyes', 'Swollen face', 'Gasping'], concern: 'Respiratory infection (e.g. coryza or CRD)', advice: 'Separate affected birds and improve ventilation, especially at night.' },
  { signs: ['Diarrhoea', 'Bloody droppings', 'Lethargy'], concern: 'Gut infection such as coccidiosis', advice: 'Keep litter dry and water clean. Do not share drinkers with healthy birds.' },
  { signs: ['Drop in lay', 'Soft-shelled eggs'], concern: 'Nutrition or stress-related drop in lay', advice: 'Check feed calcium, lighting hours and recent changes to the flock.' },
  { signs: ['Twisted neck', 'Paralysis', 'Sudden deaths'], concern: 'A serious notifiable disease such as Newcastle', advice: 'Isolate the house immediately and speak to a vet today.', urgent: true },
];
export const SIGNS = ['Sneezing', 'Watery eyes', 'Swollen face', 'Gasping', 'Diarrhoea', 'Bloody droppings', 'Lethargy', 'Drop in lay', 'Soft-shelled eggs', 'Twisted neck', 'Paralysis', 'Sudden deaths'];

export function triage(signs, photoCount) {
  if (!signs.length || photoCount === 0) return { confidence: 'low', concerns: [], summary: "We can't tell from this information. A vet can look properly." };
  const scored = RULES.map((r) => ({ ...r, hits: r.signs.filter((s) => signs.includes(s)).length })).filter((r) => r.hits > 0).sort((a, b) => b.hits - a.hits);
  if (!scored.length) return { confidence: 'low', concerns: [], summary: "These signs don't match a common pattern. A vet can look properly." };
  const top = scored[0];
  const confidence = top.urgent ? 'medium' : top.hits >= 2 ? 'medium' : 'low';
  return { confidence, urgent: !!top.urgent, concerns: scored.slice(0, 2).map((r) => r.concern), advice: top.advice,
    summary: 'You reported: ' + signs.join(', ').toLowerCase() + '.' };
}
