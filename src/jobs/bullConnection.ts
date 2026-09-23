import IORedis from "ioredis";

export const bullConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});
