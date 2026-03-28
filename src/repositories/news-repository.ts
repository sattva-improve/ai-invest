import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import type { NewsArticle } from "../schemas/news.js";
import { dynamoClient, TABLE_NAME } from "./dynamo-client.js";

export interface NewsItem {
  PK: string;
  SK: string;
  type: "NEWS_ITEM";
  Title: string;
  Url: string;
  Source: string;
  Sentiment: number;
  PublishedAt: string;
  CreatedAt: string;
  articleId: string;
}

export async function saveNewsItem(article: NewsArticle, sentiment: number): Promise<NewsItem> {
  const now = new Date().toISOString();
  const id = article.id ?? uuidv4();
  const sk = `${now}#${id}`;

  const item: NewsItem = {
    PK: "NEWS",
    SK: sk,
    type: "NEWS_ITEM",
    Title: article.title,
    Url: article.url,
    Source: article.source,
    Sentiment: sentiment,
    PublishedAt: article.publishedAt,
    CreatedAt: now,
    articleId: id,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }),
  );

  return item;
}

export async function findByUrl(url: string): Promise<NewsItem | null> {
  // URL でクエリするにはGSIが必要だが、今はシンプルにScanで代替
  // Phase後でGSI追加 or Urlをインデックスに追加可能
  // 現状: newsItemsを直近20件取得してURLフィルタリング
  const items = await listRecentNews(20);
  return items.find((item) => item.Url === url) ?? null;
}

export async function listRecentNews(limit = 20): Promise<NewsItem[]> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": "NEWS",
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );

  return (result.Items ?? []) as NewsItem[];
}
