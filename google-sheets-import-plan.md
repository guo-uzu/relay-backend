# Google Sheets Import Plan

Status: Draft for review

Organizations will connect Google worksheets and manually import their contents into PostgreSQL. Each worksheet may have different headers, so one shared table will hold imported rows. Google Sheets remains the source of truth: a later import replaces that worksheet's previous database snapshot.

## Current state

The Drizzle `sheet` table already links a Google spreadsheet ID and tab name to an organization and the user who registered it. It allows multiple records per organization, but has no uniqueness constraint or table for imported rows. `polling_sheet` schedules header checks only. The existing `POST /:id/get-data` route reads a hard-coded tab and does not save the returned rows.

## Storage options

| Option | Advantage | Tradeoff |
| --- | --- | --- |
| One shared table with fixed business columns | Typed values and straightforward indexes | Cannot represent unrelated worksheet layouts without changing the schema |
| One PostgreSQL table per worksheet | Each sheet gets natural SQL columns | Dynamic schema changes, many tables, and a poor fit with static Drizzle definitions |
| One database record per cell | Arbitrary columns can be searched individually | Many records and joins for every worksheet row |
| **One shared table with one record per row** | Preserves different layouts without multiplying tables | Column-specific filtering needs additional indexes or projections later |

Use the last option. Store the ordered header list on the sheet connection and the ordered cell values on each imported row as PostgreSQL `text[]`. PostgreSQL arrays can contain SQL `NULL` elements, so a short row can be padded to exactly the header count and every empty string can become `NULL`. The Apps Script `_id` column remains part of the stored headers and values and also supplies each row's stable source key. [PostgreSQL array documentation](https://www.postgresql.org/docs/current/arrays.html)

## Data model and API

- Extend `sheet` with the numeric Google tab ID, ordered headers, and last successful import time. Enforce uniqueness on `(organization_id, sheet_id, google_tab_id)`. The same Google tab may be registered by two organizations, producing separate snapshots. A duplicate registration within one organization returns its existing connection.
- Add `sheet_row` with a foreign key to the internal `sheet.id`, source UUID, source row number, and nullable `text[]` of values. Enforce uniqueness on `(sheet_id, source_uuid)`. Rows inherit their organization through their parent sheet; all reads and writes must verify that parent belongs to the requested organization.
- Keep `POST /:id/set-sheet-id`. Require an organization admin or owner, confirm the service account can access the spreadsheet and named tab, resolve the tab's numeric ID, and return the internal sheet connection ID.
- Keep `POST /:id/get-data`, changing its body to `{ "connectionId": "..." }`. Resolve the spreadsheet and tab from that registered connection; do not accept an unregistered Google ID as the import target. Use connection IDs for the existing header and polling endpoints as well, so two tabs from one spreadsheet are unambiguous. Make the header cache tab-specific.

## Manual import behavior

1. Check that the authenticated caller is an admin or owner of the connection's organization. Read the selected tab from Google. Row 1 is always the header row; the UUID column is always named `_id`.
2. Require exactly one `_id` header and a unique, nonempty `_id` for each nonblank data row. Preserve header order. Convert `""` to `NULL`, pad shorter rows to header width, and reject rows with data beyond that width. Skip fully blank data rows.
3. Fetch and validate the complete worksheet before changing PostgreSQL. In one transaction, delete only that connection's old imported rows, insert the new rows in batches, and update headers, tab name, and import time. A failed read, invalid row, or failed insert leaves the previous snapshot intact.
4. Return the imported row count and timestamp. This endpoint is manually triggered; it does not schedule data polling.

For the expected worksheets of fewer than 10,000 rows, keep the initial import in the request path. Read in bounded row ranges and handle Google rate-limit responses with backoff. If import duration or concurrent usage grows, move the same import operation behind the existing BullMQ queue and return a job ID. Google recommends API responses around 2 MB and documents per-minute limits for service-account requests. [Google Sheets API limits](https://developers.google.com/workspace/sheets/api/limits)

## Later capabilities

The first release covers import only. For word search across all cells, add a text-search representation and a PostgreSQL GIN index when the search endpoint is built. [PostgreSQL text search](https://www.postgresql.org/docs/current/textsearch-controls.html)

For app edits or deletions, find the current Google row by its `_id`, write to Google first, and then refresh the database copy. The service account will need Editor access. If two organizations share a source worksheet, the other organization's snapshot stays unchanged until its next manual import.

## Verification

- Import worksheets with different header counts, interior blanks, and omitted trailing cells; verify each stored row has the header count and blanks are SQL `NULL`.
- Reject missing or duplicate `_id` values and data beyond the headers without altering the previous snapshot.
- Reimport after a source edit or deletion; verify the old snapshot is replaced rather than appended.
- Verify organization role checks, duplicate registration within one organization, separate snapshots for two organizations using the same Google tab, and two tabs in one spreadsheet.
- Verify a failed Google request or database transaction leaves the previous imported rows intact.

## Access assumption

This is a trusted internal admin workflow. A successful Google API call proves that the shared service account can access the worksheet; it does not prove that the human registering it personally has Google access. The authenticated organization admin plus that service-account access check is the connection rule for this release.
