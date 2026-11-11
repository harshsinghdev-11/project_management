import mongoose, { Schema } from "mongoose";

const agentChatSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    workingMemory: {
      lastProject: {
        id: { type: String, default: null },
        name: { type: String, default: "" },
      },
      lastTask: {
        id: { type: String, default: null },
        title: { type: String, default: "" },
        projectId: { type: String, default: null },
      },
      updatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

export const AgentChat = mongoose.model("AgentChat", agentChatSchema);
