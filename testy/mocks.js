// Simulace služeb Google pro testy v Node. Vkládá se za kód aplikace do jednoho skriptu (sdílený globální rozsah jako v Apps Script).
var __props = {}, __userProps = {}, __cache = {}, __sent = [], __triggers = [];
var __stats = { sheetCalls: 0, propCalls: 0, apiCalls: 0 };
function __wrapProps(store) {
  return {
    getProperty: function(k) { __stats.propCalls++; return k in store ? store[k] : null; },
    setProperty: function(k, v) { __stats.propCalls++; store[k] = String(v); },
    deleteProperty: function(k) { __stats.propCalls++; delete store[k]; },
    getProperties: function() { __stats.propCalls++; return Object.assign({}, store); }
  };
}
var PropertiesService = { getScriptProperties: function() { return __wrapProps(__props); }, getUserProperties: function() { return __wrapProps(__userProps); } };
var CacheService = { getScriptCache: function() { return {
  get: function(k) { return k in __cache ? __cache[k] : null; },
  getAll: function(ks) { var o = {}; ks.forEach(function(k) { if (k in __cache) o[k] = __cache[k]; }); return o; },
  put: function(k, v) { __cache[k] = String(v); },
  putAll: function(m) { Object.keys(m).forEach(function(k) { __cache[k] = String(m[k]); }); },
  remove: function(k) { delete __cache[k]; } }; } };
var Utilities = {
  DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
  computeDigest: function(alg, t) { return Array.from(__crypto.createHash("sha256").update(String(t), "utf8").digest()).map(function(x) { return x > 127 ? x - 256 : x; }); },
  sleep: function() {},
  getUuid: function() { return __crypto.randomUUID(); },
  base64Encode: function(b) { return Buffer.from(b.map(function(x) { return x & 255; })).toString("base64"); },
  newBlob: function(bytes, type, name) { return { bytes: bytes, type: type, name: name }; },
  formatDate: function(d, tz, fmt) { var p = function(n) { return ("0" + n).slice(-2); }; return d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes()); }
};
var LockService = { getScriptLock: function() { return { tryLock: function() { return true; }, releaseLock: function() {}, waitLock: function() {} }; },
  getUserLock: function() { return { tryLock: function() { return true; }, releaseLock: function() {}, waitLock: function() {} }; } };
