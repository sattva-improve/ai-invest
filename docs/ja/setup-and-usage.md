# AIアルゴリズム取引ボット — セットアップ・使用ガイド

## 1. 概要

RSSフィード（定性情報）と取引所マーケットデータ（定量情報）を組み合わせ、Google Gemini LLMで投資判断を自動化するシステムです。分析結果は構造化JSONとして生成され、確信度が閾値を超えた場合のみ暗号資産取引所へ自動発注します。

**主な特徴:**

| 特徴 | 内容 |
| :--- | :--- |
| マルチソース分析 | RSSニュース + リアルタイム価格データ + RSI指標を統合 |
| AI構造化出力 | Vercel AI SDK `generateObject()` + Zod で型安全なシグナル生成 |
| コスト最適AI | 高頻度分析は Gemini 2.0 Flash、重要判断は Gemini 2.5 Pro |
| 冪等性保証 | DynamoDB チェックで同一ニュースへの重複発注を防止 |
| Lambda対応 | ハンドラーパターンにより、コード変更なしで AWS Lambda へ移行可能 |
| ペーパートレード | `PAPER_TRADE=true` で資金を動かさずに動作検証 |

---

## 2. 前提条件

ローカル開発を始める前に、以下を準備してください。

- **Node.js v22+** — [公式サイト](https://nodejs.org/) からインストール
- **Docker & Docker Compose v2** — DynamoDB Local と Redis の起動に使用
- **Google Gemini APIキー** — [Google AI Studio](https://aistudio.google.com/) で取得
- **取引所 APIキー** — 実取引を行う場合のみ（まずはペーパートレードで動作確認推奨）

---

## 3. クイックスタート

5ステップでローカル環境を立ち上げられます。

```bash
# 1. リポジトリをクローン
git clone <repository-url>
cd investment-agent

# 2. 依存パッケージをインストール
npm install

# 3. 環境変数ファイルを用意して GOOGLE_GENERATIVE_AI_API_KEY を設定
cp .env.example .env

# 4. DynamoDB Local + Redis を起動
docker compose up -d

# 5. DBテーブルを初期化して開発サーバーを起動
npm run db:init && npm run dev
```

> ⚠️ **注意**: 初回は必ず `npm run db:init` を実行してください。テーブルが存在しない場合、起動時にエラーになります。

---

## 4. 詳細セットアップ

### 4-1. リポジトリのクローンと依存インストール

```bash
git clone <repository-url>
cd investment-agent
npm install
```

### 4-2. 環境変数の設定

`.env.example` をコピーして `.env` を作成します。

```bash
cp .env.example .env
```

`.env` を開き、最低限以下の値を設定してください。

```env
# AI (必須)
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key_here

# 取引所 (実取引時のみ)
EXCHANGE_ID=binance
EXCHANGE_API_KEY=your_exchange_api_key_here
EXCHANGE_SECRET=your_exchange_secret_here

# DynamoDB Local (ローカル開発はデフォルトのまま)
DYNAMODB_ENDPOINT=http://localhost:8000
DYNAMODB_REGION=ap-northeast-1
DYNAMODB_TABLE_NAME=InvestmentTable

# Redis (ローカル開発はデフォルトのまま)
REDIS_URL=redis://localhost:6379

# アプリ設定
NODE_ENV=development
LOG_LEVEL=info
PAPER_TRADE=true          # まずは true で動作確認
CONFIDENCE_THRESHOLD=0.8  # この確信度を超えた場合のみ発注
```

各変数の詳細説明は「[7. 環境変数リファレンス](#7-環境変数リファレンス)」を参照してください。

### 4-3. Dockerインフラの起動

```bash
docker compose up -d
```

起動後、以下のサービスが使えます。

| サービス | URL / ポート | 用途 |
| :--- | :--- | :--- |
| DynamoDB Local | `localhost:8000` | データストア本体 |
| DynamoDB Admin UI | `http://localhost:8001` | テーブルの中身をブラウザで確認 |
| Redis (Valkey) | `localhost:6379` | BullMQ ジョブキュー & キャッシュ |

コンテナの状態は `docker compose ps` で確認できます。

### 4-4. DBテーブルの初期化

```bash
npm run db:init
```

`InvestmentTable` と GSI `TypeIndex` を作成します。初回起動時と、テーブルをリセットしたいときに実行してください。

---

## 5. 開発ガイド

### 開発サーバーの起動

```bash
npm run dev
```

`tsx watch` でソースコードの変更を監視し、自動再起動します。ログは pino によって JSON 形式で出力されます（`LOG_LEVEL=info` で制御）。

### コマンド一覧

| コマンド | 説明 |
| :--- | :--- |
| `npm run dev` | 開発モード起動（watchモード） |
| `npm run build` | TypeScript をコンパイルして `dist/` を生成 |
| `npm run test` | Vitest でテストを1回実行 |
| `npm run test:watch` | Vitest をウォッチモードで実行 |
| `npm run lint` | Biome で静的解析 |
| `npm run format` | Biome でコードを整形 |
| `npm run check` | Biome で lint + format を一括実行（コミット前推奨） |
| `npm run db:init` | DynamoDB テーブルを初期化 |

### Lint・フォーマット

このプロジェクトは ESLint / Prettier の代わりに **[Biome](https://biomejs.dev/)** を採用しています。

```bash
# コミット前に実行することを推奨
npm run check
```

CI で `npm run lint` がエラーになると、警告レベルが `warning` 以上のコードはコミットできません。`info` / `hint` のみ許容されます。

---

## 6. アーキテクチャ概要

### データフロー

```
スケジューラー
    ↓ 定期実行トリガー
Fetcher
    ├─ RSS フィードからニュースを取得
    └─ 取引所 API から価格・テクニカル指標を取得
    ↓
DynamoDB で冪等性チェック（処理済み記事はスキップ）
    ↓ 新着あり
AI Agent (Gemini)
    ↓ JSON { ticker, action, conf, sentiment }
DynamoDB に分析結果を保存
    ↓ conf > 0.8 のみ
Trader
    ├─ 残高確認
    ├─ 注文発行
    └─ 取引履歴を DynamoDB に保存
```

### AIモデル選択ロジック

コストと精度のトレードオフを自動管理します。

| 条件 | 使用モデル | 理由 |
| :--- | :--- | :--- |
| 確信度 ≤ 0.7 | Gemini 2.0 Flash | 低コスト・高頻度処理向き |
| 確信度 > 0.7 かつマーケットデータあり | Gemini 2.5 Pro | 高精度な最終判断 |
| 確信度 > 0.8 | 発注実行 | このラインを超えた場合のみ取引 |

### ペーパートレードモード

`.env` の `PAPER_TRADE=true` にすると、発注処理はシミュレーションになります。実際の資金は動かず、注文内容だけログに記録されます。本番移行時は `PAPER_TRADE=false` に変更するだけです。

> ⚠️ **警告**: 本番移行前に、必ず取引所アカウントの **Withdrawal（出金）権限を無効** にしてください。APIキーの漏洩リスクを最小化するためです。

---

## 7. 環境変数リファレンス

| 変数名 | 説明 | デフォルト値 | 必須 |
| :--- | :--- | :--- | :---: |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API キー | — | ✅ |
| `EXCHANGE_ID` | 取引所 ID（`binance`, `bybit` 等） | `binance` | ✅ |
| `EXCHANGE_API_KEY` | 取引所の API キー | — | 実取引時 |
| `EXCHANGE_SECRET` | 取引所のシークレット | — | 実取引時 |
| `DYNAMODB_ENDPOINT` | DynamoDB 接続先（ローカルは `http://localhost:8000`） | — | ✅ |
| `DYNAMODB_REGION` | AWS リージョン | `ap-northeast-1` | ✅ |
| `DYNAMODB_TABLE_NAME` | テーブル名 | `InvestmentTable` | ✅ |
| `REDIS_URL` | Redis 接続 URL | `redis://localhost:6379` | ✅ |
| `NODE_ENV` | 実行環境（`development` / `production`） | `development` | ✅ |
| `LOG_LEVEL` | ログレベル（`info`, `debug`, `warn` 等） | `info` | — |
| `PAPER_TRADE` | ペーパートレードモード（`true` で発注無効） | `true` | ✅ |
| `CONFIDENCE_THRESHOLD` | 発注を行う確信度の閾値 | `0.8` | — |

---

## 8. データベース設計

DynamoDB **シングルテーブル設計** を採用しています。テーブル名は `InvestmentTable` です。

### テーブル構造

| エンティティ | PK | SK | 主要フィールド |
| :--- | :--- | :--- | :--- |
| `NEWS_ITEM` | `NEWS` | `TIMESTAMP#UUID` | Title, Url, Sentiment (-1.0〜1.0) |
| `TRADE_ITEM` | `TRADE` | `TIMESTAMP#ORDER_ID` | Ticker, Side, Price, Profit |
| `STATE_ITEM` | `STATE` | `LATEST` | LastRun, Balance |

### GSI (Global Secondary Index)

| インデックス名 | Hash Key | Range Key | 用途 |
| :--- | :--- | :--- | :--- |
| `TypeIndex` | `type` | `SK` | エンティティ種別によるフィルタリング |

### データ例

```json
// NEWS_ITEM
{
  "PK": "NEWS",
  "SK": "2026-02-28T12:00:00Z#uuid-xxxx",
  "type": "NEWS_ITEM",
  "Title": "Bitcoin breaks $100K",
  "Url": "https://example.com/news/1",
  "Sentiment": 0.85
}

// TRADE_ITEM
{
  "PK": "TRADE",
  "SK": "2026-02-28T12:05:00Z#order-yyyy",
  "type": "TRADE_ITEM",
  "Ticker": "BTC/USDT",
  "Side": "BUY",
  "Price": 100000,
  "Profit": null
}
```

---

## 9. テスト

### テストの実行

```bash
# 全テストを1回実行
npm run test

# ウォッチモード（開発中に継続実行）
npm run test:watch
```

テストフレームワークは **Vitest** です。

### 環境変数のモック

テストは `src/config/env.ts` をモックしています。新しい必須環境変数を追加した場合、**テスト内の env モックも更新**してください。更新しないとテストが `process.env` の読み取りに失敗します。

```typescript
// テストファイル内のモック例
vi.mock("../config/env", () => ({
  config: {
    googleApiKey: "test-key",
    // 新しい変数をここに追加
  },
}));
```

---

## 10. AWS デプロイ（概要）

本システムはローカルの Docker 環境から、**コード変更なし**で AWS Serverless 構成へ移行できます。

### 移行ステップ（概要）

1. **DynamoDB テーブル作成** — `InvestmentTable` + GSI `TypeIndex`
2. **SSM Parameter Store** — APIキーを `SecureString` で保管（ハードコード禁止）
3. **Lambda 関数作成** — 以下の3関数をデプロイ

   | 関数名 | ハンドラー | タイムアウト |
   | :--- | :--- | :--- |
   | `algo-trade-fetch-news` | `dist/handlers/fetch-news.handler` | 60秒 |
   | `algo-trade-fetch-price` | `dist/handlers/fetch-price.handler` | 30秒 |
   | `algo-trade-execute-trade` | `dist/handlers/execute-trade.handler` | 30秒 |

4. **EventBridge スケジュール** — ニュース取得: 1時間毎、価格取得: 5分毎
5. **Step Functions** — `fetch-news → 判断 → execute-trade` のパイプラインを定義
6. **Lambda 環境変数** — `NODE_ENV=production`, `PAPER_TRADE=true`（初回は必ずペーパー）を設定

詳細な手順とコマンドは **[docs/deployment/aws-setup.md](../deployment/aws-setup.md)** を参照してください。

---

## 11. トラブルシューティング

### DynamoDB Local が応答しない

```bash
# コンテナの状態を確認
docker compose ps

# ログを確認
docker compose logs dynamodb-local

# コンテナを再起動
docker compose restart dynamodb-local
```

管理UIが表示されない場合は `http://localhost:8001` にアクセスし、`DYNAMO_ENDPOINT` の設定を確認してください。

### Redis に接続できない

```bash
docker compose logs redis

# Redis CLI で接続テスト
docker compose exec redis redis-cli ping
# -> PONG が返れば正常
```

`.env` の `REDIS_URL` が `redis://localhost:6379` になっているか確認してください。

### テストで Gemini APIキーのバリデーションエラーが出る

テストは `src/config/env.ts` をモックしているため、実際の APIキーは不要です。エラーが出る場合、テストファイル内のモックに新しく追加した環境変数が反映されていない可能性があります。該当テストのモック定義を更新してください。

### `npm run lint` がエラーになる

```bash
# 自動修正を試みる
npm run check

# それでも残るエラーはコードの修正が必要
npm run lint
```

Biome は `npx biome` または `npm run lint` 経由で実行してください。システムの PATH に `biome` コマンドは存在しません。

### `npm run db:init` が失敗する

DynamoDB Local が起動しているか確認してください。

```bash
docker compose up -d
docker compose ps  # dynamodb-local が Up になっていることを確認
npm run db:init
```

---

## 12. 免責事項

> ⚠️ **重要**: 本ソフトウェアは**教育および実験目的**で作成されています。

暗号資産・株式・ETF を含む全資産クラスへの投資によって生じた損失について、開発者は一切の責任を負いません。

**本番運用前に必ず確認すること:**

- [ ] `PAPER_TRADE=true` で十分な期間の動作検証を行う
- [ ] 取引所アカウントの **Withdrawal（出金）権限を無効** にする
- [ ] APIキーは `.env` に記載し、絶対にコードにハードコードしない
- [ ] 少額から段階的に運用を始める

実際の資金を動かす前に、**必ずペーパートレードで動作を確認**してください。
