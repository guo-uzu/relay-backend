import express, { type Router, type Request, type Response } from "express";
import { ImportSheetBody, SetSheetId, AppendRowBody, SheetRowsBody, TestSheetId, HeaderConfigBody, HeaderConfigsBody } from "../lib/validations.ts";
import z from "zod";
import { db } from "../db/index.ts";
import { history, sheet } from "../db/app.schema.ts";
import { validateUserOrg, validateUserOrgRole } from "../lib/validate.user.org.ts";
import type { User } from "better-auth";
import { eq, and, sql, type SQL } from "drizzle-orm";
import { appendTabRow, getTabRows, getTabs } from "../services/googleSheets.service.ts";
import { parseSheetRows, SheetImportError, type SheetRow } from "../lib/sheetImport.ts";
const routerSheets: Router = express.Router();
const ORGANIZATION_ROLES = ["admin", "owner"];

const FOLD_FROM = "áàäâãåéèëêíìïîóòöôõúùüûñç";
const FOLD_TO = "aaaaaaeeeeiiiiooooouuuunc";
const foldSql = (value: SQL) =>
  sql`translate(lower(${value}), ${FOLD_FROM}, ${FOLD_TO})`;
const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
const containsPattern = (value: string) =>
  sql`'%' || ${foldSql(sql`${escapeLike(value)}`)} || '%'`;
const startsWithPattern = (value: string) =>
  sql`${foldSql(sql`${escapeLike(value)}`)} || '%'`;

/*
  @param :id is the id of the organization
*/

routerSheets.post("/:id/test-sheet", async (req: Request, res: Response) => {
  const result = TestSheetId.safeParse(req.body);
  const organizationId = req.params.id as string;

  if (!result.success) {
    return res.status(400).json({
      message: "Incomplete data sended",
      code: "BAD REQUEST"
    });
  }

  const user = res.locals.user as User;

  if (!(await validateUserOrgRole(organizationId, user.id, ORGANIZATION_ROLES)))
    return res.status(403).json({ message: "Forbidden", code: "FORBIDDEN" });

  try {
    await getTabs(result.data.sheetId);
    return res.json({ message: "Sheet is accessible", data: true });
  } catch {
    return res.json({ message: "Sheet is not accessible", data: false, code: "BAD REQUEST" });
  }
});

routerSheets.post("/:id/set-sheet-id", async (req: Request, res: Response) => {
  const result = SetSheetId.safeParse(req.body);
  const organizationId = req.params.id as string;

  if (!result.success) {
    return res.status(400).json({
      message: "Incomplete data sended",
      error: z.flattenError(result.error).fieldErrors,
    });
  }

  const user = res.locals.user as User;

  if (!(await validateUserOrgRole(organizationId, user.id, ORGANIZATION_ROLES)))
    return res.status(403).json({ message: "Forbidden" });
  const spreadsheetId = result.data.sheetId;
  const spreadsheetName = result.data.nameSheet;
  try {
    const tab = (await getTabs(spreadsheetId)).find(
      (t) => t.title === spreadsheetName,
    );
    if (!tab) {
      return res.status(404).json({ message: "Tab not found in spreadsheet" });
    }

    const [existing] = await db
      .select({ id: sheet.id })
      .from(sheet)
      .where(
        and(
          eq(sheet.organizationId, organizationId),
          eq(sheet.sheetId, spreadsheetId),
          eq(sheet.googleTabId, tab.id),
        ),
      )
      .limit(1);

    if (existing) {
      return res.status(200).json({
        message: "Sheet already registered",
        data: { connectionId: existing.id, spreadsheetId },
      });
    }

    // shortcut: check-then-insert can race and register twice; add a unique (organization_id, sheet_id, google_tab_id) index to close it
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(sheet)
        .values({
          sheetId: spreadsheetId,
          googleTabId: tab.id,
          nameSheet: tab.title,
          organizationId: organizationId,
          userId: user.id,
        })
        .returning({ id: sheet.id });

      await tx.insert(history).values({
        organizationId,
        userId: user.id,
        sheetId: row!.id,
        eventType: "conectado",
        actorName: user.name,
        actorEmail: user.email,
        source: "relay",
        action: `Conectó la pestaña "${tab.title}"`,
      });

      return row!;
    });

    return res.status(201).json({
      message: "id added",
      data: { connectionId: created.id, spreadsheetId },
    });
  } catch (error) {
    console.error(error);
    return res.status(406).json({ message: "Error uploading the data" });
  }
});

