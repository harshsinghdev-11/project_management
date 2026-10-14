# MongoDB Aggregation Pipelines

Rather than issuing multiple consecutive database queries in JavaScript, the API utilizes **multi-stage MongoDB aggregation pipelines** to execute complex relational joins directly inside the database engine.

---

## 1. The Challenge with Relational Lookups in Document Databases

Fetching a detailed task requires joining four levels of data:
1. The base task document
2. Public profile of the assigned user (`assignedTo`)
3. All child checklist subtasks (`subtasks`)
4. Public profile of who created each subtask (`createdBy`)

Executing this sequentially in Node.js would require 3–4 round-trip queries over the network per request.

---

## 2. Multi-Stage Pipeline Solution: `getTaskById`

In [`src/controllers/task.controllers.js`](../src/controllers/task.controllers.js):

```javascript
const task = await Task.aggregate([
  // Stage 1: Fast indexed filter by Task ID
  { $match: { _id: new mongoose.Types.ObjectId(taskId) } },

  // Stage 2: Join assignee details from 'users' with field projection
  {
    $lookup: {
      from: "users",
      localField: "assignedTo",
      foreignField: "_id",
      as: "assignedTo",
      pipeline: [
        { $project: { _id: 1, username: 1, fullName: 1, avatar: 1 } }
      ]
    }
  },

  // Stage 3: Join subtasks with a nested lookup for each subtask's creator
  {
    $lookup: {
      from: "subtasks",
      localField: "_id",
      foreignField: "task",
      as: "subtasks",
      pipeline: [
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdBy",
            pipeline: [
              { $project: { _id: 1, username: 1, fullName: 1, avatar: 1 } }
            ]
          }
        },
        { $addFields: { createdBy: { $arrayElemAt: ["$createdBy", 0] } } }
      ]
    }
  },

  // Stage 4: Flatten the single assignee array to an object
  {
    $addFields: {
      assignedTo: { $arrayElemAt: ["$assignedTo", 0] }
    }
  }
]);
```

---

## 3. Performance Benefits
* **Single Network Round-Trip:** The entire nested relational structure is fetched and shaped in a single database operation.
* **Sensitive Field Protection:** Nested `$project` pipelines strip password hashes, refresh tokens, and internal metadata before data ever leaves MongoDB.
* **Safe Null Handling:** If a task is unassigned (`assignedTo` is `null`), `$lookup` safely returns an empty array, and `$arrayElemAt` sets `assignedTo` to `null` without throwing errors.
