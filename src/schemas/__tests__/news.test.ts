import { NewsArticleSchema } from "../news.js";

describe("NewsArticleSchema", () => {
  const validArticle = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "Bitcoin Hits All-Time High",
    url: "https://example.com/btc-ath",
    publishedAt: "2026-01-15T10:30:00.000Z",
    source: "CryptoNews",
    summary: "BTC breaks $100k",
    content: "Full article content here...",
  };

  it("parses a valid article with all fields", () => {
    const result = NewsArticleSchema.parse(validArticle);

    expect(result.id).toBe(validArticle.id);
    expect(result.title).toBe(validArticle.title);
    expect(result.url).toBe(validArticle.url);
    expect(result.publishedAt).toBe(validArticle.publishedAt);
    expect(result.source).toBe(validArticle.source);
    expect(result.summary).toBe(validArticle.summary);
    expect(result.content).toBe(validArticle.content);
  });

  it("fails when title is missing", () => {
    const { title, ...noTitle } = validArticle;
    const result = NewsArticleSchema.safeParse(noTitle);

    expect(result.success).toBe(false);
  });

  it("fails when url is missing", () => {
    const { url, ...noUrl } = validArticle;
    const result = NewsArticleSchema.safeParse(noUrl);

    expect(result.success).toBe(false);
  });

  it("fails when url format is invalid", () => {
    const result = NewsArticleSchema.safeParse({
      ...validArticle,
      url: "not-a-url",
    });

    expect(result.success).toBe(false);
  });

  it("allows omitting optional summary field", () => {
    const { summary, ...withoutSummary } = validArticle;
    const result = NewsArticleSchema.parse(withoutSummary);

    expect(result.summary).toBeUndefined();
  });

  it("allows omitting optional content field", () => {
    const { content, ...withoutContent } = validArticle;
    const result = NewsArticleSchema.parse(withoutContent);

    expect(result.content).toBeUndefined();
  });

  it("fails when title is empty string", () => {
    const result = NewsArticleSchema.safeParse({
      ...validArticle,
      title: "",
    });

    expect(result.success).toBe(false);
  });
});
