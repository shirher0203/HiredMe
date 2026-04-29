import bcrypt from "bcryptjs";
import jwt, { type Secret } from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";

const SALT_ROUNDS = 10;

function getJwtSecret(): Secret {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET");
  }
  return secret;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  plain: string,
  hashed: string
): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

export function signAuthToken(payload: { userId: string; email: string }): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

export function verifyAuthToken(token: string) {
  return jwt.verify(token, getJwtSecret());
}
