import express, { type Express, type Request, type Response } from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.ts";
import { routerSheets } from "./routes/routes.sheet.ts";
import { requireAuth } from "./middlewares/auth.session.ts";
import { pinoHttp } from "pino-http";
import { logger } from "./utils/logger.ts";

if (process.env.RUN_WORKER === "true") {
  await import("./jobs/workerQueue.ts");
}

const app: Express = express();

app.use(pinoHttp({ logger }));
// auth
app.all("/api/v1/auth/{*any}", toNodeHandler(auth));
app.use(express.json());

app.use("/api/v1/google-sheets", requireAuth, routerSheets)

app.listen(3000);
