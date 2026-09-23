import { createClient } from "redis";

const clientRedis = createClient()
clientRedis.on("error", err => console.log("Redis Client Error"))

await clientRedis.connect()

export { clientRedis }
