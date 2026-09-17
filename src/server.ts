import express, { type Express, type Request, type Response } from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.ts";
import { routerAuth } from "./routes/routes.auth.ts";

const app: Express = express();

// auth
app.all("/api/v1/better-auth/auth/{*any}", toNodeHandler(auth));
app.use(express.json());

app.use("/api/v1/auth", routerAuth);

app.listen(3000);
