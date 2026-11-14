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
import {
  initPubSub,
  broadcastThroughPubSub,
  closePubSub,
} from "../redis/pubsub.js";


const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((cookie) => {
      const [key, ...val] = cookie.trim().split("=");
      return [key, decodeURIComponent(val.join("="))];
    }),
  );
};


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


export const initializeSocket = (io) => {
  // Initialize Redis Pub/Sub integration for cross-server synchronization
  initPubSub(io);

  // Apply JWT authentication middleware
  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
   
    socket.emit(CONNECTED_EVENT);
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


    socket.on(LEAVE_CHAT_EVENT, ({ conversationId }) => {
      if (conversationId) {
        socket.leave(conversationId);
        socket.emit(LEAVE_CHAT_EVENT, { conversationId });
      }
    });


    socket.on(TYPING_EVENT, ({ conversationId }) => {
      if (conversationId) {
        broadcastThroughPubSub(
          io,
          conversationId,
          TYPING_EVENT,
          {
            conversationId,
            user: {
              _id: socket.user._id,
              username: socket.user.username,
              fullName: socket.user.fullName,
            },
          },
          socket,
        );
      }
    });

    socket.on(STOP_TYPING_EVENT, ({ conversationId }) => {
      if (conversationId) {
        broadcastThroughPubSub(
          io,
          conversationId,
          STOP_TYPING_EVENT,
          {
            conversationId,
            user: {
              _id: socket.user._id,
              username: socket.user.username,
              fullName: socket.user.fullName,
            },
          },
          socket,
        );
      }
    });

   
    socket.on(DISCONNECT_EVENT, () => {
    
    });
  });
};


export const emitSocketEvent = (io, roomId, event, payload) => {
  if (roomId) {
    broadcastThroughPubSub(io, roomId, event, payload);
  }
};

export { closePubSub };
