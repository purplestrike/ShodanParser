# 🕵️‍♂️ ShodanParser — From Shodan JSON to Actionable CSV/XLSX

<p align="center">
  <img src="purple_strike_logo_transparent.png" alt="Purple Strike" width="160"/>
</p>

<p align="center">
  <b>Client‑side Shodan JSON ➜ clean CSV/XLSX with live preview, filters, and summaries.</b><br/>
  <a href="https://purplestrike.github.io/ShodanParser/"><b>🌐 Live Demo</b></a> ·
  <a href="#-features"><b>✨ Features</b></a> ·
  <a href="#-quick-start"><b>🚀 Quick Start</b></a> ·
  <a href="#-usage"><b>🧭 Usage</b></a> ·
  <a href="#-faq"><b>❓ FAQ</b></a>
</p>

<p align="center">
  <a href="https://github.com/purplestrike/ShodanParser/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/purplestrike/ShodanParser?style=for-the-badge"></a>
  <a href="https://github.com/purplestrike/ShodanParser/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/purplestrike/ShodanParser?style=for-the-badge"></a>
  <a href="https://github.com/purplestrike/ShodanParser/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/purplestrike/ShodanParser?style=for-the-badge"></a>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blueviolet?style=for-the-badge">
  <img alt="Status" src="https://img.shields.io/badge/status-active-success?style=for-the-badge">
</p>

---

## 👋 Overview
**ShodanParser** is a lightweight, **100% client‑side** utility that converts raw, messy **Shodan JSON** into **structured CSV/XLSX** for fast triage, reporting, and threat hunting. Paste JSON or upload a file, select the fields you need, filter results, preview live, and export in seconds — **no server, no data leaves your browser**.

> Built as part of **Purple Strike** — sharing tools and research with the cybersecurity community.

---

## ✨ Features
- **🧼 Beautify & Auto‑Fix** common JSON issues (quotes, trailing commas, unquoted keys, JSONL)
- **✅ Validate** with clear error hints (line/column) + automatic repair when possible
- **⬆️ Upload** Shodan `.json` or **NDJSON/JSON Lines**
- **🎚️ Quick Fields**: IP, Domains, Ports, City, Organization, Vulnerabilities, Products, Versions
- **🔎 Filters**: include/exclude terms (case‑insensitive, `;` delimited)
- **👀 Live Preview** with readable grouping and per‑row filtering
- **🧮 Mini Summary**: unique counts for selected fields (post‑filter)
- **📦 Exports**
  - **CSV** for SIEM/Excel
  - **XLSX** (*real OpenXML*) with **merged & centered cells** for IP/Organization
- **⚡ Fast**: Web Worker offloads heavy parsing to keep the UI smooth
- **🔐 Private by design**: runs entirely in your browser

---

## 🚀 Quick Start
### Option A — Use it online
1. Open the **Live Demo**: https://purplestrike.github.io/ShodanParser/
2. Paste or upload your Shodan JSON.
3. Click **Extract & Download** to export CSV/XLSX.

### Option B — Run locally
```bash
# clone
git clone https://github.com/purplestrike/ShodanParser.git
cd ShodanParser

# serve (recommended to avoid worker issues on file://)
# use any static server; examples:
python -m http.server 8080
# or
npx serve . -p 8080
```
Then visit `http://localhost:8080` and open `index.html`.

> ⚠️ Workers are blocked on `file://`. Use a local server for the best experience.

---

## 🧭 Usage
1. **Paste / Upload JSON** (supports single JSON object, array, or JSONL).
2. **Beautify** *(optional)* — pretty‑print and auto‑fix common issues.
3. **Validate** *(optional)* — get clear error messages; auto‑repair when possible.
4. **Select Fields** — toggle IP, Domains, Ports, etc.
5. **Filter** *(optional)* — add `include` terms (all must match) and `exclude` terms (any blocks).
6. **Search (Preview Only)** — render a preview table without download links.
7. **Extract & Download** — preview + **CSV** and **XLSX** download links.
8. **Mini Summary** — unique counts of selected fields, **after filters**.
9. **Clear** — reset everything with one click.

---

