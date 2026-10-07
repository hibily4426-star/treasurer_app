# KINARI BOOTH

ブース用の売上送信 API、返金・取消 API、管理画面、Windows レジ画面を
Next.js と SQLite で構成したアプリケーションです。実行環境、HTTPS、
SQLite の永続化は Docker Compose で管理します。

## 構成

- `app`: Next.js 16、API、管理画面、レジ画面、SQLite
- `proxy`: Caddy、HTTPS 終端、セキュリティヘッダー
- `booth_data`: SQLite ファイルを保持する Docker named volume
- `caddy_data`: TLS 証明書を保持する Docker named volume

SQLite はサーバープロセスに組み込まれるため、DB 専用コンテナは不要です。
売上データは `booth_data` 内の `/data/booth-sales.sqlite` に保存されます。

## 起動

1. 環境ファイルを作成します。

   ```bash
   cp .env.example .env
   ```

2. `.env` の `POS_API_KEY` と `ADMIN_API_KEY` を、それぞれ異なる
   32文字以上のランダム値に変更します。

   ```bash
   openssl rand -hex 32
   ```

3. コンテナを起動します。

   ```bash
   docker compose up --build -d
   ```

4. レジ画面を `https://localhost/`、管理画面を
   `https://localhost/admin` で開きます。

ローカル HTTPS は Caddy の内部 CA を使います。Windows 端末で警告なく
利用するには、CA 証明書を取り出して管理者 PowerShell で信頼します。

```bash
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
certutil -addstore -f Root .\caddy-root.crt
```

実ドメインを使う場合は `DOMAIN=booth.example.com` として DNS をサーバーへ
向けます。Caddy が公開 TLS 証明書の取得と更新を行います。

## 初期設定

レジ画面右上の設定ボタンから次を入力します。

- ブースサーバー URL: `https://localhost` または公開 URL
- レジ API キー: `.env` の `POS_API_KEY`

管理画面には `.env` の `ADMIN_API_KEY` でログインします。管理者キーは
ブラウザーのセッション内だけに保持され、タブを閉じると破棄されます。

## API

### 売上送信

`POST /api/sales`

```bash
curl https://localhost/api/sales \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${POS_API_KEY}" \
  -d '{
    "transactionId": "register-01-00000001",
    "items": [
      { "productId": "drip-coffee", "quantity": 2 },
      { "productId": "baked-cheesecake", "quantity": 1 }
    ]
  }'
```

`transactionId` は一意です。同じ ID を再送した場合は既存の売上を返し、
二重計上しません。価格と合計金額はサーバーの商品マスターから再計算します。
通常売上は `cancelled=0` で保存されます。

### 返金・取消

`POST /api/admin/sales/{saleId}/cancel`

```bash
curl https://localhost/api/admin/sales/SALE_ID/cancel \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: ${ADMIN_API_KEY}" \
  -d '{ "reason": "商品の渡し間違い" }'
```

対象売上を `cancelled=1` に更新し、取消日時・理由・実行者を残します。
売上と明細の物理削除 API はありません。

### 管理集計

`GET /api/admin/dashboard` に `X-Admin-Key` を付けて呼び出します。
今日の売上一覧、商品別売上、時間帯別売上、直近50件の返金履歴を返します。
営業日と時間帯は日本時間で集計します。

## バックアップ

停止せずに整合性のあるバックアップを取る場合は、SQLite の backup コマンドを
コンテナ内で実行します。

```bash
docker compose exec app node -e \
  "const D=require('better-sqlite3');const d=new D('/data/booth-sales.sqlite');d.backup('/data/backup.sqlite').then(()=>d.close())"
docker compose cp app:/data/backup.sqlite ./backup.sqlite
```

コンテナ更新時は `docker compose down` を使います。
`docker compose down -v` は売上 volume も削除するため運用環境では実行しないで
ください。
