# LT スライドジェネレータ

LT会（ライトニングトーク）のタイムテーブル用に、**16:9** の画像を自動生成します。

- 発表者1名ごとの個別カード画像（`slides/per-talk/`）
- 全体タイムテーブル画像（`slides/timetable.png`）

HTML + CSS + JSON でデザインし、Node.js（Puppeteer-core / Google Chrome）で PNG 化します。
見た目は **ライト×ミニマル**、背景は白〜淡グレー、アクセントは1色です。

## 必要環境
- Node.js 18 以上（動作確認: v20）
- Google Chrome（自動検出: `/usr/bin/google-chrome`。別の場所なら環境変数 `CHROME_PATH` で指定）

## セットアップ

```bash
npm install
```

## 使い方

データ `data/schedule.json`（と必要に応じて `data/config.json`）を編集してから実行します。

```bash
npm run generate
# もしくは
node generate.js
```

出力:
```
slides/per-talk/01_bababa@LT.png   # 各発表の個別カード
slides/timetable.png               # 全体タイムテーブル
```

### 入力データ（data/schedule.json）

```json
[
  {
    "handleName": "bababa@LT",
    "title": "1分でわかるOpenCode活用術",
    "tags": ["開発", "ツール", "AI"]
  }
]
```

| キー | 内容 | 必須 |
|---|---|---|
| `handleName` | ハンドルネーム | 〇 |
| `title` | 発表タイトル | 〇 |
| `tags` | ジャンルタグ（3つ前後） | - |

発表の順番はJSONの配列順で**自動採番**（`01`〜）されます。`time` は表示されません。

### タイトルの改行

- **自動調整（推奨）**: タイトルは Google Budoux により、
  日本語の自然な単語境界で自動的に折り返されます。
- **手動指定**: 改行したい位置に `\n` を書くと、その位置で確実に改行されます
  （例: `"title": "AIエージェント\n企業での使い方"`）。

### イベント設定（data/config.json）

日付やイベント名は `data/config.json` で一元管理できます。

```json
{
  "date": "2026.08.29 FRI",
  "event": "LT FES"
}
```

| キー | 内容 | 必須 |
|---|---|---|
| `date` | ヘッダー等に表示する日付（例 `2026.08.29 FRI`） | - |
| `event` | フッターに表示するイベント名（既定 `LT FES`） | - |

- `date` の優先順位: `config.json` → 環境変数 `LT_DATE` → 既定値 `2026.08.29 FRI`
- ファイルが無い場合は通常どおり環境変数・既定値にフォールバックします。

### 環境変数
- `CHROME_PATH` … Chrome の実行パス
- `LT_DATE` … ヘッダー等に表示する日付（config.json が無い場合のフォールバック。例 `2026.08.29 FRI`）

## カスタマイズ
- 色・余白・文字サイズ: `src/style.css` の `:root` と各種セレクタ
- レイアウト: `src/per-talk.html`（個別） / `src/timetable.html`（全体）
- 生成ロジック: `generate.js`
