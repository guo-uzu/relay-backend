import { describe, it, expect } from "vitest";

import request, { type Response } from "supertest";

import { randomUUID } from "node:crypto";
import type TestAgent from "supertest/lib/agent.js";

const API = "http://localhost:3000";
const AUTH = "/api/v1/auth";

describe("Better Auth", () => {
  let client: TestAgent;
  let response: Response
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

  it("Should generate an org and put an id", async () => {
    const organization = "My Org";
    const slug = `my-org-${randomUUID()}`;  
    const org = await client
      .post(`${AUTH}/organization/create`)
      .set({ "Origin":"http://localhost:3000"})
      .send({ name: organization, slug, userId: response.body.user.id })
      .expect(200)
    console.log(org)
  });
});
