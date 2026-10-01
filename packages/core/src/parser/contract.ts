import { z } from 'zod';

/**
 * Core data contract (TZ §6). Every parser — rule-based or AI — must produce
 * exactly this shape, and nothing reaches the database without passing it.
 */
export const TRANSACTION_TYPES = ['expense', 'income', 'debt_given', 'debt_taken', 'debt_return'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export const DEBT_TYPES = new Set<TransactionType>(['debt_given', 'debt_taken', 'debt_return']);

export const parsedTransactionSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.enum(['UZS', 'USD']),
    category_id: z.string().min(1).max(64).nullable(),
    note: z.string().max(200).nullable(),
    counterparty: z.string().max(100).nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type ParsedTransaction = z.infer<typeof parsedTransactionSchema>;
