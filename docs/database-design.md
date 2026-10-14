# Database Design & Schema Modeling

The database uses **MongoDB Atlas** with **Mongoose ODM**. It employs a **normalized, reference-based schema** across 6 collections rather than deep document embedding.

---

## 1. Entity Relationship Overview

```
[Users] <──────┐
   │           │
   │ (creates) │ (assigned to)
   ▼           │
[Projects] ───► [Tasks] ───► [Subtasks]
   │              │
   ▼              ▼
[ProjectMembers] [ProjectNotes]
```

---

## 2. Collections & Schema Breakdown

| Collection | Model File | Purpose |
| :--- | :--- | :--- |
| **`users`** | `user.models.js` | User profiles, credential hashes, refresh tokens, and avatar metadata. |
| **`projects`** | `project.models.js` | Workspaces created by users. |
| **`projectmembers`** | `projectmember.models.js` | **Junction model** linking users to projects with assigned role permissions. |
| **`tasks`** | `task.models.js` | Work items linked to a project, assigned user, and creator. |
| **`subtasks`** | `subtask.models.js` | Checklist items belonging to a parent task. |
| **`projectnotes`** | `note.models.js` | Notes and comments attached to a project workspace. |

---

## 3. Why Normalized Over Monolithic Embedding?

1. **Avoids 16MB BSON Document Cap:** In a production project management tool, a project can accumulate thousands of tasks, comments, and subtasks over time. Storing them inside a single nested document would eventually violate MongoDB's 16MB document size limit.
2. **Efficient Team Queries via Junction Collection:** Rather than storing an array of user IDs inside each project document, the dedicated `ProjectMember` collection stores `{ project, user, role }`. This enables fast, indexed bidirectional queries:
   - *"Which projects does User X belong to?"*
   - *"Which users belong to Project Y and what are their permissions?"*
3. **Selective Embedding for Bounded Data:** Small, bounded data that never grows indefinitely (such as task file attachments `[{ url, mimetype, size }]` or user avatars `{ url, localPath }`) is embedded directly to avoid unnecessary lookups.
