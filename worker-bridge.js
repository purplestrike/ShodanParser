/* worker-bridge.js — two modes:
   - runPreview(): Preview ONLY (no CSV/XLSX links)
   - extractToCSV(): Preview + CSV/XLSX
   Includes robust worker init + progress handling + fallback.
*/

(function () {
  const originalExtract = window.extractToCSV;  // just in case
  let spWorker = null;
  let workerAvailable = false;
  let initTried = false;

  // Helpers from page
  const showMsg = window.showMsg || function(){};
  const clearMsgs = window.clearMsgs || function(){};
  const setInputErrorState = window.setInputErrorState || function(){};
  const styleCell = window.styleCell || function(){};
  const styleHeaderCell = window.styleHeaderCell || function(){};
  const exportXLSX = window.exportXLSX || null;
  const ensureExcelLink = window.ensureExcelLink || function(){ return document.getElementById("excelLink"); };

  const showProgress = window.showProgress || function(){};
  const setProgress = window.setProgress || function(){};
  const hideProgress = window.hideProgress || function(){};

  function colName(n) {
    let s = "", x = Number(n);
    do { s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26) - 1; } while (x >= 0);
    return s;
  }

  function initWorkerIfPossible() {
    if (initTried) return workerAvailable;
    initTried = true;
    try {
      spWorker = new Worker("worker.js");
      workerAvailable = true;
    } catch (e) {
      workerAvailable = false;
      const isFileURL = location.protocol === "file:";
      if (isFileURL) showMsg("⚠️ Workers blocked on file://. Use a local server. Falling back to normal mode.", "warn");
      else showMsg("⚠️ Worker init failed. Check path/case/CSP. Falling back to normal mode.", "warn");
    }
    return workerAvailable;
  }

  function readFlags(){
    const g = id => document.getElementById(id) || {};
    return {
      includeIP: !!g("field_ip").checked,
      includeDomain: !!g("field_domain").checked,
      includePorts: !!g("field_ports").checked,
      includeCity: !!g("field_city").checked,
      includeOrg: !!g("field_org").checked,
      includeVulns: !!g("field_vulns").checked,
      includeProdAndTech: !!g("field_webtech").checked,
      includeVersions: !!g("field_versions").checked
    };
  }

  // CSV with quoting + formula injection guard
  function toCSV(rows){
    const q = (v) => {
      if (v == null) v = "";
      v = String(v);
      if (/^[=\-+@]/.test(v)) v = "'" + v; // formula injection guard
      if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
      return v;
    };
    return rows.map(r => r.map(q).join(",")).join("\n");
  }

  function applySummary(summary){
    const mapping = {
      sum_ip: summary.ips,
      sum_domains: summary.domains,
      sum_ports: summary.ports,
      sum_cities: summary.cities,
      sum_orgs: summary.orgs,
      sum_vulns: summary.vulns,
      sum_products: summary.products,
      sum_versions: summary.versions,
      sum_webtech: summary.webtech
    };
    let any=false;
    for (const id in mapping){
      const el = document.getElementById(id);
      if (el){ el.textContent = String(mapping[id]||0); any=true; }
    }
    const wrap = document.getElementById("miniSummary");
    if (wrap && any) wrap.style.display = "block";
  }

  function renderPreview(headers, groups, makeDownloads){
    const previewDiv = document.getElementById("csvPreview");
    if (previewDiv) previewDiv.innerHTML = "";

    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headers.forEach(h=>{
      const th = document.createElement("th");
      th.textContent = h;
      styleHeaderCell(th);
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const idxMap = {};
    headers.forEach((h,i)=>{
      if (h==="IP") idxMap.ip=i;
      if (h==="Organization") idxMap.org=i;
    });

    const excelRows = [headers.slice()];
    const merges = [];
    const centerTopCells = new Set();
    let excelRowCursor = 1; // header row

    groups.forEach((group) => {
      const rows = group.rows || [];
      const finalCount = rows.length;
      if (!finalCount) return;

      const startRowExcel = excelRowCursor + 1;
      const endRowExcel = startRowExcel + finalCount - 1;

      const ipCol = idxMap.ip;
      const orgCol = idxMap.org;

      if (finalCount > 1) {
        if (ipCol != null) {
          const colA = colName(ipCol);
          merges.push(colA + startRowExcel + ":" + colA + endRowExcel);
          centerTopCells.add(colA + startRowExcel);
        }
        if (orgCol != null) {
          const colB = colName(orgCol);
          merges.push(colB + startRowExcel + ":" + colB + endRowExcel);
          centerTopCells.add(colB + startRowExcel);
        }
      } else {
        if (ipCol != null) centerTopCells.add(colName(ipCol) + startRowExcel);
        if (orgCol != null) centerTopCells.add(colName(orgCol) + startRowExcel);
      }

      let rendered = 0;
      rows.forEach((r) => {
        const tr = document.createElement("tr");
        headers.forEach((_, colIdx) => {
          const cellVal = r[colIdx] || "";
          if (colIdx === ipCol || colIdx === orgCol) {
            if (rendered === 0 && cellVal !== "") {
              const td = document.createElement("td");
              td.textContent = cellVal;
              td.rowSpan = finalCount;
              styleCell(td);
              td.style.textAlign = "center";
              td.style.verticalAlign = "middle";
              tr.appendChild(td);
            }
          } else {
            const td = document.createElement("td");
            td.textContent = cellVal;
            styleCell(td);
            tr.appendChild(td);
          }
        });
        tbody.appendChild(tr);
        excelRows.push(r.slice());
        excelRowCursor++;
        rendered++;
      });
    });

    table.appendChild(tbody);
    if (previewDiv){
      previewDiv.appendChild(table);
      const section = document.getElementById("csvPreviewSection");
      if (section) section.style.display = "block";
    }

    // Handle download links visibility
    const dl = document.getElementById("downloadLink");
    const xl = document.getElementById("excelLink") || ensureExcelLink();

    if (!makeDownloads){
      if (dl) dl.style.display = "none";
      if (xl) xl.style.display = "none";
      return; // preview only
    }

    // CSV (use excelRows so it matches preview exactly)
    const csvString = toCSV(excelRows);
    if (dl){
      try{ if (dl.href) URL.revokeObjectURL(dl.href); }catch(e){}
      const blob = new Blob([csvString], {type:"text/csv"});
      const url = URL.createObjectURL(blob);
      dl.href = url;
      dl.download = "shodan_output.csv";
      dl.style.display = "inline";
      dl.textContent = "Download CSV";
    }

    // XLSX
    if (exportXLSX) {
      const xlsxBlob = exportXLSX(excelRows, merges, centerTopCells);
      const xlsxUrl = URL.createObjectURL(xlsxBlob);
      const excelLink = ensureExcelLink();
      if (excelLink) {
        excelLink.href = xlsxUrl;
        excelLink.download = "shodan_output.xlsx";
        excelLink.style.display = "inline";
      }
    }
  }

  function run(mode /* "preview" | "extract" */){
    const inputEl = document.getElementById("beautifyInput");
    if (!inputEl) return;
    const flags = readFlags();
    const includeFilter = (document.getElementById("includeFilter") || {}).value || "";
    const excludeFilter = (document.getElementById("excludeFilter") || {}).value || "";

    const SUMMARY_MODE = window.SUMMARY_MODE || "unique_post_filter";
    const COUNT_IP_LIKE_DOMAINS = !!window.COUNT_IP_LIKE_DOMAINS;

    clearMsgs();
    showProgress(35, "35%");
    const start = performance.now();
    const makeDownloads = (mode === "extract");

    spWorker.onmessage = (e)=>{
      const { kind } = e.data || {};
      if (kind === "progress") {
        setProgress(e.data.pct);
        return;
      }
      if (kind === "error"){
        hideProgress();
        setInputErrorState(true, { error: e.data.message });
        showMsg("❌ " + e.data.message, "bad");
        return;
      }
      if (kind !== "ok") return;

      // Worker may return fixedText (auto-fix)
      if (e.data.fixedText && e.data.fixedText !== inputEl.value){
        inputEl.value = e.data.fixedText;
      }
      setInputErrorState(false);

      const { headers, groups, summary } = e.data;
      renderPreview(headers, groups, makeDownloads);
      applySummary(summary);

      const ms = Math.max(1, Math.round(performance.now() - start));
      hideProgress();
      showMsg(makeDownloads ? ("✅ Done (extract) — " + ms + " ms") : ("✅ Done (preview) — " + ms + " ms"), "good");
      showMsg("find the output below", "good");
    };

    try{
      spWorker.postMessage({
        kind: "parse_and_extract",
        text: inputEl.value || "",
        flags,
        includeFilter,
        excludeFilter,
        SUMMARY_MODE,
        COUNT_IP_LIKE_DOMAINS
      });
    }catch(e){
      hideProgress();
      showMsg("⚠️ Worker postMessage failed.", "warn");
      // Fallback to original (sync) if present
      if (typeof originalExtract === "function" && makeDownloads) return originalExtract();
    }
  }

  // Public functions
  window.runPreview = function(){
    const ok = initWorkerIfPossible();
    if (!ok) {
      // no worker: best effort — hide downloads and reuse originalExtract then hide links
      if (typeof originalExtract === "function") {
        originalExtract();
        const dl=document.getElementById("downloadLink"); if (dl) dl.style.display="none";
        const xl=document.getElementById("excelLink");   if (xl) xl.style.display="none";
      }
      return;
    }
    run("preview");
  };

  window.extractToCSV = function(){
    const ok = initWorkerIfPossible();
    if (!ok) {
      if (typeof originalExtract === "function") return originalExtract();
      return;
    }
    run("extract");
  };
})();
