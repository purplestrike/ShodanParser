🕵️‍♂️ ShodanParser

Turn Shodan data chaos into clean CSV for threat hunting.

ShodanParser — Shodan JSON ➜ Clean CSV for Threat Hunting

🔗 Live Demo (GitHub Pages):
https://purplestrike.github.io/ShodanParser/

🔑 Key Features
1. JSON Beautify

Pretty-prints your raw Shodan JSON for easier reading.

Detects and auto-fixes common issues:

Smart quotes → standard quotes

Unquoted keys → quoted keys

Trailing commas → removed

Single quotes → double quotes

If auto-fix succeeds, corrected JSON is shown in the editor.

2. JSON Validation

Checks if your JSON is valid.

Displays clear error messages with line/column hints.

Highlights the exact error location in the editor for quick fixes.

If possible, the auto-fix engine repairs errors and marks JSON as valid.

3. File Upload Support

Upload .json files exported from Shodan directly.

Supports large files and JSON Lines (NDJSON) format.

Automatically applies the same validation and auto-fix logic as paste input.

4. Quick Field Toggles

One-click extraction of common Shodan fields into CSV:

IP (ip_str)

Domain(s) (hostnames, domains, HTTP host)

Ports

City (from location.city)

Organization (org/isp/asn)

Vulnerabilities (CVE list)

Web Technologies (products, components, servers)

Versions (software/service versions)

5. Filtering

Two types of filters applied at row-level before CSV export:

Include filter: Row must contain all specified terms.

Exclude filter: Row must not contain any of the terms.

Case-insensitive and supports multiple terms separated by ;.

6. CSV Preview & Download

After extraction, results are displayed in a live preview table.

Preview reflects:

Expanded rows (e.g., multiple CVEs → multiple rows).

All selected quick fields and filters.

Single-click Download CSV for use in Excel, SIEM, or further analysis.

7. 🧮 Unique Counts (Mini Summary) — New

A compact Mini Summary appears above the preview showing unique counts of the selected quick fields, computed after filters (i.e., counts match what you see in the preview).

Counts shown:

IP, Domain(s), Ports, City, Organization, Vulnerabilities, Products, Versions

Notes:

Only selected fields are counted (toggle a field on to include it in the counts).

Duplicates are removed across all kept rows—counts are unique.

8. 📦 Excel Export (.xlsx) with Merged Cells — New

In addition to CSV, you can download a real .xlsx workbook that:

Preserves the preview layout with merged & centered cells for IP and Organization across multi-row groups (e.g., many CVEs for the same host).

Opens directly in Excel without warnings.

Implemented fully in-browser (no server): creates a minimal OpenXML spreadsheet and zips it on the fly.

Button appears next to CSV as “Download XLSX (merged)” and is styled to match.

🛠 Step by Step Usage

Open the tool
Visit ShodanParser
.

Paste or Upload JSON

Paste JSON into the left editor, or

Click Upload JSON to import a .json file.

Beautify (Optional)
Click Beautify to format the JSON for readability.
Any auto-fix corrections are applied instantly.

Validate (Optional)
Click Validate to check if JSON is valid.
Errors are highlighted with exact position info.

Select Fields
Use Quick Fields checkboxes to extract standard fields like IP, Ports, Domains, etc.

Apply Filters (Optional)

Add Include terms: e.g., 443; nginx; ssl

Add Exclude terms: e.g., ftp; telnet
Rows are filtered before preview and export.

Extract & Preview
Click Extract & Download CSV.

A live preview appears at the bottom.

A Mini Summary above the preview shows unique counts of the selected fields (based on filtered/previewed rows).

Download

Download CSV — standard CSV (note: CSV format does not support merged cells).

Download XLSX (merged) — real Excel with merged & centered cells for IP and Organization groups (matches the preview layout).

Clear (Optional)
Use Clear to reset input, output, preview, and messages.
