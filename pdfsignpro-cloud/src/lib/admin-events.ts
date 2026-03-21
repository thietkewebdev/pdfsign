import { prisma } from "@/lib/prisma";

type JsonLike = Record<string, unknown> | null | undefined;

export async function recordAdminAuditLog(input: {
  actorUserId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  detail?: string | null;
  metadata?: JsonLike;
}) {
  return prisma.adminAuditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      detail: input.detail ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

export async function recordAdminAnalyticsEvent(input: {
  eventType: string;
  path?: string | null;
  method?: string | null;
  actorUserId?: string | null;
  subjectUserId?: string | null;
  metadata?: JsonLike;
}) {
  return prisma.adminAnalyticsEvent.create({
    data: {
      eventType: input.eventType,
      path: input.path ?? null,
      method: input.method ?? null,
      actorUserId: input.actorUserId ?? null,
      subjectUserId: input.subjectUserId ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

export async function recordSigningErrorEvent(input: {
  errorCode: string;
  path: string;
  method: string;
  metadata?: JsonLike;
}) {
  return recordAdminAnalyticsEvent({
    eventType: `signing.error.${input.errorCode}`,
    path: input.path,
    method: input.method,
    metadata: input.metadata,
  });
}
