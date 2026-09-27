/*! daedalus A 轨运行时 v0.1 — 零依赖：hash 路由 + 7 交互原语(open-page/open-modal/close-modal/switch-tab/toggle-drawer/submit/set-state) + toast + sessionStorage 状态 + data-proto-if 显隐 */
(function () {
  'use strict';
  var SK = 'proto-state';
  function st() { try { return JSON.parse(sessionStorage.getItem(SK)) || {}; } catch (e) { return {}; } }
  function setState(s) {
    var i = s.indexOf('='); if (i < 1) return;
    var o = st(); o[s.slice(0, i)] = s.slice(i + 1);
    try { sessionStorage.setItem(SK, JSON.stringify(o)); } catch (e) {}
    applyIf();
  }
  function applyIf() {
    var o = st(), n = document.querySelectorAll('[data-proto-if]'), i, e, q, v, m;
    for (i = 0; i < n.length; i++) {
      e = n[i]; q = e.getAttribute('data-proto-if'); v = q.indexOf('='); if (v < 1) continue;
      if (!e.getAttribute('data-pk-d')) e.setAttribute('data-pk-d', e.style.display || '');
      m = String(o[q.slice(0, v)]) === q.slice(v + 1);
      e.style.display = m ? e.getAttribute('data-pk-d') : 'none';
    }
  }
  function toast(msg, err) {
    var t = document.createElement('div');
    t.setAttribute('data-proto-toast', ''); t.className = 'pk-toast' + (err ? ' pk-toast-error' : '');
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.parentNode && t.parentNode.removeChild(t); }, 2500);
  }
  function show(id) {
    var p = document.querySelectorAll('.pk-page'), i;
    for (i = 0; i < p.length; i++) p[i].classList.toggle('pk-active', p[i].getAttribute('data-proto-page') === id);
  }
  function route() {
    var h = location.hash.charAt(0) === '#' ? location.hash.slice(1) : location.hash;
    show(h || document.body.getAttribute('data-proto-entry') || '');
  }
  function el(sel) {
    if (!sel) return null; var e = null;
    if (sel.charAt(0) === '#') e = document.getElementById(sel.slice(1));
    else { try { e = document.querySelector(sel); } catch (x) {} if (!e) e = document.getElementById(sel); }
    return e;
  }
  function switchTab(btn, cid) {
    var c = el(cid) || (btn.closest ? btn.closest('.pk-tabs') : null); if (!c) return;
    var k = btn.getAttribute('data-proto-tab'), a = c.querySelectorAll('[data-proto-panel]'), b = c.querySelectorAll('[data-proto-tab]'), i, on;
    for (i = 0; i < a.length; i++) a[i].classList.toggle('pk-active', a[i].getAttribute('data-proto-panel') === k);
    for (i = 0; i < b.length; i++) { on = b[i].getAttribute('data-proto-tab') === k; b[i].setAttribute('aria-selected', on ? 'true' : 'false'); b[i].classList.toggle('pk-active', on); }
  }
  function run(host, list) {
    if (!list) return; if (!Array.isArray(list)) list = [list];
    for (var i = 0; i < list.length; i++) {
      var s = list[i] || {}, e; if (!s.action) continue;
      switch (s.action) {
        case 'open-page': if (s.target) { if (location.hash === '#' + s.target) show(s.target); else location.hash = '#' + s.target; } break;
        case 'open-modal': (e = el(s.target)) && e.classList.add('pk-open'); break;
        case 'close-modal': (e = el(s.target)) && e.classList.remove('pk-open'); break;
        case 'toggle-drawer': (e = el(s.target)) && e.classList.toggle('pk-open'); break;
        case 'switch-tab': switchTab(host, s.target); break;
        case 'set-state': s.state && setState(s.state); break;
        case 'submit': break; // submit 语义由 form 的 submit 处理器原生完成，链内为占位步骤
      }
    }
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target, h = t && t.closest ? t.closest('[data-proto-chain]') : null;
    if (!h || h.tagName === 'FORM') return; // form 自身的链走 submit 事件，避免双触发
    var c = null; try { c = JSON.parse(h.getAttribute('data-proto-chain')); } catch (e) {}
    run(h, c);
  });
  document.addEventListener('submit', function (ev) {
    var f = ev.target; if (!f || f.tagName !== 'FORM') return;
    ev.preventDefault();
    var r = f.querySelectorAll('[required]'), i, bad = null;
    for (i = 0; i < r.length; i++) if (!String(r[i].value || '').trim()) { bad = r[i]; break; }
    if (bad) { toast('请填写必填项' + (bad.getAttribute('placeholder') ? '：' + bad.placeholder : ''), 1); bad.focus(); return; }
    toast('提交成功');
    var c = null; try { c = JSON.parse(f.getAttribute('data-proto-chain')); } catch (e) {}
    run(f, c);
  });
  function init() { applyIf(); route(); window.addEventListener('hashchange', route); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
