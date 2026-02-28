# Decisions — trading-bot

## [2026-02-28] 初期アーキテクチャ決定

### D-001: 実行順序
動くプロトタイプ優先 → テストカバレッジで品質担保
- Phase 1〜6: 実装優先（テストは最小限）
- Phase 7: テストカバレッジ集中フェーズ
- Phase 8: AWS移行準備

### D-002: AIモデル選択ロジック
```
conf <= 0.7: Gemini 2.0 Flash のみ（低コスト）
conf > 0.7 AND マーケットデータあり: Gemini 2.5 Pro（高精度）
conf > 0.8: 注文実行
```

### D-003: 対象資産
両方対応:
- 暗号資産: ccxt（Binance/Bybit）
- 株式・ETF: yahoo-finance2

### D-004: ペーパートレードモード
`PAPER_TRADE=true` 環境変数で注文をシミュレーション（実際には発注しない）
本番移行時は `PAPER_TRADE=false` に変更するだけ
