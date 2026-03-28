Prompt for opencode 2026/03/26
===

## BedrockからGithub Copilotへの移行

```markdown:prompt
# Background
- 現在、システムではAmazon Bedrockを使用して投資判断をしようとしています。
- しかし、AWS側の事情なのかBedrockの使用許可が降りませんでした。
- Bedrockではなく、Github CopilotのModelを使用して投資判断を行おうと考えています。

# Result
- 投資判断を行うAIモデルをBedrockからGitHub Copilotのモデルに変更すること。
- step functionの動作確認を行うこと。

# Request
- コードを修正して、投資判断を行うAIモデルをBedrockからGitHub Copilotのモデルに変更してください。

# Restrict
- 投資の判断履歴を機械学習で、AIモデルに学習させようとしていましたが、この試みは廃止します。
    - RSSフィードをAIモデルに入力して、単純な判断をAIモデルに委ねます。
- Bedrockや機械学習に関するコード、および、リソースは削除してください。
    - コスト削減の観点からもAWSリソースも削除してほしいです。
- GitHub Copilotは、Personal tokenを使用して使用したいと考えています。
    - 必要な設定は.envに設定するようにしてください。
```