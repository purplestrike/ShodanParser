/***** Utilities: message center *****/
function showMsg(text, type = "info") {
  var wrap = document.getElementById("messages");
  if (!wrap) return;
  var el = document.createElement("div");
  el.className = "msg " + type;
  el.textContent = text;
  wrap.appendChild(el);
  var msgs = wrap.querySelectorAll(".msg");
  if (msgs.length > 6) wrap.removeChild(msgs[0]);
}
function clearMsgs() {
  var wrap = document.getElementById("messages");
  if (wrap) wrap.innerHTML = "";
}
function runSearch() { showMsg("🔎 Running search with current filters…", "info"); extractToCSV(); }

/***** JSON Parse with line/col & selection *****/
function parseJSONWithContext(text) {
  try { return { ok: true, data: JSON.parse(text) }; }
  catch (err) {
    var position = null, m = /position (\d+)/i.exec(err.message);
    if (m) position = parseInt(m[1], 10);
    var line = null, col = null, lc = /line (\d+) column (\d+)/i.exec(err.message);
    if (lc) { line = parseInt(lc[1], 10); col = parseInt(lc[2], 10); }
    else if (position !== null) {
      var l = 1, c = 1;
      for (var i = 0; i < Math.min(position, text.length); i++) {
        if (text[i] === "\n") { l++; c = 1; } else { c++; }
      }
      line = l; col = c;
    }
    return { ok: false, error: err, line: line, col: col, position: position };
  }
}

/***** Error panel helpers *****/
function setInputErrorState(on, errorMeta) {
  var ta = document.getElementById("beautifyInput");
  var details = document.getElementById("errorDetails");
  var dump = document.getElementById("errorDump");
  if (!ta) return;
  if (on) {
    ta.classList.add("error");
    if (details) details.style.display = "block";
    var msg = errorMeta && errorMeta.error ? String(errorMeta.error) : "Unknown error";
    if (errorMeta && errorMeta.line && errorMeta.col) msg += "\n\nApprox. location: line " + errorMeta.line + ", column " + errorMeta.col;
    if (dump) dump.textContent = msg;
    if (errorMeta && typeof errorMeta.position === "number") {
      try { ta.focus(); ta.setSelectionRange(errorMeta.position, Math.min(errorMeta.position + 1, ta.value.length)); } catch(e){}
    }
  } else {
    ta.classList.remove("error");
    if (details) details.style.display = "none";
    if (dump) dump.textContent = "";
  }
}

