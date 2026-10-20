// HPF Talent Hub client script. Pages render fully without it; this adds filtering,
// the shortlist, contact reveal, the rotating hero hooks and live timeline state.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ROOT = document.documentElement.dataset.root || '';
  const PEOPLE = JSON.parse($('#people-data')?.textContent || '[]');
  const byId = Object.fromEntries(PEOPLE.map(p => [p.id, p]));
  const first = name => name.split(' ')[0];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Toast
  const toast = $('#toast');
  let tt;
  const say = msg => { if (!toast) return; toast.textContent = msg; toast.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('show'), 2600); };

  // Header border on scroll
  const top = $('.top');
  const onScroll = () => top && top.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Hero hooks rotate with a pause control (WCAG 2.2.2); static under reduced motion.
  const hook = $('#hook');
  const hookBtn = $('#hook-toggle');
  const heroImg = $('.hero-bg img');
  const hooks = JSON.parse($('#hooks-data')?.textContent || '[]');
  if (hook && hooks.length > 1 && !reduceMotion) {
    let h = 0, paused = false, hovering = false;
    const wrap = hook.closest('.hero-hook');
    wrap.addEventListener('mouseenter', () => { hovering = true; });
    wrap.addEventListener('mouseleave', () => { hovering = false; });
    if (hookBtn) {
      hookBtn.hidden = false;
      hookBtn.addEventListener('click', () => {
        paused = !paused;
        hookBtn.textContent = paused ? 'Play' : 'Pause';
        hookBtn.setAttribute('aria-label', paused ? 'Play rotating highlights' : 'Pause rotating highlights');
        if (heroImg) heroImg.style.animationPlayState = paused ? 'paused' : 'running';
      });
    }
    setInterval(() => {
      if (document.hidden || paused || hovering) return;
      hook.classList.add('out');
      setTimeout(() => { h = (h + 1) % hooks.length; hook.textContent = hooks[h]; hook.classList.remove('out'); }, 350);
    }, 3800);
  }

  // Timeline: completed, in progress ("Now") or the next milestone ("Up next"), announced for screen readers.
  const today = new Date().toISOString().slice(0, 10);
  let flagged = false;
  $$('.tl li[data-start]').forEach(li => {
    const { start, end } = li.dataset;
    li.classList.remove('done', 'now', 'next');
    li.removeAttribute('aria-current');
    li.querySelector('.tl-state')?.remove();
    let state = 'Upcoming';
    if (end < today) { li.classList.add('done'); state = 'Completed'; }
    else if (!flagged) {
      const live = start <= today;
      li.classList.add(live ? 'now' : 'next');
      if (live) li.setAttribute('aria-current', 'step');
      state = live ? 'In progress' : 'Up next';
      flagged = true;
    }
    const tag = document.createElement('span');
    tag.className = 'sr tl-state';
    tag.textContent = state + ': ';
    li.querySelector('h3')?.prepend(tag);
  });

  // Shortlist (kept in this browser only)
  const KEY = 'hpf-shortlist';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const save = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} };
  let shortlist = load().filter(id => byId[id]);

  const drawer = $('#drawer');
  const opener = $('[data-open-shortlist]');
  const renderShortlist = () => {
    $$('.count').forEach(c => { c.textContent = shortlist.length; c.dataset.n = shortlist.length; });
    $$('.star[data-id]').forEach(b => {
      const on = shortlist.includes(b.dataset.id);
      b.setAttribute('aria-pressed', on);
      const label = $('.star-label', b);
      if (label) label.textContent = on ? 'Shortlisted' : 'Shortlist';
    });
    const list = $('#sl-list');
    if (!list) return;
    list.innerHTML = shortlist.length ? shortlist.map(id => {
      const p = byId[id];
      const av = p.photo ? `<img src="${ROOT}${esc(p.photo)}" alt="" loading="lazy">` : esc(p.initials);
      return `<li><span class="av">${av}</span><span><a href="${ROOT}t/${esc(p.id)}/">${esc(p.name)}</a><small>${esc(p.trackShort)} · ${esc(p.status)}</small></span><button type="button" data-remove="${esc(p.id)}">Remove<span class="sr"> ${esc(p.name)}</span></button></li>`;
    }).join('') : '<li class="empty">No one yet. Tap <b>Shortlist</b> on any card or profile to save it here.</li>';
    $('#sl-actions').hidden = !shortlist.length;
  };
  const toggle = id => {
    const was = shortlist.includes(id);
    shortlist = was ? shortlist.filter(x => x !== id) : [...shortlist, id];
    save(shortlist); renderShortlist();
    say(was ? `${first(byId[id].name)} removed from your shortlist` : `${first(byId[id].name)} added. Open your shortlist (${shortlist.length}) from the top bar.`);
    if (!was && !reduceMotion) $$('.count').forEach(c => { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); });
  };

  // Drawer behaves as a real modal: background inert, focus trapped, focus returned on close.
  const behind = () => [$('.skip'), $('.top'), $('main'), $('.foot')].filter(Boolean);
  let returnTo = null;
  const openDrawer = () => {
    returnTo = document.activeElement;
    drawer.classList.add('open');
    behind().forEach(el => { el.inert = true; });
    opener?.setAttribute('aria-expanded', 'true');
    $('.x', drawer).focus();
  };
  const closeDrawer = () => {
    if (!drawer?.classList.contains('open')) return;
    drawer.classList.remove('open');
    behind().forEach(el => { el.inert = false; });
    opener?.setAttribute('aria-expanded', 'false');
    (returnTo && returnTo !== document.body && returnTo.isConnected ? returnTo : opener)?.focus();
  };
  drawer?.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = $$('a[href], button', drawer).filter(el => el.getClientRects().length);
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  });
  document.addEventListener('click', e => {
    const star = e.target.closest('.star[data-id]');
    if (star) { e.preventDefault(); toggle(star.dataset.id); return; }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const i = $$('[data-remove]', drawer).indexOf(rm);
      toggle(rm.dataset.remove);
      const left = $$('[data-remove]', drawer);
      (left[i] || left[i - 1] || $('.x', drawer)).focus();
      return;
    }
    if (e.target.closest('[data-open-shortlist]')) { openDrawer(); return; }
    if (e.target.closest('[data-close]')) closeDrawer();
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

  const listText = () => shortlist.map(id => `${byId[id].name} (${byId[id].trackShort}, ${byId[id].status}): ${new URL(ROOT + 't/' + id + '/', location.href).href}`).join('\n');
  $('#sl-copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('HPF Talent Hub shortlist\n\n' + listText()); say('Shortlist copied'); }
    catch { say('Copy failed. Select and copy manually.'); }
  });
  $('#sl-email')?.addEventListener('click', () => {
    location.href = 'mailto:?subject=' + encodeURIComponent('HPF Talent Hub shortlist') + '&body=' + encodeURIComponent('Trainees I would like to follow up with:\n\n' + listText());
  });
  $('#sl-intro')?.addEventListener('click', e => {
    location.href = 'mailto:' + e.currentTarget.dataset.to + '?subject=' + encodeURIComponent('Introduction request: HPF Talent Hub shortlist') + '&body=' + encodeURIComponent('Please introduce me to these trainees:\n\n' + listText());
  });
  renderShortlist();

  // Contact reveal: details are stored encoded so simple scrapers do not harvest them.
  // WhatsApp opens in one tap with a message that credits the Talent Hub.
  $$('.reveal[data-v]').forEach(btn => btn.addEventListener('click', () => {
    const v = atob(btn.dataset.v);
    const kind = btn.dataset.kind;
    const who = btn.closest('.contact-list')?.dataset.first || '';
    const msg = `Hello ${who}, I found your profile on the HPF Talent Hub (${location.href.split(/[?#]/)[0]}) and would like to talk to you about an opportunity.`;
    const a = document.createElement('a');
    a.className = btn.className;
    a.innerHTML = btn.innerHTML;
    if (kind === 'email') a.href = 'mailto:' + v + '?subject=' + encodeURIComponent('Opportunity via the HPF Talent Hub') + '&body=' + encodeURIComponent(msg);
    if (kind === 'phone') a.href = 'tel:' + v;
    if (kind === 'wa') { a.href = 'https://wa.me/' + v.replace(/\D/g, '') + '?text=' + encodeURIComponent(msg); a.target = '_blank'; a.rel = 'noopener'; }
    $('span', a).textContent = kind === 'wa' ? 'WhatsApp ' + v : v;
    btn.replaceWith(a);
    a.focus();
    if (kind === 'wa') window.open(a.href, '_blank', 'noopener');
  }));

  // Copy profile link
  $('[data-share]')?.addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    if (navigator.share) { try { await navigator.share({ title: document.title, url }); return; } catch { return; } }
    try { await navigator.clipboard.writeText(url); say('Profile link copied'); } catch { say(url); }
  });

  // Profile pages: the back link returns to the recruiter's last filtered results.
  const DIR_KEY = 'hpf-dir';
  const back = $('#back-link');
  if (back) {
    let saved = '';
    try { saved = sessionStorage.getItem(DIR_KEY) || ''; } catch {}
    if (saved) { back.href = ROOT + '?' + saved + '#trainees'; back.textContent = '← Back to your results'; }
  }

  // Directory filters
  const grid = $('#grid');
  if (!grid) return;
  const state = { q: '', track: 'all', avail: 'all', skill: '' };
  const cards = $$('.card', grid);
  const line = $('#result-line');
  const empty = $('#empty');
  let announce;
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
    // Debounced so screen readers are not told the count on every keystroke.
    clearTimeout(announce);
    announce = setTimeout(() => { line.textContent = n === cards.length ? `Showing all ${n} trainees` : `Showing ${n} of ${cards.length} trainees`; }, 400);
    empty.hidden = n > 0;
    const params = new URLSearchParams();
    Object.entries(state).forEach(([k, val]) => { if (val && val !== 'all') params.set(k, val); });
    const qs = params.toString();
    history.replaceState(null, '', (qs ? '?' + qs : location.pathname) + location.hash);
    try { sessionStorage.setItem(DIR_KEY, qs); } catch {}
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
