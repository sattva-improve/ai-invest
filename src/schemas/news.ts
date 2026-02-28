import { z } from "zod";

export const NewsArticleSchema = z.object({
  id: z.string().describe("Unique identifier (UUID)"),
  title: z.string().min(1).describe("Article title"),
  url: z.string().url().describe("Article URL"),
  publishedAt: z.string().datetime().describe("ISO 8601 publish timestamp"),
  source: z.string().describe("RSS feed source name"),
  summary: z.string().optional().describe("Article summary or excerpt"),
  content: z.string().optional().describe("Full article content"),
});

export type NewsArticle = z.infer<typeof NewsArticleSchema>;

export const RssFeedItemSchema = z.object({
  title: z.string().optional(),
  link: z.string().optional(),
  pubDate: z.string().optional(),
  isoDate: z.string().optional(),
  content: z.string().optional(),
  contentSnippet: z.string().optional(),
});

export type RssFeedItem = z.infer<typeof RssFeedItemSchema>;
