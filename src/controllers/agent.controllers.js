import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { AgentChat } from "../models/agentchat.models.js";
import { AgentChatMessage } from "../models/agentchatmessage.models.js";

const HISTORY_LIMIT = 20;
const MESSAGE_LIST_LIMIT = 100;
const CONTENT_MAX_CHARS = 20000;

const capContent = (text) => {
  const value = typeof text === "string" ? text.trim() : "";
  if (value.length <= CONTENT_MAX_CHARS) return value;
  return value.slice(0, CONTENT_MAX_CHARS);
};

const getOrCreateAgentChat = async (userId) => {
  return AgentChat.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    { new: true, upsert: true },
  );
};

const toPublicMessage = (doc) => ({
  _id: doc._id,
  role: doc.role,
  content: doc.content,
  createdAt: doc.createdAt,
});

/**
 * GET /api/v1/agent/messages
 * Returns the current user's Camp Agent thread, oldest first (last 100).
 */
const getAgentMessages = asyncHandler(async (req, res) => {
  const chat = await AgentChat.findOne({ user: req.user._id });
  if (!chat) {
    return res
      .status(200)
      .json(new ApiResponse(200, { messages: [] }, "Agent messages fetched"));
  }

  const recent = await AgentChatMessage.find({ chat: chat._id })
    .sort({ createdAt: -1 })
    .limit(MESSAGE_LIST_LIMIT)
    .select("role content createdAt");

  const messages = recent.reverse().map(toPublicMessage);

  return res
    .status(200)
    .json(new ApiResponse(200, { messages }, "Agent messages fetched"));
});

/**
 * DELETE /api/v1/agent/messages
 * Clears the current user's persisted Camp Agent turns and resets working memory.
 */
const clearAgentMessages = asyncHandler(async (req, res) => {
  const chat = await AgentChat.findOne({ user: req.user._id });
  if (chat) {
    await AgentChatMessage.deleteMany({ chat: chat._id });
    chat.workingMemory = {
      lastProject: null,
      lastTask: null,
      updatedAt: new Date(),
    };
    await chat.save();
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { messages: [] }, "Agent messages cleared"));
});

/**
 * POST /api/v1/agent/run
 * Persists the user turn, forwards recent history + query to FastAPI, then stores the answer.
 */
const runAgent = asyncHandler(async (req, res) => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) {
    throw new ApiError(400, "Query is required");
  }

  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace(/^Bearer\s+/i, "")?.trim();

  if (!token) {
    throw new ApiError(401, "Unauthorized: Access token missing");
  }

  const chat = await getOrCreateAgentChat(req.user._id);

  const workingMemory = {
    last_project: chat.workingMemory?.lastProject?.id
      ? {
          id: chat.workingMemory.lastProject.id,
          name: chat.workingMemory.lastProject.name || "",
        }
      : null,
    last_task: chat.workingMemory?.lastTask?.id
      ? {
          id: chat.workingMemory.lastTask.id,
          title: chat.workingMemory.lastTask.title || "",
          project_id: chat.workingMemory.lastTask.projectId || "",
        }
      : null,
  };

  const prior = await AgentChatMessage.find({ chat: chat._id })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT)
    .select("role content");

  const history = prior
    .reverse()
    .filter((turn) => turn.role === "user" || turn.role === "assistant")
    .map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));

  await AgentChatMessage.create({
    chat: chat._id,
    role: "user",
    content: capContent(query),
  });

  const agentServiceUrl = (
    process.env.AGENT_SERVICE_URL || "http://localhost:8000"
  ).replace(/\/+$/, "");

  let response;
  try {
    response = await fetch(`${agentServiceUrl}/agent/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, history, working_memory: workingMemory }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new ApiError(504, "Agent service timed out while processing request");
    }
    throw new ApiError(
      502,
      "Unable to reach agent service. Ensure the FastAPI agent is running.",
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail = data?.detail;
    const errorMessage =
      (typeof detail === "string" ? detail : null) ||
      data?.message ||
      `Agent service error (HTTP ${response.status})`;
    const statusCode =
      response.status >= 400 && response.status < 500 ? response.status : 502;
    throw new ApiError(statusCode, errorMessage);
  }

  const answer = typeof data?.answer === "string" ? data.answer : "";
  if (answer.trim()) {
    await AgentChatMessage.create({
      chat: chat._id,
      role: "assistant",
      content: capContent(answer),
    });
  }

  if (data?.working_memory_patch) {
    const patch = data.working_memory_patch;
    if (!chat.workingMemory) {
      chat.workingMemory = {};
    }
    let memoryUpdated = false;
    if (patch.last_project && patch.last_project.id) {
      chat.workingMemory.lastProject = {
        id: patch.last_project.id,
        name: patch.last_project.name || "",
      };
      memoryUpdated = true;
    }
    if (patch.last_task && patch.last_task.id) {
      chat.workingMemory.lastTask = {
        id: patch.last_task.id,
        title: patch.last_task.title || "",
        projectId: patch.last_task.project_id || "",
      };
      memoryUpdated = true;
    }
    if (memoryUpdated) {
      chat.workingMemory.updatedAt = new Date();
      await chat.save();
    }
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        answer,
        messages: data?.messages || [],
      },
      "Agent completed successfully",
    ),
  );
});

export { runAgent, getAgentMessages, clearAgentMessages };
