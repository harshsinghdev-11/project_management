import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { User } from "../models/user.models.js";
import { Conversation } from "../models/conversation.models.js";
import { ProjectMember } from "../models/projectmember.models.js";
import { ApiError } from "../utils/api-error.js";
import {
  CONNECTED_EVENT,
  DISCONNECT_EVENT,
  JOIN_CHAT_EVENT,
  LEAVE_CHAT_EVENT,
  TYPING_EVENT,
  STOP_TYPING_EVENT,
  SOCKET_ERROR_EVENT,
} from "./events.js";

/**
 * Utility helper to parse cookie string into key-value pairs
 */
const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((cookie) => {
      const [key, ...val] = cookie.trim().split("=");
      return [key, decodeURIComponent(val.join("="))];
    }),
  );
};

/**
 * Socket.io authentication middleware
 */
const socketAuthMiddleware = async (socket, next) => {
  try {
    const rawCookies = socket.handshake.headers?.cookie;
    const cookies = parseCookies(rawCookies);

    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "") ||
      cookies?.accessToken;

    if (!token) {
      return next(
        new ApiError(401, "Unauthorized: Authentication token is missing"),
      );
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decodedToken?._id).select(
      "-password -refreshToken",
    );

    if (!user) {
      return next(
        new ApiError(401, "Unauthorized: Invalid authentication token"),
      );
    }

    socket.user = user;
    next();
  } catch (error) {
    return next(
      new ApiError(
        401,
        error?.message || "Unauthorized: Socket authentication failed",
      ),
    );
  }
};

/**
 * Initialize Socket.io server with authentication and chat event handlers
 */
export const initializeSocket = (io) => {
  // Apply JWT authentication middleware
  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    // Notify client of successful connection
    socket.emit(CONNECTED_EVENT);

    /**
     * Join a conversation room (enforces Requirement 2: group members only)
     */
    socket.on(JOIN_CHAT_EVENT, async ({ conversationId }) => {
      try {
        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
          return socket.emit(SOCKET_ERROR_EVENT, {
            message: "Valid conversation ID is required",
          });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          return socket.emit(SOCKET_ERROR_EVENT, {
            message: "Conversation not found",
          });
        }

        // Verify the user belongs to the project associated with this conversation
        const isMember = await ProjectMember.exists({
          project: conversation.project,
          user: socket.user._id,
        });

        if (!isMember) {
          return socket.emit(SOCKET_ERROR_EVENT, {
            message: "You are not a member of this chat group",
          });
        }

        socket.join(conversationId);
        socket.emit(JOIN_CHAT_EVENT, { conversationId });
      } catch (error) {
        socket.emit(SOCKET_ERROR_EVENT, {
          message: error?.message || "Failed to join chat room",
        });
      }
    });

    /**
     * Leave a conversation room
     */
    socket.on(LEAVE_CHAT_EVENT, ({ conversationId }) => {
      if (conversationId) {
        socket.leave(conversationId);
        socket.emit(LEAVE_CHAT_EVENT, { conversationId });
      }
    });

    /**
     * Typing indicators
     */
    socket.on(TYPING_EVENT, ({ conversationId }) => {
      if (conversationId) {
        socket.in(conversationId).emit(TYPING_EVENT, {
          conversationId,
          user: {
            _id: socket.user._id,
            username: socket.user.username,
            fullName: socket.user.fullName,
          },
        });
      }
    });

    socket.on(STOP_TYPING_EVENT, ({ conversationId }) => {
      if (conversationId) {
        socket.in(conversationId).emit(STOP_TYPING_EVENT, {
          conversationId,
          user: {
            _id: socket.user._id,
            username: socket.user.username,
            fullName: socket.user.fullName,
          },
        });
      }
    });

    /**
     * Disconnect handler
     */
    socket.on(DISCONNECT_EVENT, () => {
      // Socket cleans up joined rooms automatically on disconnect
    });
  });
};

/**
 * Helper to emit a socket event to a room from anywhere (e.g. REST controllers)
 */
export const emitSocketEvent = (io, roomId, event, payload) => {
  if (io && roomId) {
    io.to(roomId).emit(event, payload);
  }
};
