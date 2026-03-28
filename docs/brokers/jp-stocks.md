# 🇯🇵 日本株 ブローカー & API セットアップガイド

日本株（東京証券取引所 / JPX）の自動売買に使用するブローカーとAPIの設定手順。

---

## 推奨ブローカー比較

| ブローカー | API種別 | 日本株 | 単元株 | ペーパー取引 | 月額費用 | 難易度 |
|---|---|---|---|---|---|---|
| **au Kabucom API** | REST + WebSocket | ✅ | 要対応 | ❌ | 無料 | ★★☆ |
| **Interactive Brokers** | REST (Client Portal) | ✅ | 1株から | ✅ | 無料〜 | ★★★ |
| **SBI証券 HYPER SBI 2** | REST (localhost) | ✅ | 要対応 | ❌ | 無料 | ★★☆ |

---

## Option 1: au Kabucom API（推奨）

### 概要
au カブコム証券が提供する個人投資家向け API。「kabuステーション®」ソフトウェアを仲介して REST/WebSocket 経由で注文を出す。Node.js から HTTP リクエストで利用可能。

- **公式サイト**: https://kabucom.github.io/kabusapi/ptal/
- **API ドキュメント**: https://kabucom.github.io/kabusapi/ptal/
- **GitHub サンプル**: https://github.com/kabucom/kabusapi

### 特徴
- ローカルマシン（kabuステーション®動作中）から `localhost:18080` で接続
- REST API (OpenAPI 3.0 仕様) + WebSocket (リアルタイム配信)
- 日本株・先物・FX に対応
- **無料** （au カブコム証券口座が必要）
- **注意**: kabuステーション® のデスクトップアプリが常時起動している必要あり → AWS Lambda への直接移行は不可（ローカル経由 or Proxy 構成が必要）

### セットアップ手順