/***** Auto-fix engine *****/
function normalizeSmartQuotes(s){return s.replace(/[\u201C\u201D\u2033]/g,'"').replace(/[\u2018\u2019\u2032]/g,"'");}
function stripComments(s){return s.replace(/(^|[^:])\/\/.*$/gm,"$1").replace(/\/\*[\s\S]*?\*\//g,"");}
function removeTrailingCommas(s){return s.replace(/,\s*(?=[}\]])/g,"");}
function quoteUnquotedKeys(s){return s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_\-.$]*)(\s*:)/g,'$1"$2"$3');}
function singleToDoubleQuotedStrings(s){return s.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g,function(_,i){return '"'+i.replace(/"/g,'\\"')+'"';});}
function fixConcatenatedObjects(s){var j=s.replace(/}\s*{(?=\s*")/g,"},\n{");if(/^\s*{[\s\S]*}\s*,\s*{[\s\S]*}\s*$/.test(j))return"["+j+"]";return j;}
function tryParseJSONL(s){var lines=s.split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean);if(lines.length<=1)return null;var arr=[];for(var i=0;i<lines.length;i++){try{arr.push(JSON.parse(lines[i]));}catch(e){return null;}}return arr;}
function autoFixJSON(raw){
  var notes=[], jsonl=tryParseJSONL(raw);
  if(jsonl){notes.push("Detected JSON Lines and converted to array.");return{ok:true,data:jsonl,fixedText:JSON.stringify(jsonl,null,2),notes:notes};}
  var attempts=[
    function A(t){var s=t; s=normalizeSmartQuotes(s); s=stripComments(s); return s!==t?s:null;},
    function B(t){var s=t; var s1=singleToDoubleQuotedStrings(s); var s2=quoteUnquotedKeys(s1); return s2!==t?s2:null;},
    function C(t){var s=removeTrailingCommas(t); return s!==t?s:null;},
    function D(t){var s=fixConcatenatedObjects(t); return s!==t?s:null;},
    function E(t){if(!/^\s*{[\s\S]*}\s*$/.test(t) && t.indexOf("}\n{")!==-1) return "["+t.replace(/}\s*\n\s*{/g,"},\n{")+"]"; return null;}
  ];
  var current=raw;
  for(var k=0;k<attempts.length;k++){
    var tr=attempts[k](current);
    if(tr!==null){ current=tr; try{var d=JSON.parse(current); notes.push("Applied automatic formatting and common fixes (quotes/keys/comments/trailing commas/joins)."); return{ok:true,data:d,fixedText:JSON.stringify(d,null,2),notes:notes};}catch(e){} }
  }
  try{var parts=raw.split(/\n\s*\n/).map(function(x){return x.trim();}).filter(Boolean); if(parts.length>1){var objs=parts.map(JSON.parse); notes.push("Merged multiple JSON chunks into an array."); return{ok:true,data:objs,fixedText:JSON.stringify(objs,null,2),notes:notes};}}catch(e){}
  return{ok:false,notes:notes};
}
function parseWithAutoFix(text){var strict=parseJSONWithContext(text); if(strict.ok) return{ok:true,data:strict.data,fixed:false,fixedText:text,notes:[]}; var fixed=autoFixJSON(text); if(fixed.ok) return{ok:true,data:fixed.data,fixed:true,fixedText:fixed.fixedText,notes:fixed.notes}; return{ok:false,errorCtx:strict};}

/***** Editor helpers *****/
function intToIP(num){return[(num>>>24)&255,(num>>>16)&255,(num>>>8)&255,num&255].join(".");}
function isIP(v){if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v))return v.split(".").every(function(o){o=Number(o);return o>=0&&o<=255;}); if(/^[0-9a-f:]+$/i.test(v)&&v.indexOf(":")!==-1)return true; return false;}

/***** Mini Summary (auto-injected if missing) *****/
function ensureMiniSummary(){
  var wrap=document.getElementById("miniSummary");
  if(!wrap){
    wrap=document.createElement("section");
    wrap.id="miniSummary"; wrap.style.padding="0.6rem 1rem"; wrap.style.display="none";
    wrap.style.background="#151515"; wrap.style.borderBottom="1px solid #2a2a2a";
    var grid=document.createElement("div");
    grid.style.display="grid"; grid.style.gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))"; grid.style.gap="0.5rem";
    function pill(label,id){var d=document.createElement("div"); d.style.display="inline-block"; d.style.padding="0.35rem 0.6rem"; d.style.border="1px solid #333"; d.style.borderRadius="999px"; d.style.background="#1e1e1e"; d.style.color="#caa8ff"; d.style.fontSize="0.9rem"; d.style.textAlign="center"; d.textContent=label+": "; var s=document.createElement("span"); s.id=id; s.textContent="0"; d.appendChild(s); return d;}
    [["IP","sum_ip"],["Domain(s)","sum_domains"],["Ports","sum_ports"],["City","sum_cities"],["Organization","sum_orgs"],["Vulnerabilities","sum_vulns"],["Products","sum_products"],["Versions","sum_versions"]].forEach(function(x){grid.appendChild(pill(x[0],x[1]));});
    wrap.appendChild(grid);
    var anchor=document.getElementById("csvPreviewSection"); if(anchor&&anchor.parentNode) anchor.parentNode.insertBefore(wrap,anchor); else document.body.appendChild(wrap);
  }
  return wrap;
}
function initSummarySets(){return{ips:new Set(),domains:new Set(),ports:new Set(),cities:new Set(),orgs:new Set(),vulns:new Set(),products:new Set(),versions:new Set()};}
function updateMiniSummary(counts){
  ensureMiniSummary();
  var map={sum_ip:counts.ips.size,sum_domains:counts.domains.size,sum_ports:counts.ports.size,sum_cities:counts.cities.size,sum_orgs:counts.orgs.size,sum_vulns:counts.vulns.size,sum_products:counts.products.size,sum_versions:counts.versions.size};
  var any=false; for (var id in map){var el=document.getElementById(id); if(el){el.textContent=String(map[id]); any=true;}}
  var wrap=document.getElementById("miniSummary"); if(wrap&&any) wrap.style.display="block";
}

/***** UI actions *****/
function beautifyJSON(){
  clearMsgs();
  var inputEl=document.getElementById("beautifyInput");
  var outputEl=document.getElementById("beautifyOutput"); if(!inputEl||!outputEl) return;
  var res=parseWithAutoFix(inputEl.value);
  if(!res.ok){ setInputErrorState(true,res.errorCtx); outputEl.value=""; showMsg("❌ Invalid JSON — auto-fix couldn’t recover. See error details below.","bad"); return; }
  setInputErrorState(false);
  outputEl.value=JSON.stringify(res.data,null,2);
  if(res.fixed){ inputEl.value=res.fixedText; showMsg("🛠️ Auto-fixed and beautified JSON.","good"); } else showMsg("✅ Beautified successfully.","good");
}
function validateJSON(){
  clearMsgs();
  var inputEl=document.getElementById("beautifyInput");
  var outputEl=document.getElementById("beautifyOutput"); if(!inputEl||!outputEl) return;
  var res=parseWithAutoFix(inputEl.value);
  if(!res.ok){ setInputErrorState(true,res.errorCtx); outputEl.value="❌ Invalid JSON"; showMsg("❌ Invalid JSON — auto-fix couldn’t recover. See details below.","bad"); }
  else { setInputErrorState(false); outputEl.value="✅ Valid JSON"; showMsg(res.fixed?"🛠️ JSON was auto-corrected and is now valid.":"✅ JSON is valid.","good"); if(res.fixed) inputEl.value=res.fixedText; }
}
function uploadJSON(){
  clearMsgs();
  var fileInput=document.getElementById("fileInput"); if(!fileInput) return;
  fileInput.click();
  fileInput.onchange=function(){
    var f=fileInput.files&&fileInput.files[0]; if(!f) return;
    var r=new FileReader();
    r.onload=function(e){
      var text=e.target.result, res=parseWithAutoFix(text), inputEl=document.getElementById("beautifyInput"); if(!inputEl) return;
      if(!res.ok){ inputEl.value=text; setInputErrorState(true,res.errorCtx); showMsg("⚠️ File loaded, but JSON is invalid — auto-fix failed. Please review the highlighted area.","warn"); return; }
      setInputErrorState(false);
      inputEl.value=res.fixed?res.fixedText:JSON.stringify(res.data,null,2);
      showMsg(res.fixed?"🛠️ Loaded and auto-corrected JSON file.":"✅ JSON file loaded successfully!","good");
    };
    r.readAsText(f);
  };
}
function clearText(){
  clearMsgs();
  var inputEl=document.getElementById("beautifyInput");
  var outputEl=document.getElementById("beautifyOutput");
  if(inputEl) inputEl.value=""; if(outputEl) outputEl.value="";
  var dl=document.getElementById("downloadLink"); if(dl) dl.style.display="none";
  var xl=document.getElementById("excelLink"); if(xl) xl.style.display="none";
  var prev=document.getElementById("csvPreviewSection"); if(prev) prev.style.display="none";
  setInputErrorState(false);
  var mini=document.getElementById("miniSummary"); if(mini) mini.style.display="none";
  showMsg("🧹 Cleared.","info");
}

/***** Table cell styling (ensures borders are always visible) *****/
function styleCell(el){ el.style.border="1px solid #333"; el.style.padding="6px 10px"; }
function styleHeaderCell(el){ styleCell(el); el.style.background="#2a2a2a"; el.style.color="#bb86fc"; }

/***** Links: ensure XLSX link next to CSV and styled the same *****/
function ensureExcelLink() {
  var a=document.getElementById("excelLink");
  if(!a){
    a=document.createElement("a");
    a.id="excelLink";
    a.style.display="none";
    // match a#downloadLink styling
    a.style.color="#03dac6";
    a.style.fontWeight="bold";
    a.style.textDecoration="none";
    a.style.alignSelf="center";
    a.style.marginLeft="12px";
    a.textContent="Download XLSX (merged)";

    var dl=document.getElementById("downloadLink");
    if (dl && dl.parentNode) dl.parentNode.insertBefore(a, dl.nextSibling);
    else document.body.appendChild(a);
  }
  return a;
}

/***** Minimal ZIP builder (STORE) for XLSX *****/
function crc32(buf){
  var table = (crc32.table||(crc32.table=(function(){
    var c,t=[],k; for(var n=0;n<256;n++){c=n;for(k=0;k<8;k++) c = (c&1)?(0xedb88320^(c>>>1)):(c>>>1); t[n]=c>>>0;} return t;
  })()));
  var crc=~0>>>0;
  for (var i=0;i<buf.length;i++) crc=(crc>>>8) ^ table[(crc ^ buf[i]) & 0xff];
  return (~crc)>>>0;
}
function strToU8(s){ if (typeof TextEncoder!=="undefined") return new TextEncoder().encode(s); var u=new Uint8Array(s.length); for (var i=0;i<s.length;i++) u[i]=s.charCodeAt(i)&255; return u; }
function u32LE(n){ return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]); }
function u16LE(n){ return new Uint8Array([n&255,(n>>>8)&255]); }
function concatU8(arrs){ var len=arrs.reduce(function(a,b){return a+b.length;},0),o=new Uint8Array(len),p=0; arrs.forEach(function(a){o.set(a,p);p+=a.length;}); return o; }

