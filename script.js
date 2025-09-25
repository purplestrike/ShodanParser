/* =========================
   Shodan Parser – single-file logic
   - Search => preview only
   - Extract & Download => preview + CSV/XLSX links
   - Smooth progressive progress bar during upload + processing
   ========================= */

/* ====== Config ====== */
const SUMMARY_MODE = "unique_post_filter";
const COUNT_IP_LIKE_DOMAINS = false;

/* ====== Helpers: Messages ====== */
function showMsg(t, k="info"){
  const box = document.getElementById("messages");
  if(!box) return;
  const d = document.createElement("div");
  d.className = "msg " + k;
  d.textContent = t;
  box.appendChild(d);
  const all = box.querySelectorAll(".msg");
  if (all.length > 8) box.removeChild(all[0]);
}
function clearMsgs(){ const box=document.getElementById("messages"); if(box) box.innerHTML=""; }

/* ====== Progress bar ====== */
let _p_animReq = null;
let _p_startTime = 0;
let _p_startVal = 0;
let _p_targetVal = 0;
let _p_lastDrawn = -1;

function _progressNow(){ return (typeof performance!=="undefined" && performance.now) ? performance.now() : Date.now(); }

function _getProgressEls(){
  const wrap = document.getElementById("progressWrap");
  const bar  = document.getElementById("progressBar");
  let lab = document.getElementById("progressLabel") || document.getElementById("progressText");
  if(!lab && wrap){
    lab = document.createElement("div");
    lab.id = "progressLabel";
    lab.style.position = "absolute";
    lab.style.inset = "0";
    lab.style.display = "grid";
    lab.style.placeItems = "center";
    lab.style.fontSize = "11px";
    lab.style.color = "rgba(255,255,255,0.9)";
    lab.style.pointerEvents = "none";
    wrap.style.position = wrap.style.position || "relative";
    wrap.appendChild(lab);
  }
  return { wrap, bar, lab };
}

function _readWidthPct(el){
  const w = el && el.style && el.style.width ? el.style.width : "0%";
  const m = /(-?\d+(?:\.\d+)?)%/.exec(w);
  return m ? Math.max(0, Math.min(100, parseFloat(m[1]))) : 0;
}

function _progressTick(){
  const { bar, lab } = _getProgressEls();
  if(!bar){ _p_animReq = null; return; }
  const now = _progressNow();
  const DURATION = 140;
  const t = Math.min(1, (now - _p_startTime) / DURATION);
  const eased = t;
  const val = _p_startVal + (_p_targetVal - _p_startVal) * eased;
  const rounded = Math.round(val);
  if(rounded !== _p_lastDrawn){
    bar.style.width = val.toFixed(3) + "%";
    if(lab) lab.textContent = Math.max(0, Math.min(100, rounded)) + "%";
    _p_lastDrawn = rounded;
  }
  if(t < 1){
    _p_animReq = requestAnimationFrame(_progressTick);
  }else{
    bar.style.width = _p_targetVal + "%";
    if(lab) lab.textContent = _p_targetVal + "%";
    _p_startVal = _p_targetVal;
    _p_animReq = null;
  }
}

function progressShow(){ 
  const { wrap } = _getProgressEls();
  if(wrap) wrap.style.display="flex";
  progressSet(0);
}
function progressSet(p){
  const { bar, lab } = _getProgressEls();
  if(!bar) return;
  const target = Math.max(0, Math.min(100, Number(p) || 0));
  if(_p_animReq === null){ _p_startVal = _readWidthPct(bar); }
  _p_startVal   = _readWidthPct(bar);
  _p_startTime  = _progressNow();
  _p_targetVal  = Math.round(target);
  if(lab && (lab.textContent === "" || lab.textContent == null)) lab.textContent = "0%";
  if(_p_animReq === null){ _p_animReq = requestAnimationFrame(_progressTick); }
}
function progressHide(){ 
  const { wrap, bar, lab } = _getProgressEls();
  if(wrap) wrap.style.display="none";
  if(bar)  bar.style.width = "0%";
  if(lab)  lab.textContent = "0%";
  if(_p_animReq){ cancelAnimationFrame(_p_animReq); _p_animReq = null; }
  _p_startVal = 0; _p_targetVal = 0; _p_lastDrawn = -1;
}

/* ====== Error display ====== */
function setInputErrorState(on, meta){
  const ta = document.getElementById("beautifyInput");
  const det = document.getElementById("errorDetails");
  const dump= document.getElementById("errorDump");
  if(!ta) return;
  if(on){
    ta.classList.add("error");
    if(det) det.style.display="block";
    if(dump){
      let msg = meta && meta.error ? String(meta.error) : "Error";
      if(meta && meta.line && meta.col) msg += `\n\nApprox. location: line ${meta.line}, column ${meta.col}`;
      dump.textContent = msg;
    }
  }else{
    ta.classList.remove("error");
    if(det) det.style.display="none";
    if(dump) dump.textContent="";
  }
}

