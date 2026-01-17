from pathlib import Path
import re

p = Path('/mnt/data/work/seijo_play.html')
s = p.read_text(encoding='utf-8')

# 1) Single column layout
s = s.replace('grid-template-columns: 1fr 360px;', 'grid-template-columns: 1fr;')

# 2) Insert compact HUD CSS (once)
if '/* --- compact HUD (progress / score / timer) --- */' not in s:
    anchor = '    .kpi .num{font-size:22px;font-weight:800;letter-spacing:.02em}\n'
    if anchor not in s:
        raise SystemExit('CSS anchor not found for HUD insertion')
    hud_css = anchor + "\n\n" + """    /* --- compact HUD (progress / score / timer) --- */
    .hud{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;align-items:stretch}
    .hud .box{min-width:100px;padding:8px 10px;border-radius:16px;border:1px solid var(--line);background: rgba(0,0,0,.16)}
    .hud .num{font-size:16px;font-weight:800;letter-spacing:.02em}
    @media (max-width:600px){.hud .box{min-width:90px}}
"""
    s = s.replace(anchor, hud_css, 1)

# 3) Replace the top "status + sentence" block inside the main card
sec_start = s.find('<section class="card">')
if sec_start < 0:
    raise SystemExit('section not found')
row_start = s.find('      <div class="row space">', sec_start)
if row_start < 0:
    raise SystemExit('row space not found')
hr_marker = '\n\n      <div class="hr"></div>'
row_end = s.find(hr_marker, row_start)
if row_end < 0:
    raise SystemExit('hr marker not found after row space')

new_top = """      <div class=\"row space\">
        <div class=\"muted small\" id=\"statusLine\">未開始</div>
        <div class=\"hud\" aria-label=\"HUD\">
          <div class=\"box\">
            <div class=\"muted small\">進捗</div>
            <div class=\"num\" id=\"kpiProg\">0/0</div>
          </div>
          <div class=\"box\">
            <div class=\"muted small\">タイマー</div>
            <div class=\"num\" id=\"kpiTime\">--</div>
          </div>
          <div class=\"box\">
            <div class=\"muted small\">スコア</div>
            <div class=\"num\" id=\"kpiScore\">0</div>
          </div>
        </div>
      </div>

      <div class=\"sentence\" id=\"sentenceLine\">下の設定で開始してください。</div>
      <div class=\"slotline\" id=\"slots\"></div>
      <div class=\"chips\" id=\"chips\"></div>
      <div id=\"toast\" class=\"toast\" style=\"display:none\"></div>
"""

s = s[:row_start] + new_top + s[row_end+2:]  # keep leading newline of hr_marker

# 4) Insert Start/Stop + Settings block right after the help text
help_key = '使い方:'
help_pos = s.find(help_key, sec_start)
if help_pos < 0:
    raise SystemExit('help text not found')
# Find the opening <div ...> of the help block, then its closing </div>
help_div_start = s.rfind('<div class="small muted"', sec_start, help_pos)
if help_div_start < 0:
    raise SystemExit('help div start not found')
help_div_end = s.find('</div>', help_pos)
if help_div_end < 0:
    raise SystemExit('help div end not found')
help_div_end += len('</div>')

controls = """

      <div class=\"hr\"></div>

      <div class=\"row\">
        <button id=\"btnStart\" class=\"primary\">▶ 開始</button>
        <button id=\"btnStop\">■ 終了</button>
        <span class=\"small muted\">※ 設定は下の「⚙ 設定」から変更できます</span>
      </div>

      <details id=\"settingsPanel\" style=\"margin-top:10px\">
        <summary>⚙ 設定（出題・時間・音など）</summary>

        <div class=\"grid\" style=\"margin-top:10px\">
          <div>
            <label>モード</label>
            <select id=\"mode\">
              <option value=\"practice\">練習（1人）</option>
              <option value=\"duel\">対戦（同端末・交代）</option>
            </select>
          </div>
          <div>
            <label>出題数</label>
            <input id=\"count\" type=\"number\" min=\"1\" value=\"10\" />
          </div>
        </div>

        <div class=\"grid\" style=\"margin-top:10px\">
          <div>
            <label>制限時間（秒 / 1問）</label>
            <input id=\"timePerQ\" type=\"number\" min=\"0\" value=\"0\" />
          </div>
          <div>
            <label>出題順</label>
            <select id=\"order\">
              <option value=\"random\">ランダム</option>
              <option value=\"inorder\">登録順</option>
            </select>
          </div>
        </div>

        <div class=\"grid\" style=\"margin-top:10px\">
          <div class=\"toggle\">
            <input class=\"ck\" id=\"optSpeak\" type=\"checkbox\" checked />
            <label for=\"optSpeak\">🔊 発音（en-US）</label>
          </div>
          <div class=\"toggle\">
            <input class=\"ck\" id=\"optSfx\" type=\"checkbox\" checked />
            <label for=\"optSfx\">🎵 効果音</label>
          </div>
        </div>

        <div class=\"small muted\" style=\"margin-top:10px\">
          ※ バンクが0件なら <a href=\"seijo_edit.html\" style=\"color:var(--text)\">問題編集</a>で作成してください。
        </div>
      </details>
"""

