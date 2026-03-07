import { z } from "zod";

export const JobStatusResponseSchema = z.object({
  status: z.enum(["CREATED", "COMPLETED", "EXPIRED", "CANCELED"]),
  expiresAt: z.string(),
  completedAt: z.string().nullable().optional(),
  outputVersionId: z.string().nullable().optional(),
  signedDownloadUrl: z.string().nullable().optional(),
});

export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;

export const CreateJobResponseSchema = z.object({
  jobId: z.string(),
  deepLink: z.string(),
  placement: z.object({
    page: z.union([z.literal("LAST"), z.number()]),
    rectPct: z.object({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    }),
  }),
  documentId: z.string(),
  expiresAt: z.string(),
});

export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>;
