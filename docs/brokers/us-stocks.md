# 🇺🇸 米国株 ブローカー & API セットアップガイド

米国株（NYSE / NASDAQ）の自動売買に使用するブローカーとAPIの設定手順。

---

## 推奨ブローカー比較

| ブローカー | API種別 | 米国株 | 日本居住者 | ペーパー取引 | 最低入金 | 難易度 |
|---|---|---|---|---|---|---|
| **Interactive Brokers** | REST (Client Portal) | ✅ | ✅ | ✅ | ~$10,000 | ★★★ |
| **Alpaca** | REST | ✅ | △ (制限あり) | ✅ 無料 | $0 | ★☆☆ |
| Webull | REST | ✅ | △ | ✅ | $0 | ★★☆ |

---

## Option 1: Interactive Brokers (IBKR)（推奨）

### 概要
世界最大の個人向け証券会社の1つ。日本居住者が米国株・日本株・香港株すべてを1つのAPIで取引可能。

- **公式サイト**: https://www.interactivebrokers.co.jp/
- **API ドキュメント**: https://ibkrcampus.com/ibkr-api-page/cpapi-v1/
- **TWS API (Python/Java)**: https://ibkrcampus.com/ibkr-api-page/twsapi-doc/

### 特徴
- REST API (Client Portal Gateway) または TWS API（独自プロトコル）
- **Paper Trading 口座**が無料で利用可能 → 本番移行前の必須ステップ
- 日本株 (TSE)・米国株 (NYSE/NASDAQ)・香港株 (HKEX) を統一管理
- 手数料: 米国株 $0.005/株（最低 $1/注文）
- **最低預入**: 個人口座 $10,000 USD 相当

### セットアップ手順

#### 1. 口座開設
1. [IBKR 日本語サイト](https://www.interactivebrokers.co.jp/ja/home.php) でオンライン口座開設
2. 「Individual Account」を選択
3. 本人確認（パスポートまたは運転免許証）+ 住所証明書類
4. 審査後に **Paper Trading 口座**が先に有効化される

#### 2. Client Portal Gateway セットアップ
詳細は `docs/brokers/jp-stocks.md` の「Option 2: IBKR」セクションを参照。

```bash
# Client Portal Gateway (Docker)
docker run -p 5000:5000 \
  -e IBKR_USERNAME=your_username \
  ghcr.io/samgozman/go-ibkr-portal:latest

# または公式バイナリを使用
wget https://download2.interactivebrokers.com/portal/clientportal.gw.zip
unzip clientportal.gw.zip && cd clientportal.gw
./bin/run.sh root/conf.yaml
```

#### 3. 環境変数の設定
```env
# .env
IBKR_BASE_URL=https://localhost:5000/v1/api
IBKR_ACCOUNT_ID=U1234567P   # Paper: 末尾P付き, Live: 末尾なし
PAPER_TRADE=true
# SSL証明書 (自己署名) を無視する場合
NODE_TLS_REJECT_UNAUTHORIZED=0
```

### 主要 API エンドポイント（US株）

| エンドポイント | 説明 |
|---|---|
| `GET /iserver/secdef/search` | シンボルから conid を取得（例: AAPL → 265598） |
| `POST /iserver/account/{id}/orders` | 注文発注 |
| `GET /iserver/account/trades` | 約定履歴 |
| `GET /portfolio/{id}/summary` | 残高・証拠金 |
| `GET /iserver/marketdata/snapshot?conids={id}&fields=31,84,86` | 株価スナップショット |

### Node.js コード例

```typescript
// 米国株の conid 検索
async function findUSConid(symbol: string): Promise<number> {
  const res = await fetch(`${process.env.IBKR_BASE_URL}/iserver/secdef/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol,         // 例: 'AAPL'
      secType: 'STK',
      exchange: 'SMART',  // SMARTルーティング (NYSE/NASDAQ自動選択)
    }),
  });
  const [result] = await res.json() as Array<{ conid: number }>;
  return result.conid;
}

// 米国株 買い注文（成行）
async function buyUSStock(symbol: string, quantity: number): Promise<string> {
  const conid = await findUSConid(symbol);
  const accountId = process.env.IBKR_ACCOUNT_ID;

  const res = await fetch(
    `${process.env.IBKR_BASE_URL}/iserver/account/${accountId}/orders`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orders: [{
          conid,
          side: 'BUY',
          quantity,
          orderType: 'MKT',  // 成行
          tif: 'DAY',
        }],
      }),
    }
  );
  const [order] = await res.json() as Array<{ order_id: string }>;
  return order.order_id;
}
```

### npm パッケージ（IBKR TWS API — 推奨）

Client Portal REST API の代わりに、公式 TypeScript npm パッケージ `@stoqey/ib` も利用可能。

```bash
# @stoqey/ib — IBKR TWS Java API の TypeScript ポート (アクティブメンテナンス中)
npm install @stoqey/ib
```

```typescript
// src/services/traders/ibkr-tws-client.ts
import { IBApi, EventName, Order, OrderAction, OrderType, SecType, Contract } from '@stoqey/ib';

const ib = new IBApi({
  clientId: 1,
  host: '127.0.0.1',
  port: 7497, // TWS: 7496/7497, IB Gateway: 4001/4002 (ペーパー: 7497/4002)
});

// 米国株の注文発注
const contract: Contract = {
  symbol: 'AAPL',
  secType: SecType.STK,
  currency: 'USD',
  exchange: 'SMART', // NYSE/NASDAQ 自動ルーティング
};

const order: Order = {
  action: OrderAction.BUY,
  orderType: OrderType.MKT,
  totalQuantity: 10,
};

