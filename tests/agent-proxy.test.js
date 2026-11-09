import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runAgent } from "../src/controllers/agent.controllers.js";

function callController(fn, req, res = {}) {
  return new Promise((resolve, reject) => {
    fn(req, res, (err) => {
      if (err) return reject(err);
      resolve({ req, res });
    });
  });
}

describe("Agent Controller Unit Tests", () => {
  it("should pass ApiError 400 to next when query is empty or missing", async () => {
    const req = {
      body: { query: "   " },
      header: () => "Bearer dummy-token",
    };
    const res = {};

    await assert.rejects(
      async () => {
        await callController(runAgent, req, res);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.message, "Query is required");
        return true;
      },
    );
  });

  it("should pass ApiError 401 to next when token is missing", async () => {
    const req = {
      body: { query: "List my projects" },
      header: () => undefined,
      cookies: {},
    };
    const res = {};

    await assert.rejects(
      async () => {
        await callController(runAgent, req, res);
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.match(err.message, /Access token missing/i);
        return true;
      },
    );
  });

  it("should pass 502 to next when FastAPI agent service is unreachable", async () => {
    const req = {
      body: { query: "List my projects" },
      header: (name) => (name === "Authorization" ? "Bearer valid-token" : undefined),
    };
    const res = {};

    const originalUrl = process.env.AGENT_SERVICE_URL;
    process.env.AGENT_SERVICE_URL = "http://127.0.0.1:59999";

    try {
      await assert.rejects(
        async () => {
          await callController(runAgent, req, res);
        },
        (err) => {
          assert.equal(err.statusCode, 502);
          assert.match(err.message, /Unable to reach agent service/i);
          return true;
        },
      );
    } finally {
      process.env.AGENT_SERVICE_URL = originalUrl;
    }
  });

  it("should return 200 with answer and messages when FastAPI succeeds", async () => {
    const req = {
      body: { query: "List my projects" },
      header: (name) => (name === "Authorization" ? "Bearer valid-token" : undefined),
    };

    let responseStatus = null;
    let responseJson = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.match(url, /\/agent\/run$/);
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer valid-token");
      assert.equal(options.headers["Content-Type"], "application/json");

      const body = JSON.parse(options.body);
      assert.equal(body.query, "List my projects");

      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          answer: "You have 2 projects: Marketing and Sales",
          messages: [{ role: "assistant", content: "..." }],
        }),
      };
    };

    try {
      await new Promise((resolve, reject) => {
        const res = {
          status(code) {
            responseStatus = code;
            return this;
          },
          json(payload) {
            responseJson = payload;
            resolve();
            return this;
          },
        };
        runAgent(req, res, reject);
      });

      assert.equal(responseStatus, 200);
      assert.equal(responseJson.success, true);
      assert.equal(responseJson.data.answer, "You have 2 projects: Marketing and Sales");
      assert.equal(responseJson.data.messages.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should forward downstream 4xx status and detail from FastAPI", async () => {
    const req = {
      body: { query: "List my projects" },
      header: (name) => (name === "Authorization" ? "Bearer invalid-token" : undefined),
    };
    const res = {};

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({
        ok: false,
        detail: "Authorization header must be: Bearer <accessToken>",
      }),
    });

    try {
      await assert.rejects(
        async () => {
          await callController(runAgent, req, res);
        },
        (err) => {
          assert.equal(err.statusCode, 401);
          assert.equal(err.message, "Authorization header must be: Bearer <accessToken>");
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