routerSheets.get("/:id/sheets", async (req: Request, res: Response) => {
  const organizationId = req.params.id as string;
  const user = res.locals.user as User;

  if (
    !(await validateUserOrg(organizationId, user.id))
  ) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const sheets = await db
      .select({
        id: sheet.id,
        name: sheet.nameSheet,
        rowCount: sheet.rowCount,
        importedAt: sheet.importedAt,
      })
      .from(sheet)
      .where(eq(sheet.organizationId, organizationId));

    return res.status(200).json(sheets);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error fetching sheets" });
  }
});

routerSheets.post("/:id/sheets/:sheetId/rows", async (req: Request, res: Response) => {
  const result = SheetRowsBody.safeParse(req.body);
  const organizationId = req.params.id as string;
  const sheetId = req.params.sheetId as string;
  const user = res.locals.user as User;

  if (!result.success) {
    return res.status(400).json({
      message: "Invalid request body",
      code: "SHEET_ROWS_INVALID_REQUEST",
    });
  }

  if (!(await validateUserOrg(organizationId, user.id))) {
    return res.status(403).json({ message: "Forbidden", code: "FORBIDDEN" });
  }

  try {
    const [connection] = await db
      .select({ name: sheet.nameSheet, headers: sheet.headers })
      .from(sheet)
      .where(
        and(eq(sheet.id, sheetId), eq(sheet.organizationId, organizationId)),
      )
      .limit(1);

    if (!connection) {
      return res.status(404).json({
        message: "Sheet connection not found",
        code: "SHEET_NOT_FOUND",
      });
    }

    const headers = connection.headers ?? [];
    const names = headers.map((h) => h.name);
    const cellValue = (index: number) =>
      sql`coalesce(elem->'cells' ->> ${index}::int, '')`;

    const termConditions = result.data.terms
      .map((term) => term.trim())
      .filter(Boolean)
      .map(
        (term) => sql`exists (
          select 1
          from jsonb_array_elements_text(coalesce(elem->'cells', '[]'::jsonb)) as term_cell
          where ${foldSql(sql`term_cell`)} like ${containsPattern(term)}
        )`,
      );

    const filterConditions = result.data.filters.flatMap((filter): SQL[] => {
      const index = names.indexOf(filter.column);
      if (index === -1) return [];
      if (filter.op !== "isEmpty" && !filter.value.trim()) return [];

      const value = cellValue(index);
      switch (filter.op) {
        case "contains":
          return [
            sql`${foldSql(value)} like ${containsPattern(filter.value)}`,
          ];
        case "equals":
          return [sql`${foldSql(value)} = ${foldSql(sql`${filter.value}`)}`];
        case "startsWith":
          return [
            sql`${foldSql(value)} like ${startsWithPattern(filter.value)}`,
          ];
        case "isEmpty":
          return [sql`btrim(${value}) = ''`];
        case "gt":
          return [sql`case
            when ${value} ~ '^-?[0-9]+([.][0-9]+)?$'
              and ${filter.value} ~ '^-?[0-9]+([.][0-9]+)?$'
            then ${value}::numeric > ${filter.value}::numeric
            else ${value} > ${filter.value}
          end`];
        case "lt":
          return [sql`case
            when ${value} ~ '^-?[0-9]+([.][0-9]+)?$'
              and ${filter.value} ~ '^-?[0-9]+([.][0-9]+)?$'
            then ${value}::numeric < ${filter.value}::numeric
            else ${value} < ${filter.value}
          end`];
        default:
          return [];
      }
    });

    const conditions: SQL[] = [];
    if (termConditions.length) {
      conditions.push(
        sql`(${sql.join(
          termConditions,
          result.data.mode === "and" ? sql` and ` : sql` or `,
        )})`,
      );
    }
    if (filterConditions.length) {
      conditions.push(
        sql`(${sql.join(
          filterConditions,
          result.data.fmode === "and" ? sql` and ` : sql` or `,
        )})`,
      );
    }
    const where = conditions.length
      ? sql.join(conditions, sql` and `)
      : sql`true`;

    const sortIndex = result.data.sort
      ? names.indexOf(result.data.sort)
      : -1;
    const sortKey =
      sortIndex < 0
        ? sql`(elem->>'n')::int`
        : sql`coalesce(elem->'cells' ->> ${sortIndex}::int, '')`;
    const direction = sql.raw(
      sortIndex < 0 ? "asc" : result.data.dir,
    );
    const { page, size } = result.data;
    const offset = (page - 1) * size;

    const [rowsPage] = await db
      .select({
        total: sql<number>`(
          select count(*)::int
          from jsonb_array_elements(${sheet.values}) as elem
          where ${where}
        )`,
        rows: sql<SheetRow[]>`coalesce((
          select jsonb_agg(jsonb_build_object('n', paged.n, 'cells', paged.cells) order by paged.sort_key ${direction}, paged.n)
          from (
            select
              (elem->>'n')::int as n,
              elem->'cells' as cells,
              ${sortKey} as sort_key
            from jsonb_array_elements(${sheet.values}) as elem
            where ${where}
            order by sort_key ${direction}, n
            limit ${size} offset ${offset}
          ) as paged
        ), '[]'::jsonb)`,
      })
      .from(sheet)
      .where(
        and(eq(sheet.id, sheetId), eq(sheet.organizationId, organizationId)),
      )
      .limit(1);

    if (!rowsPage) {
      return res.status(404).json({
        message: "Sheet connection not found",
        code: "SHEET_NOT_FOUND",
      });
    }

    return res.status(200).json({
      headers,
      rows: rowsPage.rows,
      total: rowsPage.total,
      sheetName: connection.name,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error fetching sheet rows",
      code: "SHEET_ROWS_FETCH_FAILED",
    });
  }
});

