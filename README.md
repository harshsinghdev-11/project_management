# Project Guide: Project Camp Backend

Welcome to the **Project Camp Backend**! This file will help you understand the project structure, what each component does, and how you can get started with navigating, running, and modifying the codebase.

## 1. What is this project?

This project is a RESTful API backend for a collaborative **Project Management System**. 
It allows users to register, log in, create projects, manage tasks and subtasks, add notes, and oversee team members with role-based access control (Admin, Project Admin, Member).

The detailed specifications, features, and API endpoints for this backend are fully documented in the **`PRD.md`** file (Product Requirements Document) included in this directory.

## 2. Tech Stack used

- **Node.js & Express.js**: For running the API server and handling routing.
- **MongoDB & Mongoose**: For the database and object data modeling (ODM).
- **JWT (JSON Web Tokens)**: For secure user authentication and authorization.
- **Bcrypt**: For securely hashing and storing passwords.
- **Multer**: For handling file attachments and image uploads.
- **Nodemailer & Mailgen**: For sending template-based emails (like account verification and password resets).
- **Express Validator**: For sanitizing and validating user inputs.

## 3. Folder Structure Overview

The project follows a standard backend architectural pattern (MVC/Router-Controller-Service). All the active source code lives inside the `src/` folder.

Here is how you should think about the codebase:

- **`src/index.js`**: The main entry point. It establishes the connection to the database and starts the HTTP server.
- **`src/app.js`**: Where the Express application is configured. It sets up app-level middlewares (like CORS, cookie-parser, JSON parsing) and mounts the main API route files.
- **`src/db/`**: Contains the connection logic for the MongoDB database.
- **`src/models/`**: Defines the Schemas for your database entities (e.g., Users, Projects, Tasks, Subtasks, Notes). This is how data is structured in MongoDB.
- **`src/controllers/`**: Contains the core logic. Whenever an endpoint is hit, a specific controller function executes to fetch/modify data in the database and send back a JSON response.
- **`src/routes/`**: Defines the URL API endpoints (e.g., `/api/v1/auth/register`) and maps them to their respective controller functions and middlewares.
- **`src/middlewares/`**: Contains intermediate functions that run before reaching the controllers. Important ones include authentication guards, role verifiers, and file upload handlers.
- **`src/utils/`**: Helper files containing standard error formatting (`ApiError`), standard response formatting (`ApiResponse`), and repetitive utilities.
- **`src/validators/`**: Contains input validation schemas to ensure the data sent by clients is correct before processing them in the controllers.
- **`public/`**: Stores static assets, most likely uploaded files or images from tasks, as mentioned in the PRD.
- **`PRD.md`**: The official requirement document listing exactly what this API achieves.

## 4. How to Navigate the Code (Recommended Order)

If you're studying the codebase, read things in this order:

1. **Understand the Goal**: First, read through **`PRD.md`** completely. It serves as the blueprint of what you are building.
2. **Main Setup**: Check **`src/index.js`** and **`src/app.js`** to see how the Express server is initialized.
3. **Data Structure**: Look at the files in **`src/models/`** to understand how data is related. Start with the `User` and `Project` models.
4. **The Flow**: 
   - Open a file in **`src/routes/`**. Look at an endpoint.
   - Follow that endpoint into its connected file in **`src/controllers/`**.
   - Observe how the controller uses the database models to get the job done and return a response.
5. **Security/Validation**: Review **`src/middlewares/`** and **`src/validators/`** to see how incoming requests are authenticated and checked for errors.

## 5. How to Run the Project Locally

1. **Install Dependencies**: Open your terminal in this project folder and run:
   ```bash
   npm install
   ```

2. **Set up Environment Variables**: Create a `.env` file in the root directory (the same place as `package.json`). Based on the dependencies, you will need to define variables like:
   ```env
   PORT=8000
   MONGODB_URI=your_mongodb_connection_string
   CORS_ORIGIN=*
   ACCESS_TOKEN_SECRET=your_super_secret_access_key
   ACCESS_TOKEN_EXPIRY=1d
   REFRESH_TOKEN_SECRET=your_super_secret_refresh_key
   REFRESH_TOKEN_EXPIRY=10d
   ```
   *(You'll need an active MongoDB connection string—local or MongoDB Atlas—to run this).*

3. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   This command uses `nodemon`, so your server will automatically restart and refresh whenever you save code changes.

4. **Start the Production Server**:
   ```bash
   npm start
   ```

## 6. Next Steps
Once your `.env` is set up and the app is running on port 8000, you can configure an API client like **Postman** or **Thunder Client** to test the endpoints listed in the `PRD.md` file!
