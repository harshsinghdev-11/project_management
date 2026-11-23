import mongoose, { Schema } from "mongoose";
import { AvailableProjectStatuses, ProjectStatusEnum } from "../utils/constants.js";

const projectSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
    },
    status: {
      type: String,
      enum: AvailableProjectStatuses,
      default: ProjectStatusEnum.TODO,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

export const Project = mongoose.model("Project", projectSchema);
