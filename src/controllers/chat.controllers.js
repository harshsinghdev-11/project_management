import { Conversation } from "../models/conversation.models.js";
import { Message } from "../models/message.models.js";
import { Project } from "../models/project.models.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { emitSocketEvent } from "../socket/index.js";
import { MESSAGE_RECEIVED_EVENT } from "../socket/events.js";
import mongoose from "mongoose";

const getProjectDefaultChat = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  let conversation = await Conversation.findOne({
    project: new mongoose.Types.ObjectId(projectId),
    isDefault: true,
  });

  // If for some reason a legacy project didn't have one, create it on-demand
  if (!conversation) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new ApiError(404, "Project not found");
    }
    conversation = await Conversation.create({
      project: project._id,
      name: `${project.name} General`,
      isDefault: true,
    });
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, conversation, "Default chat retrieved successfully"),
    );
});

const getConversationMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const skip = (page - 1) * limit;

  const messages = await Message.find({
    conversation: new mongoose.Types.ObjectId(conversationId),
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("sender", "username fullName avatar email");

  const totalMessages = await Message.countDocuments({
    conversation: new mongoose.Types.ObjectId(conversationId),
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        messages,
        pagination: {
          page,
          limit,
          totalMessages,
          totalPages: Math.ceil(totalMessages / limit),
        },
      },
      "Messages fetched successfully",
    ),
  );
});

const sendMessage = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { content } = req.body;


  const message = await Message.create({
    content,
    conversation: new mongoose.Types.ObjectId(conversationId),
    sender: new mongoose.Types.ObjectId(req.user._id),
  });

  const populatedMessage = await Message.findById(message._id).populate(
    "sender",
    "username fullName avatar email",
  );

  emitSocketEvent(
    req.app.get("io"),
    conversationId,
    MESSAGE_RECEIVED_EVENT,
    populatedMessage,
  );

  return res
    .status(201)
    .json(new ApiResponse(201, populatedMessage, "Message sent successfully"));
});

export { getProjectDefaultChat, getConversationMessages, sendMessage };
