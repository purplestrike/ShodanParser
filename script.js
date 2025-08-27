/***** Utilities: message center *****/
function showMsg(text, type = "info") {
  const wrap = document.getElementById("messages");
  const el = document.createElement("div");
  el.className = `msg ${type}`;
  el.textContent = text;
  wrap.appendChild(el);
  const msgs = wrap.querySelectorAll(".msg");
  if (msgs.length > 6) wrap.removeChild(msgs[0]);
}
function clearMsgs() {
  const wrap = document.getElementById("messages");
  wrap.innerHTML = "";
}
function runSearch() {
  showMsg("🔎 Running search with current filters…", "info");
  extractToCSV();
}

/***** JSON Parse with line/col & selection *****/
function parseJSONWithContext(text) {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (err) {
    let position = null;
    const posMatch = /position (\d+)/i.exec(err.message);
    if (posMatch) position = parseInt(posMatch[1], 10);

    let line = null, col = null;
    const lineColMatch = /line (\d+) column (\d+)/i.exec(err.message);
    if (lineColMatch) {
      line = parseInt(lineColMatch[1], 10);
      col  = parseInt(lineColMatch[2], 10);
    } else if (position !== null) {
      let l = 1, c = 1;
      for (let i = 0; i < Math.min(position, text.length); i++) {
        if (text[i] === "\n") { l++; c = 1; } else { c++; }
      }
      line = l; col = c;
    }
    return { ok: false, error: err, line, col, position };
  }
}

/***** Error panel helpers *****/
function setInputErrorState(on, errorMeta) {
  const ta = document.getElementById("beautifyInput");
  const details = document.getElementById("errorDetails");
  const dump = document.getElementById("errorDump");
  if (on) {
    ta.classList.add("error");
    details.style.display = "block";
    let msg = errorMeta?.error ? String(errorMeta.error) : "Unknown error";
    if (errorMeta?.line && errorMeta?.col) {
      msg += `\n\nApprox. location: line ${errorMeta.line}, column ${errorMeta.col}`;
    }
    dump.textContent = msg;
    if (typeof errorMeta.position === "number") {
      try {
        ta.focus();
        ta.setSelectionRange(errorMeta.position, Math.min(errorMeta.position + 1, ta.value.length));
      } catch {}
    }
  } else {
    ta.classList.remove("error");
    details.style.display = "none";
    dump.textContent = "";
  }
}

