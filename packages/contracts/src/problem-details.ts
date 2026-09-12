import { z } from "zod";

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