var Logger = { log: function() {} };
var Session = { getScriptTimeZone: function() { return "Europe/Prague"; }, getEffectiveUser: function() { return { getEmail: function() { return "admin@gmail.com"; } }; } };
var MailApp = { getRemainingDailyQuota: function() { return 100; } };
var UrlFetchApp = { fetch: function() { throw new Error("offline"); } };
var ScriptApp = {
  getProjectTriggers: function() { return __triggers.slice(); },
  deleteTrigger: function(t) { __triggers = __triggers.filter(function(x) { return x !== t; }); },
  newTrigger: function(fn) { var t = { getHandlerFunction: function() { return fn; } }; var b = { timeBased: function() { return b; }, everyHours: function() { return b; }, create: function() { __triggers.push(t); return t; } }; return b; },
  getService: function() { return { getUrl: function() { return "https://script.google.com/macros/s/X/exec"; } }; }
};
function __colEmpty(v) { return v === "" || v === null || v === undefined; }
function __mkSheet(ss, name, id, rows) {
  var sh = { __data: (rows || []).map(function(r) { return r.slice(); }), __bg: [], __maxR: Math.max(1000, (rows || []).length), __maxC: 26, __hidden: false };
  function get(r, c) { var row = sh.__data[r - 1]; var v = row ? row[c - 1] : undefined; return v === undefined || v === null ? "" : v; }
  function set(r, c, v) { while (sh.__data.length < r) sh.__data.push([]); var row = sh.__data[r - 1]; while (row.length < c) row.push(""); row[c - 1] = v; if (r > sh.__maxR) sh.__maxR = r; if (c > sh.__maxC) sh.__maxC = c; }
  function lastRow() { for (var i = sh.__data.length; i >= 1; i--) { var row = sh.__data[i - 1]; for (var j = 0; j < row.length; j++) if (!__colEmpty(row[j])) return i; } return 0; }
  function lastCol() { var w = 0; sh.__data.forEach(function(row) { for (var j = row.length; j >= 1; j--) if (!__colEmpty(row[j - 1])) { if (j > w) w = j; break; } }); return w; }
  sh.getName = function() { return name; }; sh.setName = function(n) { name = n; return sh; };
  sh.getSheetId = function() { return id; };
  sh.getParent = function() { return ss; };
  sh.getIndex = function() { return ss.__sheets.indexOf(sh) + 1; };
  sh.getLastRow = lastRow; sh.getLastColumn = lastCol;
  sh.getMaxRows = function() { return sh.__maxR; }; sh.getMaxColumns = function() { return sh.__maxC; };
  sh.insertRowsAfter = function(row, n) { for (var i = 0; i < n; i++) { sh.__data.splice(row, 0, []); sh.__bg.splice(row, 0, undefined); } sh.__maxR += n; return sh; };
  sh.insertColumnsAfter = function(c, n) { sh.__maxC += n; return sh; };
  sh.deleteRows = function(row, n) { sh.__data.splice(row - 1, n); sh.__bg.splice(row - 1, n); sh.__maxR -= n; return sh; };
  sh.deleteRow = function(row) { return sh.deleteRows(row, 1); };
  sh.deleteColumn = function(c) { sh.__data.forEach(function(row) { if (row.length >= c) row.splice(c - 1, 1); }); sh.__bg.forEach(function(row) { if (row && row.length >= c) row.splice(c - 1, 1); }); return sh; };
  sh.hideSheet = function() { sh.__hidden = true; return sh; }; sh.showSheet = function() { sh.__hidden = false; return sh; };
  sh.setColumnWidth = function() { return sh; }; sh.setFrozenRows = function() { return sh; };
  sh.getRange = function(r, c, nr, nc) {
    nr = nr === undefined ? 1 : nr; nc = nc === undefined ? 1 : nc;
    if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error("Rozsah mimo tabulku: " + [r, c, nr, nc]);
    __stats.sheetCalls++;
    var rg = {};
    rg.getValues = function() { __stats.sheetCalls++; var o = []; for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) row.push(get(r + i, c + j)); o.push(row); } return o; };
    rg.getValue = function() { __stats.sheetCalls++; return get(r, c); };
    rg.setValues = function(v) { __stats.sheetCalls++; if (v.length !== nr || v[0].length !== nc) throw new Error("setValues: rozměr " + v.length + "x" + v[0].length + " ≠ " + nr + "x" + nc); for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) set(r + i, c + j, v[i][j]); return rg; };
    rg.setValue = function(v) { __stats.sheetCalls++; for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) set(r + i, c + j, v); return rg; };
    rg.clearContent = function() { for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) set(r + i, c + j, ""); return rg; };
    rg.getBackgrounds = function() { var o = []; for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) { var b = sh.__bg[r - 1 + i]; row.push(b && b[c - 1 + j] ? b[c - 1 + j] : "#ffffff"); } o.push(row); } return o; };
    rg.setBackgrounds = function(v) { for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) { while (sh.__bg.length < r + i) sh.__bg.push(undefined); var b = sh.__bg[r - 1 + i] || (sh.__bg[r - 1 + i] = []); b[c - 1 + j] = v[i][j]; } return rg; };
    rg.setBackground = function(col) { for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) { while (sh.__bg.length < r + i) sh.__bg.push(undefined); var b = sh.__bg[r - 1 + i] || (sh.__bg[r - 1 + i] = []); b[c - 1 + j] = col; } return rg; };
    rg.setRichTextValues = function(v) { for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) set(r + i, c + j, v[i][j].text); return rg; };
    ["setFontWeight", "setFontColor", "setWrap", "setNumberFormat", "setHorizontalAlignment"].forEach(function(m) { rg[m] = function() { return rg; }; });
    return rg;
  };
  sh.getDataRange = function() { var lr = Math.max(lastRow(), 1), lc = Math.max(lastCol(), 1); return sh.getRange(1, 1, lr, lc); };
  return sh;
}
var __ssNextId = 100;
function __mkSpreadsheet(sheetsDef) {
  var ss = { __sheets: [], __active: 0, __name: "Tabulka" };
  sheetsDef.forEach(function(d) { ss.__sheets.push(__mkSheet(ss, d.name, d.id, d.rows)); });
  ss.getSheets = function() { return ss.__sheets.slice(); };
  ss.getSheetByName = function(n) { for (var i = 0; i < ss.__sheets.length; i++) if (ss.__sheets[i].getName() === n) return ss.__sheets[i]; return null; };
  ss.insertSheet = function(n, pos) { var s = __mkSheet(ss, n, ++__ssNextId, []); if (pos === undefined) ss.__sheets.push(s); else ss.__sheets.splice(Math.min(pos, ss.__sheets.length), 0, s); return s; };
  ss.deleteSheet = function(s) { var i = ss.__sheets.indexOf(s); if (i === -1) throw new Error("List neexistuje"); ss.__sheets.splice(i, 1); };
  ss.getActiveSheet = function() { return ss.__sheets[ss.__active] || ss.__sheets[0]; };
  ss.setActiveSheet = function(s) { var i = ss.__sheets.indexOf(s); if (i !== -1) ss.__active = i; return s; };
  ss.rename = function(n) { ss.__name = n; }; ss.getName = function() { return ss.__name; };
  ss.getId = function() { return "SSID"; }; ss.getUrl = function() { return "https://docs.google.com/spreadsheets/d/SSID/edit"; };
  return ss;
}
var __SS = null;
var SpreadsheetApp = {
  getActiveSpreadsheet: function() { return __SS; }, openById: function() { return __SS; }, getUi: function() { throw new Error("Není UI"); },
  newRichTextValue: function() { var t = ""; var b = { setText: function(x) { t = x; return b; }, setLinkUrl: function() { return b; }, build: function() { return { text: t }; } }; return b; }
};
// Gmail
var __gmail = { messages: [], labels: {} };
function __mkMsg(m) { return { getId: function() { return m.id; }, getFrom: function() { return m.from; }, getPlainBody: function() { return m.body; }, getDate: function() { return m.date; }, getSubject: function() { return m.subject || "Pohyb na účtu"; } }; }
var GmailApp = {
  getAliases: function() { return []; },
  getUserLabels: function() { return Object.keys(__gmail.labels).map(function(n) { return __gmail.labels[n]; }); },
  getUserLabelByName: function(n) { return __gmail.labels[n] || null; },
  createLabel: function(n) { var th = {}; var l = { getName: function() { return n; }, getThreads: function(s, m) { return Object.keys(th).slice(s, s + m).map(function(k) { return th[k]; }); }, removeFromThread: function(t) { delete th[t.getId()]; }, __th: th }; __gmail.labels[n] = l; return l; },
  search: function(q, start, max) {
    var m = q.match(/"([0-9]+)"/); var ss = m ? m[1] : "";
    var hits = __gmail.messages.filter(function(x) { return !ss || x.body.indexOf(ss) !== -1; });
    var byThread = {}; hits.forEach(function(x) { (byThread[x.thread] = byThread[x.thread] || []).push(x); });
    var res = Object.keys(byThread).map(function(tid) { var t = { getId: function() { return tid; }, getMessages: function() { return byThread[tid].map(__mkMsg); }, addLabel: function(l) { l.__th[tid] = t; } }; return t; });
    return res.slice(start, start + max);
  },
  getMessageById: function(id) { var x = __gmail.messages.filter(function(y) { return y.id === id; })[0]; if (!x) throw new Error("Zpráva neexistuje"); return __mkMsg(x); },
  sendEmail: function(to, subj, text, opts) { __sent.push({ to: to, subject: subj, text: text, opts: opts || {} }); }
};
var Sheets = { Spreadsheets: { Values: { batchGet: function(id, opt) {
  __stats.apiCalls++;
  return { valueRanges: opt.ranges.map(function(r) {
    var name = r.replace(/^'|'$/g, "").replace(/''/g, "'"); var sh = __SS.getSheetByName(name);
    var rows = sh ? sh.__data.map(function(row) { var t = row.slice(); while (t.length && __colEmpty(t[t.length - 1])) t.pop(); return t; }) : [];
    while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
    return { range: r, values: rows };
  }) }; } } } };
