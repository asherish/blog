---
title: "CUDA をインストールせずに NVIDIA ドライバーをインストールする方法"
emoji: "🖥️"
type: "tech"
topics: ["NVIDIA", "CUDA", "Ubuntu", "Linux"]
published: true
---

## モチベーション

AIモデルの開発環境では、プロジェクトやプログラムによって必要とされる CUDA のバージョンが異なることがよくあります。例えば、あるプロジェクトでは CUDA 11.8が必要である一方、別のプロジェクトでは CUDA 12.2が求められることがあります。このような状況で、ローカル環境に複数の CUDA バージョンを直接インストールして管理するのは、バージョン間の競合の要因となります。

さらに、チームで開発環境を共有する場合、ローカル環境に依存する構成では再現性を確保することが難しくなります。一人一人が異なる CUDA バージョンを使用していると、環境の違いによるエラーが発生しやすくなります。

そのため、CUDA はローカル環境でなくコンテナ内にインストールされるべきです。コンテナを利用することで、プロジェクトごとに必要な CUDA バージョンを柔軟に切り替えられるようになり、ローカル環境が影響を受けることはありません。また、コンテナをチーム全体で共有することで、チーム全体で統一された環境を構築できます。

本記事では、ローカル環境に CUDA をインストールせず、NVIDIA ドライバーだけをインストールすることを目指します。

## インストールすべきバージョンを確認する

まず、インストールすべきバージョンを確認するために、以下のサイトを利用します。GPU の製品名や OS を選択すると、適切な NVIDIA ドライバーのバージョンを確認できます。

https://www.nvidia.com/ja-jp/drivers/

GPU の型番が分からない場合は、以下のコマンドで確認できます。

```bash
sudo lshw -C display
```

## CUDA をインストールせずに NVIDIA ドライバーをインストールする方法

NVIDIA ドライバーをインストールする方法は主に2つあります。