/***** Auto-fix engine *****/
function normalizeSmartQuotes(s) {
  return s
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2018\u2019\u2032]/g, "'");
}
function stripComments(s) {
  return s
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}
function removeTrailingCommas(s) {
  return s.replace(/,\s*(?=[}\]])/g, "");
}
function quoteUnquotedKeys(s) {
  return s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_\-.$]*)(\s*:)/g, '$1"$2"$3');
}
function singleToDoubleQuotedStrings(s) {
  return s.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, function(_, inner) {
    const unescaped = inner.replace(/"/g, '\\"');
    return `"${unescaped}"`;
  });
}
function fixConcatenatedObjects(s) {
  const joined = s.replace(/}\s*{(?=\s*")/g, "},\n{");
  if (/^\s*{[\s\S]*}\s*,\s*{[\s\S]*}\s*$/.test(joined)) return `[${joined}]`;
  return joined;
}
function tryParseJSONL(s) {
  const lines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) return null;
  const arr = [];
  for (const line of lines) {
    try { arr.push(JSON.parse(line)); } catch { return null; }
  }
  return arr;
}
function autoFixJSON(raw) {
  const notes = [];
  const jsonl = tryParseJSONL(raw);
  if (jsonl) {
    notes.push("Detected JSON Lines and converted to array.");
    return { ok: true, data: jsonl, fixedText: JSON.stringify(jsonl, null, 2), notes };
  }
  const attempts = [];
  attempts.push(function A(text) {
    let s = text; s = normalizeSmartQuotes(s); s = stripComments(s);
    if (s !== text) return s; return null;
  });
  attempts.push(function B(text) {
    let s = text; const s1 = singleToDoubleQuotedStrings(s); const s2 = quoteUnquotedKeys(s1);
    if (s2 !== text) return s2; return null;
  });
  attempts.push(function C(text) {
    const s = removeTrailingCommas(text); if (s !== text) return s; return null;
  });
  attempts.push(function D(text) {
    const s = fixConcatenatedObjects(text); if (s !== text) return s; return null;
  });
  attempts.push(function E(text) {
    if (/^\s*{[\s\S]*}\s*$/.test(text) === false && text.includes("}\n{")) {
      return `[${text.replace(/}\s*\n\s*{/g, "},\n{")}]`;
    }
    return null;
  });

  let current = raw;
  for (const stage of attempts) {
    const transformed = stage(current);
    if (transformed !== null) {
      current = transformed;
      try {
        const data = JSON.parse(current);
        notes.push("Applied automatic formatting and common fixes (quotes/keys/comments/trailing commas/joins).");
        return { ok: true, data, fixedText: JSON.stringify(data, null, 2), notes };
      } catch { continue; }
    }
  }
  try {
    const parts = raw.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
    if (parts.length > 1) {
      const objs = parts.map(JSON.parse);
      notes.push("Merged multiple JSON chunks into an array.");
      return { ok: true, data: objs, fixedText: JSON.stringify(objs, null, 2), notes };
    }
  } catch {}
  return { ok: false, notes };
}
function parseWithAutoFix(text) {
  const strict = parseJSONWithContext(text);
  if (strict.ok) return { ok: true, data: strict.data, fixed: false, fixedText: text, notes: [] };
  const fixed = autoFixJSON(text);
  if (fixed.ok) return { ok: true, data: fixed.data, fixed: true, fixedText: fixed.fixedText, notes: fixed.notes };
  return { ok: false, errorCtx: strict };
}

/***** Editor helpers *****/
function intToIP(num) {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255
  ].join(".");
}
function isIP(value) {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split(".").every(oct => Number(oct) >= 0 && Number(oct) <= 255);
  }
  if (/^[0-9a-f:]+$/i.test(value) && value.includes(":")) return true;
  return false;
}

/***** UI actions *****/
function beautifyJSON() {
  clearMsgs();
  const input = document.getElementById("beautifyInput").value;
  const res = parseWithAutoFix(input);
  if (!res.ok) {
    setInputErrorState(true, res.errorCtx);
    document.getElementById("beautifyOutput").value = "";
    showMsg("❌ Invalid JSON — auto-fix couldn’t recover. See error details below.", "bad");
    return;
  }
  setInputErrorState(false);
  const pretty = JSON.stringify(res.data, null, 2);
  document.getElementById("beautifyOutput").value = pretty;
  if (res.fixed) {
    document.getElementById("beautifyInput").value = res.fixedText;
    showMsg("🛠️ Auto-fixed and beautified JSON.", "good");
  } else {
    showMsg("✅ Beautified successfully.", "good");
  }
}

function validateJSON() {
  clearMsgs();
  const input = document.getElementById("beautifyInput").value;
  const res = parseWithAutoFix(input);
  if (!res.ok) {
    setInputErrorState(true, res.errorCtx);
    document.getElementById("beautifyOutput").value = "❌ Invalid JSON";
    showMsg("❌ Invalid JSON — auto-fix couldn’t recover. See details below.", "bad");
  } else {
    setInputErrorState(false);
    document.getElementById("beautifyOutput").value = "✅ Valid JSON";
    showMsg(res.fixed ? "🛠️ JSON was auto-corrected and is now valid." : "✅ JSON is valid.", "good");
    if (res.fixed) document.getElementById("beautifyInput").value = res.fixedText;
  }
}

function uploadJSON() {
  clearMsgs();
  const fileInput = document.getElementById("fileInput");
  fileInput.click();
  fileInput.onchange = function () {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      const text = e.target.result;
      const res = parseWithAutoFix(text);
      if (!res.ok) {
        document.getElementById("beautifyInput").value = text;
        setInputErrorState(true, res.errorCtx);
        showMsg("⚠️ File loaded, but JSON is invalid — auto-fix failed. Please review the highlighted area.", "warn");
        return;
      }
      setInputErrorState(false);
      document.getElementById("beautifyInput").value = res.fixed ? res.fixedText : JSON.stringify(res.data, null, 2);
      showMsg(res.fixed ? "🛠️ Loaded and auto-corrected JSON file." : "✅ JSON file loaded successfully!", "good");
    };
    reader.readAsText(file);
  };
}

