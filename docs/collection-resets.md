# Correcting collections in NovaRace Flow

Admins can undo an accidental medal, kit, meal, or other counter collection so the participant can scan the **same QR** again.

1. Select the event, open **Participants**, find the participant and choose **Collections**. You can also choose **Manage collections** from a participant's Journey, including Analytics journeys.
2. Review the counter's active collections, timestamps, prerequisites, maximum and remaining allowance. This view always shows the whole event, irrespective of analytics filters.
3. Choose **Undo this collection**, **Undo latest**, or **Reset all at this counter**. Reset all affects only that participant at that counter.
4. Enter a specific reason. Check the impact acknowledgement if this counter is the entrance or removing its last collection affects completed downstream counters.
5. Choose **Confirm undo** or **Confirm counter reset**. The reset history records the admin, reason, time and batch ID.
6. Ask the volunteer to go online and tap **Sync now**, then scan the participant's existing QR again. Wait for green confirmation before issuing the item.

An undone entrance can change attendance statistics. Downstream collections stay recorded; review those individually if they also need correcting. A deactivated participant stays deactivated. A fresh scan still needs its prerequisites and remaining allowance.

If collections or rules change while you are reviewing a reset, the app refuses the stale confirmation and loads the current state. Review it and confirm again. If a response is lost, **Retry same reset** safely checks the same operation without undoing a later collection.

## Offline safety

Each participant/counter has a revision number. The scanner freezes that revision when the physical QR is captured. Admin resets advance the revision atomically with the undo. Queued scans from the old revision are acknowledged as rejected and removed from the queue; they cannot restore the collection. The volunteer must take a fresh scan after the tablet learns the new revision. Do not edit or retry an old queued request with a newer revision.

An older tablet or custom API client that omits the revision is treated as revision zero. It works before any reset, and is safely rejected after a reset. Refresh/update the scanner app before the event.

Original scan attempts remain immutable. Retrying an earlier successful scan whose collection has since been undone returns a `COLLECTION_REVERSED` result, rather than showing an old green approval. Other requests predating a reset return `COLLECTION_RESET`. Replays do not create extra audit attempts.

## Reports and deployment

Overview, analytics, journeys and participant status use net collections (excluding undos). Historical successful scan counts remain part of the audit. Journey Excel, PDF and CSV exports include reset attribution; PDF journey exports show undone timestamps, admin, reason and reset ID.

Restart the API to apply migration `003_collection_resets.sql` automatically. Back up the SQLite database before deploying, as with any migration. Existing undone collections receive an initial revision so old offline captures cannot silently restore them. No QR regeneration or participant reimport is needed.
