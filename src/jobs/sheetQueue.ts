import { Queue } from "bullmq";
import { bullConnection } from "./bullConnection.ts";

const myQueue = new Queue("sheet-queue", { connection: bullConnection })


async function pollSheetForHeadersChanges {
  await myQueue.upsertJobScheduler(
    'repeat-every-60s',
    { every: 60000 },
    {
      name: 'poll sheet for headers',
      data: { url: 'http://localhost:3000/api/v1/google-sheets/get-titles' },
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    },
  );
}

export { myQueue }

