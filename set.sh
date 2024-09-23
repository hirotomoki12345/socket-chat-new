#!/bin/bash

# 設定
REPO_URL="https://github.com/hirotomoki12345/socket-chat-new.git"
APP_DIR="$HOME/socket-chat-new"  # インストール先のパス
APP_NAME="socket-chat-new"  # pm2でのアプリ名

# 既存のディレクトリを削除
if [ -d "$APP_DIR" ]; then
    echo "既存のディレクトリを削除しています: $APP_DIR"
    rm -rf "$APP_DIR"
fi

# リポジトリを新しくクローン
echo "リポジトリをクローンしています: $REPO_URL"
git clone "$REPO_URL" "$APP_DIR"

# ディレクトリに移動
cd "$APP_DIR" || { echo "ディレクトリの移動に失敗しました。"; exit 1; }

# 依存パッケージをインストール
echo "依存パッケージをインストールしています..."
npm install

# pm2のインストール
if ! command -v pm2 &> /dev/null; then
    echo "pm2がインストールされていません。pm2をインストールします..."
    npm install -g pm2
fi

# pm2でアプリを起動
echo "pm2でアプリを起動しています..."
pm2 start index.js --name "$APP_NAME"

# pm2の自動起動設定（システム再起動時）
echo "pm2の自動起動を設定しています..."
pm2 startup
pm2 save

echo "セットアップ完了！"
