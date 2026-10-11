import dotenv from "dotenv";
import app from "./app.js";
import connectDB from "./db/index.js";

dotenv.config({
  path: "./.env",
});

const port = process.env.PORT || 3000;

const initializeDB = () => {
  connectDB().catch((error) => {
    console.error("Database unavailable; server remains running.");
    setTimeout(initializeDB, 5000);
  });
};

initializeDB();

app.listen(port, () => {
      console.log(`app listening on port http://localhost:${port}`);
    });
