
# 🕵️‍♂️ ShodanParser — Turn Shodan JSON Chaos into Actionable Intelligence

<p align="center">
  <b>From raw Shodan JSON ➜ clean CSV/XLSX for fast threat hunting.</b><br/>
  <a href="https://purplestrike.github.io/ShodanParser/">🌐 Live Demo</a> ·
  <a href="#-key-features">✨ Features</a> ·
  <a href="#-usage">🚀 Usage</a> ·
  <a href="#-faq">❓ FAQ</a>
</p>

---

## ✨ Why ShodanParser?
Security researchers often export Shodan results as large, messy JSON. ShodanParser converts that into **clean, filtered, and structured** data you can immediately use — **no backend, 100% client-side**.

---

## 🔑 Key Features

### 🧼 1) JSON Beautify & Auto‑Fix
- Pretty‑prints your raw Shodan JSON.
- Smart, safe auto‑fixes for common issues:
  - “Smart quotes” → standard quotes
  - Unquoted keys → quoted
  - Trailing commas → removed
  - Single quotes → double quotes
- If auto‑fix succeeds, the corrected JSON is shown in the editor.

### ✅ 2) JSON Validation
- Validates JSON and shows **clear errors** with **line/column** hints.
- Highlights approximate error position in the editor.
- When possible, auto‑repairs and marks as valid.

### ⬆️ 3) File Upload
- Upload `.json` files exported from Shodan.
- Supports **NDJSON/JSON Lines**.
- Same beautify + validation pipeline applies.

### 📦 4) Extracted Fields

You choose the columns; the tool builds rows and expands multi-values when needed.

- **IP** — `ip_str` or numeric IP converted to dotted quad  
- **Domain(s)** — registrable roots from hostnames/domains/http.host (deduped)  
- **Ports** — union of `port` across host/services  
- **City** — `location.city` (if present)  
- **Organization** — best of `org` / `isp` / `asn`  
- **Vulnerabilities** — CVE list (normalized to `CVE-YYYY-NNNN`)  
- **Product** — service banner products (incl. `http.server`)  
- **Web Technologies** — `http.components` keys (deduped)  
- **Versions** — version parsed from product/banner (fallbacks handled)  
- **CVSS** — best available score per CVE (cvssv3.base_score → cvss → empty)  
- **Timestamp** — host’s observed time (prefers `last_update` → `timestamp` → `last_seen`)

### 🔎 5) Powerful Filtering
- **Include** filter → Row must contain **all** terms.
- **Exclude** filter → Row must contain **none** of the terms.
- Case‑insensitive; separate multiple terms with `;`.

### 👀 6) Live Preview
- See results in a styled table before download.
- Multi‑value fields (e.g., many CVEs) are expanded as multiple rows.

### 🧮 7) Mini Summary (Unique Counts) — *New*
Above the preview you get **unique counts** for the fields you selected:
> **IP**, **Domain(s)**, **Ports**, **City**, **Organization**, **Vulnerabilities**, **Products**, **Versions**  
Counts are computed **after filters**, so they match exactly what you see.

### 📦 8) True Excel Export (.xlsx) with Merge & Center — *New*
- Download a real **`.xlsx`** workbook (no warnings) built entirely in‑browser.
- **IP** and **Organization** cells are **merged & centered** across multi‑row groups (e.g., many CVEs or domains per host) — mirroring the preview.
- Great for sharing and executive reporting.

### 📄 9) CSV Export
- Standard CSV for quick analysis in Excel, SIEM, or further scripting.
- Note: CSV format doesn’t support merged cells; use **XLSX** for that layout.

---

## 🚀 Usage

1. **Open the tool**  
   👉 <a href="https://purplestrike.github.io/ShodanParser/">https://purplestrike.github.io/ShodanParser/</a>

2. **Paste or Upload JSON**  
   - Paste into the left editor, or  
   - Click **Upload JSON** and select a Shodan `.json` file.

3. **Beautify** *(optional)*  
   - Click **Beautify** to format and auto‑fix.

4. **Validate** *(optional)*  
   - Click **Validate** to confirm correctness; errors show with line/column info.

5. **Choose Your Fields**  
   - Tick **Quick Fields** (IP, Ports, Domains, etc.).

6. **Apply Filters** *(optional)*  
   - **Include**: e.g., `443; nginx; ssl`  
   - **Exclude**: e.g., `ftp; telnet`

7. **Extract & Preview**  
   - Click **Extract & Download CSV** to generate a live preview table.  
   - A **Mini Summary** of **unique counts** appears above the preview.

8. **Download**  
   - **Download CSV** for a flat file.  
   - **Download XLSX (merged)** for a formatted Excel sheet with **merged & centered** IP/Org columns.

9. **Clear** *(optional)*  
   - Click **Clear** to reset inputs, outputs, preview, and messages.

---

## 🧠 How It Works (Tech Notes)
- 100% **client‑side** — your Shodan data **never leaves your browser**.
- The XLSX export builds a minimal **OpenXML** workbook and zips it on the fly.
- The preview table uses simple **rowspan** to simulate merge & center; the XLSX does the real thing with `<mergeCells>` and centered alignment.

---

## 🧩 Tips & Tricks
- Turn on only the fields you need — the **Mini Summary** shows counts **only for selected fields**.
- Combine Include/Exclude filters to narrow down technology stacks:
  - Include: `443; nginx`
  - Exclude: `test; staging`
- Prefer **XLSX** when sharing with non‑technical stakeholders.

---

## ❓ FAQ

**Q: Do counts include filtered‑out rows?**  
**A:** No. Counts reflect **only the rows that remain after filters**.

**Q: Why are IP and Organization merged?**  
**A:** They’re host‑level attributes spanning multiple detail rows (e.g., many CVEs). Merging keeps the sheet readable.

**Q: CSV doesn’t show merged cells. Is that a bug?**  
**A:** CSV doesn’t support formatting/merges. Use **XLSX** for that presentation.

---

## 🛠 Local Dev (VS Code)
- Open the folder in VS Code and use **Live Server** (or just open `index.html` in a browser).
- No backend required.

---

## 🌐 Deploy on GitHub Pages
1. Push to GitHub (branch: `main`).  
2. Repo → **Settings** → **Pages** → **Deploy from a branch** → `main` / root.  
3. Your app will be available at:  
   `https://purplestrike.github.io/ShodanParser/`

---

## 🤝 Contributing
PRs are welcome! Open an issue for bugs/ideas.

---

## 📜 License
MIT © Purple Strike