routerSheets.patch("/:id/sheets/:sheetId/headers", async (req: Request, res: Response) => {
  const result = HeaderConfigBody.safeParse(req.body);
  const organizationId = req.params.id as string;
  const sheetId = req.params.sheetId as string;
  const user = res.locals.user as User;

  if (!result.success) {
    return res.status(400).json({
      message: "Invalid request body",
      code: "SHEET_HEADERS_INVALID_REQUEST",
    });
  }

  if (!(await validateUserOrgRole(organizationId, user.id, ORGANIZATION_ROLES))) {
    return res.status(403).json({ message: "Forbidden", code: "FORBIDDEN" });
  }

  try {
    const [connection] = await db
      .select({ headers: sheet.headers })
      .from(sheet)
      .where(
        and(eq(sheet.id, sheetId), eq(sheet.organizationId, organizationId)),
      )
      .limit(1);

    if (!connection) {
      return res.status(404).json({
        message: "Sheet connection not found",
        code: "SHEET_NOT_FOUND",
      });
    }

    const headers = connection.headers ?? [];
    const index = headers.findIndex((h) => h.name === result.data.name);
    if (index === -1) {
      return res.status(400).json({
        message: "Header not found in sheet",
        code: "SHEET_HEADER_NOT_FOUND",
      });
    }
    if (headers[index]!.obligatory === result.data.obligatory) {
      return res.status(200).json({ message: "No changes" });
    }

    // single UPDATE with jsonb_set: no read-modify-write of the whole array
    await db
      .update(sheet)
      .set({
        headers: sql`jsonb_set(${sheet.headers}, ${`{${index},obligatory}`}::text[], ${JSON.stringify(result.data.obligatory)}::jsonb)`,
      })
      .where(
        and(eq(sheet.id, sheetId), eq(sheet.organizationId, organizationId)),
      );

    return res.status(200).json({ message: "Header updated" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error updating header",
      code: "SHEET_HEADERS_UPDATE_FAILED",
    });
  }
});

routerSheets.get("/:id/sheets/:sheetId/headers", async (req: Request, res: Response) => {
  const organizationId = req.params.id as string;
  const sheetId = req.params.sheetId as string;
  const user = res.locals.user as User;

  if (!(await validateUserOrg(organizationId, user.id))) {
    return res.status(403).json({ message: "Forbidden", code: "FORBIDDEN" });
  }

  try {
    console.log(sheetId)
    console.log(organizationId)
    const [connection] = await db
      .select({ headers: sheet.headers })
      .from(sheet)
      .where(and(eq(sheet.id, sheetId), eq(sheet.organizationId, organizationId)))
      .limit(1);

    if (!connection) {
      return res.status(404).json({
        message: "Sheet connection not found",
        code: "SHEET_NOT_FOUND",
      });
    }

    return res.status(200).json(connection.headers ?? []);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error fetching headers",
      code: "SHEET_HEADERS_FETCH_FAILED",
    });
  }
});

