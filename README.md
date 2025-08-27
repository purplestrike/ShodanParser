# 🕵️‍♂️ ShodanInsights
*Turn Shodan data chaos into clean CSV for threat hunting.*

# ShodanInsights — Shodan JSON ➜ Clean CSV for Threat Hunting

Convert messy **Shodan JSON output** into clean, structured **CSV** with filters and a preview table.  
Built for threat hunters, researchers, and analysts who need to quickly make sense of Shodan data.

🔗 **Live Demo (GitHub Pages):**  
[https://github.com/purplestrike/ShodanParser/](https://github.com/purplestrike/ShodanParser/)
[https://github.com/purplestrike/ShodanParser/](https://purplestrike.github.io/ShodanParser/)


## 🔑 Key Features

### 1. JSON Beautify
- Pretty-prints your raw Shodan JSON for easier reading.
- Detects and **auto-fixes** common issues:
  - Smart quotes → standard quotes  
  - Unquoted keys → quoted keys  
  - Trailing commas → removed  
  - Single quotes → double quotes  
- If auto-fix succeeds, corrected JSON is shown in the editor.

### 2. JSON Validation
- Checks if your JSON is valid.  
- Displays clear **error messages** with line/column hints.  
- Highlights the exact error location in the editor for quick fixes.  
- If possible, the auto-fix engine repairs errors and marks JSON as valid.

### 3. File Upload Support
- Upload `.json` files exported from Shodan directly.  
- Supports large files and **JSON Lines (NDJSON)** format.  
- Automatically applies the same validation and auto-fix logic as paste input.

### 4. Quick Field Toggles
- One-click extraction of common Shodan fields into CSV:
  - **IP** (`ip_str`)
  - **Domain(s)** (hostnames, domains, HTTP host)
  - **Ports**
  - **City** (from `location.city`)
  - **Organization** (org/isp/asn)
  - **Vulnerabilities** (CVE list)
  - **Web Technologies** (products, components, servers)
  - **Versions** (software/service versions)

### 5. Filtering
- Two types of filters applied at row-level before CSV export:
  - **Include filter**: Row must contain *all* specified terms.
  - **Exclude filter**: Row must *not* contain any of the terms.
- Case-insensitive and supports multiple terms separated by `;`.

### 6. CSV Preview & Download
- After extraction, results are displayed in a **live preview table**.
- Preview reflects:
  - Expanded rows (multiple rows if multiple CVEs are present).
  - All selected quick fields and filters.
- Single-click **Download CSV** for use in Excel, SIEM, or further analysis.

---

## 🛠 Step by Step Usage

1. **Open the tool**  
   Visit [ShodanInsights](https://purplestrike.github.io/ShodanInsights/).

2. **Paste or Upload JSON**  
   - Paste JSON into the left editor, or  
   - Click **Upload JSON** to import a `.json` file.

3. **Beautify (Optional)**  
   Click **Beautify** to format the JSON for readability.  
   Any auto-fix corrections are applied instantly.

4. **Validate (Optional)**  
   Click **Validate** to check if JSON is valid.  
   Errors are highlighted with exact position info.

5. **Select Fields**  
   Use **Quick Fields** checkboxes to extract standard fields like IP, Ports, Domains, etc.

6. **Apply Filters (Optional)**  
- Add **Include terms**: e.g., `443; nginx; ssl`  
- Add **Exclude terms**: e.g., `ftp; telnet`  
Rows are filtered before export.

7. **Extract CSV**  
Click **Extract & Download CSV**.  
- Preview appears at the bottom.  
- A **Download CSV** button is displayed.

8. **Clear (Optional)**  
Use **Clear** to reset input, output, preview, and messages.
