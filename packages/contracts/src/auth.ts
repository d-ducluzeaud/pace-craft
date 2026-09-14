import { z } from "zod";

export const signUpBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  password: z.string().min(8).max(128).meta({ writeOnly: true }),
});

export const signUpResponseSchema = z.object({
  token: z.null(),
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    image: z.string().nullable().optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),
});
