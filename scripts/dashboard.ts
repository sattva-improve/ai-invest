import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "dotenv";

config();

const endpoint = process.env.DYNAMODB_ENDPOINT;
const region = process.env.DYNAMODB_REGION ?? "ap-northeast-1";
const tableName = process.env.DYNAMODB_TABLE_NAME ?? "InvestmentTable";

const clientConfig = endpoint
  ? {
      region,
      endpoint,
      credentials: { accessKeyId: "local", secretAccessKey: "local" },
    }
  : { region };

const client = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig), {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false },
});

// ─── ANSI Colors ───────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
};

// ─── Helpers ───────────────────────────────────────────────────

function pad(str: string, len: number): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping requires control char
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "");
  const diff = len - stripped.length;
  return diff > 0 ? str + " ".repeat(diff) : str;
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? `${str.slice(0, maxLen - 1)}…` : str;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  } catch {
    return iso;
  }
}

function colorAction(action: string): string {
  switch (action) {
    case "BUY":
      return `${c.green}${c.bold}BUY ${c.reset}`;
    case "SELL":
      return `${c.red}${c.bold}SELL${c.reset}`;
    case "HOLD":
      return `${c.yellow}${c.bold}HOLD${c.reset}`;
    default:
      return action;
  }
}

function colorConfidence(conf: number): string {
  const pct = `${(conf * 100).toFixed(0)}%`;
  if (conf >= 0.8) return `${c.green}${pct}${c.reset}`;
  if (conf >= 0.5) return `${c.yellow}${pct}${c.reset}`;
  return `${c.red}${pct}${c.reset}`;
}

function colorSide(side: string): string {
  return side === "BUY" ? `${c.green}${side}${c.reset}` : `${c.red}${side}${c.reset}`;
}

function colorStatus(status: string): string {
  switch (status) {
    case "OPEN":
      return `${c.green}${status}${c.reset}`;
    case "CLOSED":
      return `${c.dim}${status}${c.reset}`;
    case "PAPER":
      return `${c.cyan}${status}${c.reset}`;
    default:
      return status;
  }
}

function colorProfit(profit: number): string {
  const str = profit.toFixed(6);
  if (profit > 0) return `${c.green}+${str}${c.reset}`;
  if (profit < 0) return `${c.red}${str}${c.reset}`;
  return `${c.dim}${str}${c.reset}`;
}

function printHeader(title: string): void {
  const line = "═".repeat(100);
  console.log();
  console.log(`${c.bgBlue}${c.white}${c.bold} ${title} ${c.reset}`);
  console.log(`${c.blue}${line}${c.reset}`);
}

function printSeparator(): void {
  console.log(`${c.dim}${"─".repeat(100)}${c.reset}`);
}

// ─── Data Types ────────────────────────────────────────────────

interface NewsItem {
  PK: string;
  SK: string;
  Title: string;
  Url: string;
  Source: string;
  Sentiment: number;
  PublishedAt: string;
  CreatedAt: string;
  Ticker?: string;
  Action?: string;
  Confidence?: number;
  Reasoning?: string;
  Market?: string;
}

interface TradeItem {
  PK: string;
  SK: string;
  Ticker: string;
  Side: string;
  PositionSide: string;
  Price: number;
  Leverage: number;
  Profit: number;
  OrderId: string;
  Status: string;
  Confidence: number;
  CreatedAt: string;
}

interface StateItem {
  PK: string;
  SK: string;
  LastRun: string;
  Balance: number;
  UpdatedAt: string;
}

// ─── Data Fetchers ─────────────────────────────────────────────

async function fetchNews(limit: number): Promise<NewsItem[]> {
  const pks = ["NEWS", "NEWS#JP", "NEWS#US", "NEWS#CN"];
  const allItems: NewsItem[] = [];

  for (const pk of pks) {
    try {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": pk },
          ScanIndexForward: false,
          Limit: limit,
        }),
      );
      if (result.Items) {
        allItems.push(...(result.Items as NewsItem[]));
      }
    } catch {
      /* partition may not have data */
    }
  }

  allItems.sort((a, b) => (b.CreatedAt ?? b.SK).localeCompare(a.CreatedAt ?? a.SK));
  return allItems.slice(0, limit);
}

