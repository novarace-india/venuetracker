import { z } from 'zod';
export const eventSchema = z.object({
  name: z.string().trim().min(1).max(160),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, 'Invalid timezone'),
  startsAt: z.string().datetime().nullable().optional(),
  emailSubject: z.string().min(1).max(200).default('Your pass for {{event}}'),
  emailBody: z
    .string()
    .min(1)
    .max(10000)
    .default(
      'Hello {{name}},\nYour pass for {{event}} is ready. Show this QR code at the gate.\nTicket: {{ticketType}}',
    ),
});
export const participantSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  fullName: z.string().trim().min(1).max(200),
  phone: z.string().max(80).default(''),
  ticketType: z.string().max(120).default('General'),
  company: z.string().max(200).default(''),
  metadata: z.record(z.string().max(200), z.string().max(2000)).default({}),
  active: z.boolean().default(true),
});
export const gateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  maxCollections: z.number().int().min(1).max(100),
  requires: z.array(z.string().uuid()).max(50).default([]),
});
export const scanSchema = z.object({
  operationId: z.string().uuid(),
  payload: z.string().max(1024).optional(),
  participantId: z.string().uuid().optional(),
  manual: z.boolean().default(false),
  reason: z.string().trim().max(500).optional(),
  clientTime: z.string().datetime().optional(),
  collectionRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});
export type EventInput = z.infer<typeof eventSchema>;
export type ParticipantInput = z.infer<typeof participantSchema>;
export type GateInput = z.infer<typeof gateSchema>;
export type ScanInput = z.infer<typeof scanSchema>;
export interface ScanResult {
  status: 'success' | 'already' | 'denied';
  message: string;
  participant?: { id: string; fullName: string };
  timestamp: string;
  previousTimestamp?: string;
  operationId: string;
  code?: 'COLLECTION_RESET' | 'COLLECTION_REVERSED';
  collectionRevision?: number;
  resetAt?: string;
}

export * from './analytics.js';
export * from './brand.js';
export * from './collections.js';