#### 1. 口座開設
1. [au カブコム証券](https://kabu.com/) で口座を開設（無料）
2. 本人確認書類のアップロード → 審査（数日）
3. 初回入金（最低額なし）

#### 2. kabuステーション® のインストール
1. [kabuステーション® ダウンロード](https://kabu.com/kabustation/kabustation/) からインストール
2. Windows 必須（Linux/Mac 非対応）
   - Ubuntu Server から使う場合は Windows VM (VirtualBox/KVM) を用意するか Wine を試用
   - Docker コンテナではなく、ホスト OS または別 VM で動かす

#### 3. API Token の取得
```bash
# kabuステーション® 起動後、以下のエンドポイントでトークン取得
curl -X POST http://localhost:18080/kabusapi/token \
  -H "Content-Type: application/json" \
  -d '{"APIPassword": "YOUR_API_PASSWORD"}'

# Response: {"Token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
```

#### 4. 環境変数の設定
```env
# .env
KABUCOM_API_URL=http://localhost:18080/kabusapi
KABUCOM_API_PASSWORD=your_api_password
KABUCOM_API_TOKEN=           # 自動更新するため初期値空でOK
PAPER_TRADE=true             # 初期は必ずtrue
```

### 主要 API エンドポイント

| エンドポイント | メソッド | 説明 |
|---|---|---|
| `/token` | POST | APIトークン取得 |
| `/sendorder` | POST | 注文発注（現物・信用） |
| `/cancelorder` | PUT | 注文取消 |
| `/positions` | GET | 保有銘柄・ポジション取得 |
| `/wallet/cash` | GET | 現金残高取得 |
| `/wallet/margin` | GET | 信用建余力取得 |
| `/orders` | GET | 注文一覧取得 |
| `/symbol/{symbol}@{exchange}` | GET | 銘柄情報取得 |
| `/board/{symbol}@{exchange}` | GET | 時価情報（板情報）取得 |

### Node.js コード例

```typescript
// src/services/traders/jp-trader.ts

const BASE_URL = process.env.KABUCOM_API_URL ?? 'http://localhost:18080/kabusapi';

// APIトークン取得
async function getToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ APIPassword: process.env.KABUCOM_API_PASSWORD }),
  });
  const data = await res.json() as { Token: string };
  return data.Token;
}

// 現物買い注文
async function placeOrder(params: {
  ticker: string;   // 例: "7203"（.T なしの4桁コード）
  quantity: number; // 単元株数（トヨタは100株単位）
  price?: number;   // 成行の場合は省略
}): Promise<string> {
  const token = await getToken();

  const body = {
    Password: process.env.KABUCOM_ACCOUNT_PASSWORD,
    Symbol: params.ticker,
    Exchange: 1,          // 1=東証, 3=名証, 5=福証, 6=札証
    SecurityType: 1,      // 1=株式
    Side: '2',            // '1'=売, '2'=買
    CashMargin: 1,        // 1=現物, 2=信用新規
    DelivType: 2,         // 2=自動振替
    AccountType: 2,       // 2=一般, 4=特定, 12=NISA
    Qty: params.quantity,
    FrontOrderType: params.price ? 20 : 10, // 10=成行, 20=指値
    Price: params.price ?? 0,
    ExpireDay: 0,         // 0=当日
  };

  const res = await fetch(`${BASE_URL}/sendorder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': token,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { OrderId: string };
  return data.OrderId;
}
```

### 注意事項
- **単元株**: 日本株は銘柄ごとに売買単位が異なる（多くは100株単位）。`/symbol` API で `TradUnit` を確認
- **取引時間**: 東証は平日 9:00〜11:30 / 12:30〜15:30（JST）
- **kabuステーション® 常時起動**: API はローカルアプリ経由のため、サーバー移行時は Proxy 構成が必要

---

## Option 2: Interactive Brokers (IBKR) Client Portal API

### 概要
インタラクティブ・ブローカーズの Client Portal Web API。日本株・米国株・香港株すべてを **1 つの API で管理可能**。日本居住者対応済み。

- **公式サイト**: https://www.interactivebrokers.co.jp/
- **API ドキュメント**: https://ibkrcampus.com/ibkr-api-page/cpapi-v1/
- **Client Portal Gateway**: https://github.com/InteractiveBrokers/cpwebapi

### 特徴
- REST API（JSON）
- Client Portal Gateway（Javaアプリ）をローカルで動かし、`https://localhost:5000` で接続
- Paper Trading（模擬取引）口座あり → **`PAPER_TRADE=true` で即利用可能**
- 日本株 (TSE)・米国株 (NYSE/NASDAQ)・香港株 (HKEX) すべて対応
- **最低預入**: 約 $10,000 USD 相当（個人口座）

### セットアップ手順

#### 1. 口座開設
1. [IBKR 日本語ページ](https://www.interactivebrokers.co.jp/ja/home.php) からオンライン口座開設
2. 日本居住者として申請（日本語サポートあり）
3. 本人確認 + 資産証明書類の提出
4. **Paper Trading 口座**は審査後すぐ利用可能（実際の入金不要）

#### 2. Client Portal Gateway のセットアップ
```bash
# Java 11+ が必要
java -version

# Client Portal Gateway ダウンロード (IBKRサイトから)
# または GitHub: https://github.com/InteractiveBrokers/cpwebapi
wget https://download2.interactivebrokers.com/portal/clientportal.gw.zip
unzip clientportal.gw.zip
cd clientportal.gw

# 起動
bin/run.sh root/conf.yaml
# または Docker で起動:
# docker run -p 5000:5000 ghcr.io/samgozman/go-ibkr-portal:latest
```

#### 3. 環境変数の設定
```env
# .env
IBKR_BASE_URL=https://localhost:5000/v1/api
IBKR_ACCOUNT_ID=YOUR_ACCOUNT_ID    # Paper: U1234567P, Live: U1234567
PAPER_TRADE=true
```

### 主要 API エンドポイント

| エンドポイント | メソッド | 説明 |
|---|---|---|
| `/iserver/auth/status` | GET | 認証状態確認 |
| `/iserver/reauthenticate` | POST | 再認証 |
| `/iserver/account` | GET | 口座情報 |
| `/iserver/accounts` | GET | 全口座一覧 |
| `/iserver/account/orders` | POST | 注文発注 |
| `/iserver/account/order/{orderId}` | DELETE | 注文取消 |
| `/iserver/account/trades` | GET | 約定一覧 |
| `/portfolio/{accountId}/positions` | GET | ポジション取得 |
| `/portfolio/{accountId}/summary` | GET | 残高・証拠金サマリー |
| `/iserver/contract/{conid}/info` | GET | 銘柄情報（conid使用） |
| `/iserver/secdef/search` | POST | 銘柄検索（symbolからconid取得） |
| `/iserver/marketdata/snapshot` | GET | リアルタイム気配値 |

### Node.js コード例

```typescript
// src/services/traders/ibkr-client.ts
// 注意: Client Portal Gateway の SSL は自己署名証明書 → NODE_TLS_REJECT_UNAUTHORIZED=0 が必要

const BASE_URL = process.env.IBKR_BASE_URL ?? 'https://localhost:5000/v1/api';

// conid検索（銘柄シンボルから内部IDを取得）
async function findConid(symbol: string, exchange: 'TSE' | 'NYSE' | 'NASDAQ' | 'HKEX'): Promise<number> {
  const res = await fetch(`${BASE_URL}/iserver/secdef/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, secType: 'STK', exchange }),
  });
  const data = await res.json() as Array<{ conid: number }>;
  return data[0].conid;
}

