---
title: "Fixing Ubuntu Desktop Freezing at the Login Screen"
published: true
tags: Ubuntu, Linux, NVIDIA, GPU
canonical_url: https://zenn.dev/asherish/articles/ubuntu-desktop-freeze-on-login
---

When installing Ubuntu Desktop, the system may freeze at login if the default graphics settings are incompatible with the hardware. This article explains how to resolve this issue.

## What Is Ubuntu Desktop?

Ubuntu comes in two varieties: "Ubuntu Server" for server use, and "Ubuntu Desktop" for personal and office use.

**Ubuntu Server** is designed primarily for server operations and is intended to be operated via command line (CUI). It does not include a GUI.

**Ubuntu Desktop** is designed for personal and office use, with an intuitive GUI included as standard.

## Why It Freezes

Normally, the kernel initializes the framebuffer (the display area using the GPU) during boot and sets the optimal resolution. However, when this operation fails, the following problems can occur:

- The screen goes black
- The boot process freezes
- The login screen doesn't appear

The main cause of this failure is that the open-source driver is not compatible with the installed GPU.

*Note: Open-source drivers are the drivers installed by default on Ubuntu, such as `nouveau` (for NVIDIA), `amdgpu` (for AMD), and `modesetting` (a generic driver).*

For example, the open-source driver may fail to initialize the framebuffer for the latest NVIDIA GPUs, causing a freeze at login. BIOS/UEFI settings or specific hardware configurations (e.g., multi-GPU environments) can also be the cause.

Installing a proprietary driver is required for NVIDIA GPUs to set the optimal resolution, but you can't install the proprietary driver without being able to log in first.

## How to Log In

Using `nomodeset` disables automatic initialization and runs in low-resolution mode, allowing you to use the GUI environment. Note that this is a temporary fix — you'll need to install the proprietary driver as a permanent solution.

1. Display the GRUB menu at boot (press the Shift key repeatedly)
2. Press `e` before selecting "Ubuntu"
3. Change `quiet splash` to `quiet splash nomodeset`
4. Boot with Ctrl + X

This starts the GUI in low-resolution mode, allowing you to log in.

## Install the Proprietary Driver

After logging in, install the proprietary driver to display the screen at the proper resolution. The following example is for NVIDIA GPUs.

Check the recommended driver:

```bash
ubuntu-drivers devices
```

Install the recommended driver:

```bash
sudo apt install nvidia-driver-xxx
```

*The officially provided driver from the repository is recommended, but if needed, download and install the latest driver from the [NVIDIA official website](https://www.nvidia.com/).*

## Remove nomodeset

After installing the proprietary driver, remove `nomodeset` from the GRUB configuration.

Edit the GRUB configuration (e.g., using `nano`):

```bash
sudo nano /etc/default/grub
```

Find the following line:

```bash
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash nomodeset"
```

Change it to:

```bash
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash"
```

Save the settings and update GRUB:

```bash
sudo update-grub
sudo reboot
```

After rebooting, verify that the proprietary driver is working correctly with the following command:

```bash
nvidia-smi
```

## Note: For AMD or Intel GPUs

Even with AMD or Intel GPUs, similar issues can occur due to open-source drivers.

- For AMD: Check if the `amdgpu` driver is applied, and install the proprietary driver if necessary.
- For Intel: Check if the `i915` driver is applied.

If the specific problem is not resolved, refer to official documentation or support forums.
