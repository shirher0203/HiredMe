import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "./app";
import { validateEnv } from "./config/env.config";

const env = validateEnv();

async function bootstrap(): Promise<void> {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(env.MONGODB_URI);
  console.log("MongoDB connected");
  
  console.log("Creating app...");
  const app = createApp();
  console.log("App created");
  
  const server = app.listen(env.PORT, () => {
    console.log(`Server listening on port ${env.PORT}`);
  });
  
  server.on("error", (err) => {
    console.error("Server error:", err);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
