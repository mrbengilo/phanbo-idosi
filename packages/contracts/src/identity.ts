import { z } from 'zod';

import {
  EntityIdSchema,
  IsoDateTimeSchema,
  PaginationMetaSchema,
  PaginationQuerySchema,
} from './common.js';

export const AccountRoleSchema = z.enum(['ADMIN', 'HTKD', 'STORE']);
export type AccountRole = z.infer<typeof AccountRoleSchema>;

export const AccountStatusSchema = z.enum(['ACTIVE', 'LOCKED', 'DISABLED']);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const AccountSchema = z
  .object({
    id: EntityIdSchema,
    username: z.string().trim().min(3).max(80),
    displayName: z.string().trim().min(1).max(120),
    role: AccountRoleSchema,
    status: AccountStatusSchema,
    storeId: EntityIdSchema.nullable(),
    sessionVersion: z.number().int().nonnegative(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((account, context) => {
    if (account.role === 'STORE' && account.storeId === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['storeId'],
        message: 'A store account must belong to a store',
      });
    }

    if (account.role !== 'STORE' && account.storeId !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['storeId'],
        message: 'Only store accounts may have a storeId',
      });
    }
  });
export type Account = z.infer<typeof AccountSchema>;

export const AuthenticatedPrincipalSchema = z
  .object({
    accountId: EntityIdSchema,
    username: z.string().trim().min(3).max(80),
    displayName: z.string().trim().min(1).max(120),
    role: AccountRoleSchema,
    status: z.literal('ACTIVE'),
    storeId: EntityIdSchema.nullable(),
    assignedStoreIds: z.array(EntityIdSchema),
  })
  .strict()
  .superRefine((principal, context) => {
    if (principal.role === 'STORE') {
      if (principal.storeId === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['storeId'],
          message: 'A store principal must have a storeId',
        });
      }
      if (principal.assignedStoreIds.length !== 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['assignedStoreIds'],
          message: 'A store principal cannot have HTKD assignments',
        });
      }
    }

    if (principal.role === 'HTKD' && principal.storeId !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['storeId'],
        message: 'An HTKD principal cannot have a storeId',
      });
    }

    if (
      principal.role === 'ADMIN' &&
      (principal.storeId !== null || principal.assignedStoreIds.length > 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignedStoreIds'],
        message: 'An admin principal is global and cannot have store assignments',
      });
    }
  });
export type AuthenticatedPrincipal = z.infer<typeof AuthenticatedPrincipalSchema>;

export const SessionSchema = z
  .object({
    id: EntityIdSchema,
    principal: AuthenticatedPrincipalSchema,
    createdAt: IsoDateTimeSchema,
    lastSeenAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema,
  })
  .strict();
export type Session = z.infer<typeof SessionSchema>;

export const LoginRequestSchema = z
  .object({
    username: z.string().trim().min(3).max(80),
    password: z.string().min(6).max(256),
  })
  .strict();
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({ data: SessionSchema }).strict();
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const GetSessionResponseSchema = z.object({ data: SessionSchema }).strict();
export type GetSessionResponse = z.infer<typeof GetSessionResponseSchema>;

export const LogoutResponseSchema = z
  .object({ data: z.object({ revoked: z.literal(true) }).strict() })
  .strict();
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

const CreateAccountShapeSchema = z
  .object({
    username: z.string().trim().min(3).max(80),
    displayName: z.string().trim().min(1).max(120),
    password: z.string().min(6).max(256),
    role: AccountRoleSchema,
    storeId: EntityIdSchema.nullable().default(null),
  })
  .strict();

export const CreateAccountRequestSchema = CreateAccountShapeSchema.superRefine(
  (request, context) => {
    if (request.role === 'STORE' && request.storeId === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['storeId'],
        message: 'A store account must belong to a store',
      });
    }

    if (request.role !== 'STORE' && request.storeId !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['storeId'],
        message: 'Only store accounts may have a storeId',
      });
    }
  },
);
export type CreateAccountRequest = z.infer<typeof CreateAccountRequestSchema>;

export const CreateAccountResponseSchema = z.object({ data: AccountSchema }).strict();
export type CreateAccountResponse = z.infer<typeof CreateAccountResponseSchema>;

export const UpdateAccountRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    status: AccountStatusSchema.optional(),
    expectedSessionVersion: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (request) => request.displayName !== undefined || request.status !== undefined,
    'At least one mutable field is required',
  )
  .superRefine((request, context) => {
    if (request.status !== undefined && request.expectedSessionVersion === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedSessionVersion'],
        message: 'expectedSessionVersion is required when changing account status',
      });
    }
  });
export type UpdateAccountRequest = z.infer<typeof UpdateAccountRequestSchema>;

export const UpdateAccountResponseSchema = z.object({ data: AccountSchema }).strict();
export type UpdateAccountResponse = z.infer<typeof UpdateAccountResponseSchema>;

export const ResetPasswordRequestSchema = z
  .object({
    newPassword: z.string().min(6).max(256),
    expectedSessionVersion: z.number().int().nonnegative(),
    revokeSessions: z.literal(true).default(true),
  })
  .strict();
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const ResetPasswordResponseSchema = z
  .object({
    data: z
      .object({
        accountId: EntityIdSchema,
        sessionsRevoked: z.number().int().nonnegative(),
        sessionVersion: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponseSchema>;

export const ListAccountsQuerySchema = PaginationQuerySchema.extend({
  role: AccountRoleSchema.optional(),
  status: AccountStatusSchema.optional(),
  storeId: EntityIdSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
}).strict();
export type ListAccountsQuery = z.infer<typeof ListAccountsQuerySchema>;

export const ListAccountsResponseSchema = z
  .object({
    data: z.array(AccountSchema),
    pagination: PaginationMetaSchema,
  })
  .strict();
export type ListAccountsResponse = z.infer<typeof ListAccountsResponseSchema>;

export const AccountParamsSchema = z.object({ accountId: EntityIdSchema }).strict();
export type AccountParams = z.infer<typeof AccountParamsSchema>;
