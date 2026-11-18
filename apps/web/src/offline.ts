import { openDB, type DBSchema } from 'idb';
import type { ScanInput, ScanResult } from '@gatecheck/shared';
interface QueuedScan {
  id: string;
  deviceId: string;
  input: ScanInput;
  queuedAt: string;
}
export interface Receipt {
  id: string;
  deviceId: string;
  result: ScanResult;
  receivedAt: string;
}
interface GateDB extends DBSchema {
  queue: { key: string; value: QueuedScan };
  receipts: { key: string; value: Receipt };
}
const database = openDB<GateDB>('gatecheck-offline', 1, {
  upgrade(db) {
    db.createObjectStore('queue', { keyPath: 'id' });
    db.createObjectStore('receipts', { keyPath: 'id' });
  },
});
export async function enqueue(deviceId: string, input: ScanInput) {
  await (
    await database
  ).put('queue', { id: input.operationId, deviceId, input, queuedAt: new Date().toISOString() });
}
export async function queued(deviceId: string) {
  return (await (await database).getAll('queue'))
    .filter((q) => q.deviceId === deviceId)
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}
export async function allQueueCount() {
  return (await (await database).getAll('queue')).length;
}
export async function complete(deviceId: string, result: ScanResult) {
  const db = await database;
  const tx = db.transaction(['queue', 'receipts'], 'readwrite');
  await tx
    .objectStore('receipts')
    .put({ id: result.operationId, deviceId, result, receivedAt: new Date().toISOString() });
  await tx.objectStore('queue').delete(result.operationId);
  await tx.done;
  const receipts = await db.getAll('receipts');
  if (receipts.length > 200) {
    receipts.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    const cleanup = db.transaction('receipts', 'readwrite');
    for (const r of receipts.slice(200)) await cleanup.store.delete(r.id);
    await cleanup.done;
  }
}
export async function recentReceipts(deviceId: string) {
  return (await (await database).getAll('receipts'))
    .filter((r) => r.deviceId === deviceId)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, 30);
}
