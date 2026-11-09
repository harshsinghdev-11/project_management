import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

/**
 * Controller to proxy agent requests from Node.js to the internal FastAPI agent service.
 *
 * Flow:
 * 1. User authenticated via verifyJWT middleware.
 * 2. User's access token is forwarded in Authorization: Bearer <token>.
 * 3. Calls FastAPI POST /agent/run.
 * 4. Tools in Python agent invoke Node APIs using the forwarded JWT.
 * 5. Returns final answer encapsulated in an ApiResponse envelope.
 */
const runAgent = asyncHandler(async (req, res) => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) {
    throw new ApiError(400, "Query is required");
  }

  // Extract the user's access token from the same sources as verifyJWT
  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace(/^Bearer\s+/i, "")?.trim();

  if (!token) {
    throw new ApiError(401, "Unauthorized: Access token missing");
  }

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
      body: JSON.stringify({ query }),
      // Generous 120s timeout for LLM inference and multi-step tool calls
      signal: AbortSignal.timeout(120000),
    });
  } catch (error) {
    if (error.name === "TimeoutError") {
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
    const errorMessage =
      data?.detail || data?.message || `Agent service error (HTTP ${response.status})`;
    const statusCode =
      response.status >= 400 && response.status < 500 ? response.status : 502;
    throw new ApiError(statusCode, errorMessage);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        answer: data?.answer || "",
        messages: data?.messages || [],
      },
      "Agent completed successfully",
    ),
  );
});

export { runAgent };

