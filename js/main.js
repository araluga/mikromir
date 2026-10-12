'use strict';
// ───────── Главный цикл ─────────

(function () {
  initWorld('balanced');
  initRender($('view'));
  initUI();
  window.addEventListener('resize', () => { resizeCanvas(); drawChart(); });

  let last = performance.now();
  let tickAcc = 0, tpsT = last;
  let turboFrame = 0;

  function frame(now) {
    const fdt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const running = ui.speed > 0;
    applyTools(fdt);
    if (running) {
      const turbo = ui.speed >= 999;
      const target = turbo ? 100000 : ui.speed;
      const budget = turbo ? 45 : 28;   // мс на симуляцию за кадр
      const t0 = performance.now();
      let n = 0;
      while (n < target && performance.now() - t0 < budget) { simStep(); n++; }
      tickAcc += n;
    }
    if (now - tpsT > 1000) { ui.tps = tickAcc * 1000 / (now - tpsT); tickAcc = 0; tpsT = now; }
    if (sim.selected && sim.selected.dead && cam.follow) cam.follow = false;
    // в режиме MAX отрисовываем не каждый кадр
    turboFrame++;
    if (ui.speed < 999 || turboFrame % 4 === 0) render(fdt * Math.min(ui.speed || 1, 3), running);
    updateUI(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // за меню живёт фоновый мир-витрина; игра начинается с выбора режима
  showMenu();
})();
