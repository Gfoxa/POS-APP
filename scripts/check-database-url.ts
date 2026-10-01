import "dotenv/config";

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL first.",
  );
  process.exit(1);
}