ib.placeOrder(nextOrderId++, contract, order);
```

> **Note**: TWS API 利用には IB Gateway（ヘッドレス動作可能）が必要。`@stoqey/ib` は Client Portal REST API より高機能だが設定が複雑。


---

## Option 2: Alpaca（ペーパートレード推奨）

### 概要
米国株専門のアルゴリズム取引プラットフォーム。シンプルな REST API とペーパートレード環境が魅力。

- **公式サイト**: https://alpaca.markets/
- **API ドキュメント**: https://docs.alpaca.markets/
- **npm パッケージ**: `@alpacahq/alpaca-trade-api` または直接 REST

### 特徴
- 完全無料のペーパートレード環境（即座に利用可能）
- 手数料ゼロ（米国株）
- **日本居住者の制約**: ライブトレードは米国居住者を主対象 → **ペーパートレードのみ推奨**
- 1株単位から取引可能（フラクショナルシェア対応）
- WebSocket でリアルタイム株価配信

### セットアップ手順

#### 1. アカウント作成
1. [Alpaca ダッシュボード](https://app.alpaca.markets/signup) で無料アカウント作成
2. メール確認のみで **Paper Trading が即時利用可能**
3. ライブトレードは身分証明が必要（米国外居住者は制限あり）

#### 2. API キーの取得
```
ダッシュボード → Paper Trading → Right Side Panel → API Keys → Generate New Key
```

#### 3. 環境変数の設定
```env
# .env
ALPACA_API_KEY=PKXXXXXXXXXXXXXXXXXXXXXXXX
ALPACA_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ALPACA_BASE_URL=https://paper-api.alpaca.markets   # Paper Trading
# ALPACA_BASE_URL=https://api.alpaca.markets       # Live Trading (要資格)
PAPER_TRADE=true
```

### npm パッケージのインストール

```bash
# 公式 SDK
npm install @alpacahq/alpaca-trade-api

# または型付きの非公式ラッパー
npm install alpaca-trade-api
```

### Node.js コード例

```typescript
// src/services/traders/us-trader.ts
import Alpaca from '@alpacahq/alpaca-trade-api';

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY!,
  secretKey: process.env.ALPACA_SECRET_KEY!,
  paper: process.env.PAPER_TRADE === 'true',
});

// 残高確認
async function getBalance(): Promise<number> {
  const account = await alpaca.getAccount();
  return parseFloat(account.cash);
}

// 株価取得
async function getQuote(symbol: string): Promise<{ price: number; currency: string }> {
  const quote = await alpaca.getLatestQuote(symbol);
  return {
    price: (quote.ap + quote.bp) / 2,  // Mid price
    currency: 'USD',
  };
}

// 成行買い注文
async function buyStock(symbol: string, quantity: number): Promise<string> {
  const order = await alpaca.createOrder({
    symbol,                // 例: 'AAPL'
    qty: quantity,
    side: 'buy',
    type: 'market',
    time_in_force: 'day',
  });
  return order.id;
}

// 成行売り注文
async function sellStock(symbol: string, quantity: number): Promise<string> {
  const order = await alpaca.createOrder({
    symbol,
    qty: quantity,
    side: 'sell',
    type: 'market',
    time_in_force: 'day',
  });
  return order.id;
}

// WebSocket でリアルタイム株価を受信
function subscribeToQuotes(symbols: string[], onQuote: (data: unknown) => void): void {
  const socket = alpaca.data_ws;
  socket.onConnect(() => {
    socket.subscribe({ trades: symbols, quotes: symbols });
  });
  socket.onStockQuote((quote) => onQuote(quote));
  socket.connect();
}
```

---

## 銘柄コード（ティッカー）形式

| 取引所 | 形式 | 例 |
|--------|------|-----|
| NYSE | `{SYMBOL}` | `AAPL`（Apple）, `MSFT`（Microsoft）|
| NASDAQ | `{SYMBOL}` | `NVDA`（NVIDIA）, `AMZN`（Amazon）|
| ETF | `{SYMBOL}` | `SPY`（S&P500 ETF）, `QQQ`（NASDAQ-100 ETF）|

### yahoo-finance2 での取得例
```typescript
import yahooFinance from 'yahoo-finance2';

// Apple の株価取得
const quote = await yahooFinance.quote('AAPL');
console.log(quote.regularMarketPrice); // 例: 185.50 (USD)

// OHLCV データ取得
const history = await yahooFinance.chart('AAPL', {
  period1: '2026-01-01',
  period2: '2026-01-31',
  interval: '1d',
});
```

---

## US市場 時間（JST）

| セッション | JST | 備考 |
|-----------|-----|------|
| プレマーケット | 18:00 〜 23:30 | 流動性低い |
| **通常取引** | **23:30 〜 06:00+1** | 本取引（IBKRは通常時間対応） |
| アフターマーケット | 06:00 〜 10:00+1 | 流動性低い |
| **夏時間 (3月〜11月)** | **22:30 〜 05:00** | 1時間早まる |

---

## EventBridge スケジュール（AWS）

```bash
# US市場開始 1時間前に起動 (JST 22:30 = 夏時間対応)
aws events put-rule \
  --name algo-trade-us-schedule \
  --schedule-expression "cron(30 13 ? * MON-FRI *)" \  # UTC 13:30 = JST 22:30
  --state ENABLED \
  --region ap-northeast-1
```

---

## 免責事項

米国株投資は為替リスクを伴います。本ドキュメントは情報提供目的のみです。投資には元本割れのリスクがあります。まずは Alpaca のペーパートレードで十分な検証を行ってください。
