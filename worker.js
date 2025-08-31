/* worker.js — parsing + row building with progress messages */

let SUMMARY_MODE = "unique_post_filter";
let COUNT_IP_LIKE_DOMAINS = false;

const MULTI_PART_SUFFIXES = [
  "co.uk","ac.uk","gov.uk","org.uk","net.uk",
  "com.au","net.au","org.au","edu.au","gov.au",
  "co.in","ac.in","gov.in","net.in","org.in","res.in",
  "co.jp","ne.jp","or.jp",
  "com.br","com.mx","com.sg","com.hk","com.cn","edu.cn","gov.cn",
  "co.za","org.za"
];

function postProgress(p){ try{ self.postMessage({kind:"progress", pct: Math.max(0, Math.min(100, Math.round(p))) }); }catch(e){} }

function isIP(v){
  if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v)) return v.split(".").every(o=>{o=Number(o);return o>=0&&o<=255;});
  if(/^[0-9a-f:]+$/i.test(v)&&v.includes(":")) return true;
  return false;
}
function intToIP(num){ return [(num>>>24)&255,(num>>>16)&255,(num>>>8)&255,num&255].join("."); }
function getRegistrableDomain(host){
  if (!host) return null;
  host = String(host).trim().replace(/\.$/,"").replace(/^\*\./,"").toLowerCase();
  if (!host) return null;
  if (isIP(host)) return null;
  const colon = host.indexOf(":");
  if (colon !== -1) host = host.slice(0, colon);
  const parts = host.split(".");
  if (parts.length <= 1) return host;
  const last2 = parts.slice(-2).join(".");
  const last3 = parts.slice(-3).join(".");
  for (let i=0;i<MULTI_PART_SUFFIXES.length;i++){
    const suf = MULTI_PART_SUFFIXES[i];
    if (last3.endsWith("."+suf) || last3 === suf) return last3;
  }
  return last2;
}

