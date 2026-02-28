import type { RssFeed } from "../schemas/config.js";

/**
 * RSS feed list for the trading bot.
 * Add, remove, or toggle feeds by editing this file.
 * Set `enabled: false` to temporarily disable a feed without removing it.
 */
export const RSS_FEEDS: RssFeed[] = [
  // -----------------------------------------------------------------------
  // Crypto-specific media (high priority)
  // -----------------------------------------------------------------------
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
    name: "CryptoNews",
    url: "https://cryptonews.com/news/feed/",
    enabled: true,
  },
  {
    name: "CryptoPotato",
    url: "https://cryptopotato.com/feed/",
    enabled: true,
  },
  {
    name: "CryptoSlate",
    url: "https://cryptoslate.com/feed/",
    enabled: true,
  },
  {
    name: "The Defiant",
    url: "https://thedefiant.io/feed/",
    enabled: true,
  },
  {
    name: "The Block",
    url: "https://www.theblockcrypto.com/rss.xml",
    enabled: true,
  },
  {
    name: "Bitcoin Magazine",
    url: "https://bitcoinmagazine.com/.rss/full",
    enabled: true,
  },
  {
    name: "Decrypt",
    url: "https://decrypt.co/feed",
    enabled: true,
  },
  {
    name: "BeInCrypto",
    url: "https://beincrypto.com/feed/",
    enabled: true,
  },
  {
    name: "CCN",
    url: "https://www.ccn.com/news/crypto-news/feeds/",
    enabled: true,
  },
  {
    name: "NewsBTC",
    url: "https://www.newsbtc.com/feed/",
    enabled: true,
  },
  {
    name: "AMBCrypto",
    url: "https://ambcrypto.com/feed/",
    enabled: true,
  },
  {
    name: "U.Today",
    url: "https://u.today/rss",
    enabled: true,
  },
  {
    name: "CoinGape",
    url: "https://coingape.com/feed/",
    enabled: true,
  },
  {
    name: "Bitcoinist",
    url: "https://bitcoinist.com/feed/",
    enabled: true,
  },
  {
    name: "CryptoMode",
    url: "https://cryptomode.com/feed/",
    enabled: true,
  },
  {
    name: "Unchained Podcast",
    url: "https://unchainedcrypto.com/feed/",
    enabled: true,
  },

  // -----------------------------------------------------------------------
  // DeFi / Web3 focused
  // -----------------------------------------------------------------------
  {
    name: "DeFi Pulse",
    url: "https://defipulse.com/blog/feed/",
    enabled: true,
  },
  {
    name: "Bankless",
    url: "https://banklesshq.com/rss/",
    enabled: true,
  },

  // -----------------------------------------------------------------------
  // General finance & macro (supplementary)
  // -----------------------------------------------------------------------
  {
    name: "Yahoo Finance",
    url: "https://finance.yahoo.com/news/rssindex",
    enabled: true,
  },
  {
    name: "CNBC Finance",
    url: "https://www.cnbc.com/id/10000664/device/rss/rss.html",
    enabled: true,
  },
  {
    name: "Reuters Business",
    url: "https://feeds.reuters.com/reuters/businessNews",
    enabled: true,
  },
  {
    name: "Bloomberg Markets",
    url: "https://feeds.bloomberg.com/markets/news.rss",
    enabled: true,
  },
  {
    name: "Investing.com",
    url: "https://www.investing.com/rss/news.rss",
    enabled: true,
  },
  {
    name: "MarketWatch",
    url: "https://feeds.marketwatch.com/marketwatch/topstories/",
    enabled: true,
  },
  {
    name: "Seeking Alpha",
    url: "https://seekingalpha.com/market_currents.xml",
    enabled: true,
  },
];
