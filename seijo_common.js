'use strict';

// ===== Storage =====
const LS_KEY = 'seijo_bank_v1';

function nowIso(){
  return new Date().toISOString();
}

function readBank(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return [];
    const data = JSON.parse(raw);
    if(!Array.isArray(data)) return [];
    return normalizeBank(data);
  }catch(e){
    console.warn('readBank failed', e);
    return [];
  }
}

function writeBank(bank){
  const data = normalizeBank(bank);
  localStorage.setItem(LS_KEY, JSON.stringify(data));
  return data;
}

function normalizeBank(bank){
  const out = [];
  const used = new Set();

  // keep order; ensure required fields exist
  for(const q0 of (bank || [])){
    if(!q0 || typeof q0 !== 'object') continue;
    const q = {
      example_id: String(q0.example_id ?? '').trim(),
      en_sentence: String(q0.en_sentence ?? '').trim(),
      ja_translation: String(q0.ja_translation ?? '').trim(),
      multi_terms: String(q0.multi_terms ?? '').trim(),
      start: clampInt(q0.start, 1, 9999, 1),
      ending: clampInt(q0.ending, 0, 9999, 0),
      missing_words: String(q0.missing_words ?? '').trim(),
      extra_words: String(q0.extra_words ?? '').trim(),
      show_jp: !!q0.show_jp,
      updated_at: q0.updated_at ? String(q0.updated_at) : nowIso(),
    };

    // auto id if blank
    if(!q.example_id) q.example_id = makeNextId(out);

    // ensure unique id (only among those already kept)
    if(used.has(q.example_id)){
      q.example_id = makeNextId(out);
    }
    used.add(q.example_id);

    out.push(q);
  }

  return out;
}

function makeNextId(bank){
  let max = 0;
  for(const q of (bank || [])){
    const n = parseInt(String(q.example_id || '').trim(), 10);
    if(Number.isFinite(n)) max = Math.max(max, n);
  }
  return String(max + 1);
}

