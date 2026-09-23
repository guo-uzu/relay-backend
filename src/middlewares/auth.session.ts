import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { auth } from "../lib/auth.ts";

export const requireAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session) return res.status(401).json({ message: "Unauthorized" })
  res.locals.user = session.user
  next()
}
