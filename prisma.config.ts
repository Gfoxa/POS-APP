import "dotenv/config";
import { defineConfig } from "prisma/config";

const generationOnlyUrl =
  "postgresql://cafe_pos:local_only@localhost:5432/cafe_pos";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? generationOnlyUrl,
  },
});
