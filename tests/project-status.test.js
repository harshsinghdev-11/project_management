import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ProjectStatusEnum,
  AvailableProjectStatuses,
} from "../src/utils/constants.js";
import {
  createProjectValidator,
  updateProjectValidator,
} from "../src/validators/index.js";

describe("Project Status Constants and Validators", () => {
  it("should define todo, in_progress, and completed in ProjectStatusEnum", () => {
    assert.equal(ProjectStatusEnum.TODO, "todo");
    assert.equal(ProjectStatusEnum.IN_PROGRESS, "in_progress");
    assert.equal(ProjectStatusEnum.COMPLETED, "completed");
    assert.deepEqual(AvailableProjectStatuses.sort(), [
      "completed",
      "in_progress",
      "todo",
    ]);
  });

  it("createProjectValidator should include status validation rules", () => {
    const rules = createProjectValidator();
    const statusRule = rules.find((r) => r.builder?.fields?.includes("status"));
    assert.ok(statusRule, "status rule should exist in createProjectValidator");
  });

  it("updateProjectValidator should allow optional name, description, and status", () => {
    const rules = updateProjectValidator();
    const statusRule = rules.find((r) => r.builder?.fields?.includes("status"));
    const nameRule = rules.find((r) => r.builder?.fields?.includes("name"));
    assert.ok(statusRule, "status rule should exist in updateProjectValidator");
    assert.ok(nameRule, "name rule should exist in updateProjectValidator");
  });
});