routerSheets.post("/:id/sheets/:sheetId/headers", async (req: Request, res: Response) => {
  const result = HeaderConfigsBody.safeParse(req.body.headers);
  console.log(req.body.headers)
  const organizationId = req.params.id as string;
  const sheetId = req.params.sheetId as string;
  const user = res.locals.user as User;

  if (!result.success) {
    return res.status(400).json({
      message: "Invalid request body",
      code: "SHEET_HEADERS_INVALID_REQUEST",
    });
  }

  if (!(await validateUserOrgRole(organizationId, user.id, ORGANIZATION_ROLES))) {
    return res.status(403).json({ message: "Forbidden", code: "FORBIDDEN" });
  }

  try {
    const [connection] = await db
      .select({ headers: sheet.headers })
      .from(sheet)
      .where(and(eq(sheet.id, sheetId), eq(sheet.organizationId, organizationId)))
      .limit(1);

    if (!connection) {
      return res.status(404).json({
        message: "Sheet connection not found",
        code: "SHEET_NOT_FOUND",
      });
    }

    // headers map by position to the cells of each row: names and order must stay the sheet's columns
    const current = connection.headers ?? [];
    const sameColumns =
      result.data.length === current.length &&
      result.data.every((h, i) => h.name === current[i]!.name);
    if (!sameColumns) {
      return res.status(400).json({
        message: "Headers do not match the sheet columns",
        code: "SHEET_HEADERS_MISMATCH",
      });
    }

    // ponytail: read-then-write, so an import running between the check and this update can leave stale names. Guard with a conditional UPDATE if imports run concurrently.
    await db
      .update(sheet)
      .set({ headers: result.data })
      .where(and(eq(sheet.id, sheetId), eq(sheet.organizationId, organizationId)));

    return res.status(200).json({ message: "Headers updated" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error updating headers",
      code: "SHEET_HEADERS_UPDATE_FAILED",
    });
  }
});

routerSheets.post(
  "/:id/sheets/:sheetId/rows/append",
  async (req: Request, res: Response) => {
    const result = AppendRowBody.safeParse(req.body);
    const organizationId = req.params.id as string;
    const sheetId = req.params.sheetId as string;
    const user = res.locals.user as User;

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid request body",
        code: "SHEET_APPEND_INVALID_REQUEST",
      });
    }

    if (!(await validateUserOrg(organizationId, user.id))) {
      return res.status(403).json({ message: "Forbidden", code: "FORBIDDEN" });
    }

    try {
      const [connection] = await db
        .select({
          id: sheet.id,
          sheetId: sheet.sheetId,
          googleTabId: sheet.googleTabId,
          headers: sheet.headers,
        })
        .from(sheet)
        .where(
          and(eq(sheet.id, sheetId), eq(sheet.organizationId, organizationId)),
        )
        .limit(1);

      if (!connection) {
        return res.status(404).json({
          message: "Sheet connection not found",
          code: "SHEET_NOT_FOUND",
        });
      }
      if (connection.googleTabId === null) {
        return res.status(409).json({
          message: "Connection has no tab id, register the sheet again",
          code: "SHEET_TAB_NOT_REGISTERED",
        });
      }

      const headers = connection.headers ?? [];
      const idIndex = headers.findIndex((h) => h.name === "_id");
      if (idIndex === -1) {
        return res.status(409).json({
          message: "Import the sheet before adding rows",
          code: "SHEET_NOT_IMPORTED",
        });
      }

      const rawCells = result.data.cells;
      const cells = headers.map((_, index) =>
        Array.isArray(rawCells)
          ? (rawCells[index] ?? "")
          : (rawCells[String(index)] ?? ""),
      );
      if (!cells.some((cell) => cell.trim())) {
        return res.status(400).json({
          message: "Row is empty",
          code: "SHEET_ROW_EMPTY",
        });
      }
      // after the empty check so the uuid alone never makes a row non-empty; overwrites any client-sent _id
      cells[idIndex] = crypto.randomUUID();

      const tab = (await getTabs(connection.sheetId)).find(
        (t) => t.id === connection.googleTabId,
      );
      if (!tab) {
        return res.status(404).json({
          message: "Tab not found in spreadsheet",
          code: "SHEET_TAB_NOT_FOUND",
        });
      }

      try {
        await appendTabRow(connection.sheetId, tab.title, cells);
      } catch (error) {
        console.error(error);
        return res.status(502).json({
          message: "Error writing to Google Sheets",
          code: "SHEET_APPEND_FAILED",
        });
      }

      try {
        const updated = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(sheet)
            .set({
              values: sql`coalesce(${sheet.values}, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                'n',
                (
                  select coalesce(max((entry->>'n')::int), 0) + 1
                  from jsonb_array_elements(coalesce(${sheet.values}, '[]'::jsonb)) as entry
                ),
                'cells',
                ${JSON.stringify(cells)}::jsonb
              ))`,
              rowCount: sql`${sheet.rowCount} + 1`,
            })
            .where(
              and(eq(sheet.id, sheetId), eq(sheet.organizationId, organizationId)),
            )
            .returning({
              n: sql<number>`(${sheet.values}->-1->>'n')::int`,
            });

          if (!row) return null;

          await tx.insert(history).values({
            organizationId,
            userId: user.id,
            sheetId: connection.id,
            eventType: "agregado",
            actorName: user.name,
            actorEmail: user.email,
            rowNumber: row.n,
            newValue: cells.filter(Boolean).join(" · "),
            source: "relay",
            action: `Agregó una fila a la pestaña "${tab.title}"`,
            rawPayload: { cells },
          });

          return row;
        });

        if (!updated) {
          return res.status(404).json({
            message: "Sheet connection not found",
            code: "SHEET_NOT_FOUND",
          });
        }

        return res.status(201).json({
          message: "Row added",
          data: { n: updated.n, cells },
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({
          message:
            "Row was written to Google Sheets but could not be saved locally",
          code: "SHEET_APPEND_SAVE_FAILED",
        });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Error adding the row",
        code: "SHEET_APPEND_FAILED",
      });
    }
  },
);

