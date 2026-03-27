import { existsSync, rmSync } from "node:fs";

const testDbFile = "/tmp/prediction-market-test.sqlite";

if (existsSync(testDbFile)) {
  rmSync(testDbFile);
}

process.env.DB_FILE_NAME = testDbFile;
process.env.JWT_SECRET = "test-jwt-secret";
