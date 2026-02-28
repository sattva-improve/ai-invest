import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { env } from "../config/env.js";

function createDynamoClient(): DynamoDBDocumentClient {
  const clientConfig = env.DYNAMODB_ENDPOINT
    ? {
        region: env.DYNAMODB_REGION,
        endpoint: env.DYNAMODB_ENDPOINT,
        credentials: {
          accessKeyId: "local",
          secretAccessKey: "local",
        },
      }
    : { region: env.DYNAMODB_REGION };

  const client = new DynamoDBClient(clientConfig);
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertEmptyValues: false,
    },
  });
}

export const dynamoClient = createDynamoClient();
export const TABLE_NAME = env.DYNAMODB_TABLE_NAME;
