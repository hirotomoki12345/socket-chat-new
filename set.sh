#!/bin/bash

# 設定
REPO_URL="https://github.com/hirotomoki12345/socket-chat-new.git"
APP_DIR="$HOME/socket-chat-new"  # インストール先のパス
APP_NAME="socket-chat-new"  # pm2でのアプリ名

function setup_pm2() {
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
    pm2 start server.js --name "$APP_NAME"

    # pm2の自動起動設定（システム再起動時）
    echo "pm2の自動起動を設定しています..."
    pm2 startup
    pm2 save

    echo "セットアップ完了！"
}

function remove_directory_pm2() {
    # pm2でアプリを削除
    if pm2 list | grep -q "$APP_NAME"; then
        echo "pm2からアプリを削除しています..."
        pm2 delete "$APP_NAME"
    fi

    # 既存のディレクトリを削除
    if [ -d "$APP_DIR" ]; then
        echo "既存のディレクトリを削除しています: $APP_DIR"
        rm -rf "$APP_DIR"
    else
        echo "削除するディレクトリは存在しません。"
    fi
}

while true; do
    echo "メニューオプションを選択してください:"
    echo "1. セットアップpm2"
    echo "2. ディレクトリとpm2の削除"
    echo "3. 終了"
    read -rp "選択: " choice

    case $choice in
        1)
            setup_pm2
            ;;
        2)
            remove_directory_pm2
            ;;
        3)
            echo "終了します。"
            exit 0
            ;;
        *)
            echo "無効な選択です。もう一度選択してください。"
            ;;
    esac
done
