import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
} from "@aws-sdk/client-dynamodb";
import { config } from "dotenv";

config();

const endpoint = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";
const region = process.env.DYNAMODB_REGION ?? "ap-northeast-1";
const tableName = process.env.DYNAMODB_TABLE_NAME ?? "InvestmentTable";

const client = new DynamoDBClient({
  region,
  endpoint,
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
});

async function createTable(): Promise<void> {
  console.log(`Creating DynamoDB table: ${tableName} at ${endpoint}`);

  try {
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [
          { AttributeName: "PK", AttributeType: "S" },
          { AttributeName: "SK", AttributeType: "S" },
        ],
        KeySchema: [
          { AttributeName: "PK", KeyType: "HASH" },
          { AttributeName: "SK", KeyType: "RANGE" },
        ],
      }),
    );
    console.log(`✅ Table "${tableName}" created successfully`);
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      console.log(`ℹ️  Table "${tableName}" already exists, skipping`);
    } else {
      throw error;
    }
  }
}

async function verifyTable(): Promise<void> {
  const result = await client.send(
    new DescribeTableCommand({ TableName: tableName }),
  );
  console.log(`✅ Table status: ${result.Table?.TableStatus}`);
}

async function main(): Promise<void> {
  await createTable();
  await verifyTable();
  console.log("✅ Database initialization complete");
}

main().catch((error: unknown) => {
  console.error("❌ Database initialization failed:", error);
  process.exit(1);
});
