import { Queue } from "bullmq";
import { bullConnection } from "./bullConnection.ts";

const SheetQueue = new Queue("polling-sheet", { connection: bullConnection })

export { SheetQueue }
