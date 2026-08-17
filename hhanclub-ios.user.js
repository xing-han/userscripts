// ==UserScript==
// @name         hhanclub自动抽奖增强版（iOS Userscripts）
// @version      1.5-ios.3
// @description  适配 iPhone/iPad Safari Userscripts：自动抽奖、历史统计、触摸拖拽与串行请求
// @author       Timi / iOS compatibility adaptation
// @match        https://hhanclub.net/lucky.php*
// @run-at       document-end
// @inject-into  auto
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const API = '/plugin/lucky-draw';
  const STORE = 'hhanclub_lottery_stats';
  const $ = id => document.getElementById(id);
  const fresh = () => ({ count:0, wins:0, cost:0, beans:0, invites:0, rainbow:0, vip:0, makeup:0, upload:0, prizes:{} });
  const num = text => Number((String(text ?? '').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/) || [0])[0]);

  let current = fresh();
  let total = loadTotal();
  let running = false;
  let timer = null;
  let cost = 2000;
  let intervalMs = 7000;
  let maxCount = 10;
  let roundStart = 0;
  let errors = 0;

  function loadTotal() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!d || typeof d !== 'object') return fresh();
      const out = fresh();
      for (const k of Object.keys(out)) {
        if (k === 'prizes') out.prizes = d.prizes && typeof d.prizes === 'object' ? d.prizes : {};
        else out[k] = Number(d[k]) || 0;
      }
      return out;
    } catch { return fresh(); }
  }

  function saveTotal() {
    try { localStorage.setItem(STORE, JSON.stringify(total)); }
    catch (e) { console.error('[hhanclub lottery] save failed', e); }
  }

  function readCost() {
    const n = num(document.querySelector('.use-bean')?.textContent);
    if (n > 0) cost = n;
    return cost;
  }

  function readBalance() {
    return num(document.querySelector('.bean-number')?.textContent);
  }

  function panel() {
    const style = document.createElement('style');
    style.textContent = `
#hh-ios-lottery{position:fixed;top:calc(env(safe-area-inset-top,0px) + 12px);right:calc(env(safe-area-inset-right,0px) + 12px);z-index:2147483646;width:min(340px,calc(100vw - 24px));max-height:calc(100vh - 24px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));overflow:auto;box-sizing:border-box;padding:12px;border:2px solid #0a84ff;border-radius:12px;background:#fffffff8;color:#222;box-shadow:0 8px 28px #0004;font:14px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;-webkit-overflow-scrolling:touch}
#hh-ios-lottery *{box-sizing:border-box}#hh-ios-lottery button,#hh-ios-lottery input,#hh-ios-lottery select{font:inherit}#hh-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;border-bottom:1px solid #ddd;touch-action:none;user-select:none}#hh-head b{font-size:17px;color:#0a84ff}.hh-card{margin-top:10px;padding:9px;background:#f2f2f7;border-radius:8px}.hh-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0}.hh-grid{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}.hh-input{width:76px;padding:6px;border:1px solid #c7c7cc;border-radius:7px;font-size:16px!important}.hh-btn{min-height:36px;border:0;border-radius:8px;padding:0 10px;color:#fff}.hh-green{background:#30d158}.hh-red{background:#ff453a}.hh-blue{background:#0a84ff}.hh-gray{background:#8e8e93}.hh-yellow{background:#ffd60a;color:#332900}.hh-actions{display:flex;gap:8px;margin-top:10px}.hh-actions .hh-btn{flex:1;min-height:42px;font-weight:700}.hh-small{font-size:12px;color:#6e6e73}.hh-metrics{font-size:12px;line-height:1.7}.hh-prizes{max-height:120px;overflow:auto;font-size:11px}.hh-log{display:none;max-height:150px;overflow:auto;margin-top:8px;padding:7px;border-radius:7px;background:#f2f2f7;font-size:11px}.hh-log div{margin-bottom:3px;overflow-wrap:anywhere}.hh-mini{min-width:36px;min-height:32px;border:0;border-radius:8px;background:#e9f3ff;color:#0a66c2;font-size:18px}
`;
    document.head.appendChild(style);

    const box = document.createElement('section');
    box.id = 'hh-ios-lottery';
    box.innerHTML = `
<div id="hh-head"><b>🎲 自动抽奖工具</b><button id="hh-collapse" class="hh-mini" type="button">−</button></div>
<div id="hh-body">
  <div class="hh-card hh-small">
    <div class="hh-row"><span>憨豆余额：<strong id="hh-balance">检测中…</strong></span><span>可抽：<strong id="hh-possible">-</strong></span></div>
    <div>单次消耗：<span id="hh-cost">${cost.toLocaleString()}</span></div>
  </div>
  <div class="hh-card hh-grid">
    <label>抽奖间隔（秒）</label><input id="hh-interval" class="hh-input" type="number" inputmode="numeric" min="3" max="300" value="7">
    <label>最大抽奖次数</label><div><input id="hh-max" class="hh-input" type="number" inputmode="numeric" min="1" max="1000" value="10"> <button id="hh-maxbtn" class="hh-btn hh-blue" type="button">最大</button></div>
  </div>
  <div class="hh-actions"><button id="hh-start" class="hh-btn hh-green" type="button">开始抽奖</button><button id="hh-stop" class="hh-btn hh-red" type="button" disabled>停止抽奖</button></div>
  <div class="hh-card">
    <div class="hh-row hh-small"><span>状态：<strong id="hh-status">等待开始</strong></span><select id="hh-mode"><option value="current">本次</option><option value="total">总计</option></select></div>
    <div id="hh-metrics" class="hh-metrics"></div>
    <div id="hh-prizes" class="hh-prizes"></div>
    <div class="hh-actions"><button id="hh-reset" class="hh-btn hh-yellow" type="button">重置本次</button><button id="hh-clear" class="hh-btn hh-gray" type="button">清空历史</button></div>
    <div id="hh-log" class="hh-log"></div>
  </div>
</div>`;
    document.body.appendChild(box);
    return box;
  }

  function log(message, type='info') {
    const box = $('hh-log');
    if (!box) return;
    box.style.display = 'block';
    const line = document.createElement('div');
    line.style.color = ({success:'#248a3d',error:'#d70015',warning:'#b25000',info:'#6e6e73'})[type];
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    box.appendChild(line);
    while (box.children.length > 30) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
  }

  function status(text, color='#6e6e73') {
    if ($('hh-status')) { $('hh-status').textContent = text; $('hh-status').style.color = color; }
  }

  function updateBalance(warn=false) {
    const bean = document.querySelector('.bean-number');
    const b = readBalance();
    readCost();
    const possible = cost > 0 ? Math.floor(b / cost) : 0;
    $('hh-balance').textContent = bean ? b.toLocaleString() : '未找到';
    $('hh-possible').textContent = bean ? possible.toLocaleString() : '-';
    $('hh-cost').textContent = cost.toLocaleString();
    if (!bean && warn) log('未找到余额元素 .bean-number，请确认页面已加载', 'warning');
    updateButtons();
    return possible;
  }

  function updateButtons() {
    const enough = readBalance() >= readCost();
    $('hh-start').disabled = running || !enough;
    $('hh-start').style.opacity = $('hh-start').disabled ? '.55' : '1';
    $('hh-start').textContent = !enough && !running ? '余额不足' : '开始抽奖';
    $('hh-stop').disabled = !running;
    $('hh-stop').style.opacity = running ? '1' : '.55';
  }

  function displayData() { return $('hh-mode')?.value === 'total' ? total : current; }

  function updateStats() {
    const s = displayData();
    const profit = s.beans - s.cost;
    const rate = s.cost ? `${((profit / s.cost) * 100).toFixed(1)}%` : '-';
    $('hh-metrics').innerHTML = `已抽奖：<b>${s.count}</b> 次 ｜ 中奖：<b>${s.wins}</b> 次 ｜ 消耗：<b>${s.cost.toLocaleString()}</b><br>憨豆奖：<b>${s.beans.toLocaleString()}</b> ｜ 盈亏：<b>${profit > 0 ? '+' : ''}${profit.toLocaleString()}</b> ｜ 盈亏率：<b>${rate}</b><br>邀请：${s.invites} ｜ 彩虹ID：${s.rainbow}天 ｜ VIP：${s.vip}天 ｜ 补签卡：${s.makeup} ｜ 上传：${s.upload}GB`;
    const items = Object.entries(s.prizes).sort((a,b) => b[1]-a[1]);
    $('hh-prizes').innerHTML = items.length ? '<hr>' + items.map(([p,n]) => `<div class="hh-row"><span></span><b>${n}次</b></div>`).join('') : '';
    [...$('hh-prizes').querySelectorAll('.hh-row span')].forEach((el,i) => { el.textContent = items[i][0]; });
  }

  function prize(text) {
    const s = String(text || '未知奖品');
    const n = num(s);
    current.wins++; total.wins++;
    const add = key => { current[key] += n; total[key] += n; };
    if (s.includes('魔力') || s.includes('憨豆')) add('beans');
    else if (s.includes('邀请')) add('invites');
    else if (s.includes('彩虹')) add('rainbow');
    else if (s.toUpperCase().includes('VIP')) add('vip');
    else if (s.includes('补签卡')) add('makeup');
    else if (s.includes('上传量')) add('upload');
    current.prizes[s] = (current.prizes[s] || 0) + 1;
    total.prizes[s] = (total.prizes[s] || 0) + 1;
  }

  async function draw() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const r = await fetch(API, {method:'POST', credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json, text/plain, */*','X-Requested-With':'XMLHttpRequest'}, signal:controller.signal});
      const text = await r.text();
      let data = null;
      try { data = JSON.parse(text); } catch {}
      return {ok:r.ok, status:r.status, data, text};
    } catch (e) {
      return {ok:false, error:e?.name === 'AbortError' ? '请求超时（20秒）' : (e?.message || String(e))};
    } finally { clearTimeout(timeout); }
  }

  function schedule(delay=intervalMs) {
    if (!running) return;
    clearTimeout(timer);
    timer = setTimeout(loop, delay);
  }

  function stop(reason='已停止', type='info') {
    const was = running;
    running = false;
    clearTimeout(timer); timer = null;
    status(reason, type === 'warning' ? '#b25000' : '#d70015');
    updateButtons();
    if (was) log(`🛑 ${reason}`, type);
  }

  async function loop() {
    if (!running) return;
    const done = current.count - roundStart;
    if (done >= maxCount) return stop(`本轮达到最大抽奖次数（${maxCount}）`);
    readCost();
    if (readBalance() < cost) return stop('余额不足，已自动停止', 'warning');

    log(`执行本轮第 ${done + 1}/${maxCount} 次抽奖`, 'info');
    const r = await draw();
    if (!running) return;
    if (!r.ok) {
      errors++;
      log(`请求失败：${r.error || `HTTP ${r.status}`}`, 'error');
      if (errors >= 3) intervalMs = Math.min(Math.round(intervalMs * 1.5), 30000);
      return schedule();
    }
    if (!r.data || typeof r.data !== 'object') {
      errors++; log('服务端返回无法识别的内容，本次不计入统计', 'warning'); return schedule();
    }

    const ret = Number(r.data.ret);
    const msg = String(r.data.msg || '未知错误').replace(/\\u[\dA-F]{4}/gi, x => String.fromCharCode(parseInt(x.slice(2),16)));
    if (ret === 0) {
      errors = 0;
      intervalMs = Math.max(3, Math.min(300, Number($('hh-interval').value) || 7)) * 1000;
      const text = String(r.data?.data?.prize_text || '未知奖品').replace(/\\u[\dA-F]{4}/gi, x => String.fromCharCode(parseInt(x.slice(2),16)));
      log(`🎉 抽中了：${text}`, 'success');
      prize(text);
      current.count++; current.cost += cost; total.count++; total.cost += cost;
      saveTotal(); updateStats(); setTimeout(updateBalance, 250);
      if (current.count - roundStart >= maxCount) return stop(`本轮达到最大抽奖次数（${maxCount}）`);
      return schedule();
    }

    if (ret === -1 && (msg.includes('重复点击') || msg.includes('请稍后'))) {
      errors++;
      if (errors >= 3) intervalMs = Math.min(Math.round(intervalMs * 1.5), 30000);
      log(`${msg}，稍后重试`, 'warning'); return schedule();
    }
    if (/次数|用完|余额不足|不足/.test(msg)) return stop(msg, 'warning');
    errors++; log(`服务端返回：${msg}（ret=${r.data.ret}）`, 'error'); schedule();
  }

  function start() {
    if (running) return;
    const seconds = Math.max(3, Math.min(300, Number($('hh-interval').value) || 7));
    maxCount = Math.max(1, Math.min(1000, Math.floor(Number($('hh-max').value) || 10)));
    $('hh-interval').value = seconds; $('hh-max').value = maxCount;
    if (readBalance() < readCost()) return log('余额不足，无法开始', 'error');
    intervalMs = seconds * 1000; errors = 0; roundStart = current.count; running = true;
    status('运行中…', '#b25000'); updateButtons(); log(`🚀 开始抽奖：最多 ${maxCount} 次，间隔 ${seconds} 秒`, 'info'); loop();
  }

  function interactions(box) {
    $('hh-start').onclick = start;
    $('hh-stop').onclick = () => stop();
    $('hh-mode').onchange = updateStats;
    $('hh-maxbtn').onclick = () => $('hh-max').value = Math.max(1, updateBalance(true));
    $('hh-reset').onclick = () => { if (running) return log('请先停止抽奖', 'warning'); if (confirm('确定重置本次数据？')) { current = fresh(); roundStart = 0; updateStats(); } };
    $('hh-clear').onclick = () => { if (confirm('确定清空所有历史统计？')) { total = fresh(); localStorage.removeItem(STORE); updateStats(); log('历史统计已清空','success'); } };
    $('hh-collapse').onclick = () => { const body=$('hh-body'), hidden=body.style.display==='none'; body.style.display=hidden?'block':'none'; $('hh-collapse').textContent=hidden?'−':'+'; };

    const head = $('hh-head');
    if (!window.PointerEvent) return;
    let drag=false, dx=0, dy=0, pid=null;
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button,input,select,a')) return;
      const r=box.getBoundingClientRect(); drag=true; pid=e.pointerId; dx=e.clientX-r.left; dy=e.clientY-r.top;
      try { head.setPointerCapture(pid); } catch {} e.preventDefault();
    });
    head.addEventListener('pointermove', e => {
      if (!drag || e.pointerId!==pid) return;
      const r=box.getBoundingClientRect(), m=6;
      const left=Math.min(Math.max(m,e.clientX-dx),Math.max(m,innerWidth-r.width-m));
      const top=Math.min(Math.max(m,e.clientY-dy),Math.max(m,innerHeight-44));
      box.style.left=`${left}px`; box.style.top=`${top}px`; box.style.right='auto'; e.preventDefault();
    });
    const end=e=>{ if (!drag || e.pointerId!==pid) return; drag=false; try{head.releasePointerCapture(pid)}catch{} pid=null; };
    head.addEventListener('pointerup',end); head.addEventListener('pointercancel',end);
  }

  function init() {
    if ($('hh-ios-lottery')) return;
    const box = panel(); interactions(box); updateBalance(true); updateStats();
    setInterval(() => { if (!document.hidden) updateBalance(); }, 10000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { updateBalance(); if (running && !timer) schedule(800); } });
    log('✅ iOS Userscripts 适配版已就绪', 'success');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();