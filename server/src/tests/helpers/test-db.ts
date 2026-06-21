import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { signAuthToken } from "../../utils/auth";

let mongoServer: MongoMemoryServer | undefined;

function ensureTestSecret(): void {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "test-secret";
  }
}

/** Spin up an in-memory MongoDB and connect mongoose to it. */
export async function connectTestDb(): Promise<void> {
  ensureTestSecret();
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}

/** Wipe every collection between tests for isolation. */
export async function clearTestDb(): Promise<void> {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

/** Disconnect mongoose and stop the in-memory server. */
export async function disconnectTestDb(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = undefined;
  }
}

/** Create a valid Bearer JWT for a test user (default id is a fresh ObjectId). */
export function makeAuthToken(overrides?: {
  userId?: string;
  email?: string;
}): { token: string; userId: string; email: string } {
  ensureTestSecret();
  const userId = overrides?.userId ?? new mongoose.Types.ObjectId().toHexString();
  const email = overrides?.email ?? "test@example.com";
  const token = signAuthToken({ userId, email });
  return { token, userId, email };
}
