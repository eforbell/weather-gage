// Presentation-only receipts. Read public pending orders and friendly ships;
// never infer transmission timing from an era or mutate simulation state.
const sameOrder = (a, b) => a?.type === b?.type && (a?.type !== 'proceed' || (a.q === b.q && a.r === b.r));

export function captureCommandReceipt(view, shipIds, order, sequence) {
  const last = view.log.at(-1);
  const ids = new Set(shipIds);
  const targets = view.pending.filter(p => ids.has(p.shipId) && p.order && sameOrder(p.order, order))
    .map(p => ({ id: p.shipId, name: view.ships.find(s => s.id === p.shipId)?.name || 'Vessel', deliverAt: p.deliverAt }));
  const rejected = ['warn', 'warning'].includes(last?.kind) || !targets.length;
  return { sequence, submittedAt: view.tick, order: { ...order }, targets: rejected ? [] : targets,
    rejected, reason: rejected ? last?.text || 'No active vessels received this signal.' : '' };
}

export function commandReceiptStatus(receipt, view) {
  if (!receipt) return null;
  if (receipt.rejected) return { phase: 'rejected', title: 'Signal not sent', detail: receipt.reason };
  const counts = { queued: 0, acknowledged: 0, superseded: 0, unavailable: 0, resolved: 0 };
  const arrivals = [];
  for (const target of receipt.targets) {
    const ship = view.ships.find(s => s.id === target.id);
    const pending = view.pending.find(p => p.shipId === target.id && p.order);
    if (!ship || ship.status !== 'active') counts.unavailable++;
    else if (pending && sameOrder(pending.order, receipt.order)) {
      counts.queued++; arrivals.push(Math.max(view.tick + 1, pending.deliverAt));
    } else if (pending) counts.superseded++;
    else if (sameOrder(ship.order, receipt.order)) counts.acknowledged++;
    else counts.resolved++;
  }
  const summary = Object.entries(counts).filter(([, n]) => n).map(([kind, n]) => `${n} ${kind}`).join(' · ');
  if (counts.queued) {
    const min = Math.min(...arrivals), max = Math.max(...arrivals);
    const timing = min === max ? `T${String(min).padStart(2, '0')}` : `T${String(min).padStart(2, '0')}–T${String(max).padStart(2, '0')}`;
    return { phase: 'queued', title: counts.acknowledged ? 'Signal partly acknowledged' : 'Signal queued', detail: `${summary} · delivery ${timing}. Advance the clock for delivery.` };
  }
  if (counts.acknowledged === receipt.targets.length) return { phase: 'acknowledged', title: 'Signal acknowledged', detail: `${summary}. Captains have this standing order.` };
  return { phase: counts.superseded ? 'superseded' : 'resolved', title: counts.superseded ? 'Signal superseded' : 'Signal resolved', detail: `${summary}. See the action dispatch for details.` };
}
