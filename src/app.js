// HPF Talent Hub client script. Pages render fully without it; this adds filtering,
// the shortlist, contact reveal and live timeline state.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ROOT = document.documentElement.dataset.root || '';
  const PEOPLE = JSON.parse($('#people-data')?.textContent || '[]');
  const byId = Object.fromEntries(PEOPLE.map(p => [p.id, p]));

  // Toast
  const toast = $('#toast');
  let tt;
  const say = msg => { if (!toast) return; toast.textContent = msg; toast.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('show'), 2200); };

  // Header border on scroll
  const top = $('.top');
  const onScroll = () => top && top.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Hero hook captions rotate every few seconds (static when reduced motion is on).
  const hook = $('#hook');
  const hooks = JSON.parse(document.getElementById('hooks-data')?.textContent || '[]');
  if (hook && hooks.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let h = 0;
    setInterval(() => {
      if (document.hidden) return;
      hook.classList.add('out');
      setTimeout(() => { h = (h + 1) % hooks.length; hook.textContent = hooks[h]; hook.classList.remove('out'); }, 350);
    }, 3800);
  }

  // Timeline: mark past, current and upcoming milestones from today's date.
  const today = new Date().toISOString().slice(0, 10);
  let marked = false;
  $$('.tl li[data-start]').forEach(li => {
    const { start, end } = li.dataset;
    li.classList.remove('done', 'now');
    if (end < today) li.classList.add('done');
    else if (start <= today || !marked) { li.classList.add('now'); marked = true; }
  });

  // Shortlist (kept in this browser only)
  const KEY = 'hpf-shortlist';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const save = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} };
  let shortlist = load().filter(id => byId[id]);

  const drawer = $('#drawer');
  const renderShortlist = () => {
    $$('.count').forEach(c => { c.textContent = shortlist.length; c.dataset.n = shortlist.length; });
    $$('.star[data-id]').forEach(b => {
      const on = shortlist.includes(b.dataset.id);
      b.setAttribute('aria-pressed', on);
      const label = $('span', b);
      if (label) label.textContent = on ? 'Shortlisted' : 'Shortlist';
    });
    const list = $('#sl-list');
    if (!list) return;
    list.innerHTML = shortlist.length ? shortlist.map(id => {
      const p = byId[id];
      const av = p.photo ? `<img src="${ROOT}${esc(p.photo)}" alt="" loading="lazy">` : esc(p.initials);
      return `<li><span class="av">${av}</span><span><a href="${ROOT}t/${esc(p.id)}/">${esc(p.name)}</a><small>${esc(p.trackShort)}</small></span><button type="button" data-remove="${esc(p.id)}">Remove</button></li>`;
    }).join('') : '<li class="empty">No one yet. Tap <b>Shortlist</b> on any profile to save it here.</li>';
    $('#sl-actions').hidden = !shortlist.length;
  };
  const toggle = id => {
    const was = shortlist.includes(id);
    shortlist = was ? shortlist.filter(x => x !== id) : [...shortlist, id];
    save(shortlist); renderShortlist();
    say(was ? 'Removed from shortlist' : `${byId[id].name} added to shortlist`);
  };
  document.addEventListener('click', e => {
    const star = e.target.closest('.star[data-id]');
    if (star) { e.preventDefault(); toggle(star.dataset.id); return; }
    const rm = e.target.closest('[data-remove]');
    if (rm) { toggle(rm.dataset.remove); return; }
    if (e.target.closest('[data-open-shortlist]')) { drawer.classList.add('open'); $('.x', drawer).focus(); return; }
    if (e.target.closest('[data-close]')) drawer.classList.remove('open');
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') drawer?.classList.remove('open'); });

  const listText = () => shortlist.map(id => `${byId[id].name} (${byId[id].trackShort}): ${new URL(ROOT + 't/' + id + '/', location.href).href}`).join('\n');
  $('#sl-copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('HPF Talent Hub shortlist\n\n' + listText()); say('Shortlist copied'); }
    catch { say('Copy failed. Select and copy manually.'); }
  });
  $('#sl-email')?.addEventListener('click', () => {
    location.href = 'mailto:?subject=' + encodeURIComponent('HPF Talent Hub shortlist') + '&body=' + encodeURIComponent('Trainees I would like to follow up with:\n\n' + listText());
  });
  renderShortlist();

  // Contact reveal: details are stored encoded so simple scrapers do not harvest them.
  $$('.reveal[data-v]').forEach(btn => btn.addEventListener('click', () => {
    const v = atob(btn.dataset.v);
    const kind = btn.dataset.kind;
    const a = document.createElement('a');
    a.className = 'btn btn-soft reveal';
    a.innerHTML = btn.innerHTML;
    if (kind === 'email') a.href = 'mailto:' + v;
    if (kind === 'phone') a.href = 'tel:' + v;
    if (kind === 'wa') { a.href = 'https://wa.me/' + v.replace(/\D/g, ''); a.target = '_blank'; a.rel = 'noopener'; }
    $('span', a).textContent = kind === 'wa' ? 'WhatsApp ' + v : v;
    btn.replaceWith(a);
    a.focus();
  }));

  // Copy profile link
  $('[data-share]')?.addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    if (navigator.share) { try { await navigator.share({ title: document.title, url }); return; } catch { return; } }
    try { await navigator.clipboard.writeText(url); say('Profile link copied'); } catch { say(url); }
  });

  // Directory filters
  const grid = $('#grid');
  if (!grid) return;
  const state = { q: '', track: 'all', avail: 'all', skill: '' };
  const cards = $$('.card', grid);
  const line = $('#result-line');
  const empty = $('#empty');
  const apply = () => {
    const q = state.q.trim().toLowerCase();
    let n = 0;
    cards.forEach(c => {
      const p = byId[c.dataset.id];
      const ok = (state.track === 'all' || p.track === state.track)
        && (state.avail === 'all' || (state.avail === 'open' ? !p.working : p.working))
        && (!state.skill || p.skills.includes(state.skill))
        && (!q || p.search.includes(q));
      c.hidden = !ok; if (ok) n++;
    });
    line.textContent = n === cards.length ? `Showing all ${n} trainees` : `Showing ${n} of ${cards.length} trainees`;
    empty.hidden = n > 0;
    const params = new URLSearchParams();
    Object.entries(state).forEach(([k, v]) => { if (v && v !== 'all') params.set(k, v); });
    history.replaceState(null, '', (params.size ? '?' + params : location.pathname) + location.hash);
  };
  const setSeg = (name, val) => {
    state[name] = val;
    $$(`[data-${name}]`).forEach(b => b.setAttribute('aria-pressed', b.dataset[name] === val));
  };
  $('#q').addEventListener('input', e => { state.q = e.target.value; apply(); });
  $('#skill').addEventListener('change', e => { state.skill = e.target.value; apply(); });
  $$('[data-track]').forEach(b => b.addEventListener('click', () => { setSeg('track', b.dataset.track); apply(); }));
  $$('[data-avail]').forEach(b => b.addEventListener('click', () => { setSeg('avail', b.dataset.avail); apply(); }));
  $('#reset')?.addEventListener('click', () => {
    $('#q').value = ''; $('#skill').value = ''; state.q = ''; state.skill = '';
    setSeg('track', 'all'); setSeg('avail', 'all'); apply();
  });

  // Restore filters from the URL so a filtered view can be shared.
  const params = new URLSearchParams(location.search);
  if (params.get('q')) { state.q = params.get('q'); $('#q').value = state.q; }
  if (params.get('skill')) { state.skill = params.get('skill'); $('#skill').value = state.skill; }
  if (params.get('track')) setSeg('track', params.get('track'));
  if (params.get('avail')) setSeg('avail', params.get('avail'));
  apply();
})();
