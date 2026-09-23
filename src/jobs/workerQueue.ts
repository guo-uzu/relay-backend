import { Worker } from "bullmq";
import { bullConnection } from "./bullConnection.ts";

const worker = new Worker("polling-sheet", async job => {
  console.log(job.name, job.data)
}, { connection: bullConnection })