function clampInt(v, min, max, fallback){
  const n = parseInt(String(v ?? ''), 10);
  if(!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ===== Small helpers =====

function esc(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function arraysEqual(a, b){
  if(a === b) return true;
  if(!Array.isArray(a) || !Array.isArray(b)) return false;
  if(a.length !== b.length) return false;
  for(let i=0;i<a.length;i++){
    if(a[i] !== b[i]) return false;
  }
  return true;
}

function parseCommaList(s){
  return String(s || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}

function underscoreToSpace(tok){
  return String(tok || '').replaceAll('_', ' ');
}

function shuffle(arr){
  const a = (arr || []).slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ===== Tokenization =====

function tokensFromSentence(sentence){
  let s = String(sentence || '').trim().replace(/\s+/g, ' ');
  if(!s) return {tokens: [], punctuation: ''};
  const raw = s.split(' ');

  // only peel off the final punctuation if it is a single char . ! ?
  let punctuation = '';
  if(raw.length){
    const last = raw[raw.length-1];
    const m = last.match(/^(.*?)([.!?])$/);
    if(m){
      punctuation = m[2];
      if(m[1]) raw[raw.length-1] = m[1];
      else raw.pop();
    }
  }
  return {tokens: raw, punctuation};
}

function applyMultiTerms(tokens, multiTermsStr){
  const phrases = parseCommaList(multiTermsStr);
  if(!phrases.length) return (tokens || []).slice();

  let out = (tokens || []).slice();

  // Apply in order; greedy merge.
  for(const phrase of phrases){
    const parts = phrase.split(/\s+/).filter(Boolean);
    if(parts.length <= 1) continue;

    const merged = [];
    for(let i=0; i<out.length; ){
      let ok = true;
      for(let j=0; j<parts.length; j++){
        if(out[i+j] !== parts[j]){ ok = false; break; }
      }
      if(ok){
        merged.push(parts.join('_'));
        i += parts.length;
      }else{
        merged.push(out[i]);
        i += 1;
      }
    }
    out = merged;
  }

  return out;
}

// ===== Puzzle builder =====

function buildPuzzle(q){
  const {tokens, punctuation} = tokensFromSentence(q.en_sentence);
  const merged = applyMultiTerms(tokens, q.multi_terms);
  const origN = merged.length;

  if(origN === 0){
    return null;
  }

  let start = clampInt(q.start, 1, origN, 1);
  let ending = clampInt(q.ending, 0, origN, 0);
  if(ending <= 0 || ending > origN) ending = origN;
  if(start > ending){ const tmp = start; start = ending; ending = tmp; }

  const prefix = merged.slice(0, start-1);
  let middle = merged.slice(start-1, ending);
  const suffix = merged.slice(ending);

  // Remove missing words from middle (first match only)
  const missing = parseCommaList(q.missing_words).map(w => w.replace(/\s+/g,'_'));
  for(const mw of missing){
    const idx = middle.indexOf(mw);
    if(idx >= 0) middle.splice(idx, 1);
  }

  const answer = middle.slice();
  const baseChoices = shuffle(answer);

  // Add extra words
  const extras = parseCommaList(q.extra_words).map(w => w.replace(/\s+/g,'_'));
  const choices = baseChoices.map(t => ({t, extra:false}))
    .concat(extras.map(t => ({t, extra:true})));

  // Shuffle with extras included
  const choices2 = shuffle(choices).map(o => ({
    t: o.t,
    extra: !!o.extra,
    text: underscoreToSpace(o.t),
    isExtra: !!o.extra,
  }));

  const prefixText = prefix.map(underscoreToSpace).join(' ');
  const suffixText = suffix.map(underscoreToSpace).join(' ');
  const blanks = answer.map(() => '____').join(' ');
  const previewSentence = [prefixText, blanks, suffixText].filter(Boolean).join(' ') + (punctuation || '');

  return {
    prefix,
    suffix,
    prefixText,
    suffixText,
    punctuation,
    previewSentence,
    answer,
    choices: choices2,
  };
}

// seijo_play.html expects this helper name.
function buildPuzzleFromQuestion(q){
  const built = buildPuzzle(q);
  if(!built) return null;
  return {
    prefixText: built.prefixText ?? built.prefix.map(underscoreToSpace).join(' '),
    suffixText: built.suffixText ?? built.suffix.map(underscoreToSpace).join(' '),
    punctuation: built.punctuation || '',
    correct: built.answer.slice(),
    options: built.choices.map(o => ({t: o.t, extra: o.extra})),
  };
}

// ===== CSV (simple) =====
// NOTE: This is a minimal CSV parser/writer for our known schema.
const CSV_FIELDS = [
  'example_id','en_sentence','ja_translation','multi_terms','start','ending','missing_words','extra_words','show_jp'
];

function toCSV(bank){
  const rows = [];
  rows.push(CSV_FIELDS.join(','));
  for(const q of (bank || [])){
    const r = CSV_FIELDS.map(k => csvEscape(q[k] ?? ''));
    rows.push(r.join(','));
  }
  // UTF-8 BOM to play nice with Excel
  return '\ufeff' + rows.join('\n');
}

function csvEscape(v){
  const s = String(v ?? '');
  if(/[\"\,\n\r]/.test(s)) return '"' + s.replaceAll('"','""') + '"';
  return s;
}

function fromCSV(text){
  const t = String(text || '').replace(/^\ufeff/, '');
  const lines = t.split(/\r?\n/).filter(l => l.trim().length);
  if(!lines.length) return [];

  const header = parseCsvLine(lines[0]);
  const idx = {};
  header.forEach((h,i)=>{ idx[h.trim()] = i; });

  const out = [];
  for(let li=1; li<lines.length; li++){
    const cols = parseCsvLine(lines[li]);
    const q = {};
    for(const f of CSV_FIELDS){
      const i = idx[f];
      q[f] = (i==null ? '' : (cols[i] ?? ''));
    }

    // types
    q.start = clampInt(q.start, 1, 9999, 1);
    q.ending = clampInt(q.ending, 0, 9999, 0);
    q.show_jp = String(q.show_jp).trim() === '1' || String(q.show_jp).toLowerCase() === 'true';
    q.updated_at = nowIso();

    out.push(q);
  }

  return normalizeBank(out);
}

function parseCsvLine(line){
  const out = [];
  let cur = '';
  let inQ = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(inQ){
      if(ch === '"'){
        if(line[i+1] === '"'){ cur += '"'; i++; }
        else inQ = false;
      }else{
        cur += ch;
      }
    }else{
      if(ch === ','){ out.push(cur); cur = ''; }
      else if(ch === '"'){ inQ = true; }
      else{ cur += ch; }
    }
  }
  out.push(cur);
  return out;
}

// ===== Download helper =====
function downloadText(filename, text, mime='text/plain'){
  const blob = new Blob([text], {type: mime});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
}

// ===== Compatibility helpers (pages) =====

function nextAutoId(bank){
  const idStr = makeNextId(normalizeBank(bank || []));
  const n = parseInt(idStr, 10);
  return Number.isFinite(n) ? n : 1;
}

function todayYmd(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// Legacy CSV function names used by the editor UI.
function bankToCsv(bank){
  return toCSV(normalizeBank(bank || []));
}

function parseCsv(text){
  // The editor expects a "parseCsv" function.
  // For our current implementation, we pass through the raw text.
  return String(text || '');
}

function csvRowsToBank(rows){
  // rows is actually the full CSV text (see parseCsv wrapper)
  return fromCSV(rows);
}
