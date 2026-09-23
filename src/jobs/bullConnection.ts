import {Redis} from "ioredis";

export const bullConnection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});