async function fetchTrades(limit: number): Promise<TradeItem[]> {
  const pks = ["TRADE", "TRADE#JP", "TRADE#US", "TRADE#CN"];
  const allItems: TradeItem[] = [];

  for (const pk of pks) {
    try {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": pk },
          ScanIndexForward: false,
          Limit: limit,
        }),
      );
      if (result.Items) {
        allItems.push(...(result.Items as TradeItem[]));
      }
    } catch {
      /* partition may not have data */
    }
  }

  allItems.sort((a, b) => (b.CreatedAt ?? b.SK).localeCompare(a.CreatedAt ?? a.SK));
  return allItems.slice(0, limit);
}

async function fetchState(): Promise<StateItem | null> {
  try {
    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: "STATE", SK: "LATEST" },
      }),
    );
    return (result.Item as StateItem) ?? null;
  } catch {
    return null;
  }
}

// ─── Renderers ─────────────────────────────────────────────────

function renderSystemStatus(state: StateItem | null): void {
  printHeader("SYSTEM STATUS");

  if (!state) {
    console.log(`  ${c.dim}No state data found${c.reset}`);
    return;
  }

  console.log(`  ${c.bold}Last Run:${c.reset}  ${formatDate(state.LastRun)}`);
  console.log(`  ${c.bold}Balance:${c.reset}   ${state.Balance}`);
  console.log(`  ${c.bold}Updated:${c.reset}   ${formatDate(state.UpdatedAt)}`);
}

function renderNewsTable(news: NewsItem[]): void {
  printHeader(`AI ANALYSIS HISTORY (${news.length} items)`);

  if (news.length === 0) {
    console.log(`  ${c.dim}No news items found${c.reset}`);
    return;
  }

  const cols = [
    pad(`${c.bold}Date${c.reset}`, 24),
    pad(`${c.bold}Source${c.reset}`, 14),
    pad(`${c.bold}Title${c.reset}`, 40),
    pad(`${c.bold}Sentiment${c.reset}`, 14),
  ];
  console.log(`  ${cols.join(" │ ")}`);
  printSeparator();

  for (const item of news) {
    const date = pad(formatDate(item.CreatedAt ?? item.SK), 20);
    const source = pad(truncate(item.Source ?? "-", 10), 10);
    const title = pad(truncate(item.Title ?? "-", 36), 36);
    const sentiment = item.Sentiment != null ? item.Sentiment.toFixed(2) : "-";
    const sentimentColor =
      item.Sentiment > 0.5
        ? `${c.green}${sentiment}${c.reset}`
        : item.Sentiment < -0.5
          ? `${c.red}${sentiment}${c.reset}`
          : `${c.yellow}${sentiment}${c.reset}`;

    const row = [`  ${date}`, pad(source, 10), pad(title, 36), pad(sentimentColor, 10)];
    console.log(row.join(" │ "));

    if (item.Action || item.Ticker || item.Confidence != null) {
      const detail = [
        item.Ticker ? `${c.cyan}${item.Ticker}${c.reset}` : "",
        item.Action ? colorAction(item.Action) : "",
        item.Confidence != null ? `conf:${colorConfidence(item.Confidence)}` : "",
        item.Market ? `${c.dim}[${item.Market}]${c.reset}` : "",
      ]
        .filter(Boolean)
        .join("  ");
      console.log(`    └─ ${detail}`);
    }

    if (item.Reasoning) {
      console.log(`    └─ ${c.dim}${truncate(item.Reasoning, 80)}${c.reset}`);
    }
  }
}

