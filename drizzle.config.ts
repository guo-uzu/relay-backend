import { defineConfig } from "drizzle-kit"
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/db/schema.ts", "./src/db/app.schema.ts"],
  out: "./drizzle",
  dbCredentials: {url: process.env.DATABASE_URL!}
})