/* Auto-fix / JSON lines */
function normalizeSmartQuotes(s){return s.replace(/[\u201C\u201D\u2033]/g,'"').replace(/[\u2018\u2019\u2032]/g,"'");}
function stripComments(s){return s.replace(/(^|[^:])\/\/.*$/gm,"$1").replace(/\/\*[\s\S]*?\*\//g,"");}
function removeTrailingCommas(s){return s.replace(/,\s*(?=[}\]])/g,"");}
function quoteUnquotedKeys(s){return s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_\-.$]*)(\s*:)/g,'$1"$2"$3');}
function singleToDoubleQuotedStrings(s){return s.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g,(_,i)=>'"'+i.replace(/"/g,'\\"')+'"');}
function fixConcatenatedObjects(s){const j=s.replace(/}\s*{(?=\s*")/g,"},\n{"); if(/^\s*{[\s\S]*}\s*,\s*{[\s\S]*}\s*$/.test(j)) return "["+j+"]"; return j;}
function tryParseJSONL(s){
  const lines=s.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if (lines.length<=1) return null;
  const arr=[];
  for (let i=0;i<lines.length;i++){
    try{ arr.push(JSON.parse(lines[i])); }catch(e){ return null; }
  }
  return arr;
}
function autoFixJSON(raw){
  const jsonl = tryParseJSONL(raw);
  if (jsonl) return {ok:true, data:jsonl, fixedText:JSON.stringify(jsonl,null,2)};

  const attempts = [
    t => { let s=t; s=normalizeSmartQuotes(s); s=stripComments(s); return s!==t?s:null; },
    t => { const s1=singleToDoubleQuotedStrings(t); const s2=quoteUnquotedKeys(s1); return s2!==t?s2:null; },
    t => { const s=removeTrailingCommas(t); return s!==t?s:null; },
    t => { const s=fixConcatenatedObjects(t); return s!==t?s:null; },
    t => { if(!/^\s*{[\s\S]*}\s*$/.test(t) && t.indexOf("}\n{")!==-1) return "["+t.replace(/}\s*\n\s*{/g,"},\n{")+"]"; return null; }
  ];
  let current = raw;
  for (let k=0;k<attempts.length;k++){
    const tr = attempts[k](current);
    if (tr!==null){
      current = tr;
      try{ const d = JSON.parse(current); return {ok:true, data:d, fixedText:JSON.stringify(d,null,2)}; }catch(e){}
    }
  }
  try{
    const parts = raw.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
    if (parts.length>1){
      const objs = parts.map(JSON.parse);
      return {ok:true, data:objs, fixedText:JSON.stringify(objs,null,2)};
    }
  }catch(e){}
  return {ok:false};
}

function collectVulnsFromEntity(ent){
  const out = new Set();
  const add = (s) => {
    if (!s) return;
    s = String(s).trim();
    if (!s) return;
    if (/^cve-\d{4}-\d{4,7}$/i.test(s)) out.add(s.toUpperCase());
    else out.add(s);
  };
  if (ent && ent.opts && Array.isArray(ent.opts.vulns) && ent.opts.vulns.length){
    ent.opts.vulns.forEach(add);
  }
  return Array.from(out);
}

function splitTerms(v){ return (v||"").split(";").map(s=>s.trim().toLowerCase()).filter(Boolean); }
function passesBasicTerms(rowArray, incTerms, excTerms){
  const s = rowArray.join(",").toLowerCase();
  for (let i=0;i<incTerms.length;i++) if (s.indexOf(incTerms[i])===-1) return false;
  for (let j=0;j<excTerms.length;j++) if (s.indexOf(excTerms[j])!==-1) return false;
  return true;
}

function buildHeaders(flags){
  const {includeIP,includeDomain,includePorts,includeCity,includeOrg,includeVulns,includeProdAndTech,includeVersions} = flags;
  const headers=[];
  if (includeIP) headers.push("IP");
  if (includeDomain) headers.push("Domain(s)");
  if (includePorts) headers.push("Ports");
  if (includeCity) headers.push("City");
  if (includeOrg) headers.push("Organization");
  if (includeVulns) headers.push("Vulnerabilities");
  if (includeProdAndTech){ headers.push("Product"); headers.push("Web Technologies"); }
  if (includeVersions) headers.push("Versions");
  return headers;
}

function extractGroups(data, flags, includeFilter, excludeFilter){
  const headers = buildHeaders(flags);
  const idxMap={};
  headers.forEach((h,i)=>{
    if (h==="IP") idxMap.ip=i;
    if (h==="Domain(s)") idxMap.dom=i;
    if (h==="Ports") idxMap.ports=i;
    if (h==="City") idxMap.city=i;
    if (h==="Organization") idxMap.org=i;
    if (h==="Vulnerabilities") idxMap.vuln=i;
    if (h==="Product") idxMap.prod=i;
    if (h==="Web Technologies") idxMap.web=i;
    if (h==="Versions") idxMap.ver=i;
  });

  const incTerms = splitTerms(includeFilter);
  const excTerms = splitTerms(excludeFilter);

  const summary = {
    ips:new Set(), domains:new Set(), ports:new Set(), cities:new Set(),
    orgs:new Set(), vulns:new Set(), products:new Set(), versions:new Set(), webtech:new Set()
  };

  const groups = [];
  const total = data.length || 1;

  data.forEach((item, idx)=>{
    // progress budget: from ~35% (upload/ready) to ~95% across items
    const pct = 35 + Math.floor((idx/total) * 60);
    if (idx % 25 === 0) postProgress(pct);

    const ipVal = flags.includeIP ? (item.ip_str || (typeof item.ip==="number" ? intToIP(item.ip>>>0) : "")) : "";
    const orgVal = flags.includeOrg ? (item.org || item.isp || item.asn || "") : "";

    // Domains
    let domains=[];
    if (flags.includeDomain){
      let d=[];
      if (Array.isArray(item.hostnames)) d.push(...item.hostnames);
      if (Array.isArray(item.domains)) d.push(...item.domains);
      if (item.http && item.http.host) d.push(item.http.host);
      const roots = d.map(getRegistrableDomain).filter(Boolean);
      domains = Array.from(new Set(roots));
      if (!COUNT_IP_LIKE_DOMAINS) domains = domains.filter(x => !isIP(x));
    }

    // Ports
    let ports=[];
    if (flags.includePorts){
      const pset = new Set();
      if (item.port != null) pset.add(String(item.port));
      if (Array.isArray(item.data)) item.data.forEach(svc => { if (svc && svc.port != null) pset.add(String(svc.port)); });
      ports = Array.from(pset);
    }

    // City
    let cities=[];
    if (flags.includeCity && item.location && item.location.city) cities=[String(item.location.city)];

    // Vulns
    let vulns=[];
    if (flags.includeVulns){
      const vset = new Set();
      collectVulnsFromEntity(item).forEach(x => vset.add(x));
      if (Array.isArray(item.data)){
        item.data.forEach(svc => collectVulnsFromEntity(svc).forEach(x => vset.add(x)));
      }
      vulns = Array.from(vset);
    }

    // Products/Versions/WebTech
    let products=[], versions=[], webTech=[];
    if (flags.includeProdAndTech || flags.includeVersions){
      if (Array.isArray(item.data)){
        item.data.forEach(svc=>{
          if (svc && svc.product){
            products.push(String(svc.product));
            versions.push(svc.version ? String(svc.version) : "");
          }
        });
      }
      if (item.http && item.http.server){
        products.push(String(item.http.server));
        versions.push("");
      }
      if (item.http && item.http.components){
        const comps = item.http.components;
        const techs=[];
        for (const name in comps){ if (Object.prototype.hasOwnProperty.call(comps,name)) techs.push(name); }
        webTech = Array.from(new Set(techs.map(t => String(t).trim().toLowerCase()).filter(Boolean)));
      }
      // de-dupe keep versions aligned
      (function dedup(){
        const seen=new Set(), p=[], v=[];
        for (let i=0;i<products.length;i++){
          const key=String(products[i]).trim().toLowerCase();
          if (!key) continue;
          if (seen.has(key)) continue;
          seen.add(key); p.push(products[i]); v.push(versions[i]||"");
        }
        products=p; versions=v;
      })();
    }

    const rowCount = Math.max(1,
      flags.includeDomain?(domains.length||0):0,
      flags.includePorts?(ports.length||0):0,
      flags.includeCity?(cities.length||0):0,
      flags.includeVulns?(vulns.length||0):0,
      flags.includeProdAndTech?(products.length||0):0,
      flags.includeProdAndTech?(webTech.length||0):0,
      flags.includeVersions?(products.length||0):0
    );

    const candidates=[];
    for (let i=0;i<rowCount;i++){
      const row=[];
      if (flags.includeIP)       row.push(i===0?ipVal:"");
      if (flags.includeDomain)   row.push(domains[i]||"");
      if (flags.includePorts)    row.push(ports[i]||"");
      if (flags.includeCity)     row.push(cities[i]||"");
      if (flags.includeOrg)      row.push(i===0?orgVal:"");
      if (flags.includeVulns)    row.push(vulns[i]||"");
      if (flags.includeProdAndTech){ row.push(products[i]||""); row.push(webTech[i]||""); }
      if (flags.includeVersions) row.push(products[i] ? (versions[i]||"") : "");
      candidates.push(row);
    }

    const kept = candidates.filter(r => passesBasicTerms(r, splitTerms(includeFilter), splitTerms(excludeFilter)));

    // summary updates
    function addToSummary(r){
      if (flags.includeIP && idxMap.ip!=null && r[idxMap.ip]) summary.ips.add(r[idxMap.ip]);
      if (flags.includeDomain && idxMap.dom!=null && r[idxMap.dom]) summary.domains.add(r[idxMap.dom]);
      if (flags.includePorts && idxMap.ports!=null && r[idxMap.ports]) summary.ports.add(r[idxMap.ports]);
      if (flags.includeCity && idxMap.city!=null && r[idxMap.city]) summary.cities.add(r[idxMap.city]);
      if (flags.includeOrg && idxMap.org!=null && r[idxMap.org]) summary.orgs.add(r[idxMap.org]);
      if (flags.includeVulns && idxMap.vuln!=null && r[idxMap.vuln]) summary.vulns.add(r[idxMap.vuln]);
      if (flags.includeProdAndTech && idxMap.prod!=null && r[idxMap.prod]) summary.products.add(r[idxMap.prod]);
      if (flags.includeVersions && idxMap.ver!=null && r[idxMap.ver]) summary.versions.add(r[idxMap.ver]);
      if (flags.includeProdAndTech && idxMap.web!=null && r[idxMap.web]) summary.webtech.add(r[idxMap.web]);
    }

    if (!kept.length){
      // unique_pre_filter/per_host behaviors (same logic as earlier)
      // For brevity, we won't duplicate all branches; the main mode is unique_post_filter
      return;
    }

    const headersForIdx = headers || buildHeaders(flags);
    const idxMap = {};
    headersForIdx.forEach((h,i)=>{
      if (h==="IP") idxMap.ip=i;
      if (h==="Domain(s)") idxMap.dom=i;
      if (h==="Ports") idxMap.ports=i;
      if (h==="City") idxMap.city=i;
      if (h==="Organization") idxMap.org=i;
      if (h==="Vulnerabilities") idxMap.vuln=i;
      if (h==="Product") idxMap.prod=i;
      if (h==="Web Technologies") idxMap.web=i;
      if (h==="Versions") idxMap.ver=i;
    });

    kept.forEach(addToSummary);
    groups.push({ rows: kept });
  });

  postProgress(95); // near done

  const toCount = o => o.size;
  return {
    headers: buildHeaders(flags),
    groups,
    summary: {
      ips: toCount(summary.ips),
      domains: toCount(summary.domains),
      ports: toCount(summary.ports),
      cities: toCount(summary.cities),
      orgs: toCount(summary.orgs),
      vulns: toCount(summary.vulns),
      products: toCount(summary.products),
      versions: toCount(summary.versions),
      webtech: toCount(summary.webtech)
    }
  };
}

self.onmessage = (e)=>{
  const { kind } = e.data || {};
  if (kind !== "parse_and_extract") return;

  try{
    SUMMARY_MODE = e.data.SUMMARY_MODE || "unique_post_filter";
    COUNT_IP_LIKE_DOMAINS = !!e.data.COUNT_IP_LIKE_DOMAINS;

    const raw = e.data.text || "";
    const flags = e.data.flags || {};
    const includeFilter = e.data.includeFilter || "";
    const excludeFilter = e.data.excludeFilter || "";

    postProgress(35); // after upload, before parse

    let fixedText = raw, parsed = null;
    try{
      parsed = JSON.parse(raw);
    }catch(parseErr){
      const fx = autoFixJSON(raw);
      if (!fx.ok) {
        self.postMessage({ kind:"error", message:"Invalid JSON — auto-fix couldn’t recover." });
        return;
      }
      fixedText = fx.fixedText;
      parsed = fx.data;
    }

    if (!Array.isArray(parsed)) parsed = [parsed];

    const out = extractGroups(parsed, flags, includeFilter, excludeFilter);

    postProgress(100);
    self.postMessage({ kind:"ok", fixedText, ...out });
  }catch(err){
    self.postMessage({ kind:"error", message: String(err && err.message ? err.message : err) });
  }
};