function clearText() {
  clearMsgs();
  document.getElementById("beautifyInput").value = "";
  document.getElementById("beautifyOutput").value = "";
  document.getElementById("downloadLink").style.display = "none";
  document.getElementById("csvPreviewSection").style.display = "none";
  setInputErrorState(false);
  showMsg("🧹 Cleared.", "info");
}

/***** CSV Extraction + Preview (Quick Fields + Filters only) *****/
function extractToCSV() {
  clearMsgs();
  const inputText = document.getElementById("beautifyInput").value;

  // Parse with auto-fix
  const res = parseWithAutoFix(inputText);
  if (!res.ok) {
    setInputErrorState(true, res.errorCtx);
    showMsg("❌ Invalid JSON — cannot extract CSV. Auto-fix failed. See error details.", "bad");
    return;
  }
  setInputErrorState(false);
  if (res.fixed) {
    document.getElementById("beautifyInput").value = res.fixedText;
    showMsg("🛠️ Auto-corrected JSON before extraction.", "good");
  }

  // Normalize to array
  let data = res.data;
  if (!Array.isArray(data)) data = [data];

  // Toggles
  const includeIP        = document.getElementById("field_ip").checked;
  const includeDomain    = document.getElementById("field_domain").checked;
  const includePorts     = document.getElementById("field_ports").checked;
  const includeCity      = document.getElementById("field_city").checked;
  const includeOrg       = document.getElementById("field_org").checked;
  const includeVulns     = document.getElementById("field_vulns").checked;
  const includeWebTech   = document.getElementById("field_webtech").checked;
  const includeVersions  = document.getElementById("field_versions").checked;

  // Headers (no Advanced Fields)
  const headers = [];
  if (includeIP)       headers.push("IP");
  if (includeDomain)   headers.push("Domain(s)");
  if (includePorts)    headers.push("Ports");
  if (includeCity)     headers.push("City");
  if (includeOrg)      headers.push("Organization");
  if (includeVulns)    headers.push("Vulnerabilities");
  if (includeWebTech)  headers.push("Products");
  if (includeVersions) headers.push("Versions");

  // Filters
  const incTerms = (document.getElementById("includeFilter")?.value || "")
    .split(";").map(s => s.trim().toLowerCase()).filter(Boolean);
  const excTerms = (document.getElementById("excludeFilter")?.value || "")
    .split(";").map(s => s.trim().toLowerCase()).filter(Boolean);

  const passesFilter = (rowArray) => {
    const s = rowArray.join(",").toLowerCase();
    for (const t of incTerms) if (!s.includes(t)) return false;
    for (const t of excTerms) if (s.includes(t))  return false;
    return true;
  };

  // Prepare preview skeleton
  const previewDiv = document.getElementById("csvPreview");
  previewDiv.innerHTML = "";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");

  // CSV rows (mirrors preview)
  const csvRows = [headers.join(",")];

  // Build preview+CSV per JSON item (host)
  data.forEach(item => {
    // Gather column arrays/values
    let ipVal = "";
    if (includeIP) {
      ipVal = item.ip_str || (typeof item.ip === "number" ? intToIP(item.ip >>> 0) : "");
    }

    let orgVal = "";
    if (includeOrg) {
      orgVal = item.org || item.isp || item.asn || "";
    }

    let domains = [];
    if (includeDomain) {
      const d = [];
      if (Array.isArray(item.hostnames)) d.push(...item.hostnames);
      if (Array.isArray(item.domains))   d.push(...item.domains);
      if (item.http && item.http.host)   d.push(item.http.host);
      domains = [...new Set(d.filter(x => x && !isIP(x)))];
    }

    let ports = [];
    if (includePorts) {
      if (item.port != null) ports = [String(item.port)];
    }

    let cities = [];
    if (includeCity) {
      if (item.location && item.location.city) cities = [item.location.city];
    }

    let vulns = [];
    if (includeVulns) {
      const vkeys = (item.vulns && typeof item.vulns === "object") ? Object.keys(item.vulns) : [];
      vulns = vkeys;
    }

    let techs = [];
    let vers  = [];
    if (includeWebTech || includeVersions) {
      const t = [], v = [];
      if (item.data && Array.isArray(item.data)) {
        item.data.forEach(svc => {
          if (svc.product) t.push(svc.product);
          if (svc.version) v.push(svc.version);
        });
      }
      if (item.http && item.http.components) {
        const comps = item.http.components;
        for (const compName in comps) {
          t.push(compName);
          if (Array.isArray(comps[compName].versions)) v.push(...comps[compName].versions);
        }
      }
      if (item.http && item.http.server) t.push(item.http.server);
      techs = [...new Set(t.filter(Boolean))];
      vers  = [...new Set(v.filter(Boolean))];
    }

    // Total logical rows before filtering (max length of multi columns)
    const rowCount = Math.max(
      1,
      includeDomain ? (domains.length || 0) : 0,
      includePorts ? (ports.length || 0) : 0,
      includeCity ? (cities.length || 0) : 0,
      includeVulns ? (vulns.length || 0) : 0,
      includeWebTech ? (techs.length || 0) : 0,
      includeVersions ? (vers.length || 0) : 0
    );

    // Build all candidate rows, then apply filters to determine final rows
    const candidates = [];
    for (let i = 0; i < rowCount; i++) {
      const row = [];
      if (includeIP)       row.push(i === 0 ? ipVal : "");
      if (includeDomain)   row.push(domains[i] || "");
      if (includePorts)    row.push(ports[i] || "");
      if (includeCity)     row.push(cities[i] || "");
      if (includeOrg)      row.push(i === 0 ? orgVal : "");
      if (includeVulns)    row.push(vulns[i] || "");
      if (includeWebTech)  row.push(techs[i] || "");
      if (includeVersions) row.push(vers[i] || "");
      candidates.push(row);
    }

    // Apply include/exclude filters; keep only passing rows
    const kept = candidates.filter(r => passesFilter(r));
    const finalCount = kept.length;
    if (finalCount === 0) return;

    // Render preview rows with proper rowSpan for IP/Org
    for (let i = 0, j = 0; i < rowCount; i++) {
      const row = candidates[i];
      if (!passesFilter(row)) continue;

      const tr = document.createElement("tr");
      let cursor = 0;

      // IP (rowspan)
      if (includeIP) {
        const val = row[cursor++];
        if (val !== "" && j === 0) {
          const td = document.createElement("td");
          td.textContent = val;
          td.rowSpan = finalCount;
          tr.appendChild(td);
        }
      }

      // Domain(s)
      if (includeDomain) {
        const td = document.createElement("td");
        td.textContent = row[cursor++];
        tr.appendChild(td);
      }

      // Ports
      if (includePorts) {
        const td = document.createElement("td");
        td.textContent = row[cursor++];
        tr.appendChild(td);
      }

      // City
      if (includeCity) {
        const td = document.createElement("td");
        td.textContent = row[cursor++];
        tr.appendChild(td);
      }

      // Organization (rowspan)
      if (includeOrg) {
        const val = row[cursor++];
        if (val !== "" && j === 0) {
          const td = document.createElement("td");
          td.textContent = val;
          td.rowSpan = finalCount;
          tr.appendChild(td);
        }
      }

      // Vulnerabilities
      if (includeVulns) {
        const td = document.createElement("td");
        td.textContent = row[cursor++];
        tr.appendChild(td);
      }

      // Web technologies
      if (includeWebTech) {
        const td = document.createElement("td");
        td.textContent = row[cursor++];
        tr.appendChild(td);
      }

      // Versions
      if (includeVersions) {
        const td = document.createElement("td");
        td.textContent = row[cursor++];
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
      csvRows.push(row.join(","));
      j++; // count of kept rows rendered
    }
  });

  table.appendChild(tbody);
  previewDiv.appendChild(table);
  document.getElementById("csvPreviewSection").style.display = "block";

  // Create CSV blob & link (mirrors preview 1:1)
  const csvString = csvRows.join("\n");
  const downloadLink = document.getElementById("downloadLink");
  if (downloadLink.href) URL.revokeObjectURL(downloadLink.href);
  const blob = new Blob([csvString], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  downloadLink.href = url;
  downloadLink.download = "shodan_output.csv";
  downloadLink.style.display = "block";
  downloadLink.textContent = "Download CSV";

  showMsg("✅ CSV extraction successful — preview below & CSV mirrors the preview.", "good");
}
