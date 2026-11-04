import type { WebhookEvent } from "./validations.ts";

type Connection = {
  id: string;
  organizationId: string;
};

// Pure mapping so the payload contract can be tested without DB or network.
export function toHistoryRow(event: WebhookEvent, connection: Connection) {
  return {
    // the org always comes from the resolved connection, never from the payload
    organizationId: connection.organizationId,
    sheetId: connection.id,
    eventType: event.type,
    actorName: event.actorName ?? null,
    actorEmail: event.actorEmail ?? null,
    rowNumber: event.rowNumber ?? null,
    columnIndex: event.columnIndex ?? null,
    columnName: event.columnName ?? null,
    oldValue: event.oldValue ?? null,
    newValue: event.newValue ?? null,
    source: "google_sheets",
    occurredAt: new Date(event.occurredAt),
    externalId: event.externalId,
    rawPayload: event,
  };
}