function renderTradesTable(trades: TradeItem[]): void {
  printHeader(`TRADE HISTORY (${trades.length} items)`);

  if (trades.length === 0) {
    console.log(`  ${c.dim}No trade items found${c.reset}`);
    return;
  }

  const cols = [
    pad(`${c.bold}Date${c.reset}`, 24),
    pad(`${c.bold}Ticker${c.reset}`, 14),
    pad(`${c.bold}Side${c.reset}`, 10),
    pad(`${c.bold}Pos${c.reset}`, 10),
    pad(`${c.bold}Price${c.reset}`, 14),
    pad(`${c.bold}Lev${c.reset}`, 8),
    pad(`${c.bold}Profit${c.reset}`, 16),
    pad(`${c.bold}Status${c.reset}`, 12),
    pad(`${c.bold}Conf${c.reset}`, 10),
  ];
  console.log(`  ${cols.join(" │ ")}`);
  printSeparator();

  let totalProfit = 0;
  const tradeCount = { buy: 0, sell: 0 };

  for (const trade of trades) {
    totalProfit += trade.Profit ?? 0;
    if (trade.Side === "BUY") tradeCount.buy++;
    else tradeCount.sell++;

    const row = [
      `  ${pad(formatDate(trade.CreatedAt ?? trade.SK), 20)}`,
      pad(truncate(trade.Ticker ?? "-", 10), 10),
      pad(colorSide(trade.Side), 10),
      pad(trade.PositionSide ?? "-", 6),
      pad((trade.Price ?? 0).toFixed(6), 10),
      pad(`x${trade.Leverage ?? 1}`, 4),
      pad(colorProfit(trade.Profit ?? 0), 16),
      pad(colorStatus(trade.Status), 12),
      pad(trade.Confidence != null ? colorConfidence(trade.Confidence) : "-", 10),
    ];
    console.log(row.join(" │ "));
  }

  printSeparator();
  console.log(
    `  ${c.bold}Summary:${c.reset}  BUY: ${c.green}${tradeCount.buy}${c.reset}  SELL: ${c.red}${tradeCount.sell}${c.reset}  Total P&L: ${colorProfit(totalProfit)}`,
  );
}

interface TickerPnL {
  ticker: string;
  totalProfit: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  avgBuyPrice: number;
  avgSellPrice: number;
}

function computeTickerPnL(trades: TradeItem[]): TickerPnL[] {
  const map = new Map<string, { profits: number[]; buyPrices: number[]; sellPrices: number[] }>();

  for (const trade of trades) {
    const ticker = trade.Ticker ?? "UNKNOWN";
    if (!map.has(ticker)) {
      map.set(ticker, { profits: [], buyPrices: [], sellPrices: [] });
    }
    const entry = map.get(ticker);
    if (!entry) continue;

    if (trade.Side === "SELL" && trade.Profit !== 0) {
      entry.profits.push(trade.Profit);
    }
    if (trade.Side === "BUY") {
      entry.buyPrices.push(trade.Price ?? 0);
    } else {
      entry.sellPrices.push(trade.Price ?? 0);
    }
  }

  const results: TickerPnL[] = [];
  for (const [ticker, data] of map) {
    const totalProfit = data.profits.reduce((sum, p) => sum + p, 0);
    const winCount = data.profits.filter((p) => p > 0).length;
    const lossCount = data.profits.filter((p) => p < 0).length;
    const avgBuyPrice =
      data.buyPrices.length > 0
        ? data.buyPrices.reduce((s, p) => s + p, 0) / data.buyPrices.length
        : 0;
    const avgSellPrice =
      data.sellPrices.length > 0
        ? data.sellPrices.reduce((s, p) => s + p, 0) / data.sellPrices.length
        : 0;
    results.push({
      ticker,
      totalProfit,
      tradeCount: data.buyPrices.length + data.sellPrices.length,
      winCount,
      lossCount,
      avgBuyPrice,
      avgSellPrice,
    });
  }

  results.sort((a, b) => b.totalProfit - a.totalProfit);
  return results;
}

