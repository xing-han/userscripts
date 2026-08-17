// ==UserScript==
// @name         hhanclub自动抽奖增强版（iOS Userscripts / .net loader）
// @version      1.5-ios.3
// @description  hhanclub.net 入口：加载同仓库的 iOS Userscripts 主脚本
// @author       Timi / iOS compatibility adaptation
// @match        https://hhanclub.net/lucky.php*
// @run-at       document-end
// @inject-into  auto
// @noframes
// ==/UserScript==

(async () => {
  'use strict';
  if (document.getElementById('hh-ios-lottery')) return;
  try {
    const url = 'https://raw.githubusercontent.com/xing-han/userscripts/main/hhanclub-ios.user.js';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const code = await res.text();
    (0, eval)(code);
  } catch (error) {
    console.error('[hhanclub lottery] 无法加载主脚本:', error);
  }
})();