- **NVIDIA リポジトリ + `cuda-drivers`**: NVIDIA が提供するリポジトリからインストールする方法。最新のドライバーが提供される。将来 CUDA をインストールする場合にもリポジトリの設定をそのまま利用できる。詳細は[参考: NVIDIA リポジトリを使ったインストール方法](#参考%3A-nvidia-リポジトリを使ったインストール方法)を参照してください。
- **Ubuntu リポジトリ + `nvidia-driver-XXX`**: Ubuntu が検証・パッケージングしたドライバーをインストールする方法。`ubuntu-drivers devices` コマンドで推奨バージョンを確認でき、手順がシンプル。

本記事では、後者の Ubuntu リポジトリを使用する方法でインストール手順を解説します。

### セキュアブートについて

セキュアブートは、PC 起動時に信頼できる署名付きソフトウェアのみを実行する BIOS または UEFI のセキュリティ機能ですが、NVIDIA ドライバーのカーネルモジュールが署名されていない場合、この機能が原因で動作が妨げられることがあります。そのため、NVIDIA ドライバーを正常にインストールするには、セキュアブートを無効化するか、MOK（Machine-Owner Key）を登録する必要があります。

#### 方法1: BIOS でセキュアブートを無効化する

1. 電源を入れた直後に指定のキーを連打して、BIOS を起動してください。
    - DELL: F2 または DEL
    - HP: ESC（次に F10）または F2
    - ASUS: DEL または F2
    - Acer: F2 または DEL
2. Secure Boot の設定画面に移動してください。
   大抵は、以下のいずれかのタブにあります
   - Boot
   - Security
   - Authentication
   - Advanced
3. セキュアブートを無効化してください。
   - 「Secure Boot」というオプションを「Disabled」に設定します。
   - 無効化ができない場合、セキュアブートのモードを「Custom Mode」に変更してから設定を変更できる場合があります。
   - OS Type を Windows UEFI mode から Other OS に変更するだけで良い場合もあります。
4. 必要に応じて「CSM」または「Legacy Boot」を設定してください。
   - 一部のシステムでは、セキュアブートを無効にする際に「CSM（Compatibility Support Module）」または「Legacy Boot」を有効化する必要があります。
   - これを行うには「Boot」タブで「CSM」や「Legacy Boot」を「Enabled」に設定します。
5. 変更を保存して再起動してください。
   - 設定を変更したら、「Save and Exit」を選びます。
   - 一部のBIOSでは F10 キーで保存と終了が可能です。
6. セキュアブートが無効化されたかを確認してください。
   ```bash
   dmesg | grep Secure
   ```

#### 方法2: MOK（Machine-Owner Key）を登録する

セキュアブートを有効にしたまま NVIDIA ドライバーを使用する場合、ドライバーのインストール時に MOK の登録が求められます。インストール中にパスワードの設定を求められるので、パスワードを設定してください。再起動後に「Enroll MOK」メニューが表示されるので、設定したパスワードを入力して MOK を登録してください。

:::message alert
再起動時に「Enroll MOK」を選択しなかった場合、Ubuntu は起動できますが、NVIDIA ドライバーが正しく動作しません。
:::

### nouveau を無効化する

LinuxシステムでNVIDIAドライバーをインストールする際、nouveau というオープンソースのドライバーがデフォルトで有効になっていることがあります。nouveau が有効な状態では、GPU がすでに nouveau に占有されているため、NVIDIA ドライバーのインストールや動作に支障が出る可能性があります。そのため、NVIDIA ドライバーを正しくインストールするには、nouveau を無効化して GPUの占有を解除する必要があります。

1. nouveau が有効となっているかを確認してください。出力を ChatGPT に入力して、有効となっているかを確認してみてください。
   ```bash
   lsmod | grep -i nouveau
   ```
2. `sudo vi /etc/modprobe.d/blacklist-nvidia-nouveau.conf` を実行して、nouveau を無効化するための設定をファイルに記入してください。
   ```bash:/etc/modprobe.d/blacklist-nvidia-nouveau.conf
   blacklist nouveau
   options nouveau modset=0
   ```
3. 設定を反映して、nouveau を無効化してください。
   ```bash
   sudo update-initramfs -u
   ```

:::message alert
再起動しないでください。NVIDIA ドライバーをインストールしないまま再起動すると、画面表示に不具合が生じる恐れがあります。
:::

### NVIDIA ドライバーをインストールする

ついに、NVIDIA ドライバーをインストールします。これが完了したら、目標は達成です。

1. インストール済みの NVIDIA ドライバーや CUDA を削除してください。
   ```bash
   sudo apt purge "nvidia-*"
   sudo apt autoremove
   sudo apt autoclean
   ```
2. パッケージリストを最新の状態に更新してください。
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```
3. [本記事の冒頭](#インストールすべきバージョンを確認する)で紹介したように、インストールすべきバージョンを [NVIDIA 公式ドライバーページ](https://www.nvidia.com/ja-jp/drivers/) で確認してください。

:::message
インストールすべきバージョンを知るためには、GPU の型番を確認する必要があります。`sudo lshw -C display` で確認できます。
:::

ちなみに、`ubuntu-drivers devices` コマンドでも対応ドライバーの一覧と推奨バージョンを確認できます。このコマンドを実行すると [上記のページ](https://www.nvidia.com/ja-jp/drivers/) で推奨されたバージョンのオープンソース版が `recommended` と推奨されることが多いです。実際、[NVIDIA の開発者ページ](https://developer.nvidia.com/blog/nvidia-transitions-fully-towards-open-source-gpu-kernel-modules/) でも Turing 以降のアーキテクチャ（Turing, Ampere, Ada Lovelace, Hopper）ではオープンソース版カーネルモジュールの使用を推奨しており、R560 ドライバー以降ではオープンソース版がデフォルトのインストール対象になっています。ただし、推奨されたバージョンでも正しく動作しないことがあります。

4. 適切なバージョンのドライバーをインストールしてください（次のコマンドは、バージョン `535` の場合）。
   ```bash
   sudo apt install -y nvidia-driver-535
   ```
5. ドライバーが正常にインストールされたか確認してください。GPU の情報が表示されれば、インストール成功です。
   ```bash
   nvidia-smi
   ```

### 注意点

- 本記事の手順は Ubuntu 環境を想定しています。
- NVIDIA の公式ドキュメントでは、本記事と異なるインストール方法が紹介されています。
  https://docs.nvidia.com/datacenter/tesla/driver-installation-guide/#ubuntu

## 参考: NVIDIA リポジトリを使ったインストール方法

本記事では Ubuntu リポジトリを使った方法を紹介しましたが、NVIDIA のリポジトリを使ってドライバーをインストールすることもできます。ここでは、CUDA のインストールガイドに記載されている情報を参考として整理します。

### インストール手順は CUDA のインストールガイドに記載されている

NVIDIA ドライバーのインストール手順は、CUDA のインストールガイドに記載されています。困ったらこのページに帰ってくるとよいでしょう。ただし、このページは CUDA のインストールをサポートしているため、NVIDIA ドライバーのみをインストールするためには読み替えながら進める必要があります。

https://docs.nvidia.com/cuda/cuda-installation-guide-linux/index.html

上記の 3. Pre-installation Actions にて、インストール前に実施すべきことが記載されています。その中でも、以下について補足します。

- **3.4. Choose an Installation Method**
- **3.5. Download the NVIDIA CUDA Toolkit**

:::message
CUDA Quick Start Guide にも CUDA のインストール手順が記載されていますが、こちらは CUDA のインストール手順を解説したものであり、CUDA なしで NVIDIA ドライバーをインストールする方法は記載されていません。

https://docs.nvidia.com/cuda/cuda-quick-start-guide/index.html#ubuntu
:::

### distribution-specific package と runfile の2種類がある

CUDA のインストールガイドの **3.4. Choose an Installation Method** では、インストール方法が2種類あることが解説されています。

インストールガイドの解説内容を見てみましょう。

> The CUDA Toolkit can be installed using either of two different installation mechanisms: distribution-specific packages (RPM and Deb packages), or a distribution-independent package (runfile packages).
>
> The distribution-independent package has the advantage of working across a wider set of Linux distributions, but does not update the distribution's native package management system. The distribution-specific packages interface with the distribution's native package management system. It is recommended to use the distribution-specific packages, where possible.

上記のように、インストール方法には distribution-specific package（deb/rpm パッケージ）と distribution-independent package（runfile）の2種類があります。ガイドでは前者が推奨されています。

なお、runfile にも `--driver` フラグと `--toolkit` フラグの記載があり、ドライバーのみ、またはツールキットのみをインストールできるかもしれません。しかし、以下ではガイドの推奨に従い distribution-specific package（deb）を前提とします。

### NVIDIA ドライバーのダウンロード

CUDA のインストールガイドの **3.5. Download the NVIDIA CUDA Toolkit** では、以下のように解説されています。

> The NVIDIA CUDA Toolkit is available at https://developer.nvidia.com/cuda-downloads.
>
> Choose the platform you are using and download the NVIDIA CUDA Toolkit.
>
> The CUDA Toolkit contains the tools needed to create, build and run a CUDA application as well as libraries, header files, and other resources.

上記のリンクを開いて環境を選択すると、CUDA と NVIDIA ドライバーのインストール方法が表示されます。ただし、runfile を選択すると NVIDIA ドライバーのインストール方法は表示されません。deb を選択する必要があります。

https://developer.nvidia.com/cuda-downloads

たとえば、Linux, x86_64, Ubuntu 22.04, deb (network) を選択すると、NVIDIA ドライバーのインストール手順として以下が表示されます。

```bash
sudo apt-get install -y cuda-drivers
```

### local 方式と network 方式

deb パッケージを使用するインストール方法には、さらに local 方式と network 方式の2種類があります。

CUDA のインストールガイドの 4.8 にて、Ubuntu へのインストール方法が解説されています。

https://docs.nvidia.com/cuda/cuda-installation-guide-linux/index.html#ubuntu

```bash
sudo apt-get install linux-headers-$(uname -r)
sudo apt-key del 7fa2af80

# Choose an installation method: local repo or network repo.

# local
sudo dpkg -i cuda-repo-<distro>_<version>_<architecture>.deb
sudo cp /var/cuda-repo-<distro>-X-Y-local/cuda-*-keyring.gpg /usr/share/keyrings/
wget https://developer.download.nvidia.com/compute/cuda/repos/<distro>/x86_64/cuda-<distro>.pin
sudo mv cuda-<distro>.pin /etc/apt/preferences.d/cuda-repository-pin-600

# network
wget https://developer.download.nvidia.com/compute/cuda/repos/$distro/$arch/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get install cuda-drivers-<branch>
```

開発者サイトでも、OS とインストールタイプを選択すると必要なコマンドが表示されます。具体的なコマンドは CUDA のバージョンによって異なるため、以下のページで環境を選択して確認してください。

https://developer.nvidia.com/cuda-downloads

たとえば、Linux, x86_64, Ubuntu 22.04, deb (local) を選択すると、リポジトリの設定コマンドが表示されます。リポジトリを設定したあと、`cuda-toolkit` ではなく `cuda-drivers` をインストールすることで、CUDA なしで NVIDIA ドライバーのみをインストールできます。

```bash
# cuda-toolkit をインストールすると CUDA がインストールされてしまう
# sudo apt-get -y install cuda-toolkit-<version>

# cuda-drivers をインストールすると CUDA なしで NVIDIA ドライバーのみをインストールできる
sudo apt-get -y install cuda-drivers
```