/* ====== JSON parsing + auto-fix ====== */
function parseJSONWithContext(text){
  try{ return { ok:true, data: JSON.parse(text) }; }
  catch(err){
    let position=null, m=/position\s+(\d+)/i.exec(err.message);
    if(m) position=parseInt(m[1],10);
    let line=null,col=null, lc=/line\s+(\d+)\s+column\s+(\d+)/i.exec(err.message);
    if(lc){ line=parseInt(lc[1],10); col=parseInt(lc[2],10); }
    else if(position!==null){
      let l=1,c=1; for(let i=0;i<Math.min(position,text.length);i++){ if(text[i]==="\n"){l++;c=1;} else c++; }
      line=l; col=c;
    }
    return { ok:false, error:err, line, col, position };
  }
}
function normalizeSmartQuotes(s){return s.replace(/[\u201C\u201D\u2033]/g,'"').replace(/[\u2018\u2019\u2032]/g,"'");}
function stripComments(s){return s.replace(/(^|[^:])\/\/.*$/gm,"$1").replace(/\/\*[\s\S]*?\*\//g,"");}
function removeTrailingCommas(s){return s.replace(/,\s*(?=[}\]])/g,"");}
function quoteUnquotedKeys(s){return s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_\-.$]*)(\s*:)/g,'$1"$2"$3');}
function singleToDoubleQuotedStrings(s){return s.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g,(_,i)=>'"'+i.replace(/"/g,'\\"')+'"');}
function fixConcatenatedObjects(s){const j=s.replace(/}\s*{(?=\s*")/g,"},\n{"); if(/^\s*{[\s\S]*}\s*,\s*{[\s\S]*}\s*$/.test(j)) return "["+j+"]"; return j;}
function tryParseJSONL(s){
  const lines=s.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(lines.length<=1) return null;
  const arr=[];
  for(let i=0;i<lines.length;i++){ try{arr.push(JSON.parse(lines[i]));}catch(e){return null;} }
  return arr;
}
function autoFixJSON(raw){
  const jsonl=tryParseJSONL(raw);
  if(jsonl) return { ok:true, data:jsonl, fixedText:JSON.stringify(jsonl,null,2) };
  const attempts=[
    t=>{let s=t; s=normalizeSmartQuotes(s); s=stripComments(s); return s!==t?s:null;},
    t=>{const s1=singleToDoubleQuotedStrings(t); const s2=quoteUnquotedKeys(s1); return s2!==t?s2:null;},
    t=>{const s=removeTrailingCommas(t); return s!==t?s:null;},
    t=>{const s=fixConcatenatedObjects(t); return s!==t?s:null;},
    t=>{ if(!/^\s*{[\s\S]*}\s*$/.test(t) && t.indexOf("}\n{")!==-1) return "["+t.replace(/}\s*\n\s*{/g,"},\n{")+"]"; return null; }
  ];
  let cur=raw;
  for(let k=0;k<attempts.length;k++){
    const tr=attempts[k](cur);
    if(tr!==null){ cur=tr; try{ const d=JSON.parse(cur); return { ok:true, data:d, fixedText:JSON.stringify(d,null,2) }; }catch(e){} }
  }
  try{
    const parts=raw.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
    if(parts.length>1){ const objs=parts.map(JSON.parse); return { ok:true, data:objs, fixedText:JSON.stringify(objs,null,2) }; }
  }catch(e){}
  return { ok:false };
}
function parseWithAutoFix(text){
  const strict=parseJSONWithContext(text);
  if(strict.ok) return { ok:true, data:strict.data, fixed:false, fixedText:text };
  const fix=autoFixJSON(text);
  if(fix.ok) return { ok:true, data:fix.data, fixed:true, fixedText:fix.fixedText };
  return { ok:false, errorCtx: strict };
}

/* ====== IP & domains ====== */
function isIP(v){
  if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v)) return v.split(".").every(o=>{o=Number(o); return o>=0 && o<=255;});
  if(/^[0-9a-f:]+$/i.test(v) && v.includes(":")) return true;
  return false;
}
function intToIP(num){ return [(num>>>24)&255,(num>>>16)&255,(num>>>8)&255,num&255].join("."); }
const MULTI_PART_SUFFIXES = [
  "co.uk","ac.uk","gov.uk","org.uk","net.uk",
  "com.au","net.au","org.au","edu.au","gov.au",
  "co.in","ac.in","gov.in","net.in","org.in","res.in",
  "co.jp","ne.jp","or.jp",
  "com.br","com.mx","com.sg","com.hk","com.cn","edu.cn","gov.cn",
  "co.za","org.za"
];
function getRegistrableDomain(host){
  if(!host) return null;
  host = String(host).trim().replace(/\.$/,"").replace(/^\*\./,"").toLowerCase();
  if(!host) return null;
  if(isIP(host)) return null;
  const colon = host.indexOf(":");
  if(colon !== -1) host = host.slice(0,colon);
  const parts = host.split(".");
  if(parts.length <= 1) return host;
  const last2 = parts.slice(-2).join(".");
  const last3 = parts.slice(-3).join(".");
  for(let i=0;i<MULTI_PART_SUFFIXES.length;i++){
    const suf=MULTI_PART_SUFFIXES[i];
    if(last3.endsWith("."+suf) || last3===suf) return last3;
  }
  return last2;
}

/* ====== Version extraction helper ====== */
function extractVersionFromProduct(product, explicitVersion){
  if(explicitVersion && String(explicitVersion).trim()) return String(explicitVersion).trim();
  if(!product) return "";
  const s = String(product).trim();
  const patterns = [
    /\/v?(\d+(?:[.\-][\w]+)*)/i,
    /\bversion[:\s]*v?(\d+(?:[.\-][\w]+)*)\b/i,
    /\b(v?)(\d+\.\d+(?:\.\d+)?(?:[.\-][\w]+)*)\b/i,
    /\b(v?)(\d+(?:[.\-]\d+)+[a-z0-9]*)\b/i,
    / ([0-9]{1,4}(?:\.[0-9a-zA-Z_-]+)+)\b/
  ];
  for(const p of patterns){
    const m = p.exec(s);
    if(m){
      for(let gi=1; gi<m.length; gi++){
        if(m[gi] && /[0-9]/.test(m[gi])) return m[gi];
      }
    }
  }
  const fb = s.match(/(\d+(?:\.\d+){1,})/);
  return fb ? fb[1] : "";
}

/* ====== CSV & XLSX builders ====== */
function csvSafe(rows){
  const q=v=>{
    if(v==null) v="";
    v=String(v);
    if (/^[=\-+@]/.test(v)) v="'"+v; // spreadsheet formula guard
    if (/[",\n]/.test(v)) v='"'+v.replace(/"/g,'""')+'"';
    return v;
  };
  return rows.map(r=>r.map(q).join(",")).join("\n");
}

/* ---------------------------
   Robust XLSX (OpenXML) builder (with Shared Strings)
   --------------------------- */

function crc32(buf){
  const T=(crc32.T||(crc32.T=(function(){
    let t=[],c; for(let n=0;n<256;n++){ c=n; for(let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1); t[n]=c>>>0; }
    return t;
  })()));
  let crc=~0>>>0; for(let i=0;i<buf.length;i++) crc=(crc>>>8) ^ T[(crc ^ buf[i]) & 0xff]; return (~crc)>>>0;
}
function strToU8(s){
  if(typeof TextEncoder!=="undefined") return new TextEncoder().encode(s);
  const u=new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i]=s.charCodeAt(i)&255; return u;
}
function u32LE(n){ return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]); }
function u16LE(n){ return new Uint8Array([n&255,(n>>>8)&255]); }
function concatU8(chunks){
  const len=chunks.reduce((x,y)=>x+y.length,0);
  const o=new Uint8Array(len); let p=0;
  for(const b of chunks){ o.set(b,p); p+=b.length; }
  return o;
}
function escXml(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function colName(n){ let s="",x=Number(n); do{ s=String.fromCharCode(65+(x%26))+s; x=Math.floor(x/26)-1; }while(x>=0); return s; }

/* Shared strings table */
function buildSharedStrings(rows){
  const map = new Map(); // value -> index
  const list = [];
  function add(v){
    const s = String(v==null?"":v);
    if(s === "") return null; // empty cells stay truly empty
    if(map.has(s)) return map.get(s);
    const idx = list.length;
    map.set(s, idx);
    list.push(s);
    return idx;
  }
  // pre-scan all cell values
  for(let r=0;r<rows.length;r++){
    const row = rows[r];
    for(let c=0;c<row.length;c++){
      if(row[c]!=null && row[c]!=="") add(row[c]);
    }
  }
  const parts = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="'+list.length+'" uniqueCount="'+list.length+'">'];
  for(const s of list){
    // preserve spaces if user data starts/ends with them
    const needPreserve = /^\s|\s$/.test(s);
    parts.push('<si><t'+(needPreserve?' xml:space="preserve"':'')+'>'+escXml(s)+'</t></si>');
  }
  parts.push('</sst>');
  const xml = parts.join("");
  return { xml, add, size:list.length };
}

function buildSheetXML(rows, merges, centerTop, sstAdd){
  const out=['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
  '<sheetViews><sheetView workbookViewId="0"/></sheetViews>',
  '<sheetFormatPr defaultRowHeight="15"/>','<sheetData>'];
  for(let r=0;r<rows.length;r++){
    const rn=r+1, row=rows[r]; out.push('<row r="'+rn+'">');
    for(let c=0;c<row.length;c++){
      const addr=colName(c)+rn, val=row[c];
      const style=centerTop.has(addr)?' s="1"':'';
      if(val==="" || val==null){
        out.push('<c r="'+addr+'"'+style+'/>'); // truly empty cell
      }else{
        // shared string
        const idx = sstAdd(val);
        out.push('<c r="'+addr+'" t="s"'+style+'><v>'+String(idx)+'</v></c>');
      }
    }
    out.push('</row>');
  }
  out.push('</sheetData>');
  if(merges.length){
    out.push('<mergeCells count="'+merges.length+'">');
    merges.forEach(m=>out.push('<mergeCell ref="'+m+'"/>'));
    out.push('</mergeCells>');
  }
  out.push('</worksheet>');
  return out.join("");
}
function buildStylesXML(){return[
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
'<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>',
'<fills count="1"><fill><patternFill patternType="none"/></fill></fills>',
'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
'<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs>',
'</styleSheet>'
].join("");}
function buildWorkbookXML(){return[
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
'<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>',
'</workbook>'
].join("");}
function buildWorkbookRelsXML(){return[
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
'<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
'<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>',
'</Relationships>'
].join("");}
function buildRootRelsXML(){return[
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
'</Relationships>'
].join("");}
function buildCorePropsXML(){
  const now = new Date().toISOString();
  return [
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ',
' xmlns:dc="http://purl.org/dc/elements/1.1/" ',
' xmlns:dcterms="http://purl.org/dc/terms/" ',
' xmlns:dcmitype="http://purl.org/dc/dcmitype/" ',
' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
'<dc:title>Shodan Parser Export</dc:title>',
'<dc:creator>ShodanParser</dc:creator>',
'<cp:lastModifiedBy>ShodanParser</cp:lastModifiedBy>',
'<dcterms:created xsi:type="dcterms:W3CDTF">'+now+'</dcterms:created>',
'<dcterms:modified xsi:type="dcterms:W3CDTF">'+now+'</dcterms:modified>',
'</cp:coreProperties>'
].join("");
}
function buildAppPropsXML(){
  return [
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ',
' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
'<Application>ShodanParser</Application>',
'<DocSecurity>0</DocSecurity>',
'<ScaleCrop>false</ScaleCrop>',
'<Company></Company>',
'<LinksUpToDate>false</LinksUpToDate>',
'<SharedDoc>false</SharedDoc>',
'<HyperlinksChanged>false</HyperlinksChanged>',
'<AppVersion>16.0000</AppVersion>',
'</Properties>'
].join("");
}
function buildContentTypesXML(){return[
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
'<Default Extension="xml" ContentType="application/xml"/>',
'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
'<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
'<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
'<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
'</Types>'
].join("");}

/* Stored ZIP (no compression) that Excel likes */
function zipStore(files){
  const locals=[]; const centrals=[];
  let offset=0; const now=new Date();
  function dosDateTime(d){
    const dt=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
    const tm=(d.getHours()<<11)|(d.getMinutes()<<5)|((d.getSeconds()/2)|0);
    return {date:dt,time:tm};
  }
  files.forEach(f=>{
    const name=strToU8(f.name);
    const data=f.data||new Uint8Array(0);
    const crc=crc32(data);
    const dd=dosDateTime(now);

    // Local header
    const lhdr = concatU8([
      strToU8("PK\u0003\u0004"),
      u16LE(20),           // version needed
      u16LE(0),            // flags
      u16LE(0),            // compression = 0 (stored)
      u16LE(dd.time), u16LE(dd.date),
      u32LE(crc),
      u32LE(data.length),
      u32LE(data.length),
      u16LE(name.length),
      u16LE(0)             // extra len
    ]);
    const local = concatU8([lhdr, name, data]);
    locals.push(local);

    // Central directory header
    const chdr = concatU8([
      strToU8("PK\u0001\u0002"),
      u16LE(20),           // version made by
      u16LE(20),           // version needed
      u16LE(0),            // flags
      u16LE(0),            // compression
      u16LE(dd.time), u16LE(dd.date),
      u32LE(crc),
      u32LE(data.length),
      u32LE(data.length),
      u16LE(name.length),
      u16LE(0),            // extra len
      u16LE(0),            // file comment len
      u16LE(0),            // disk number start
      u16LE(0),            // internal attrs
      u32LE(0),            // external attrs
      u32LE(offset)        // local header offset
    ]);
    const central = concatU8([chdr, name]);
    centrals.push(central);

    offset += local.length;
  });

  const localAll = concatU8(locals);
  const centralDir = concatU8(centrals);

  const end = concatU8([
    strToU8("PK\u0005\u0006"),
    u16LE(0), u16LE(0),
    u16LE(files.length), u16LE(files.length),
    u32LE(centralDir.length),
    u32LE(localAll.length),
    u16LE(0) // comment length
  ]);

  return concatU8([localAll, centralDir, end]);
}

function exportXLSX(rows, merges, centerTop){
  // Build shared strings first (from all cells)
  const sst = buildSharedStrings(rows);

  const files=[
    {name:"[Content_Types].xml", data:strToU8(buildContentTypesXML())},
    {name:"_rels/.rels", data:strToU8(buildRootRelsXML())},
    {name:"docProps/core.xml", data:strToU8(buildCorePropsXML())},
    {name:"docProps/app.xml",  data:strToU8(buildAppPropsXML())},
    {name:"xl/workbook.xml", data:strToU8(buildWorkbookXML())},
    {name:"xl/_rels/workbook.xml.rels", data:strToU8(buildWorkbookRelsXML())},
    {name:"xl/styles.xml", data:strToU8(buildStylesXML())},
    {name:"xl/sharedStrings.xml", data:strToU8(sst.xml)},
    {name:"xl/worksheets/sheet1.xml", data:strToU8(buildSheetXML(rows, merges, centerTop, sst.add))}
  ];
  const zipBytes = zipStore(files);
  return new Blob([zipBytes], {
    type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

/* ====== UI bind ====== */
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnBeautify").onclick = beautifyJSON;
  document.getElementById("btnValidate").onclick = validateJSON;
  document.getElementById("btnUpload").onclick   = uploadJSON;
  document.getElementById("btnSearch").onclick   = () => processData("preview");
  document.getElementById("btnClear").onclick    = clearAll;
  document.getElementById("btnExtract").onclick  = () => processData("export");
});

/* ====== Beautify / Validate / Upload / Clear ====== */
function beautifyJSON(){
  clearMsgs();
  const i=document.getElementById("beautifyInput"), o=document.getElementById("beautifyOutput");
  const res=parseWithAutoFix(i.value);
  if(!res.ok){ setInputErrorState(true,res.errorCtx); o.value=""; showMsg("❌ Invalid JSON — auto-fix couldn’t recover. See details below.","bad"); return; }
  setInputErrorState(false);
  o.value = JSON.stringify(res.data,null,2);
  if(res.fixed){ i.value = res.fixedText; showMsg("🛠️ Auto-fixed and beautified JSON.","good"); }
  else showMsg("✅ Beautified successfully.","good");
}
function validateJSON(){
  clearMsgs();
  const i=document.getElementById("beautifyInput"), o=document.getElementById("beautifyOutput");
  const res=parseWithAutoFix(i.value);
  if(!res.ok){ setInputErrorState(true,res.errorCtx); o.value="❌ Invalid JSON"; showMsg("❌ Invalid JSON — auto-fix couldn’t recover.","bad"); return; }
  setInputErrorState(false); o.value="✅ Valid JSON";
  if(res.fixed){ i.value=res.fixedText; showMsg("🛠️ JSON was auto-corrected and is now valid.","good"); }
  else showMsg("✅ JSON is valid.","good");
}
function uploadJSON(){
  clearMsgs();
  const fi=document.getElementById("fileInput");
  fi.value=""; fi.click();
  fi.onchange=function(){
    const f=fi.files && fi.files[0]; if(!f) return;
    const r=new FileReader();
    progressShow();
    r.onprogress=function(evt){
      if(evt.lengthComputable){
        const pct = Math.min(30, Math.round((evt.loaded/evt.total)*30));
        progressSet(pct);
      }
    };
    r.onloadstart=function(){ showMsg("📥 Reading file…","info"); };
    r.onload=function(e){
      progressSet(30);
      const text=e.target.result, input=document.getElementById("beautifyInput");
      const res=parseWithAutoFix(text);
      if(!res.ok){ input.value=text; setInputErrorState(true,res.errorCtx); showMsg("⚠️ File loaded, but JSON is invalid — auto-fix failed.","warn"); progressHide(); return; }
      setInputErrorState(false);
      input.value = res.fixed ? res.fixedText : JSON.stringify(res.data,null,2);
      showMsg(res.fixed?"🛠️ Loaded + auto-corrected JSON file.":"✅ JSON file loaded.","good");
    };
    r.onerror=function(){ progressHide(); showMsg("❌ Failed to read file.","bad"); };
    r.readAsText(f);
  };
}
function clearAll(){
  clearMsgs();
  ["beautifyInput","beautifyOutput"].forEach(id => { const el=document.getElementById(id); if(el) el.value=""; });
  ["downloadLink","excelLink"].forEach(id => {
    const a=document.getElementById(id);
    if(a){
      try{ if(a.href) URL.revokeObjectURL(a.href); }catch(e){}
      a.removeAttribute("href");
      a.style.display="none";
      a.textContent = (id==="downloadLink" ? "Download CSV" : "Download XLSX (merged)");
    }
  });
  const sec=document.getElementById("csvPreviewSection"); if(sec) sec.style.display="none";
  const pv=document.getElementById("csvPreview"); if(pv) pv.innerHTML="";
  const mini=document.getElementById("miniSummary"); if(mini) mini.style.display="none";
  setInputErrorState(false);
  progressHide(); progressSet(0);
  showMsg("🧹 Cleared.","info");
}

/* ====== Core processing (preview/export) ====== */
function processData(mode /* "preview" or "export" */){
  const csvA=document.getElementById("downloadLink");
  const xlsA=document.getElementById("excelLink");
  if(csvA) { try{ if(csvA.href) URL.revokeObjectURL(csvA.href);}catch(e){} csvA.style.display="none"; }
  if(xlsA) { try{ if(xlsA.href) URL.revokeObjectURL(xlsA.href);}catch(e){} xlsA.style.display="none"; }

  clearMsgs();

  const input=document.getElementById("beautifyInput");
  const res=parseWithAutoFix(input.value);
  if(!res.ok){ setInputErrorState(true,res.errorCtx); showMsg("❌ Invalid JSON — cannot process.","bad"); return; }
  setInputErrorState(false);
  if(res.fixed){ input.value=res.fixedText; showMsg("🛠️ Auto-corrected JSON before processing.","good"); }

  let data=res.data; if(!Array.isArray(data)) data=[data];

  const includeIP      = document.getElementById("field_ip").checked;
  const includeDomain  = document.getElementById("field_domain").checked;
  const includePorts   = document.getElementById("field_ports").checked;
  const includeCity    = document.getElementById("field_city").checked;
  const includeOrg     = document.getElementById("field_org").checked;
  const includeVulns   = document.getElementById("field_vulns").checked;
  const includeProdAndTech = document.getElementById("field_webtech").checked;
  const includeVersions= document.getElementById("field_versions").checked;

  const includeCVSS = true;
  const includeTimestamp = true;

  const headers=[];
  if(includeIP)headers.push("IP");
  if(includeDomain)headers.push("Domain(s)");
  if(includePorts)headers.push("Ports");
  if(includeCity)headers.push("City");
  if(includeOrg)headers.push("Organization");
  if(includeVulns)headers.push("Vulnerabilities");
  if(includeProdAndTech){ headers.push("Product"); headers.push("Web Technologies"); }
  if(includeVersions)headers.push("Versions");
  if(includeCVSS) headers.push("CVSS");
  if(includeTimestamp) headers.push("Timestamp");

  const idx={};
  headers.forEach((h,i)=>{
    if(h==="IP") idx.ip=i;
    if(h==="Domain(s)") idx.dom=i;
    if(h==="Ports") idx.ports=i;
    if(h==="City") idx.city=i;
    if(h==="Organization") idx.org=i;
    if(h==="Vulnerabilities") idx.vuln=i;
    if(h==="Product") idx.prod=i;
    if(h==="Web Technologies") idx.web=i;
    if(h==="Versions") idx.ver=i;
    if(h==="CVSS") idx.cvss=i;
    if(h==="Timestamp") idx.ts=i;
  });

  const splitTerms = v => (v||"").split(";").map(s=>s.trim().toLowerCase()).filter(Boolean);
  const inc = splitTerms(document.getElementById("includeFilter").value);
  const exc = splitTerms(document.getElementById("excludeFilter").value);
  const rowPasses = (row) => {
    const s=row.join(",").toLowerCase();
    for(let i=0;i<inc.length;i++) if(!s.includes(inc[i])) return false;
    for(let j=0;j<exc.length;j++) if(s.includes(exc[j])) return false;
    return true;
  };

  const preview = document.getElementById("csvPreview");
  preview.innerHTML = "";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  headers.forEach(h=>{ const th=document.createElement("th"); th.textContent=h; th.style.background="#2a2a2a"; th.style.color="#bb86fc"; th.style.border="1px solid #333"; th.style.padding="6px 10px"; trh.appendChild(th); });
  thead.appendChild(trh); table.appendChild(thead);
  const tbody = document.createElement("tbody");

  const excelRows=[headers.slice()];
  const merges=[];
  let excelRowCursor = 1;

  const summary = { ips:new Set(), domains:new Set(), ports:new Set(), cities:new Set(), orgs:new Set(), vulns:new Set(), products:new Set(), versions:new Set(), webtech:new Set() };

  progressShow();
  let i=0, total=data.length||1;
  const CHUNK = 100;

  function collectVulnEntries(ent){
    const outMap = new Map(); // id -> cvss string or ""
    if(!ent) return [];
    const add = (id, score) => {
      if(!id) return;
      let v = String(id).trim();
      if(!v) return;
      if (/^cve-\d{4}-\d{4,7}$/i.test(v)) v = v.toUpperCase();
      const prev = outMap.get(v);
      const s = (score==null || score==="") ? (prev ?? "") : String(score);
      outMap.set(v, s);
    };
    const extractFromDetails = (obj) => {
      if(!obj || typeof obj!=="object") return "";
      if (obj.cvssv3 && typeof obj.cvssv3 === "object" && obj.cvssv3.base_score != null) return String(obj.cvssv3.base_score);
      if (obj.cvss != null) return String(obj.cvss);
      return "";
    };
    if (Array.isArray(ent.vulns)) ent.vulns.forEach(id => add(id, ""));
    else if (ent.vulns && typeof ent.vulns === "object") Object.keys(ent.vulns).forEach(k => add(k, extractFromDetails(ent.vulns[k])));
    else if (typeof ent.vulns === "string" && ent.vulns.trim()) add(ent.vulns, "");
    if (ent.opts && ent.opts.vulns){
      if (Array.isArray(ent.opts.vulns)) ent.opts.vulns.forEach(id => add(id, ""));
      else if (typeof ent.opts.vulns === "object") Object.keys(ent.opts.vulns).forEach(k => add(k, extractFromDetails(ent.opts.vulns[k])));
      else if (typeof ent.opts.vulns === "string") add(ent.opts.vulns, "");
    }
    if (ent.vuln && typeof ent.vuln === "string") add(ent.vuln, "");
    return Array.from(outMap.entries()).map(([id,cvss]) => ({ id, cvss }));
  }

  function pickHostTimestamp(item){
    const candidates = [item.last_update, item.timestamp, item.last_seen];
    for (let k=0;k<candidates.length;k++){
      const v = candidates[k];
      if (v && String(v).trim()) return String(v).trim();
    }
    return "";
  }

  function step(){
    const start=i;
    for(; i<Math.min(start+CHUNK,total); i++){
      const item=data[i];

      const ipVal = includeIP ? (item.ip_str || (typeof item.ip==="number" ? intToIP(item.ip>>>0) : "")) : "";
      const orgVal= includeOrg ? (item.org || item.isp || item.asn || "") : "";
      const hostTs = includeTimestamp ? pickHostTimestamp(item) : "";

      // domains
      let domains=[];
      if(includeDomain){
        let d=[];
        if(Array.isArray(item.hostnames)) d.push(...item.hostnames);
        if(Array.isArray(item.domains)) d.push(...item.domains);
        if(item.http && item.http.host) d.push(item.http.host);
        const roots=d.map(getRegistrableDomain).filter(Boolean);
        domains=Array.from(new Set(roots));
        if(!COUNT_IP_LIKE_DOMAINS) domains = domains.filter(x=>!isIP(x));
      }

      // ports
      let ports=[];
      if(includePorts){
        const set=new Set();
        if(item.port!=null) set.add(String(item.port));
        if(Array.isArray(item.data)) item.data.forEach(svc=>{ if(svc && svc.port!=null) set.add(String(svc.port)); });
        ports = Array.from(set);
      }

      // city
      let cities=[];
      if(includeCity && item.location && item.location.city) cities=[String(item.location.city)];

      // vulns + cvss
      let vulnList=[], cvssList=[];
      if(includeVulns || includeCVSS){
        const map = new Map(); // CVE -> best CVSS
        const addEntries = (arr) => {
          arr.forEach(({id,cvss})=>{
            if(!id) return;
            if(!map.has(id) || (map.get(id)==="" && cvss!=="")) map.set(id, cvss || "");
          });
        };
        addEntries(collectVulnEntries(item));
        if(item && item.opts) addEntries(collectVulnEntries(item.opts));
        if(Array.isArray(item.data)){
          item.data.forEach(svc=>{
            addEntries(collectVulnEntries(svc));
            if (svc && svc.opts) addEntries(collectVulnEntries(svc.opts));
          });
        }
        const pairs = Array.from(map.entries());
        vulnList = pairs.map(p=>p[0]);
        cvssList = pairs.map(p=>p[1] || "");
      }

      // products / versions / web tech
      let products=[], versions=[], webTech=[];
      if(includeProdAndTech || includeVersions){
        if(Array.isArray(item.data)){
          item.data.forEach(svc=>{
            if(svc && svc.product){
              const v = extractVersionFromProduct(svc.product, svc.version);
              products.push(String(svc.product));
              versions.push(v ? String(v) : (svc.version ? String(svc.version) : ""));
            }
          });
        }
        if(item.http && item.http.server){
          const serverText = String(item.http.server);
          const v = extractVersionFromProduct(serverText, "");
          products.push(serverText);
          versions.push(v || "");
        }
        if(item.http && item.http.components){
          const comps=item.http.components, t=[];
          for(const k in comps){ if(Object.prototype.hasOwnProperty.call(comps,k)) t.push(k); }
          webTech = Array.from(new Set(t.map(x=>String(x).trim().toLowerCase()).filter(Boolean)));
        }
        (function dedupe(){
          const seen=new Set(), p=[], v=[];
          for(let k=0;k<products.length;k++){
            const key=String(products[k]).trim().toLowerCase();
            if(!key) continue; if(seen.has(key)) continue; seen.add(key); p.push(products[k]); v.push(versions[k]||"");
          }
          products=p; versions=v;
        })();
      }

      const rowCount = Math.max(1,
        includeDomain?(domains.length||0):0,
        includePorts?(ports.length||0):0,
        includeCity?(cities.length||0):0,
        includeVulns?(vulnList.length||0):0,
        includeProdAndTech?(products.length||0):0,
        includeProdAndTech?(webTech.length||0):0,
        includeVersions?(products.length||0):0
      );

      const candidates=[];
      for(let r=0;r<rowCount;r++){
        const row=[];
        if(includeIP)       row.push(r===0?ipVal:"");
        if(includeDomain)   row.push(domains[r]||"");
        if(includePorts)    row.push(ports[r]||"");
        if(includeCity)     row.push(cities[r]||"");
        if(includeOrg)      row.push(r===0?orgVal:"");
        if(includeVulns)    row.push(vulnList[r]||"");
        if(includeProdAndTech){ row.push(products[r]||""); row.push(webTech[r]||""); }
        if(includeVersions) row.push(products[r]? (versions[r]||"") : "");
        if(includeCVSS)     row.push(vulnList[r] ? (cvssList[r] || "") : "");
        if(includeTimestamp)row.push(hostTs || "");
        candidates.push(row);
      }

      const kept=candidates.filter(rowPasses);
      if(!kept.length){
        // no rows kept after filter
      }else{
        const startRowExcel = excelRowCursor + 1;
        const endRowExcel   = startRowExcel + kept.length - 1;
        if(kept.length>1){
          if(includeIP && idx.ip!=null && ipVal) { merges.push(colName(idx.ip)+startRowExcel+":"+colName(idx.ip)+endRowExcel); }
          if(includeOrg && idx.org!=null && orgVal){ merges.push(colName(idx.org)+startRowExcel+":"+colName(idx.org)+endRowExcel); }
        }

        kept.forEach(r=>{
          if(includeIP && idx.ip!=null && r[idx.ip]) summary.ips.add(r[idx.ip]);
          if(includeDomain && idx.dom!=null && r[idx.dom]) summary.domains.add(r[idx.dom]);
          if(includePorts && idx.ports!=null && r[idx.ports]) summary.ports.add(r[idx.ports]);
          if(includeCity && idx.city!=null && r[idx.city]) summary.cities.add(r[idx.city]);
          if(includeOrg && idx.org!=null && r[idx.org]) summary.orgs.add(r[idx.org]);
          if(includeVulns && idx.vuln!=null && r[idx.vuln]) summary.vulns.add(r[idx.vuln]);
          if(includeProdAndTech && idx.prod!=null && r[idx.prod]) summary.products.add(r[idx.prod]);
          if(includeVersions && idx.ver!=null && r[idx.ver]) summary.versions.add(r[idx.ver]);
          if(includeProdAndTech && idx.web!=null && r[idx.web]) summary.webtech.add(r[idx.web]);
        });

        let rendered=0;
        kept.forEach(row=>{
          const tr=document.createElement("tr");
          headers.forEach((_,c)=>{
            const val=row[c]||"";
            if((c===idx.ip || c===idx.org)){
              if(rendered===0 && val!==""){
                const td=document.createElement("td"); td.textContent=val; td.rowSpan=kept.length;
                td.style.border="1px solid #333"; td.style.padding="6px 10px"; td.style.textAlign="center"; td.style.verticalAlign="middle";
                tr.appendChild(td);
              }
            }else{
              const td=document.createElement("td"); td.textContent=val; td.style.border="1px solid #333"; td.style.padding="6px 10px";
              tr.appendChild(td);
            }
          });
          tbody.appendChild(tr);
          excelRows.push(row.slice());
          excelRowCursor++;
          rendered++;
        });
      }
    }

    const pct = 30 + ((i/total) * 70);
    progressSet(pct);

    if(i<total){ setTimeout(step, 0); }
    else {
      table.appendChild(tbody);
      const sec=document.getElementById("csvPreviewSection");
      if(sec) sec.style.display="block";
      preview.appendChild(table);

      const mapping = {
        sum_ip: summary.ips.size, sum_domains: summary.domains.size, sum_ports: summary.ports.size,
        sum_cities: summary.cities.size, sum_orgs: summary.orgs.size, sum_vulns: summary.vulns.size,
        sum_products: summary.products.size, sum_versions: summary.versions.size, sum_webtech: summary.webtech.size
      };
      let any=false; for(const id in mapping){ const el=document.getElementById(id); if(el){ el.textContent=String(mapping[id]); any=true; } }
      const mini=document.getElementById("miniSummary"); if(mini && any) mini.style.display="block";

      if(mode==="export"){
        const csv = csvSafe(excelRows);
        const csvA=document.getElementById("downloadLink");
        if(csvA){
          const blob=new Blob([csv], {type:"text/csv"});
          const url = URL.createObjectURL(blob);
          csvA.href=url; csvA.download="shodan_output.csv";
          csvA.style.display="inline";
          csvA.textContent="Download CSV";
        }
        // Center top cells (IP/Org merged tops) for a nicer look in Excel
        const centerTop = new Set();
        for(const ref of merges){
          const top = ref.split(":")[0];
          centerTop.add(top);
        }
        const xlsxBlob = exportXLSX(excelRows, merges, centerTop);
        const xlsxUrl = URL.createObjectURL(xlsxBlob);
        const xlsA=document.getElementById("excelLink");
        if(xlsA){
          xlsA.href = xlsxUrl; xlsA.download = "shodan_output.xlsx";
          xlsA.style.display = "inline";
        }
      }

      progressSet(100); setTimeout(progressHide, 300);
      showMsg(mode==="export" ? "✅ Extracted. Download links are ready." : "✅ Preview generated.", "good");
      showMsg("Output as Below", "good");
    }
  }

  // Start
  preview.appendChild(table);
  progressSet(30);
  step();
}
