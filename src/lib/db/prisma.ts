import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  cafePosPrisma?: PrismaClient;
};

export function getPrismaClient(): PrismaClient {
  if (globalForPrisma.cafePosPrisma) return globalForPrisma.cafePosPrisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Database is not configured. Set DATABASE_URL in .env.");
  }

  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.cafePosPrisma = client;
  }

  return client;
}