# Only insert if not already inserted
if 'id="settingsPanel"' not in s:
    s = s[:help_div_end] + controls + s[help_div_end:]

# 5) Remove the entire right-side <aside> panel
aside_start = s.find('<aside class="card">', sec_start)
if aside_start >= 0:
    aside_end = s.find('</aside>', aside_start)
    if aside_end < 0:
        raise SystemExit('aside end not found')
    aside_end += len('</aside>')
    s = s[:aside_start] + s[aside_end:]

# 6) Text tweaks (right -> bottom)
s = s.replace('右の設定で開始してください。', '下の設定で開始してください。')
s = s.replace('右の「開始」', '下の「開始」')

# 7) JS: add elTime ref (once)
if "const elTime = $('kpiTime');" not in s:
    s = s.replace("  const elScore = $('kpiScore');\n", "  const elScore = $('kpiScore');\n  const elTime = $('kpiTime');\n", 1)

# 8) JS: update stopQuiz to reset timer display
if "if(elTime) elTime.textContent" not in s:
    s = s.replace("    elProg.textContent = '0/0';\n  }\n", "    elProg.textContent = '0/0';\n    if(elTime) elTime.textContent = '--';\n  }\n", 1)

# 9) JS: startTimer updates HUD timer
start_timer_new = """  function startTimer(){
    clearTimer();
    const sec = Math.max(0, parseInt($('timePerQ').value || '0', 10));
    if(sec <= 0){
      timeLeft = 0;
      elStatus.textContent = statusText();
      if(elTime) elTime.textContent = '∞';
      return;
    }
    timeLeft = sec;
    elStatus.textContent = statusText() + ` | ⏳ ${timeLeft}s`;
    if(elTime) elTime.textContent = `${timeLeft}s`;
    timer = setInterval(()=>{
      timeLeft -= 1;
      if(elTime) elTime.textContent = `${Math.max(0, timeLeft)}s`;
      if(timeLeft <= 0){
        clearTimer();
        if(elTime) elTime.textContent = '0s';
        showToast('bad', '時間切れ… 次の問題へ');
        setTimeout(()=>{ hideToast(); skipQuestion(true); }, 700);
        return;
      }
      elStatus.textContent = statusText() + ` | ⏳ ${timeLeft}s`;
    }, 1000);
  }

  function statusText(){
"""

s, n = re.subn(
    r"\s*function startTimer\(\)\{[\s\S]*?\n\s*\}\n\n\s*function statusText\(\)\{",
    start_timer_new,
    s,
    count=1,
)
if n != 1:
    raise SystemExit(f'startTimer replacement failed: {n}')

# 10) Ensure timer display is initialized on build
# (Not mandatory; startTimer will set it, but we set a sensible default when starting.)
if "elTime.textContent" not in s.split('function buildQuiz',1)[1].split('function',1)[0]:
    # Insert after progress init
    s = s.replace("    elScore.textContent = String(score);\n    elProg.textContent = `0/${quiz.length}`;\n",
                  "    elScore.textContent = String(score);\n    elProg.textContent = `0/${quiz.length}`;\n    if(elTime) elTime.textContent = '--';\n", 1)

# 11) Also set timer display to '--' on initial load
if "elTime.textContent = '--';" not in s:
    s = s.replace("  loadBank();\n  elStatus.textContent = '未開始';\n",
                  "  loadBank();\n  elStatus.textContent = '未開始';\n  if(elTime) elTime.textContent = '--';\n", 1)

# Basic sanity checks
if s.count('id="btnStart"') != 1 or s.count('id="btnStop"') != 1:
    raise SystemExit('Start/Stop buttons duplicated or missing')
if s.count('id="settingsPanel"') != 1:
    raise SystemExit('Settings panel missing/duplicated')
if '<aside class="card">' in s:
    raise SystemExit('Aside still present')

p.write_text(s, encoding='utf-8')
print('patched OK')