## 🧠 How it Works
- **Client‑only:** No backend. Your data never leaves your machine.
- **Web Worker:** `worker.js` parses JSON, extracts fields, dedupes, applies filters, and streams progress.
- **XLSX Builder:** Minimal **OpenXML** workbook built on the fly (no third‑party libs), with _merged_ & _centered_ IP/Org cells to mirror the preview layout.
- **Safety:** CSV/Excel **formula‑injection** guarded by prefixing `'=+-@` values with `'` during export.

### Extracted Fields (Quick Toggles)
- **IP** (`ip_str` or numeric `ip` → dotted quad)
- **Domain(s)** (root domains from `hostnames`, `domains`, `http.host` with public‑suffix awareness)
- **Ports** (from `port` and nested `data[].port`)
- **City** (`location.city`)
- **Organization** (`org`, `isp`, or `asn`)
- **Vulnerabilities** (`opts.vulns[]` on host/services; CVEs normalized to uppercase)
- **Products** (`data[].product`, `http.server`)
- **Versions** (aligned with products)
- **Web Technologies** (`http.components` keys, lowercased)

---

## 📸 Screenshots
> Replace with your own captures.
- **Home / Editors / Toolbar**
- **Live Preview with Grouping & Summary**
- **XLSX in Excel with Merged IP/Org**

```
docs/
  screenshots/
    editor.png
    preview.png
    xlsx.png
```

---

## 🧪 Sample Data
```jsonc
// JSON Lines (NDJSON) — supported
{"ip_str":"203.0.113.10","port":443,"org":"Example ISP","http":{"server":"nginx","host":"app.example.com","components":{"openssh":{}, "nginx":{}}},"opts":{"vulns":["CVE-2023-12345"]}}
{"ip_str":"203.0.113.10","port":80,"http":{"host":"www.example.com"}}
{"ip_str":"198.51.100.22","port":22,"org":"Example Org","data":[{"product":"OpenSSH","version":"8.4","port":22}]}
```

---

## 🛣️ Roadmap
- [ ] Field mapping presets (e.g., “Asset Overview”, “Web Tech”, “Vuln Focus”)
- [ ] Export to **Parquet** and **JSONL** in addition to CSV/XLSX
- [ ] Save/Load user filter profiles (local storage)
- [ ] Pinned columns & column re‑ordering in preview
- [ ] Dark/light theme switch
- [ ] Drag‑drop file upload
- [ ] Offline PWA support

---

## 🐞 Troubleshooting
- **Workers blocked on file://** → Serve the folder locally (see _Quick Start_).
- **“Invalid JSON — auto‑fix couldn’t recover.”** → Check if the file is truncated; try **Beautify** first.
- **CSV opens with formulas** → Guard is enabled; values starting with `= - + @` are automatically prefixed with `'`.

---

## 🤝 Contributing
PRs and issues are welcome! If you’re proposing a feature, describe the **use‑case**, mock up the **output**, and include a small **sample JSON**. For bugs, attach a minimal repro JSON and steps.

---

## 🧱 Tech Stack
- **HTML/CSS/JS** (vanilla)
- **Web Workers** for parsing/extraction
- **OpenXML** XLSX generator (custom, minimal ZIP writer)
- **No backend, no analytics**

---

## 🔒 Security & Privacy
This tool runs entirely **client‑side**. Neither your **JSON** nor exported files leave your browser. Always handle sensitive data according to your organization’s policies.

---

## 📄 License
MIT © Purple Strike

---

## 🙏 Acknowledgements
- Inspired by day‑to‑day threat hunting and OSINT workflows.
- Shodan data model references their public JSON fields.

---

## ❓ FAQ
**Q: Do counts include filtered‑out rows?**  
A: No — the **Mini Summary** reflects **post‑filter** results only.

**Q: Why are IP & Organization merged in XLSX?**  
A: They’re host‑level attributes spanning multiple detail rows (e.g., many CVEs/domains per host). Merging keeps reports readable.

**Q: CSV shows no merged cells — bug?**  
A: CSV doesn’t support merged cells. Use **XLSX** for formatted reporting.

**Q: How are domains normalized?**  
A: Hostnames are reduced to a **registrable domain** using a compact public‑suffix list and lowercased; IP‑like strings are excluded by default.
