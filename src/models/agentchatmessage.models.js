import mongoose, { Schema } from "mongoose";

const agentChatMessageSchema = new Schema(
  {
    chat: {
      type: Schema.Types.ObjectId,
      ref: "AgentChat",
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

agentChatMessageSchema.index({ chat: 1, createdAt: 1 });

export const AgentChatMessage = mongoose.model(
  "AgentChatMessage",
  agentChatMessageSchema,
);
