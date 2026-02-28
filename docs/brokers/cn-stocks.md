# 🇨🇳 中国株・香港株 ブローカー & API セットアップガイド

中国本土株（上海・深圳 A 株）および香港株（H 株・レッドチップ）の自動売買に使用するブローカーとAPIの設定手順。

---

## 市場概要

| 市場 | 取引所 | ティッカー形式 | 主要銘柄 | 通貨 |
|------|-------|--------------|---------|------|
| 上海A株 | SSE (上海証券取引所) | `600519.SS` | 貴州茅台、中国平安 | CNY |
| 深圳A株 | SZSE (深圳証券取引所) | `000858.SZ`, `002594.SZ` | BYD、万科 | CNY |
| 香港H株 | HKEX (香港取引所) | `0700.HK` | テンセント、アリババ | HKD |

### 日本居住者のアクセス方法
- **香港株 (H株)**: 直接投資可能（IBKR / Futu経由）
- **A株（本土）**: 「Stock Connect（沪港通・深港通）」を通じて間接的に投資可能
  - 香港〜上海: **滬港通（フーガントン）**
  - 香港〜深圳: **深港通（シェンガントン）**

---

## 推奨ブローカー比較

| ブローカー | API種別 | HK株 | A株(Stock Connect) | 日本居住者 | ペーパー取引 |
|---|---|---|---|---|---|
| **Futu OpenAPI** | REST + WebSocket | ✅ | ✅ | ✅ | ✅ |
| **Interactive Brokers** | REST (Client Portal) | ✅ | ✅ | ✅ | ✅ |
| Tiger Brokers (老虎証券) | REST | ✅ | ✅ | △ | ✅ |

---

## Option 1: Futu OpenAPI（富途牛牛 / Moomoo）（推奨）

### 概要
富途控股（Futu Holdings）が提供する証券 API。Moomoo（日本）/ 富途牛牛（中国・HK）ブランドで展開。香港株・A株（Stock Connect）・米国株を1つのAPIで管理可能。日本法人（Moomoo Securities Japan）が存在し、日本居住者対応済み。

- **公式サイト（日本）**: https://www.moomoo.com/jp/
- **Futu OpenAPI ドキュメント**: https://openapi.futunn.com/futu-api-doc/
- **GitHub**: https://github.com/FutunnOpen/py-futu-api（Python SDK）
- **REST API（非公式ラッパー）**: HTTP経由でも利用可能

### 特徴
- REST API + WebSocket（リアルタイム配信）
- **FutuOpenD** デーモンアプリが仲介（kabuステーション® と同様の構成）
- A株（Stock Connect対象銘柄）に対応
- 香港・米国・A株を統一管理
- ペーパートレードあり（Moomoo アプリ内でシミュレーション）
- **公式 JavaScript SDK あり** — `futu-api` npm パッケージ（Node.js 対応）

### セットアップ手順

