---
title: "Installing NVIDIA Drivers Without CUDA"
published: false
tags: NVIDIA, CUDA, Ubuntu, Linux
canonical_url: https://zenn.dev/asherish/articles/nvidia-driver-without-cuda
scheduled_publish_date: "2026-03-20"
---

## Motivation

In AI model development environments, different projects and programs often require different versions of CUDA. For example, one project might need CUDA 11.8 while another requires CUDA 12.2. In such situations, installing and managing multiple CUDA versions directly on your local environment can lead to version conflicts.

Furthermore, when sharing development environments across a team, configurations that depend on the local environment make it difficult to ensure reproducibility. If each team member uses a different CUDA version, errors due to environmental differences become more likely.

Therefore, CUDA should be installed inside containers rather than on the local environment. By using containers, you can flexibly switch between the CUDA versions needed for each project without affecting the local environment. Additionally, sharing containers across the team enables a unified development environment.

This article aims to install only the NVIDIA driver on the local environment without installing CUDA.

## Check the Version to Install

First, use the following site to check which version to install. By selecting your GPU product name and OS, you can find the appropriate NVIDIA driver version.

https://www.nvidia.com/ja-jp/drivers/

If you don't know your GPU model, you can check it with the following command:

```bash
sudo lshw -C display
```

## How to Install the NVIDIA Driver Without CUDA

There are two main methods for installing the NVIDIA driver:

- **NVIDIA repository + `cuda-drivers`**: Installs from NVIDIA's repository. Provides the latest drivers. The repository configuration can be reused if you install CUDA in the future. See [Reference: Installation via the NVIDIA Repository](#reference-installation-via-the-nvidia-repository) for details.
- **Ubuntu repository + `nvidia-driver-XXX`**: Installs drivers that have been tested and packaged by Ubuntu. You can check the recommended version with the `ubuntu-drivers devices` command, and the procedure is simpler.

This article explains the installation steps using the latter approach with the Ubuntu repository.

### About Secure Boot

Secure Boot is a BIOS/UEFI security feature that only allows trusted, signed software to run during PC startup. If the NVIDIA driver's kernel module is not signed, this feature can prevent it from working. Therefore, to install the NVIDIA driver successfully, you need to either disable Secure Boot or register a MOK (Machine-Owner Key).

#### Option 1: Disable Secure Boot in BIOS

1. Immediately after powering on, repeatedly press the designated key to enter BIOS.
    - DELL: F2 or DEL
    - HP: ESC (then F10) or F2
    - ASUS: DEL or F2
    - Acer: F2 or DEL
2. Navigate to the Secure Boot settings screen.
   It is usually found under one of the following tabs:
   - Boot
   - Security
   - Authentication
   - Advanced
3. Disable Secure Boot.
   - Set the "Secure Boot" option to "Disabled".
   - If you cannot disable it, try changing the Secure Boot mode to "Custom Mode" first.
   - In some cases, changing OS Type from "Windows UEFI mode" to "Other OS" is sufficient.
4. Configure "CSM" or "Legacy Boot" if necessary.
   - On some systems, you may need to enable "CSM (Compatibility Support Module)" or "Legacy Boot" when disabling Secure Boot.
   - To do this, set "CSM" or "Legacy Boot" to "Enabled" in the "Boot" tab.
5. Save changes and restart.
   - After making changes, select "Save and Exit".
   - On some BIOS, you can save and exit with the F10 key.
6. Verify that Secure Boot has been disabled.
   ```bash
   dmesg | grep Secure
   ```

#### Option 2: Register a MOK (Machine-Owner Key)

If you want to use the NVIDIA driver with Secure Boot enabled, you will be prompted to register a MOK during driver installation. Set a password when prompted during installation. After rebooting, the "Enroll MOK" menu will appear — enter the password you set to register the MOK.

> ⚠️ If you do not select "Enroll MOK" during reboot, Ubuntu will still boot, but the NVIDIA driver will not work correctly.

### Disable nouveau

When installing NVIDIA drivers on a Linux system, an open-source driver called nouveau may be enabled by default. When nouveau is active, it occupies the GPU, which can interfere with the installation and operation of the NVIDIA driver. Therefore, to install the NVIDIA driver correctly, you need to disable nouveau to release the GPU.

1. Check if nouveau is enabled. You can paste the output into ChatGPT to verify whether it is enabled.
   ```bash
   lsmod | grep -i nouveau
   ```
2. Run `sudo vi /etc/modprobe.d/blacklist-nvidia-nouveau.conf` and add the following configuration to disable nouveau.
   ```bash:/etc/modprobe.d/blacklist-nvidia-nouveau.conf
   blacklist nouveau
   options nouveau modset=0
   ```
3. Apply the configuration to disable nouveau.
   ```bash
   sudo update-initramfs -u
   ```

> ⚠️ Do not reboot. If you reboot without installing the NVIDIA driver, you may experience display issues.

### Install the NVIDIA Driver

Finally, it's time to install the NVIDIA driver. Once this is complete, you've achieved the goal.

1. Remove any previously installed NVIDIA drivers or CUDA.
   ```bash
   sudo apt purge "nvidia-*"
   sudo apt autoremove
   sudo apt autoclean
   ```
