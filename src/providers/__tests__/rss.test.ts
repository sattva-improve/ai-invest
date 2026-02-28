const { mockParseURL } = vi.hoisted(() => ({
	mockParseURL: vi.fn(),
}));

vi.mock("rss-parser", () => ({
	default: vi.fn().mockImplementation(() => ({
		parseURL: mockParseURL,
	})),
}));

vi.mock("../../config/env.js", () => ({
	env: {
		LOG_LEVEL: "silent",
		NODE_ENV: "test",
	},
}));

import { fetchRssFeeds } from "../rss.js";

describe("fetchRssFeeds", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns array of NewsArticle objects", async () => {
		mockParseURL.mockResolvedValue({
			title: "Test Feed",
			items: [
				{
					title: "BTC Pumps",
					link: "https://example.com/1",
					isoDate: "2026-01-01T00:00:00.000Z",
					contentSnippet: "BTC went up",
				},
				{
					title: "ETH Drops",
					link: "https://example.com/2",
					isoDate: "2026-01-02T00:00:00.000Z",
					contentSnippet: "ETH went down",
				},
			],
		});

		const result = await fetchRssFeeds({
			urls: ["https://example.com/rss"],
		});

		expect(result).toHaveLength(2);
		expect(result[0].title).toBe("BTC Pumps");
		expect(result[0].url).toBe("https://example.com/1");
		expect(result[0].publishedAt).toBe("2026-01-01T00:00:00.000Z");
		expect(result[0].source).toBe("Test Feed");
		expect(result[0].summary).toBe("BTC went up");
		expect(result[0].id).toBeDefined();
	});

	it("skips items with no publish date", async () => {
		mockParseURL.mockResolvedValue({
			title: "Test Feed",
			items: [
				{
					title: "Has Date",
					link: "https://example.com/1",
					isoDate: "2026-01-01T00:00:00.000Z",
				},
				{
					title: "No Date",
					link: "https://example.com/2",
					// no isoDate or pubDate
				},
			],
		});

		const result = await fetchRssFeeds({
			urls: ["https://example.com/rss"],
		});

		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("Has Date");
	});

	it("handles failed feeds gracefully (Promise.allSettled)", async () => {
		mockParseURL
			.mockResolvedValueOnce({
				title: "Good Feed",
				items: [
					{
						title: "Article",
						link: "https://example.com/1",
						isoDate: "2026-01-01T00:00:00.000Z",
					},
				],
			})
			.mockRejectedValueOnce(new Error("Network error"));

		const result = await fetchRssFeeds({
			urls: [
				"https://example.com/good",
				"https://example.com/bad",
			],
		});

		// Should return articles from the successful feed only
		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("Article");
	});

	it("respects maxItemsPerFeed limit", async () => {
		mockParseURL.mockResolvedValue({
			title: "Big Feed",
			items: [
				{ title: "Item 1", link: "https://example.com/1", isoDate: "2026-01-01T00:00:00.000Z" },
				{ title: "Item 2", link: "https://example.com/2", isoDate: "2026-01-02T00:00:00.000Z" },
				{ title: "Item 3", link: "https://example.com/3", isoDate: "2026-01-03T00:00:00.000Z" },
				{ title: "Item 4", link: "https://example.com/4", isoDate: "2026-01-04T00:00:00.000Z" },
				{ title: "Item 5", link: "https://example.com/5", isoDate: "2026-01-05T00:00:00.000Z" },
			],
		});

		const result = await fetchRssFeeds({
			urls: ["https://example.com/rss"],
			maxItemsPerFeed: 2,
		});

		expect(result).toHaveLength(2);
	});
});