// 注文発注（日本株の例: トヨタ = TSE）
async function placeOrder(params: {
  conid: number;
  side: 'BUY' | 'SELL';
  quantity: number;
  orderType: 'MKT' | 'LMT';
  price?: number;
}): Promise<string> {
  const accountId = process.env.IBKR_ACCOUNT_ID;
  const body = {
    orders: [{
      conid: params.conid,
      side: params.side,
      quantity: params.quantity,
      orderType: params.orderType,
      price: params.price,
      tif: 'DAY',          // Time in Force: DAY=当日, GTC=無期限
      cOID: `order-${Date.now()}`,  // クライアント注文ID
    }],
  };

  const res = await fetch(`${BASE_URL}/iserver/account/${accountId}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as Array<{ order_id: string }>;
  return data[0].order_id;
}
```

### 日本株 conid の調べ方
```bash
# トヨタ自動車 (7203) の conid を検索
curl -k -X POST https://localhost:5000/v1/api/iserver/secdef/search \
  -H "Content-Type: application/json" \
  -d '{"symbol": "7203", "secType": "STK", "exchange": "TSE"}'
```

---

## Option 3: SBI証券 HYPER SBI 2 API

### 概要
SBI証券（sbisec.co.jp）が提供する個人投資家向けデスクトップアプリ「HYPER SBI 2」に内蔵された REST API。
**au Kabucom の kabuステーション® と同様の構成** — デスクトップアプリを経由して `localhost` に接続する。

> ⚠️ **SBI ネオトレード証券（sbineotrade.jp）とは別会社・別 API**
> SBI グループ内の別子会社です。本セクションは **SBI証券（sbisec.co.jp）の HYPER SBI 2** について説明します。

- **公式サイト**: https://www.sbisec.co.jp/
- **HYPER SBI 2 紹介ページ**: https://go.sbisec.co.jp/lp/lp_hyper_sbi2_211112_feature.html
- **操作ガイド**: https://search.sbisec.co.jp/v2/popwin/guide/tool/hyper_sbi_2/

### 特徴

| 項目 | 詳細 |
|------|------|
| 接続方式 | HYPER SBI 2 起動中のみ `localhost:{port}` 経由で REST API 利用可能 |
| 対応 OS | Windows / Mac（au kabuステーション® は Windows のみ — SBI の方が有利） |
| 認証 | HYPER SBI 2 アプリへのログインセッション経由（API キー方式ではない） |
| 公式 SDK | Python のみ（Node.js / TypeScript 向け公式 SDK・npm パッケージなし） |
| 対応取引 | 現物取引・信用取引・PTS・SOR |
| API利用申請 | 要申請（SBI証券口座開設後、HYPER SBI 2 から申請） |
| 費用 | 無料（SBI証券口座が必要） |

### ⚠️ 重要な制約：サーバー環境では使用不可

HYPER SBI 2 API は **GUI デスクトップアプリが起動していること** を前提とします。

```
[ HYPER SBI 2 デスクトップアプリ (Windows/Mac) ]
       ↓ localhost:{port} (REST API)
[ algo-trade-bot (Node.js) ]  ← ローカル開発専用
```

このため以下は **不可能**:
- AWS Lambda / EC2 / Docker コンテナへの直接デプロイ
- ヘッドレスサーバー（Ubuntu Server 等）での単独動作

**AWS 本番環境への移行が前提のこのプロジェクトでは、au Kabucom API または IBKR を主ブローカーとして推奨します。**
HYPER SBI 2 は **ローカル開発・検証環境専用** として利用してください。

### セットアップ手順

#### 1. 口座開設
1. [SBI証券](https://www.sbisec.co.jp/) でオンライン口座開設（無料）
2. 本人確認書類のアップロード → 審査（数日〜1週間）
3. 初回入金

#### 2. HYPER SBI 2 のインストール
1. [HYPER SBI 2 ダウンロードページ](https://go.sbisec.co.jp/lp/lp_hyper_sbi2_211112_download.html) からインストール
2. Windows または Mac にインストール（どちらも対応）
3. SBI証券アカウントでログイン

#### 3. API 利用申請
1. HYPER SBI 2 を起動
2. メニューから「API 利用申請」を選択し申請
3. 申請承認後、API が有効化される

#### 4. 環境変数の設定
```env
# .env
SBI_API_URL=http://localhost:18888   # 実際のポートは HYPER SBI 2 の設定を確認
SBI_API_PASSWORD=your_api_password
SBI_ACCOUNT_PASSWORD=your_order_password  # 発注用パスワード
PAPER_TRADE=true                          # 初期は必ず true
```

> 📌 **ポート番号について**: HYPER SBI 2 のポートは公式ドキュメントに明記されていません。
> HYPER SBI 2 起動後、アプリ内の「設定」または公式サポートでポート番号を確認してください。
> （kabuステーション® は `18080` を使用するため、参考値として `18888` を記載しています）

### Node.js コード例

```typescript
// src/services/traders/sbi-client.ts
// ⚠️ ローカル開発専用 — HYPER SBI 2 デスクトップアプリ起動中のみ動作

const BASE_URL = process.env.SBI_API_URL ?? 'http://localhost:18888';

// APIトークン取得（kabuステーション® と同様のパターンと想定）
async function getToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ APIPassword: process.env.SBI_API_PASSWORD }),
  });
  if (!res.ok) throw new Error(`SBI token error: ${res.status}`);
  const data = await res.json() as { Token: string };
  return data.Token;
}

// 現物買い注文
async function placeOrder(params: {
  ticker: string;   // 例: '7203'（4桁コード、.T なし）
  quantity: number; // 単元株数
  price?: number;   // 省略時は成行
}): Promise<string> {
  const token = await getToken();

  const body = {
    Password: process.env.SBI_ACCOUNT_PASSWORD,
    Symbol: params.ticker,
    Exchange: 1,         // 1=東証
    Side: '2',           // '1'=売, '2'=買
    CashMargin: 1,       // 1=現物
    Qty: params.quantity,
    FrontOrderType: params.price ? 20 : 10, // 10=成行, 20=指値
    Price: params.price ?? 0,
    ExpireDay: 0,        // 0=当日
  };

  const res = await fetch(`${BASE_URL}/sendorder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': token,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`SBI order error: ${res.status}`);
  const data = await res.json() as { OrderId: string };
  return data.OrderId;
}
```

> ⚠️ **注意**: 上記コード例は kabuステーション® API の構造を参考にした推定実装です。
> HYPER SBI 2 の実際のエンドポイント・リクエスト形式は、API 申請承認後に HYPER SBI 2 内の公式ドキュメントで確認してください。
> 公式 Python SDK のコードを参照すると実際のエンドポイント仕様を確認できます。

### AWS SSM パラメータ（ローカル proxy 経由で使う場合）

```bash
# AWS SSM Parameter Store（ローカル Proxy サーバー経由で SBI API を公開する構成の場合）
aws ssm put-parameter --name /algo-trade/SBI_API_PASSWORD \
  --value 'YOUR_API_PASSWORD' --type SecureString
aws ssm put-parameter --name /algo-trade/SBI_ACCOUNT_PASSWORD \
  --value 'YOUR_ORDER_PASSWORD' --type SecureString
aws ssm put-parameter --name /algo-trade/SBI_API_URL \
  --value 'http://YOUR_LOCAL_PROXY:18888' --type String
```

### au Kabucom API との比較

| 比較項目 | HYPER SBI 2 (SBI証券) | au Kabucom API |
|---------|----------------------|----------------|
| 対応 OS | Windows / Mac ✅ | Windows のみ ⚠️ |
| npm パッケージ | なし | なし |
| 公式 Node.js SDK | なし | なし |
| AWS Lambda 直接利用 | ❌ 不可 | ❌ 不可 |
| ドキュメント | 承認後のみ閲覧可 | 公開 (OpenAPI 3.0) |
| ペーパートレード | ❌ | ❌ |
| 推奨用途 | ローカル検証 | ローカル本番 |
---

## 銘柄コード (ティッカー) 形式

| 取引所 | 形式 | 例 |
|--------|------|-----|
| 東証プライム | `{4桁コード}.T` | `7203.T`（トヨタ）|
| 東証スタンダード | `{4桁コード}.T` | `3197.T`（すかいらーく）|
| 東証グロース | `{4桁コード}.T` | `4385.T`（メルカリ）|

### yahoo-finance2 での取得例
```typescript
import yahooFinance from 'yahoo-finance2';

// トヨタ自動車の株価取得
const quote = await yahooFinance.quote('7203.T');
console.log(quote.regularMarketPrice); // 例: 2850 (JPY)

// OHLCV データ取得（過去30日）
const history = await yahooFinance.chart('7203.T', {
  period1: '2026-01-01',
  period2: '2026-01-31',
  interval: '1d',
});
```

---

## J-Quants API（JPX 公式データ）

JPX（日本取引所グループ）が提供する公式マーケットデータ API。無料プランあり。

- **公式サイト**: https://jpx-jquants.com/
- **API ドキュメント**: https://jpx-jquants.com/document.html

### 無料プランの制限
| 項目 | 無料 (Free) | 有料 (Light/Standard) |
|------|------------|----------------------|
| 日足データ | 12週分 | 過去全データ |
| 財務情報 | ❌ | ✅ |
| リアルタイム | ❌ | ✅ |

### Node.js での利用
```typescript
// J-Quants API は公式 npm パッケージなし → 直接 REST 呼び出し
const JQUANTS_BASE = 'https://api.jquants.com/v1';

// 認証トークン取得
async function getJQuantsToken(email: string, password: string): Promise<string> {
  // Step 1: Refresh token
  const refreshRes = await fetch(`${JQUANTS_BASE}/token/auth_user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mailaddress: email, password }),
  });
  const { refreshToken } = await refreshRes.json() as { refreshToken: string };

  // Step 2: ID token
  const idRes = await fetch(`${JQUANTS_BASE}/token/auth_refresh?refreshtoken=${refreshToken}`, {
    method: 'POST',
  });
  const { idToken } = await idRes.json() as { idToken: string };
  return idToken;
}

// 日足データ取得
async function getDailyOHLCV(code: string, date: string, token: string) {
  const res = await fetch(`${JQUANTS_BASE}/prices/daily_quotes?code=${code}&date=${date}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return res.json();
}
```

---

## マーケット時間対応スケジューラー

```typescript
// src/jobs/market-scheduler.ts
// 東証の取引時間に合わせてジョブをスケジュール

import { CronJob } from 'cron';

// 前場 (9:00 - 11:30 JST)
const morningSession = new CronJob(
  '0 9 * * 1-5',  // 月〜金 9:00 JST
  () => runJPAnalysis(),
  null, true, 'Asia/Tokyo'
);

// 後場 (12:30 - 15:30 JST)
const afternoonSession = new CronJob(
  '30 12 * * 1-5',  // 月〜金 12:30 JST
  () => runJPAnalysis(),
  null, true, 'Asia/Tokyo'
);
```

---

## 免責事項

本ドキュメントは情報提供のみを目的としています。API の利用規約や料金体系は変更される場合があります。必ず各ブローカーの最新ドキュメントを確認してください。投資には元本割れのリスクがあります。本システムを使用した投資判断に関して、開発者は一切の責任を負いません。まずは**ペーパートレード**での十分な検証を行ってください。
