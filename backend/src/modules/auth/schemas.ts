import { z } from '../../lib/openapi.js';

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const EMAIL_MAX_LENGTH = 254;

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Adresse e-mail invalide')
  .max(EMAIL_MAX_LENGTH)
  .openapi({ example: 'alex.martin@example.com' });

/** EF-AUT-01, EF-AUT-02: account creation. */
export const RegisterBodySchema = z
  .object({
    email: EmailSchema,
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères`)
      .max(PASSWORD_MAX_LENGTH, `Le mot de passe doit contenir au plus ${PASSWORD_MAX_LENGTH} caractères`)
      .openapi({ example: 'une phrase de passe longue' }),
  })
  .strict()
  .openapi('RegisterBody');

/** EF-AUT-03: the length rule is not repeated here, to reveal nothing about the policy on login. */
export const LoginBodySchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  })
  .strict()
  .openapi('LoginBody');

export const AccountSchema = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    email: z.string().openapi({ example: 'alex.martin@example.com' }),
  })
  .openapi('Account');

export type Credentials = z.infer<typeof LoginBodySchema>;
export type Account = z.infer<typeof AccountSchema>;

/** EF-AUT-11: the password again, to delete the account. */
export const DeleteAccountBodySchema = z
  .object({ password: z.string().min(1).max(PASSWORD_MAX_LENGTH) })
  .strict()
  .openapi('DeleteAccountBody');

// Base64url of 32 random bytes (`token.ts`) is 43 characters; a generous bound keeps an abusive body cheap to reject.
const ACTIVATION_CODE_MAX_LENGTH = 100;

/** EF-AUT-14: the single-use code (or link token) of the activation e-mail. */
export const ActivateBodySchema = z
  .object({ code: z.string().min(1).max(ACTIVATION_CODE_MAX_LENGTH) })
  .strict()
  .openapi('ActivateBody');

/** EF-AUT-15: a new activation e-mail, by address only — the answer never says whether it exists (RG). */
export const ResendActivationBodySchema = z
  .object({ email: EmailSchema })
  .strict()
  .openapi('ResendActivationBody');
