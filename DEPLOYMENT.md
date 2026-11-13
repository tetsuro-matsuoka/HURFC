# 本番公開の手順（初心者向け）

このアプリを **Supabase（データベース）** と **Vercel（公開サーバー）** を使って、インターネット上に公開する手順です。
**パソコンにファイルを作ったり、ターミナルでコマンドを打ったりする必要はありません。** すべてブラウザ（Chrome など）の操作だけで完了します。

所要時間の目安：30〜40分

---

## 全体の流れ

| 手順 | やること | 使うサイト |
|---|---|---|
| 1 | アプリのコードを本番用の場所（main）に取り込む | GitHub |
| 2 | データベースを作る | Supabase |
| 3 | データベースに表（テーブル）を作る | Supabase |
| 4 | 接続に必要な3つの値をメモする | Supabase |
| 5 | アプリを公開する | Vercel |
| 6 | 公開されたアプリで初期設定する | 公開したアプリ |
| 7 | 動作を確認する | 公開したアプリ |

> 💡 「メモ帳」アプリを開いておくと、途中で出てくる値を一時的に貼り付けておけて便利です。
> ただし **Secret key は他人に見せない・送らない** でください（作業が終わったらメモは削除）。

---

## 手順1：コードを main に取り込む（GitHub）

Claude がアプリのコードを GitHub に「プルリクエスト（変更の提案）」として送っています。これを取り込みます。

1. ブラウザで https://github.com/tetsuro-matsuoka/HURFC を開く
2. 上部の **「Pull requests」** タブを押す
3. 一覧にある「NUMBERS アプリ…」というタイトルを押す
4. 下の方にある緑の **「Merge pull request」** ボタンを押す
5. **「Confirm merge」** を押す
6. 「Pull request successfully merged」と出れば完了
7. 上部の **「Code」** タブを押し、`app`、`components`、`supabase` などのフォルダが並んでいることを確認

---

## 手順2：データベースを作る（Supabase）

1. https://supabase.com を開き、右上の **「Start your project」**（または「Sign in」）を押す
2. **「Continue with GitHub」** を選び、GitHub アカウントでログインする
3. **「New project」** を押す（組織＝Organization の作成を求められたら、名前に `HURFC` などと入れて作成）
4. 次のように入力する
   - **Project name**：`hurfc`
   - **Database Password**：「Generate a password」で自動作成し、**メモ帳に保存**（あとで使うことはほぼありませんが、念のため）
   - **Region**：`Northeast Asia (Tokyo)`
5. **「Create new project」** を押す
6. 1〜2分待つ（画面が準備完了になるまで）

---

## 手順3：データベースに表を作る（Supabase）

1. GitHub の HURFC リポジトリで `supabase` フォルダ → `schema.sql` を開く
2. 右上の **コピーのボタン（📋「Copy raw file」）** を押して、中身を全部コピーする
3. Supabase の画面に戻り、左のメニューから **「SQL Editor」** を押す
4. 何も書かれていない入力欄に、コピーした内容を **貼り付け**（Windows は `Ctrl` + `V`）
5. 右下の **「Run」** を押す
6. 下に **「Success. No rows returned」** と出れば完了
   - 赤いエラーが出た場合は、貼り付けが途中で切れていないか確認して、もう一度「Run」

**（おすすめ）知らない人が勝手に登録できないようにする**

7. 左のメニューの **「Authentication」** → **「Sign In / Providers」** を開く
8. **「Allow new users to sign up」** を **オフ** にして **「Save changes」**
   - これをオフにしても、コーチがアプリから選手を追加することはできます

---

## 手順4：接続に必要な3つの値をメモする（Supabase）

左下の **歯車アイコン「Project Settings」** を押し、次の3つをメモ帳に貼り付けます。
（画面上部の **「Connect」** ボタンからも確認できます。名前や場所が少し違う場合があります）

| メモする名前 | どこにあるか | 見た目の例 |
|---|---|---|
| ① Project URL | 「Data API」（または「General」）の **Project URL** | `https://abcdefgh.supabase.co` |
| ② Publishable key | 「API Keys」の **Publishable key** | `sb_publishable_…` |
| ③ Secret key | 「API Keys」の **Secret keys**（「Reveal」を押すと表示） | `sb_secret_…` |

> ⚠️ ③ Secret key は **管理者用の合鍵** です。人に送ったり、GitHub に書いたりしないでください。
>
> 「API Keys」に Publishable key が見当たらず **「Create new API keys」** ボタンがある場合は、それを押すと作成されます。

---

## 手順5：アプリを公開する（Vercel）

1. https://vercel.com を開き、**「Sign Up」**（すでにあれば「Log In」）を押す
2. プランは **「Hobby」**（無料）を選び、**「Continue with GitHub」** でログインする
3. ダッシュボード右上の **「Add New…」** → **「Project」** を押す
4. 「Import Git Repository」の一覧から **HURFC** の **「Import」** を押す
   - 一覧に出てこない場合は、「Adjust GitHub App Permissions」を押して HURFC へのアクセスを許可する
