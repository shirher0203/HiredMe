import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "./app";

const PORT = Number(process.env.PORT ?? 5000);
const MONGODB_URI = process.env.MONGODB_URI;

async function bootstrap(): Promise<void> {
  if (!MONGODB_URI) {
    throw new Error("Missing MONGODB_URI");
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("MongoDB connected");
  
  console.log("Creating app...");
  const app = createApp();
  console.log("App created");
  
  const server = app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
  
  server.on("error", (err) => {
    console.error("Server error:", err);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