function zipStore(files) {
  var localParts=[], centralParts=[], offset=0, now=new Date();
  function dosDateTime(d){
    d=d||now;
    var dt = ((d.getFullYear()-1980)<<9) | ((d.getMonth()+1)<<5) | d.getDate();
    var tm = (d.getHours()<<11) | (d.getMinutes()<<5) | (d.getSeconds()/2|0);
    return {date:dt, time:tm};
  }
  files.forEach(function(f){
    var nameU8=strToU8(f.name);
    var data=f.data||new Uint8Array(0);
    var crc=crc32(data);
    var dd=dosDateTime(f.date);

    var localHeader = concatU8([
      strToU8("PK\u0003\u0004"),
      u16LE(20),u16LE(0),u16LE(0),
      u16LE(dd.time),u16LE(dd.date),
      u32LE(crc),u32LE(data.length),u32LE(data.length),
      u16LE(nameU8.length),u16LE(0)
    ]);
    var local = concatU8([localHeader, nameU8, data]);
    localParts.push(local);

    var centralHeader = concatU8([
      strToU8("PK\u0001\u0002"),
      u16LE(20),u16LE(20),u16LE(0),u16LE(0),
      u16LE(dd.time),u16LE(dd.date),
      u32LE(crc),u32LE(data.length),u32LE(data.length),
      u16LE(nameU8.length),u16LE(0),u16LE(0),
      u16LE(0),u16LE(0),
      u32LE(0),
      u32LE(offset)
    ]);
    var central = concatU8([centralHeader, nameU8]);
    centralParts.push(central);
    offset += local.length;
  });

  var centralDir = concatU8(centralParts);
  var localAll = concatU8(localParts);
  var endRec = concatU8([
    strToU8("PK\u0005\u0006"),
    u16LE(0),u16LE(0),
    u16LE(files.length),u16LE(files.length),
    u32LE(centralDir.length),u32LE(localAll.length),
    u16LE(0)
  ]);
  return new Blob([localAll, centralDir, endRec], {type:"application/zip"});
}