5. 設定画面で、**Framework Preset** が **「Next.js」** になっていることを確認（自動で選ばれます）
6. **「Environment Variables」**（環境変数）を開き、次の3つを1つずつ追加する
   （左の「Key」に名前、右の「Value」に手順4でメモした値を貼り付けて「Add」）

   | Key（名前）※そのままコピーして使う | Value（値） |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | ① Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ② Publishable key |
   | `SUPABASE_SECRET_KEY` | ③ Secret key |

7. **「Deploy」** を押す
8. 1〜3分待ち、「Congratulations!」の画面が出れば公開完了
9. **「Continue to Dashboard」** を押し、「Domains」に表示されている URL（例：`hurfc.vercel.app`）をメモする
   - これが選手・スタッフに共有するアプリの URL です

> 環境変数を後から追加・変更した場合は、Vercel の「Deployments」タブ → 一番上の「…」→ **「Redeploy」** を押すと反映されます。

---

## 手順6：初期設定（公開したアプリ）

1. 手順5でメモした URL をスマホまたはパソコンで開く
2. 「初期設定」画面が出るので、次を入力する
   - **コーチ名**：例 `松岡`
   - **合言葉**：6文字以上（他人に推測されにくいもの）
   - **「お試し用のサンプル選手も入れる」**：動作確認したい場合はチェックしたまま
3. **「コーチを作成」** を押す（サンプルありの場合は30秒ほどかかります）
4. 自動でログインし、コーチ画面（チームダッシュボード）が表示されれば成功

---

## 手順7：動作確認チェックリスト

**コーチとして**
- [ ] チーム画面に、出席・欠席・未入力の人数と一覧が表示される
- [ ] 体重推移一覧に小さなグラフが表示される
- [ ] フィジカル画面でランキングを切り替えられる
- [ ] 選手名をタップすると詳細グラフが表示される
- [ ] 選手管理で新しい選手を（名前・学年・ポジション）で追加できる
- [ ] 選手一覧の▲▼で順番を入れ替えられる

**選手として**（選手は合言葉なし）
- [ ] ログアウトし、サンプル選手（例：佐藤 健太）を選ぶだけでログインできる
- [ ] ホームに出席率・体重グラフ・Big3が表示される
- [ ] 「記録する」で出欠と体重を保存できる
- [ ] 「フィジカル測定」で数値を保存できる（自己ベストを超えると🔥の通知）
- [ ] スマホの画面で見やすく表示される

**本番運用を始める前に**
- [ ] 選手管理画面から **サンプル選手8名を削除** する
- [ ] 実際の選手を「選手管理」から追加する（名前・学年・ポジション）
- [ ] アプリの URL を選手に共有する（スマホの「ホーム画面に追加」をすすめるとアプリのように使えます）

---

## うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| アプリに「設定が必要です」と出る | 手順5-6の環境変数が未設定か名前が違う。Vercel の「Settings」→「Environment Variables」で確認し、「Redeploy」 |
| 「データベースに接続できません」と出る | 手順3の SQL が未実行。もう一度「Run」する |
| 初期設定で「SUPABASE_SECRET_KEY が設定されていません」 | 手順5-6の③が未設定。追加して「Redeploy」 |
| 初期設定で「データベースの準備ができていません」 | 手順3の SQL を実行する |
| Vercel のデプロイが「Error」になる | 「Deployments」→ 失敗したものを開き、赤い文字の部分をコピーして Claude に見せてください |
| 合言葉を忘れた（コーチ） | Supabase の「Authentication」→「Users」から該当ユーザーを選び、パスワードを再設定（選手は合言葉なしなので不要） |
| 選手管理やログイン画面で「読み込めません」と出る | データベースの更新（下の「データベースの構造を変える修正」）が未実行。`schema.sql` をもう一度「Run」する |

---

## これからアプリを修正するとき

- GitHub の `main` に変更が入ると、**Vercel が自動で再公開** します（1〜3分）。
- 修正は、Claude などの AI エージェントに「〇〇を変えて GitHub に反映して」と頼めば、この流れで公開まで進みます。
- データベースの構造（表）を変える修正の場合は、Supabase の SQL Editor で追加の SQL を実行する作業が必要になることがあります（その都度案内します）。
  - `schema.sql` は何度実行しても壊れないように作ってあるので、**最新の `schema.sql` を全部貼り付けて「Run」** すれば OK です（記録は消えません）。

### （参考）パソコンでファイルを直接編集したい場合

通常は不要です。自分のパソコンにコードを置いて編集したくなった場合のみ行ってください。

1. Git をインストールする：https://git-scm.com/downloads から Windows 版をダウンロードしてインストール（設定はすべて「Next」のままで OK）
2. スタートメニューから **「Git Bash」** を開く
3. 次のコマンドを1行ずつ入力して `Enter`（最初の1回だけ）

   ```bash
   git config --global user.name "tetsuro-matsuoka"
   git config --global user.email "matsuokatetsuro0310@gmail.com"
   cd ~/Documents
   git clone https://github.com/tetsuro-matsuoka/HURFC.git
   ```

   → 「ドキュメント」フォルダの中に `HURFC` フォルダができ、その中にアプリのファイルが入ります。
4. ファイルを編集したあと、GitHub に反映するコマンド

   ```bash
   cd ~/Documents/HURFC
   git pull
   git add .
   git commit -m "変更内容のメモ"
   git push
   ```

   → GitHub に反映され、Vercel が自動で再公開します。
