import { Worker } from "bullmq";
import { bullConnection } from "./bullConnection.ts";

const worker = new Worker(
  "polling-sheet",
  async (job) => {
    if (job.name !== "Polling") return;
    const response = await fetch(job.data.url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.API_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    console.log("Endpoint response:", data);

    return data;
  },
  { connection: bullConnection },
);
