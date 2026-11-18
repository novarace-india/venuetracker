import { z } from 'zod';
export const collectionResetSchema = z
  .object({
    operationId: z.string().uuid(),
    mode: z.enum(['one', 'all']),
    collectionId: z.string().uuid().optional(),
    expectedState: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string().trim().min(3).max(500),
    acknowledgeImpacts: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'one' && !v.collectionId)
      ctx.addIssue({ code: 'custom', message: 'Choose the collection to undo' });
    if (v.mode === 'all' && v.collectionId)
      ctx.addIssue({
        code: 'custom',
        message: 'Reset all does not accept an individual collection',
      });
  });
export type CollectionResetInput = z.infer<typeof collectionResetSchema>;
export interface ManagedCollection {
  id: string;
  scanId: string;
  createdAt: string;
  deviceName: string | null;
  manual: boolean;
}
export interface ManagedGate {
  id: string;
  name: string;
  maxCollections: number;
  requires: { id: string; name: string }[];
  missingPrerequisites: string[];
  activeCount: number;
  remaining: number;
  revision: number;
  lastResetAt: string | null;
  stateToken: string;
  entrance: boolean;
  activeCollections: ManagedCollection[];
  completedDependents: { id: string; name: string; collections: number }[];
}
export interface CollectionResetHistory {
  id: string;
  gateId: string;
  gateName: string;
  mode: 'one' | 'all' | 'legacy';
  collectionIds: string[];
  count: number;
  reason: string;
  actorId: string | null;
  actorEmail: string | null;
  createdAt: string;
  revision: number | null;
}
export interface CollectionManagement {
  participant: { id: string; fullName: string; email: string; active: boolean };
  event: { id: string; name: string; timezone: string };
  gates: ManagedGate[];
  history: CollectionResetHistory[];
  generatedAt: string;
}
export interface CollectionResetResult {
  operationId: string;
  gateId: string;
  participantId: string;
  mode: 'one' | 'all';
  undoneCount: number;
  collectionIds: string[];
  remainingCollections: number;
  remainingAllowance: number;
  revision: number;
  timestamp: string;
  message: string;
}