/***** XLSX builder (one sheet, inline strings, merged + centered IP/Org) *****/
function escXml(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function colName(n){ var s=""; n=Number(n); do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n/26)-1; } while (n>=0); return s; }

function buildSheetXML(rows, merges, centerTopCells) {
  var out = [];
  out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  out.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
  out.push('<sheetViews><sheetView workbookViewId="0"/></sheetViews>');
  out.push('<sheetFormatPr defaultRowHeight="15"/>');
  out.push('<sheetData>');
  for (var r=0; r<rows.length; r++) {
    var rn = r+1;
    out.push('<row r="'+rn+'">');
    var row = rows[r];
    for (var c=0;c<row.length;c++){
      var addr = colName(c)+(rn);
      var val = row[c];
      var style = centerTopCells.has(addr) ? ' s="1"' : '';
      if (val === "" || val === null || typeof val === "undefined") {
        out.push('<c r="'+addr+'" t="inlineStr"'+style+'><is><t/></is></c>');
      } else {
        out.push('<c r="'+addr+'" t="inlineStr"'+style+'><is><t>'+escXml(val)+'</t></is></c>');
      }
    }
    out.push('</row>');
  }
  out.push('</sheetData>');
  if (merges.length) {
    out.push('<mergeCells count="'+merges.length+'">');
    merges.forEach(function(m){ out.push('<mergeCell ref="'+m+'"/>'); });
    out.push('</mergeCells>');
  }
  out.push('</worksheet>');
  return out.join("");
}
function buildStylesXML() {
  return [
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>',
  '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>',
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
  '<cellXfs count="2">',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
  '</cellXfs>',
'</styleSheet>'
  ].join("");
}
function buildWorkbookXML() {
  return [
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
  '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>',
'</workbook>'
  ].join("");
}
function buildWorkbookRelsXML() {
  return [
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
'</Relationships>'
  ].join("");
}
function buildRootRelsXML() {
  return [
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
'</Relationships>'
  ].join("");
}
function buildContentTypesXML() {
  return [
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
  '<Default Extension="xml" ContentType="application/xml"/>',
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
'</Types>'
  ].join("");
}
function exportXLSX(rows, merges, centerTopCells) {
  var files = [
    {name: "[Content_Types].xml", data: strToU8(buildContentTypesXML())},
    {name: "_rels/.rels", data: strToU8(buildRootRelsXML())},
    {name: "xl/workbook.xml", data: strToU8(buildWorkbookXML())},
    {name: "xl/_rels/workbook.xml.rels", data: strToU8(buildWorkbookRelsXML())},
    {name: "xl/styles.xml", data: strToU8(buildStylesXML())},
    {name: "xl/worksheets/sheet1.xml", data: strToU8(buildSheetXML(rows, merges, centerTopCells))}
  ];
  var zipBlob = zipStore(files);
  // Serve with the proper XLSX MIME
  return new Blob([zipBlob], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}

/***** CSV Extraction + Preview (with merged look via rowspan) *****/
function extractToCSV() {
  clearMsgs();
  var inputEl=document.getElementById("beautifyInput"); if(!inputEl) return;
  var res=parseWithAutoFix(inputEl.value);
  if(!res.ok){ setInputErrorState(true,res.errorCtx); showMsg("❌ Invalid JSON — cannot extract CSV. Auto-fix failed. See error details.","bad"); return; }
  setInputErrorState(false);
  if(res.fixed){ inputEl.value=res.fixedText; showMsg("🛠️ Auto-corrected JSON before extraction.","good"); }

  var data=res.data; if(!Array.isArray(data)) data=[data];

  // Toggles (Quick Fields)
  var includeIP      = !!(document.getElementById("field_ip") && document.getElementById("field_ip").checked);
  var includeDomain  = !!(document.getElementById("field_domain") && document.getElementById("field_domain").checked);
  var includePorts   = !!(document.getElementById("field_ports") && document.getElementById("field_ports").checked);
  var includeCity    = !!(document.getElementById("field_city") && document.getElementById("field_city").checked);
  var includeOrg     = !!(document.getElementById("field_org") && document.getElementById("field_org").checked);
  var includeVulns   = !!(document.getElementById("field_vulns") && document.getElementById("field_vulns").checked);
  var includeWebTech = !!(document.getElementById("field_webtech") && document.getElementById("field_webtech").checked);
  var includeVersions= !!(document.getElementById("field_versions") && document.getElementById("field_versions").checked);

  var headers=[]; 
  if(includeIP)headers.push("IP");
  if(includeDomain)headers.push("Domain(s)");
  if(includePorts)headers.push("Ports");
  if(includeCity)headers.push("City");
  if(includeOrg)headers.push("Organization");
  if(includeVulns)headers.push("Vulnerabilities");
  if(includeWebTech)headers.push("Products");
  if(includeVersions)headers.push("Versions");

  // Column indices for summary/xlsx
  var idxMap={};
  headers.forEach(function(h,i){
    if (h==="IP") idxMap.ip=i;
    if (h==="Domain(s)") idxMap.dom=i;
    if (h==="Ports") idxMap.ports=i;
    if (h==="City") idxMap.city=i;
    if (h==="Organization") idxMap.org=i;
    if (h==="Vulnerabilities") idxMap.vuln=i;
    if (h==="Products") idxMap.prod=i;
    if (h==="Versions") idxMap.ver=i;
  });

  // Filters (include/exclude)
  function splitTerms(v){return (v||"").split(";").map(function(s){return s.trim().toLowerCase();}).filter(Boolean);}
  var incTerms=splitTerms(document.getElementById("includeFilter")?document.getElementById("includeFilter").value:"");
  var excTerms=splitTerms(document.getElementById("excludeFilter")?document.getElementById("excludeFilter").value:"");
  function passesBasicTerms(rowArray){
    var s=rowArray.join(",").toLowerCase();
    for (var i=0;i<incTerms.length;i++) if (s.indexOf(incTerms[i])===-1) return false;
    for (var j=0;j<excTerms.length;j++) if (s.indexOf(excTerms[j])!==-1) return false;
    return true;
  }

  // Prepare preview skeleton
  var previewDiv=document.getElementById("csvPreview"); if(previewDiv) previewDiv.innerHTML="";
  var table=document.createElement("table");
  table.style.borderCollapse="collapse"; table.style.width="100%";
  var thead=document.createElement("thead");
  var headerRow=document.createElement("tr");
  headers.forEach(function(h){
    var th=document.createElement("th");
    th.textContent=h; styleHeaderCell(th);
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow); table.appendChild(thead);
  var tbody=document.createElement("tbody");

  var csvRows=[headers.join(",")];
  var excelRows=[headers.slice()];
  var merges=[];
  var centerTopCells=new Set();

  // Unique summary (based on kept rows)
  var summary=initSummarySets();

  // Build preview+CSV per JSON item (host)
  var excelRowCursor = 1; // header occupies row 1
  data.forEach(function(item){
    // Extract host fields
    var ipVal = includeIP ? (item.ip_str || (typeof item.ip==="number" ? intToIP(item.ip>>>0) : "")) : "";
    var orgVal= includeOrg ? (item.org || item.isp || item.asn || "") : "";

    var domains=[]; if(includeDomain){
      var d=[]; if(Array.isArray(item.hostnames)) d.push.apply(d,item.hostnames);
      if(Array.isArray(item.domains)) d.push.apply(d,item.domains);
      if(item.http && item.http.host) d.push(item.http.host);
      domains=Array.from(new Set(d.filter(function(x){return x && !isIP(x);})));
    }
    var ports=[]; if(includePorts){ if(item.port!=null) ports=[String(item.port)]; }
    var cities=[]; if(includeCity){ if(item.location && item.location.city) cities=[item.location.city]; }
    var vulns=[]; if(includeVulns){ var vkeys=(item.vulns && typeof item.vulns==="object")?Object.keys(item.vulns):[]; vulns=vkeys; }
    var techs=[], vers=[];
    if(includeWebTech || includeVersions){
      var t=[], v=[];
      if(item.data && Array.isArray(item.data)){ item.data.forEach(function(svc){ if(svc.product) t.push(svc.product); if(svc.version) v.push(svc.version); }); }
      if(item.http && item.http.components){ var comps=item.http.components; for (var name in comps){ if(!comps.hasOwnProperty(name)) continue; t.push(name); if(Array.isArray(comps[name].versions)) v.push.apply(v, comps[name].versions); } }
      if(item.http && item.http.server) t.push(item.http.server);
      techs=Array.from(new Set(t.filter(Boolean)));
      vers =Array.from(new Set(v.filter(Boolean))); // <-- fixed: no stray ')'
    }

    var rowCount=Math.max(1,
      includeDomain?(domains.length||0):0,
      includePorts?(ports.length||0):0,
      includeCity?(cities.length||0):0,
      includeVulns?(vulns.length||0):0,
      includeWebTech?(techs.length||0):0,
      includeVersions?(vers.length||0):0
    );

    var candidates=[];
    for (var i=0;i<rowCount;i++){
      var row=[];
      if(includeIP)       row.push(i===0?ipVal:"");
      if(includeDomain)   row.push(domains[i]||"");
      if(includePorts)    row.push(ports[i]||"");
      if(includeCity)     row.push(cities[i]||"");
      if(includeOrg)      row.push(i===0?orgVal:"");
      if(includeVulns)    row.push(vulns[i]||"");
      if(includeWebTech)  row.push(techs[i]||"");
      if(includeVersions) row.push(vers[i]||"");
      candidates.push(row);
    }

    var kept=candidates.filter(passesBasicTerms);
    var finalCount=kept.length;
    if(finalCount===0) return;

    // Fill UNIQUE counts (kept rows)
    kept.forEach(function(r){
      if (includeIP && idxMap.ip!=null && r[idxMap.ip]) summary.ips.add(r[idxMap.ip]);
      if (includeDomain && idxMap.dom!=null && r[idxMap.dom]) summary.domains.add(r[idxMap.dom]);
      if (includePorts && idxMap.ports!=null && r[idxMap.ports]) summary.ports.add(r[idxMap.ports]);
      if (includeCity && idxMap.city!=null && r[idxMap.city]) summary.cities.add(r[idxMap.city]);
      if (includeOrg && idxMap.org!=null && r[idxMap.org]) summary.orgs.add(r[idxMap.org]);
      if (includeVulns && idxMap.vuln!=null && r[idxMap.vuln]) summary.vulns.add(r[idxMap.vuln]);
      if (includeWebTech && idxMap.prod!=null && r[idxMap.prod]) summary.products.add(r[idxMap.prod]);
      if (includeVersions && idxMap.ver!=null && r[idxMap.ver]) summary.versions.add(r[idxMap.ver]);
    });

    // XLSX merge ranges for IP/Org across kept rows
    var startRowExcel = excelRowCursor + 1; // first data row index (header=1)
    var endRowExcel = startRowExcel + finalCount - 1;
    if (finalCount > 1) {
      if (includeIP && idxMap.ip!=null && ipVal) {
        var colA = colName(idxMap.ip);
        merges.push(colA + startRowExcel + ":" + colA + endRowExcel);
        centerTopCells.add(colA + startRowExcel);
      }
      if (includeOrg && idxMap.org!=null && orgVal) {
        var colB = colName(idxMap.org);
        merges.push(colB + startRowExcel + ":" + colB + endRowExcel);
        centerTopCells.add(colB + startRowExcel);
      }
    } else {
      if (includeIP && idxMap.ip!=null && ipVal) centerTopCells.add(colName(idxMap.ip)+startRowExcel);
      if (includeOrg && idxMap.org!=null && orgVal) centerTopCells.add(colName(idxMap.org)+startRowExcel);
    }

    // Render kept rows
    var rendered=0;
    for (var r=0;r<candidates.length;r++){
      var row=candidates[r]; if(!passesBasicTerms(row)) continue;

      var tr=document.createElement("tr");
      var cursor=0;

      if(includeIP){
        var val=row[cursor++];
        if(val!=="" && rendered===0){
          var td=document.createElement("td");
          td.textContent=val; td.rowSpan=finalCount; styleCell(td);
          td.style.textAlign="center"; td.style.verticalAlign="middle";
          tr.appendChild(td);
        }
      }
      if(includeDomain){ var td1=document.createElement("td"); td1.textContent=row[cursor++]||""; styleCell(td1); tr.appendChild(td1); }
      if(includePorts){  var td2=document.createElement("td"); td2.textContent=row[cursor++]||""; styleCell(td2); tr.appendChild(td2); }
      if(includeCity){   var td3=document.createElement("td"); td3.textContent=row[cursor++]||""; styleCell(td3); tr.appendChild(td3); }
      if(includeOrg){
        var orgCell=row[cursor++];
        if(orgCell!=="" && rendered===0){
          var tdo=document.createElement("td");
          tdo.textContent=orgCell; tdo.rowSpan=finalCount; styleCell(tdo);
          tdo.style.textAlign="center"; tdo.style.verticalAlign="middle";
          tr.appendChild(tdo);
        }
      }
      if(includeVulns){  var td4=document.createElement("td"); td4.textContent=row[cursor++]||""; styleCell(td4); tr.appendChild(td4); }
      if(includeWebTech){var td5=document.createElement("td"); td5.textContent=row[cursor++]||""; styleCell(td5); tr.appendChild(td5); }
      if(includeVersions){var td6=document.createElement("td"); td6.textContent=row[cursor++]||""; styleCell(td6); tr.appendChild(td6); }

      tbody.appendChild(tr);
      csvRows.push(row.join(","));
      excelRows.push(row.slice());
      excelRowCursor++;
      rendered++;
      if (rendered===finalCount) break;
    }
  });

  table.appendChild(tbody);
  if (previewDiv) {
    previewDiv.appendChild(table);
    var section=document.getElementById("csvPreviewSection");
    if (section) section.style.display="block";
  }

  // CSV link
  var csvString=csvRows.join("\n");
  var downloadLink=document.getElementById("downloadLink");
  if(downloadLink){
    try{ if(downloadLink.href) URL.revokeObjectURL(downloadLink.href); }catch(e){}
    var blob=new Blob([csvString],{type:"text/csv"});
    var url=URL.createObjectURL(blob);
    downloadLink.href=url; downloadLink.download="shodan_output.csv";
    downloadLink.style.display="inline"; downloadLink.textContent="Download CSV";
  }

  // XLSX link (merged + centered)
  var xlsxBlob = exportXLSX(excelRows, merges, centerTopCells);
  var xlsxUrl = URL.createObjectURL(xlsxBlob);
  var excelLink = ensureExcelLink();
  excelLink.href = xlsxUrl;
  excelLink.download = "shodan_output.xlsx";
  excelLink.style.display = "inline";

  // Mini summary (unique counts across kept rows)
  updateMiniSummary(summary);

  showMsg("✅ Extraction successful — preview below. Use CSV or XLSX (merged).","good");
}