#### 1. 口座開設
1. [Moomoo（日本）](https://www.moomoo.com/jp/) でオンライン口座開設
2. 本人確認書類（マイナンバーカード / パスポート）+ 住所確認書類
3. 審査後（約1週間）に取引開始可能

#### 2. Futu OpenAPI の申請
1. Moomoo アプリ → 設定 → 開発者向け → OpenAPI → API利用申請
2. 審査（通常数営業日）
3. **API 認証情報** (RSA鍵ペア) を生成・登録

```bash
# RSA鍵ペアの生成
openssl genrsa -out futu_private.pem 2048
openssl rsa -in futu_private.pem -pubout -out futu_public.pem

# 公開鍵 (futu_public.pem) を Moomoo の OpenAPI 設定に登録
```

#### 3. FutuOpenD のインストール
```bash
# Linux/Mac 用 FutuOpenD をダウンロード
# https://openapi.futunn.com/futu-api-doc/intro/download.html
# ダウンロード後、設定ファイル FutuOpenD.xml を編集

# 起動
./FutuOpenD -cfg_file ./FutuOpenD.xml

# デフォルトポート: 11111 (TCP接続)
```

`FutuOpenD.xml` の主要設定:
```xml
<FutuOpenDConfig>
  <login_account>YOUR_MOOMOO_ACCOUNT</login_account>
  <login_pwd_md5>MD5_OF_YOUR_PASSWORD</login_pwd_md5>
  <trade_rsa_file>./futu_private.pem</trade_rsa_file>
  <log_level>LogLevel_Debug</log_level>
  <ip>0.0.0.0</ip>
  <port>11111</port>
  <!-- Paper Trading (HK) -->
  <paper_trade_hk>true</paper_trade_hk>
  <!-- Paper Trading (US) -->
  <paper_trade_us>true</paper_trade_us>
</FutuOpenDConfig>
```

#### 4. 環境変数の設定
```env
# .env
FUTU_HOST=127.0.0.1
FUTU_PORT=11111
FUTU_TRADE_ENV=SIMULATE    # SIMULATE=ペーパー, REAL=本番
FUTU_MARKET=HK             # HK / US / CN
PAPER_TRADE=true
```

### Futu API プロトコル（REST → Node.js）

Futu OpenAPI はネイティブには TCP + Protobuf を使用。Node.js からは以下の方法でアクセス:

**方法 1: 非公式 HTTP ブリッジ**
```bash
# FutuOpenD に HTTP Proxy を立てる場合
# コミュニティ製: https://github.com/dennislwy/futu-openapi-http-bridge
docker run -p 8080:8080 futu-http-bridge:latest --futu-host localhost --futu-port 11111
```

**方法 2: Node.js TCP クライアント（推奨）**
```typescript
// src/services/traders/cn-trader.ts
// Futu API は TCP + Protobuf だが、簡易化のために主要操作のみ実装
import net from 'net';

// 注: 本番実装では futu-api や protobuf ライブラリを使用推奨
const FUTU_HOST = process.env.FUTU_HOST ?? '127.0.0.1';
const FUTU_PORT = parseInt(process.env.FUTU_PORT ?? '11111');

// 香港株の quote 取得（yahooFinance2 経由の方が簡単）
import yahooFinance from 'yahoo-finance2';

async function getHKQuote(ticker: string): Promise<{ price: number; currency: 'HKD' }> {
  // Futu API の代わりに yahoo-finance2 でも HK 株価は取得可能
  const quote = await yahooFinance.quote(ticker); // 例: '0700.HK'
  return {
    price: quote.regularMarketPrice ?? 0,
    currency: 'HKD',
  };
}
```

### 主要 API 機能（Futu OpenAPI）

| 機能 | API名 | 説明 |
|------|-------|------|
| 株価取得 | `Qot_GetBasicQot` | リアルタイム株価・板情報 |
| 履歴データ | `Qot_GetKL` | OHLCV 履歴（K線） |
| 注文発注 | `Trd_PlaceOrder` | 現物・信用注文 |
| 注文状況確認 | `Trd_GetOrderList` | 注文一覧・状況 |
| ポジション取得 | `Trd_GetPositionList` | 保有銘柄 |
| 残高確認 | `Trd_GetFunds` | 現金・証拠金残高 |

---

## Option 2: Interactive Brokers (IBKR)

IBKR は香港株（HKEX直接）と Stock Connect 経由の A 株にも対応。

### HK株 conid の検索
```bash
# テンセント (0700) の conid を検索
curl -k -X POST https://localhost:5000/v1/api/iserver/secdef/search \
  -H "Content-Type: application/json" \
  -d '{"symbol": "0700", "secType": "STK", "exchange": "HKEX"}'
```

### A株（Stock Connect）の conid 検索
```bash
# 貴州茅台 (600519) - 上海 Stock Connect
curl -k -X POST https://localhost:5000/v1/api/iserver/secdef/search \
  -H "Content-Type: application/json" \
  -d '{"symbol": "600519", "secType": "STK", "exchange": "SEHK"}'
# 注: IBKR では Stock Connect A株は SEHK（香港経由）で接続
```

### Node.js コード例

```typescript
// IBKR経由で香港株を購入
async function buyHKStock(
  symbol: string,    // 例: '0700' (テンセント)
  quantity: number,  // 最小単位: 銘柄によって異なる (テンセントは100株単位)
): Promise<string> {
  const conid = await findConid(symbol, 'HKEX');
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
          orderType: 'MKT',
          tif: 'DAY',
          currency: 'HKD',
        }],
      }),
    }
  );
  const [order] = await res.json() as Array<{ order_id: string }>;
  return order.order_id;
}
```

---

## 銘柄コード（ティッカー）形式

### yahoo-finance2 でのアクセス例
```typescript
import yahooFinance from 'yahoo-finance2';

// 香港株 (HKD建て)
const tencent = await yahooFinance.quote('0700.HK');    // テンセント
const hsbc = await yahooFinance.quote('0005.HK');       // HSBC

// 上海A株 (CNY建て)
const moutai = await yahooFinance.quote('600519.SS');   // 貴州茅台
const picc = await yahooFinance.quote('601318.SS');     // 中国平安

// 深圳A株 (CNY建て)
const byd = await yahooFinance.quote('002594.SZ');      // BYD
const wuliangye = await yahooFinance.quote('000858.SZ'); // 五粮液

console.log(tencent.regularMarketPrice);  // 例: 370.6 (HKD)
console.log(moutai.regularMarketPrice);   // 例: 1680 (CNY)
```

---

## 市場時間（JST）

| 市場 | 開場 | 閉場 | 昼休み |
|------|------|------|--------|
| **HKEX（香港）** | 10:30 | 17:00 | 13:00-14:00 |
| **SSE（上海）** | 10:30 | 16:00 | 12:30-14:00 |
| **SZSE（深圳）** | 10:30 | 16:00 | 12:30-14:00 |

> Stock Connect の取引可能時間は香港・本土両市場が開場している時間帯のみ

---

## 通貨換算（JPY基準）

```typescript
// src/lib/currency-converter.ts
// 通貨換算ユーティリティ (JPY基準のP&L計算用)

async function getExchangeRate(from: 'HKD' | 'USD' | 'CNY', to: 'JPY'): Promise<number> {
  const symbol = `${from}${to}=X`;  // 例: 'HKDJPY=X', 'USDX=X'
  const quote = await yahooFinance.quote(symbol);
  return quote.regularMarketPrice ?? 1;
}

// TRADE_ITEM 保存時に PriceJPY を計算
async function calculateJPYValue(price: number, currency: 'HKD' | 'USD' | 'CNY'): Promise<number> {
  if (currency === 'JPY') return price;
  const rate = await getExchangeRate(currency, 'JPY');
  return Math.round(price * rate);
}
```

---

## Stock Connect 投資制限

日本居住者が Stock Connect を通じて A 株に投資する場合の主な制限:

| 項目 | 制限 |
|------|------|
| 1日の総買い制限 (滬股通) | 520億 RMB |
| 1日の総買い制限 (深股通) | 420億 RMB |
| 対象銘柄 | SSE180 / SSE380 / SZSE成分指数など一部銘柄 |
| 非対象銘柄 | STARマーケット銘柄（大部分）, 一部 ST銘柄 |
| 決済サイクル | T+2（香港側は T+1） |

---

## Risk & コンプライアンス注意事項

1. **外国為替規制**: 中国本土A株への投資はStock Connect経由のみ。直接の人民元送金は不可
2. **税務**: 香港株の配当は香港源泉徴収税 (10%)、A株の配当は中国所得税 (10%)
3. **Futu/Moomoo アプリ**: API利用には通常の口座開設 + OpenAPI申請が必要（審査あり）
4. **FutuOpenD 常時起動**: kabuステーション® 同様、デーモンプロセスの常時起動が必要

---

## 免責事項

中国株・香港株への投資は通貨リスク・カントリーリスク・法制度リスクを伴います。本ドキュメントは情報提供目的のみです。投資には元本割れのリスクがあります。まずは**ペーパートレード**での十分な検証を行ってください。
