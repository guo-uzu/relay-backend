import { describe, it, expect } from "vitest";

import request, { type Response } from "supertest";

import { randomUUID } from "node:crypto";
import type TestAgent from "supertest/lib/agent.js";

const API = "http://localhost:3000";
const AUTH = "/api/v1/auth";
const SHEETS = "/api/v1/google-sheets";

let client: TestAgent, response: Response, org: Response;
describe("Better Auth", () => {
  it("Should Register, sign in and get session", async () => {
    const email = `test-${randomUUID()}@example.com`;
    const password = "test1234";
    await request(API)
      .post(`${AUTH}/sign-up/email`)
      .send({
        name: "User Test",
        email,
        password,
      })
      .expect(200);
    client = request.agent(API);
    await client
      .post(`${AUTH}/sign-in/email`)
      .send({ email, password })
      .expect(200);
    response = await client.get(`${AUTH}/get-session`).expect(200);
    expect(response.body.user.email).toBe(email);
  });

  it("Should generate an org", async () => {
    const organization = "My Org";
    const slug = `my-org-${randomUUID()}`;
    org = await client
      .post(`${AUTH}/organization/create`)
      .set({ Origin: "http://localhost:3000" })
      .send({ name: organization, slug, userId: response.body.user.id })
      .expect(200);
  });
});

describe("Sheet operations", { timeout: 15_000 }, () => {
  const id = "1OoY4QG2mes59WaXaoOJqFgE67DS2ZFBV2PTRuICFx5w";
  let connectionId: string;

  it("Should put an id", async () => {
    const name = "Registro de Peticiones (Interno)";
    const res = await client
      .post(`${SHEETS}/${org.body.id}/set-sheet-id`)
      .send({ sheetId: id, nameSheet: name })
      .expect(201);
    connectionId = res.body.data.connectionId;
  });

  it("Should return the same connection when registered twice", async () => {
    const res = await client
      .post(`${SHEETS}/${org.body.id}/set-sheet-id`)
      .send({ sheetId: id, nameSheet: "Registro de Peticiones (Interno)" })
      .expect(200);
    expect(res.body.data.connectionId).toBe(connectionId);
  });

  it("Should import the sheet into the database", async () => {
    await client
      .post(`${SHEETS}/${org.body.id}/import-sheet`)
      .send({ connectionId })
      .expect(200);
  });
});
