import { prisma } from "@/lib/prisma";

export type ContractEventType =
  | "CREATED"
  | "INVITED"
  | "VIEWED"
  | "SIGNED"
  | "COMPLETED"
  | "CANCELED"
  | "REMINDED"
  | "EXPIRED";

export async function logContractEvent(
  contractId: string,
  type: ContractEventType,
  actor?: string,
  detail?: string
) {
  try {
    await prisma.contractEvent.create({
      data: { contractId, type, actor, detail },
    });
  } catch (err) {
    console.error("Failed to log contract event:", err);
  }
}
