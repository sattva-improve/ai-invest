import type { RssFeed } from "../schemas/config.js";

export const RSS_FEEDS: RssFeed[] = [
  {
    name: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    enabled: true,
  },
  {
    name: "Cointelegraph",
    url: "https://cointelegraph.com/rss",
    enabled: true,
  },
  {
    name: "The Block",
    url: "https://www.theblockcrypto.com/rss.xml",
    enabled: true,
  },
  {
    name: "Decrypt",
    url: "https://decrypt.co/feed",
    enabled: true,
  },
  {
    name: "Blockworks",
    url: "https://blockworks.co/feed",
    enabled: true,
  },
  {
    name: "CoinPost",
    url: "https://coinpost.jp/?feed=rss2",
    enabled: true,
  },
];