routerSheets.post("/:id/import-sheet", async (req: Request, res: Response) => {
  const result = ImportSheetBody.safeParse(req.body);
  const organizationId = req.params.id as string;
  const user = res.locals.user as User;

  if (!result.success) {
    return res.status(400).json({
      message: "Incomplete data sended",
      code: "SHEET_IMPORT_INVALID_REQUEST",
    });
  }

  if (
    !(await validateUserOrgRole(organizationId, user.id, ORGANIZATION_ROLES))
  ) {
    return res.status(403).json({
      message: "Forbidden",
      code: "FORBIDDEN",
    });
  }

  try {
    const [connection] = await db
      .select({
        id: sheet.id,
        sheetId: sheet.sheetId,
        googleTabId: sheet.googleTabId,
        headers: sheet.headers,
      })
      .from(sheet)
      .where(
        and(
          eq(sheet.id, result.data.connectionId),
          eq(sheet.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!connection) {
      return res.status(404).json({
        message: "Sheet connection not found",
        code: "SHEET_CONNECTION_NOT_FOUND",
      });
    }
    if (connection.googleTabId === null) {
      return res
        .status(409)
        .json({
          message: "Connection has no tab id, register the sheet again",
          code: "SHEET_TAB_NOT_REGISTERED",
        });
    }

    const tab = (await getTabs(connection.sheetId)).find(
      (t) => t.id === connection.googleTabId,
    );
    if (!tab) {
      return res.status(404).json({
        message: "Tab not found in spreadsheet",
        code: "SHEET_TAB_NOT_FOUND",
      });
    }

    const { headers: names, values } = parseSheetRows(
      await getTabRows(connection.sheetId, tab.title),
    );
    const previous = new Map(connection.headers?.map((h) => [h.name, h.obligatory]));
    const headers = names.map((name) => ({ name, obligatory: previous.get(name) ?? true }));

    // one UPDATE is atomic: any earlier failure leaves the previous snapshot untouched
    const importedAt = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(sheet)
        .set({ nameSheet: tab.title, headers, values, importedAt, rowCount: values.length })
        .where(eq(sheet.id, connection.id));

      await tx.insert(history).values({
        organizationId,
        userId: user.id,
        sheetId: connection.id,
        eventType: "importado",
        actorName: user.name,
        actorEmail: user.email,
        source: "relay",
        action: `Importó ${values.length} filas de la pestaña "${tab.title}"`,
        rawPayload: { rows: values.length },
      });
    });

    return res.status(200).json({
      message: "Sheet imported",
      data: { rows: values.length, importedAt },
    });
  } catch (error) {
    if (error instanceof SheetImportError) {
      return res
        .status(422)
        .json({ message: error.message, code: "INVALID_SHEET_DATA" });
    }
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error importing sheet", code: "SHEET_IMPORT_FAILED" });
  }
});

export { routerSheets };