2. Update the package list to the latest state.
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```
3. Check the version to install on the [NVIDIA official driver page](https://www.nvidia.com/ja-jp/drivers/) as described in [Check the Version to Install](#check-the-version-to-install) earlier in this article.

> ℹ️ To determine which version to install, you need to know your GPU model. You can check it with `sudo lshw -C display`.

As a side note, you can also check the list of compatible drivers and recommended versions using the `ubuntu-drivers devices` command. Running this command will often show the open-source version of the driver recommended on [the page above](https://www.nvidia.com/ja-jp/drivers/) marked as `recommended`. In fact, NVIDIA's developer page also recommends using the open-source kernel modules for Turing and later architectures (Turing, Ampere, Ada Lovelace, Hopper), and starting from the R560 driver series, the open-source version is the default installation target ([reference](https://developer.nvidia.com/blog/nvidia-transitions-fully-towards-open-source-gpu-kernel-modules/)). However, even the recommended version may not always work correctly.

4. Install the appropriate version of the driver (the following command is for version `535`).
   ```bash
   sudo apt install -y nvidia-driver-535
   ```
5. Verify that the driver was installed successfully. If GPU information is displayed, the installation was successful.
   ```bash
   nvidia-smi
   ```

### Notes

- The procedures in this article are intended for Ubuntu environments.
- NVIDIA's official documentation describes different installation methods.
  https://docs.nvidia.com/datacenter/tesla/driver-installation-guide/#ubuntu

## Reference: Installation via the NVIDIA Repository

This article introduced the method using Ubuntu's repository, but you can also install drivers using NVIDIA's repository. Here, we organize the information from the CUDA Installation Guide as a reference.

### Installation Instructions Are in the CUDA Installation Guide

The NVIDIA driver installation instructions are documented in the CUDA Installation Guide. This is a good page to come back to when you get stuck. However, since this page is designed to support CUDA installation, you'll need to read selectively to install only the NVIDIA driver.

https://docs.nvidia.com/cuda/cuda-installation-guide-linux/index.html

Section 3. Pre-installation Actions describes what needs to be done before installation. In particular, we'll cover the following subsections:

- **3.4. Choose an Installation Method**
- **3.5. Download the NVIDIA CUDA Toolkit**

> ℹ️ The CUDA Quick Start Guide also describes CUDA installation procedures, but it only covers full CUDA installation and does not describe how to install the NVIDIA driver without CUDA.
> 
> https://docs.nvidia.com/cuda/cuda-quick-start-guide/index.html#ubuntu

### Two Types: distribution-specific package and runfile

Section **3.4. Choose an Installation Method** of the CUDA Installation Guide explains that there are two installation methods.

Let's look at what the installation guide says:

> The CUDA Toolkit can be installed using either of two different installation mechanisms: distribution-specific packages (RPM and Deb packages), or a distribution-independent package (runfile packages).
>
> The distribution-independent package has the advantage of working across a wider set of Linux distributions, but does not update the distribution's native package management system. The distribution-specific packages interface with the distribution's native package management system. It is recommended to use the distribution-specific packages, where possible.

As described above, there are two installation methods: distribution-specific packages (deb/rpm packages) and distribution-independent packages (runfile). The guide recommends the former.

Note that the runfile also has `--driver` and `--toolkit` flags documented, which may allow installing only the driver or only the toolkit separately. However, the following sections assume distribution-specific packages (deb) as recommended by the guide.

### Downloading the NVIDIA Driver

Section **3.5. Download the NVIDIA CUDA Toolkit** of the CUDA Installation Guide explains the following:

> The NVIDIA CUDA Toolkit is available at https://developer.nvidia.com/cuda-downloads.
>
> Choose the platform you are using and download the NVIDIA CUDA Toolkit.
>
> The CUDA Toolkit contains the tools needed to create, build and run a CUDA application as well as libraries, header files, and other resources.

When you open the link above and select your environment, the installation methods for both CUDA and the NVIDIA driver are displayed. However, if you select the runfile option, the NVIDIA driver installation method is not shown. You need to select deb.

https://developer.nvidia.com/cuda-downloads

For example, if you select Linux, x86_64, Ubuntu 22.04, deb (network), the following is shown as the NVIDIA driver installation step:

```bash
sudo apt-get install -y cuda-drivers
```

### local and network Methods

The deb package installation method is further divided into two types: local and network.

Section 4.8 of the CUDA Installation Guide describes the installation method for Ubuntu.

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
wget https://developer.download.nvidia.com/compute/cuda/repos/{% katex inline %}distro/{% endkatex %}arch/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get install cuda-drivers-<branch>
```

The developer site also displays the necessary commands when you select the OS and installer type. The specific commands vary depending on the CUDA version, so please select your environment on the following page to check:

https://developer.nvidia.com/cuda-downloads

For example, if you select Linux, x86_64, Ubuntu 22.04, deb (local), the repository setup commands are displayed. After setting up the repository, you can install only the NVIDIA driver without CUDA by installing `cuda-drivers` instead of `cuda-toolkit`.

```bash
# cuda-toolkit をインストールすると CUDA がインストールされてしまう
# sudo apt-get -y install cuda-toolkit-<version>

# cuda-drivers をインストールすると CUDA なしで NVIDIA ドライバーのみをインストールできる
sudo apt-get -y install cuda-drivers
```
