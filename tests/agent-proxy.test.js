import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { runAgent, clearAgentMessages } from "../src/controllers/agent.controllers.js";
import { AgentChat } from "../src/models/agentchat.models.js";
import { AgentChatMessage } from "../src/models/agentchatmessage.models.js";

function callController(fn, req, res = {}) {
  return new Promise((resolve, reject) => {
    fn(req, res, (err) => {
      if (err) return reject(err);
      resolve({ req, res });
    });
  });
}

describe("Agent Controller Unit Tests", () => {
  let mockChat;

  beforeEach(() => {
    mockChat = {
      _id: "chat-123",
      user: "user-123",
      workingMemory: {
        lastProject: { id: "proj-prev", name: "Previous Project" },
        lastTask: null,
        updatedAt: new Date(),
      },
      save: async function () {
        return this;
      },
    };

    AgentChat.findOneAndUpdate = async () => mockChat;
    AgentChat.findOne = async () => mockChat;

    AgentChatMessage.find = () => ({
      sort: () => ({
        limit: () => ({
          select: async () => [],
        }),
      }),
    });

    AgentChatMessage.create = async (doc) => ({ _id: "msg-123", ...doc });
    AgentChatMessage.deleteMany = async () => ({ deletedCount: 1 });
  });

  it("should pass ApiError 400 to next when query is empty or missing", async () => {
    const req = {
      user: { _id: "user-123" },
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
      user: { _id: "user-123" },
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
      user: { _id: "user-123" },
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

  it("should forward working_memory to FastAPI and merge working_memory_patch", async () => {
    const req = {
      user: { _id: "user-123" },
      body: { query: "Create a task in it named syntax" },
      header: (name) => (name === "Authorization" ? "Bearer valid-token" : undefined),
    };

    let responseStatus = null;
    let responseJson = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.match(url, /\/agent\/run$/);
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer valid-token");

      const body = JSON.parse(options.body);
      assert.equal(body.query, "Create a task in it named syntax");
      assert.deepEqual(body.working_memory, {
        last_project: { id: "proj-prev", name: "Previous Project" },
        last_task: null,
      });

      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          answer: "Task syntax created in project Previous Project.",
          messages: [{ role: "assistant", content: "..." }],
          working_memory_patch: {
            last_task: {
              id: "task-999",
              title: "syntax",
              project_id: "proj-prev",
            },
          },
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
      assert.match(responseJson.data.answer, /Task syntax created/);

      // Verify that the patch was merged into mockChat
      assert.equal(mockChat.workingMemory.lastTask.id, "task-999");
      assert.equal(mockChat.workingMemory.lastTask.title, "syntax");
      assert.equal(mockChat.workingMemory.lastProject.id, "proj-prev");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should clear working memory on clearAgentMessages", async () => {
    const req = {
      user: { _id: "user-123" },
    };

    let responseStatus = null;
    let responseJson = null;

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
      clearAgentMessages(req, res, reject);
    });

    assert.equal(responseStatus, 200);
    assert.deepEqual(responseJson.data.messages, []);
    assert.equal(mockChat.workingMemory.lastProject, null);
    assert.equal(mockChat.workingMemory.lastTask, null);
  });

  it("should forward downstream 4xx status and detail from FastAPI", async () => {
    const req = {
      user: { _id: "user-123" },
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