function renderProfitSummary(trades: TradeItem[]): void {
  printHeader("PROFIT & LOSS SUMMARY");

  if (trades.length === 0) {
    console.log(`  ${c.dim}No trade data available${c.reset}`);
    return;
  }

  const tickerPnL = computeTickerPnL(trades);

  const cols = [
    pad(`${c.bold}Ticker${c.reset}`, 16),
    pad(`${c.bold}Trades${c.reset}`, 10),
    pad(`${c.bold}Wins${c.reset}`, 8),
    pad(`${c.bold}Losses${c.reset}`, 10),
    pad(`${c.bold}Win Rate${c.reset}`, 12),
    pad(`${c.bold}Avg Buy${c.reset}`, 14),
    pad(`${c.bold}Avg Sell${c.reset}`, 14),
    pad(`${c.bold}P&L${c.reset}`, 16),
  ];
  console.log(`  ${cols.join(" │ ")}`);
  printSeparator();

  let grandTotalProfit = 0;
  let grandWins = 0;
  let grandLosses = 0;

  for (const pnl of tickerPnL) {
    grandTotalProfit += pnl.totalProfit;
    grandWins += pnl.winCount;
    grandLosses += pnl.lossCount;

    const totalRoundTrips = pnl.winCount + pnl.lossCount;
    const winRate = totalRoundTrips > 0 ? (pnl.winCount / totalRoundTrips) * 100 : 0;
    const winRateStr = totalRoundTrips > 0 ? `${winRate.toFixed(0)}%` : "-";
    const winRateColor =
      winRate >= 50
        ? `${c.green}${winRateStr}${c.reset}`
        : winRate > 0
          ? `${c.red}${winRateStr}${c.reset}`
          : `${c.dim}${winRateStr}${c.reset}`;

    const row = [
      `  ${pad(`${c.cyan}${pnl.ticker}${c.reset}`, 16)}`,
      pad(String(pnl.tradeCount), 6),
      pad(`${c.green}${pnl.winCount}${c.reset}`, 8),
      pad(`${c.red}${pnl.lossCount}${c.reset}`, 10),
      pad(winRateColor, 12),
      pad(pnl.avgBuyPrice > 0 ? pnl.avgBuyPrice.toFixed(6) : "-", 10),
      pad(pnl.avgSellPrice > 0 ? pnl.avgSellPrice.toFixed(6) : "-", 10),
      pad(colorProfit(pnl.totalProfit), 16),
    ];
    console.log(row.join(" │ "));
  }

  printSeparator();
  const grandTotal = grandWins + grandLosses;
  const grandWinRate = grandTotal > 0 ? (grandWins / grandTotal) * 100 : 0;
  const grandWinRateStr = grandTotal > 0 ? `${grandWinRate.toFixed(0)}%` : "-";
  console.log(
    `  ${c.bold}Total P&L:${c.reset} ${colorProfit(grandTotalProfit)}  │  ${c.bold}Win Rate:${c.reset} ${grandWinRateStr} (${grandWins}W / ${grandLosses}L)`,
  );
}

function renderSummary(news: NewsItem[], trades: TradeItem[], state: StateItem | null): void {
  printHeader("DASHBOARD SUMMARY");

  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  console.log(`  ${c.bold}Generated:${c.reset}    ${now}`);
  const dataSource = endpoint ? `DynamoDB Local (${endpoint})` : `AWS DynamoDB (${region})`;
  console.log(`  ${c.bold}Data Source:${c.reset}   ${dataSource}`);
  console.log(`  ${c.bold}Table:${c.reset}         ${tableName}`);
  console.log(`  ${c.bold}News Items:${c.reset}    ${news.length}`);
  console.log(`  ${c.bold}Trade Items:${c.reset}   ${trades.length}`);
  console.log(`  ${c.bold}System State:${c.reset}  ${state ? "Active" : "No data"}`);
}

// ─── Main ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  const limit = Number.parseInt(process.argv[2] ?? "50", 10);

  console.log(
    `\n${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════════════════╗${c.reset}`,
  );
  console.log(
    `${c.bold}${c.cyan}║            📊  INVESTMENT AGENT DASHBOARD                          ║${c.reset}`,
  );
  console.log(
    `${c.bold}${c.cyan}╚══════════════════════════════════════════════════════════════════════╝${c.reset}`,
  );

  try {
    const [news, trades, state] = await Promise.all([
      fetchNews(limit),
      fetchTrades(limit),
      fetchState(),
    ]);

    renderSummary(news, trades, state);
    renderSystemStatus(state);
    renderNewsTable(news);
    renderTradesTable(trades);
    renderProfitSummary(trades);

    console.log(
      `\n${c.dim}Tip: Run with a number to change limit, e.g. \`npm run dashboard -- 100\`${c.reset}\n`,
    );
  } catch (err) {
    const target = endpoint ?? `AWS DynamoDB (${region})`;
    console.error(`\n${c.red}${c.bold}Error:${c.reset} Failed to connect to DynamoDB at ${target}`);
    if (endpoint) {
      console.error(`${c.dim}Make sure DynamoDB Local is running: docker compose up -d${c.reset}`);
    } else {
      console.error(
        `${c.dim}Make sure AWS credentials are configured (aws configure / env vars / IAM role)${c.reset}`,
      );
    }
    console.error(err);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
