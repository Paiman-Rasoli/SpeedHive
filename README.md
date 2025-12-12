# SpeedHive

A desktop application focused on accurate and lightweight internet speed measurement. SpeedHive is built using **Tauri** for the desktop shell and **React** for the frontend UI.

🎧 This project was created through **vibe coding** — built with good music, flow state, and AI-assisted development.

---

## 🚀 Features (Phase 1)

- Measure **Download Speed**
- Measure **Upload Speed**
- Cross‑platform desktop app powered by **Tauri**
- Fast, minimal, and secure frontend using **React**

---

## 📥 Installation

**Just want to use SpeedHive?** Download the latest version for your platform — no coding required!

👉 **[Download from Releases](../../releases/latest)**

| Platform                  | File to Download                 | How to Install                 |
| ------------------------- | -------------------------------- | ------------------------------ |
| **Windows**               | `SpeedHive_x.x.x_x64-setup.exe`  | Run the installer              |
| **macOS (Intel)**         | `SpeedHive_x.x.x_x64.dmg`        | Open DMG, drag to Applications |
| **macOS (Apple Silicon)** | `SpeedHive_x.x.x_aarch64.dmg`    | Open DMG, drag to Applications |
| **Linux (Debian/Ubuntu)** | `SpeedHive_x.x.x_amd64.deb`      | `sudo dpkg -i SpeedHive_*.deb` |
| **Linux (Other)**         | `SpeedHive_x.x.x_amd64.AppImage` | Make executable and run        |

> 💡 **Tip:** On macOS, if you see "app is damaged", run: `xattr -cr /Applications/SpeedHive.app`

---

## 📊 How Speed Measurement Works

### Download Speed

SpeedHive measures download speed by fetching data from a remote server and tracking how much data is received over time.

1. The app connects to a test server and starts downloading a file
2. Every 250ms, it calculates the current speed: `(bytes received × 8) / elapsed seconds`
3. The test runs for up to 10 seconds
4. The final result shows your actual download throughput in **Mbps** (Megabits per second)

### Upload Speed

Upload speed is measured by sending data to a remote server and tracking how much data is transmitted.

1. The app sends chunks of data (up to 200 MB total) to a test server
2. Every 250ms, it calculates the current speed: `(bytes sent × 8) / elapsed seconds`
3. The test runs for up to 10 seconds or until 200 MB is uploaded
4. The final result shows your actual upload throughput in **Mbps**

> **Note:** Results may vary based on server location, network conditions, and time of day. For best accuracy, close other bandwidth-heavy applications during the test.

---

## 🛠 Tech Stack

- **Tauri** (Rust backend, native desktop capabilities)
- **React** (UI)

---

## 🛠️ Development Setup

> **For developers** who want to build from source or contribute to SpeedHive.

### Prerequisites

- Node.js (LTS recommended)
- Rust toolchain (stable)
- Tauri CLI

Install Tauri CLI:

```bash
cargo install tauri-cli
```

---

### Clone the Repository

```bash
git clone https://github.com/yourname/speedhive.git
cd speedhive
```

---

### Install Dependencies

```bash
pnpm install
```

---

### Run the App in Dev Mode

```bash
pnpm run dev:desktop
```

---

### Build for Production

```bash
pnpm run tauri build
```

The output binaries will be available inside the `src-tauri/target` directory.

---

## 🤝 Contributing

Contributions are welcome once the initial core features are complete. Feel free to submit issues or pull requests.
