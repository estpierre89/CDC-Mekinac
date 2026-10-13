/* Inventaire — Rentrée scolaire · CDC Mékinac
 *
 * Application locale : les données sont gardées dans le navigateur (localStorage).
 * Le format d'export (.json) est volontairement simple et versionné pour pouvoir
 * être importé tel quel dans une future version web.
 */
'use strict';
(() => {

  /* ================================================================
   * Constantes et utilitaires
   * ================================================================ */
  const STORAGE_KEY = 'cdc-mekinac.inventaire.v1';
  const FORMAT = 'cdc-mekinac-inventaire';
  const FORMAT_VERSION = 1;
  const INVENTORY_NAME = 'Inventaire — Rentrée scolaire';
  const ORGANIZATION = 'CDC Mékinac';
  const NO_CATEGORY = 'Sans catégorie';
  const STEPS = [1, 5, 10];
  const MAX_QTY = 999999;

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const norm = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  const collator = new Intl.Collator('fr-CA', { sensitivity: 'base', numeric: true });
  const nowIso = () => new Date().toISOString();
  const uid = () => (window.crypto && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const clampQty = (n) => Math.min(MAX_QTY, Math.max(0, Math.floor(n)));
  const plural = (n, one, many) => (n > 1 ? many : one);

  const fmtInt = (n, sep = ' ') => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const fmtPrice = (p, sep = ' ') => {
    if (p == null) return '';
    const [i, d] = p.toFixed(2).split('.');
    return fmtInt(Number(i), sep) + ',' + d + sep + '$';
  };
  const plainSpaces = (s) => s.replace(/[  ]/g, ' ');
  const fmtDate = (d) => plainSpaces(new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long' }).format(d));
  const fmtDateTime = (d) => plainSpaces(
    new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long' }).format(d) + ' à ' +
    new Intl.DateTimeFormat('fr-CA', { hour: '2-digit', minute: '2-digit' }).format(d)
  );
  const dateStamp = (d = new Date()) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  /** Entier ≥ 0. Retourne null si vide, NaN si invalide. */
  function parseQty(v) {
    const s = String(v ?? '').replace(/[\s  ]/g, '');
    if (s === '') return null;
    if (!/^\d+$/.test(s)) return NaN;
    return clampQty(parseInt(s, 10));
  }

  /** Prix ≥ 0, virgule ou point acceptés. Retourne null si vide, NaN si invalide. */
  function parsePrice(v) {
    if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : NaN;
    const s = String(v ?? '').replace(/[\s  $]/g, '').replace(',', '.');
    if (s === '') return null;
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return Math.round(parseFloat(s) * 100) / 100;
  }

  /** Normalise un article venant du stockage ou d'un import. Retourne null si inutilisable. */
  function sanitizeItem(o) {
    if (!o || typeof o !== 'object') return null;
    const name = String(o.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!name) return null;
    const qty = typeof o.quantity === 'number' ? o.quantity : parseQty(o.quantity);
    const price = o.price == null ? null : parsePrice(o.price);
    const target = typeof o.target === 'number' ? o.target : parseQty(o.target);
    const t = nowIso();
    return {
      id: typeof o.id === 'string' && o.id ? o.id : uid(),
      ref: String(o.ref ?? '').trim().replace(/^#/, '').slice(0, 12),
      name,
      category: String(o.category ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
      quantity: Number.isFinite(qty) ? clampQty(qty) : 0,
      price: Number.isFinite(price) && price >= 0 ? price : null,
      target: Number.isFinite(target) && target > 0 ? clampQty(target) : null,
      note: String(o.note ?? '').trim().slice(0, 300),
      createdAt: typeof o.createdAt === 'string' ? o.createdAt : t,
      updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : t,
    };
  }

  /* ================================================================
   * Stockage local
   * (couche isolée : c'est elle qui sera remplacée par une API web plus tard)
   * ================================================================ */
  const Store = {
    items: [],
    meta: { updatedAt: null, lastExportAt: null },
    ok: true,
    fresh: false, // aucun inventaire enregistré sur cet appareil

    load() {
      let raw = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch (e) {
        this.ok = false;
        return;
      }
      this.fresh = !raw;
      if (!raw) return;
      try {
        const d = JSON.parse(raw);
        this.items = (Array.isArray(d.items) ? d.items : []).map(sanitizeItem).filter(Boolean);
        this.meta = Object.assign({ updatedAt: null, lastExportAt: null }, d.meta || {});
      } catch (e) {
        // Données illisibles : on les met de côté plutôt que de les écraser.
        try { localStorage.setItem(STORAGE_KEY + '.illisible-' + Date.now(), raw); } catch (_) { /* rien */ }
      }
    },

    save(touch = true) {
      if (touch) this.meta.updatedAt = nowIso();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          format: FORMAT, version: FORMAT_VERSION, meta: this.meta, items: this.items,
        }));
        this.ok = true;
      } catch (e) {
        this.ok = false;
      }
      $('#storageWarning').classList.toggle('show', !this.ok);
    },

    get(id) { return this.items.find((i) => i.id === id); },
    categories() {
      return [...new Set(this.items.map((i) => i.category).filter(Boolean))].sort(collator.compare);
    },
  };

  /* ================================================================
   * État de l'affichage (recherche, filtres, tri, mode)
   * ================================================================ */
  const STATUSES = [
    { id: 'all', label: 'Tous les articles', test: () => true },
    { id: 'instock', label: 'En stock', test: (i) => i.quantity > 0 },
    { id: 'empty', label: 'En rupture (quantité 0)', test: (i) => i.quantity === 0 },
    { id: 'below', label: 'Sous la quantité visée', test: (i) => i.target != null && i.quantity < i.target },
    { id: 'noprice', label: 'Sans prix', test: (i) => i.price == null },
  ];
  const SORTS = [
    { id: 'category', label: 'Catégorie (ordre de la feuille)' },
    { id: 'name', label: 'Nom (A → Z)' },
    { id: 'qtyAsc', label: 'Quantité (plus petite d\'abord)' },
    { id: 'qtyDesc', label: 'Quantité (plus grande d\'abord)' },
    { id: 'recent', label: 'Modifiés récemment' },
  ];
  const DEFAULT_UI = { search: '', category: null, status: 'all', sort: 'category' };
  const ui = Object.assign({ mode: 'add' }, DEFAULT_UI);

  const byRefThenName = (a, b) => {
    if (!a.ref !== !b.ref) return a.ref ? -1 : 1; // sans numéro à la fin
    return collator.compare(a.ref, b.ref) || collator.compare(a.name, b.name);
  };
  const byCategoryThenName = (a, b) => {
    if (!a.category !== !b.category) return a.category ? -1 : 1; // « Sans catégorie » à la fin
    return collator.compare(a.category, b.category) || byRefThenName(a, b);
  };
  const SORTERS = {
    category: byCategoryThenName,
    name: (a, b) => collator.compare(a.name, b.name),
    qtyAsc: (a, b) => a.quantity - b.quantity || collator.compare(a.name, b.name),
    qtyDesc: (a, b) => b.quantity - a.quantity || collator.compare(a.name, b.name),
    recent: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''),
  };

  function matchesSearch(item, words) {
    if (!words.length) return true;
    const hay = norm(item.name + ' ' + item.category + ' ' + item.note);
    return words.every((w) => hay.includes(w) || (item.ref && w.replace(/^(#|no|n°)/, '') === norm(item.ref)));
  }

  function visibleItems() {
    const words = norm(ui.search).split(' ').filter(Boolean);
    const status = STATUSES.find((s) => s.id === ui.status) || STATUSES[0];
    return Store.items
      .filter((i) => (ui.category === null || i.category === ui.category)
        && status.test(i) && matchesSearch(i, words))
      .sort(SORTERS[ui.sort] || SORTERS.category);
  }

  const filtersActive = () => ui.search.trim() !== '' || ui.category !== null || ui.status !== 'all';

  /* ================================================================
   * Rendu
   * ================================================================ */
  function render() {
    renderMeta();
    renderChips();
    renderActiveFilters();
    renderList();
  }

  function renderMeta() {
    const n = Store.items.length;
    const units = Store.items.reduce((s, i) => s + i.quantity, 0);
    $('#meta').textContent = n
      ? `${fmtInt(n)} ${plural(n, 'article', 'articles')} · ${fmtInt(units)} ${plural(units, 'unité', 'unités')}`
      : 'Aucun article';
  }

  function renderChips() {
    const cats = Store.categories();
    const hasNoCat = Store.items.some((i) => !i.category);
    if (ui.category !== null && !cats.includes(ui.category) && !(ui.category === '' && hasNoCat)) {
      ui.category = null;
    }
    const count = (c) => Store.items.filter((i) => i.category === c).length;
    const chip = (value, label, n) => `<button type="button" class="chip"
      ${value === null ? 'data-all' : `data-cat="${esc(value)}"`}
      aria-pressed="${ui.category === value}">${esc(label)}<span class="n">${n}</span></button>`;
    let html = chip(null, 'Tout', Store.items.length);
    cats.forEach((c) => { html += chip(c, c, count(c)); });
    if (hasNoCat && cats.length) html += chip('', NO_CATEGORY, count(''));
    const el = $('#chips');
    el.innerHTML = html;
    el.hidden = Store.items.length === 0;
  }

  function renderActiveFilters() {
    const btn = $('#filterBtn');
    const n = ui.status !== 'all' ? 1 : 0;
    btn.classList.toggle('active', n > 0 || ui.sort !== 'category');
    $('#filterCount').textContent = n || '';

    const el = $('#activeFilters');
    if (!filtersActive() || !Store.items.length) { el.innerHTML = ''; return; }
    const shown = visibleItems().length;
    const parts = [];
    if (ui.status !== 'all') parts.push(STATUSES.find((s) => s.id === ui.status).label.toLowerCase());
    el.innerHTML = `<span>${fmtInt(shown)} sur ${fmtInt(Store.items.length)} ${plural(Store.items.length, 'article', 'articles')}`
      + (parts.length ? ` · ${esc(parts.join(', '))}` : '') + `</span>`
      + `<button type="button" class="reset" id="resetFilters">Tout afficher</button>`;
  }

  function itemCard(i) {
    const empty = i.quantity === 0;
    const sub = [];
    if (i.ref) sub.push(`<span class="ref">n° ${esc(i.ref)}</span>`);
    if (i.category && ui.sort !== 'category') sub.push(`<span>${esc(i.category)}</span>`);
    sub.push(i.price != null
      ? `<span class="price">${fmtPrice(i.price)}</span>`
      : `<span class="noprice">Sans prix</span>`);

    let target = '';
    if (i.target != null) {
      const pct = Math.min(100, Math.round((i.quantity / i.target) * 100));
      const reached = i.quantity >= i.target;
      const left = i.target - i.quantity;
      target = `<div class="target${reached ? ' reached' : ''}">
        <div class="target-bar"><span style="width:${pct}%"></span></div>
        <div class="target-label"><span>${fmtInt(i.quantity)} / ${fmtInt(i.target)} visés</span>
        <span class="state">${reached ? 'Atteint ✓' : `Manque ${fmtInt(left)}`}</span></div>
      </div>`;
    }

    const sign = ui.mode === 'remove' ? '−' : '+';
    const verb = ui.mode === 'remove' ? 'Retirer' : 'Ajouter';
    const steps = STEPS.map((s) => `<button type="button" data-step="${s}"
      aria-label="${verb} ${s} : ${esc(i.name)}">${sign}${s}</button>`).join('');

    return `<article class="item${empty ? ' empty' : ''}" data-id="${esc(i.id)}">
      <div class="item-head">
        <button type="button" class="item-title" data-act="edit" aria-label="Modifier ${esc(i.name)}">
          <span class="name">${esc(i.name)}</span>
          <span class="sub">${sub.join('')}</span>
          ${i.note ? `<span class="note">${esc(i.note)}</span>` : ''}
        </button>
        <button type="button" class="qty" data-act="qty" aria-label="Quantité de ${esc(i.name)} : ${i.quantity}. Toucher pour modifier.">
          ${fmtInt(i.quantity)}<small>${empty ? 'Rupture' : 'en stock'}</small>
        </button>
      </div>
      ${target}
      <div class="steps">${steps}</div>
    </article>`;
  }

  function renderList() {
    const list = $('#list');
    if (!Store.items.length) {
      list.innerHTML = `<div class="empty-state">
        <h2>Aucun article pour l'instant</h2>
        <p>Charge la liste de la feuille, ajoute un article ou importe un fichier (.json ou .csv).</p>
        ${starterList().length ? `<button type="button" class="btn" data-empty="starter">Charger la liste de la feuille (${starterList().length} articles)</button>` : ''}
        <button type="button" class="btn${starterList().length ? ' secondary' : ''}" data-empty="add">Ajouter un article</button>
        <button type="button" class="btn secondary" data-empty="import">Importer un fichier</button>
      </div>`;
      return;
    }
    const items = visibleItems();
    if (!items.length) {
      list.innerHTML = `<div class="empty-state">
        <h2>Aucun résultat</h2>
        <p>Aucun article ne correspond à ta recherche ou à tes filtres.</p>
        <button type="button" class="btn secondary" data-empty="reset">Tout afficher</button>
      </div>`;
      return;
    }
    let html = '';
    if (ui.sort === 'category') {
      let current;
      items.forEach((i, idx) => {
        if (idx === 0 || i.category !== current) {
          current = i.category;
          const n = items.filter((x) => x.category === current).length;
          html += `<h2 class="group-title">${esc(current || NO_CATEGORY)}<span class="n">${n}</span></h2>`;
        }
        html += itemCard(i);
      });
    } else {
      html = items.map(itemCard).join('');
    }
    list.innerHTML = html;
  }

  function cardEl(id) {
    return $(`#list .item[data-id="${CSS.escape(id)}"]`);
  }

  function refreshCard(id, animate) {
    const el = cardEl(id);
    const item = Store.get(id);
    if (!el || !item) return;
    el.outerHTML = itemCard(item);
    if (animate) {
      const q = cardEl(id)?.querySelector('.qty');
      if (q) q.classList.add('bump');
    }
  }

  /* ================================================================
   * Toast avec « Annuler »
   * ================================================================ */
  let toastTimer = null;
  let toastUndo = null;
  let qtyGroup = null; // regroupe les clics rapides sur le même article

  function toast(html, undo) {
    const el = $('#toast');
    $('#toastMsg').innerHTML = html;
    toastUndo = undo || null;
    $('#toastUndo').hidden = !undo;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 5000 : 2600);
  }
  function hideToast() {
    $('#toast').classList.remove('show');
    toastUndo = null;
    qtyGroup = null;
  }

  /* ================================================================
   * Actions sur les quantités
   * ================================================================ */
  function bump(id, step) {
    const item = Store.get(id);
    if (!item) return;
    const delta = ui.mode === 'remove' ? -step : step;
    const before = item.quantity;
    const after = clampQty(before + delta);
    if (after === before) {
      toast(`<strong>${esc(item.name)}</strong> est déjà à 0.`);
      qtyGroup = null;
      return;
    }
    if (!qtyGroup || qtyGroup.id !== id) qtyGroup = { id, start: before };
    item.quantity = after;
    item.updatedAt = nowIso();
    Store.save();
    refreshCard(id, true);
    renderMeta();
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) { /* rien */ } }

    const group = qtyGroup;
    const total = after - group.start;
    const totalTxt = (total > 0 ? '+' : total < 0 ? '−' : '±') + fmtInt(Math.abs(total));
    toast(`${esc(item.name)} : <b>${totalTxt}</b> → ${fmtInt(after)}`, () => {
      setQuantity(id, group.start, false);
    });
    qtyGroup = group;
  }

  function setQuantity(id, qty, withToast = true) {
    const item = Store.get(id);
    if (!item) return;
    const before = item.quantity;
    item.quantity = clampQty(qty);
    item.updatedAt = nowIso();
    Store.save();
    if (cardEl(id)) refreshCard(id, true); else renderList();
    renderMeta();
    if (withToast && before !== item.quantity) {
      toast(`${esc(item.name)} : ${fmtInt(before)} → <b>${fmtInt(item.quantity)}</b>`,
        () => setQuantity(id, before, false));
    } else if (!withToast) {
      hideToast();
    }
  }

  function setMode(mode) {
    ui.mode = mode;
    document.body.classList.toggle('removing', mode === 'remove');
    $('#modeAdd').setAttribute('aria-pressed', mode === 'add');
    $('#modeRemove').setAttribute('aria-pressed', mode === 'remove');
    qtyGroup = null;
    renderList();
  }

  /* ================================================================
   * Dialogues
   * ================================================================ */
  function openDialog(d) {
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }
  function closeDialog(d) {
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
  }
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => {
      if (e.target === d) closeDialog(d); // clic sur le fond
      if (e.target.closest('[data-close]')) closeDialog(d);
    });
  });

  function confirmBox(title, text, yesLabel = 'Confirmer') {
    return new Promise((resolve) => {
      const d = $('#confirmDialog');
      $('#confirmTitle').textContent = title;
      $('#confirmText').textContent = text;
      $('#confirmYes').textContent = yesLabel;
      let result = false;
      const yes = () => { result = true; closeDialog(d); };
      const no = () => closeDialog(d);
      $('#confirmYes').onclick = yes;
      $('#confirmNo').onclick = no;
      d.addEventListener('close', () => resolve(result), { once: true });
      openDialog(d);
    });
  }

  /* ---------- Fiche article ---------- */
  let editingId = null;

  function openItem(id) {
    editingId = id || null;
    const item = id ? Store.get(id) : null;
    $('#itemDialogTitle').textContent = item ? 'Modifier l\'article' : 'Nouvel article';
    $('#iName').value = item?.name ?? '';
    $('#iCategory').value = item?.category ?? (ui.category || '');
    $('#iRef').value = item?.ref ?? '';
    $('#iQty').value = item ? String(item.quantity) : '';
    $('#iPrice').value = item?.price != null ? item.price.toFixed(2).replace('.', ',') : '';
    $('#iTarget').value = item?.target != null ? String(item.target) : '';
    $('#iNote').value = item?.note ?? '';
    $('#iDelete').hidden = !item;
    $('#iSave').textContent = item ? 'Enregistrer' : 'Ajouter l\'article';
    $('#categoryList').innerHTML = Store.categories().map((c) => `<option value="${esc(c)}">`).join('');
    $('#iNameErr').hidden = true;
    $('#iFormErr').hidden = true;
    $('#fName').classList.remove('invalid');
    checkDuplicateName();
    openDialog($('#itemDialog'));
    if (!item) setTimeout(() => $('#iName').focus(), 60);
  }

  function checkDuplicateName() {
    const n = norm($('#iName').value);
    const dup = n && Store.items.find((i) => i.id !== editingId && norm(i.name) === n);
    const w = $('#iNameWarn');
    w.hidden = !dup;
    if (dup) {
      w.textContent = `Un article « ${dup.name} » existe déjà (quantité ${fmtInt(dup.quantity)}`
        + (dup.category ? `, ${dup.category}` : '') + ').';
    }
  }

  function submitItem(e) {
    e.preventDefault();
    const name = $('#iName').value.trim();
    const qty = parseQty($('#iQty').value);
    const price = parsePrice($('#iPrice').value);
    const target = parseQty($('#iTarget').value);
    const errs = [];
    $('#iNameErr').hidden = !!name;
    $('#fName').classList.toggle('invalid', !name);
    if (!name) errs.push('name');
    if (Number.isNaN(qty)) errs.push('La quantité doit être un nombre entier (ex. 12).');
    if (Number.isNaN(price)) errs.push('Le prix doit être un nombre (ex. 2,50).');
    if (Number.isNaN(target)) errs.push('La quantité visée doit être un nombre entier (ex. 200).');
    const msgs = errs.filter((x) => x !== 'name');
    $('#iFormErr').hidden = !msgs.length;
    $('#iFormErr').textContent = msgs.join(' ');
    if (errs.length) {
      if (!name) $('#iName').focus();
      return;
    }

    const fields = {
      name,
      category: $('#iCategory').value.trim().replace(/\s+/g, ' '),
      ref: $('#iRef').value,
      quantity: qty ?? 0,
      price,
      target: target && target > 0 ? target : null,
      note: $('#iNote').value.trim(),
    };
    let item;
    if (editingId) {
      item = Store.get(editingId);
      Object.assign(item, sanitizeItem(Object.assign({}, item, fields)), { updatedAt: nowIso() });
    } else {
      item = sanitizeItem(Object.assign({ id: uid() }, fields));
      Store.items.push(item);
    }
    Store.save();
    closeDialog($('#itemDialog'));
    render();

    const hidden = !visibleItems().some((i) => i.id === item.id);
    toast(`${editingId ? 'Modifié' : 'Ajouté'} : <strong>${esc(item.name)}</strong>`
      + (hidden ? ' (masqué par les filtres)' : ''));
    if (!hidden) {
      const el = cardEl(item.id);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  async function deleteItem() {
    const item = Store.get(editingId);
    if (!item) return;
    const ok = await confirmBox('Supprimer l\'article ?', `« ${item.name} » sera retiré de l'inventaire.`, 'Supprimer');
    if (!ok) return;
    const idx = Store.items.indexOf(item);
    Store.items.splice(idx, 1);
    Store.save();
    closeDialog($('#itemDialog'));
    render();
    toast(`Supprimé : <strong>${esc(item.name)}</strong>`, () => {
      Store.items.splice(Math.min(idx, Store.items.length), 0, item);
      Store.save();
      render();
      hideToast();
    });
  }

  /* ---------- Quantité manuelle ---------- */
  let qtyId = null;

  function openQty(id) {
    const item = Store.get(id);
    if (!item) return;
    qtyId = id;
    $('#qtyDialogTitle').textContent = item.name;
    $('#qtyLead').textContent = `Quantité actuelle : ${fmtInt(item.quantity)}. Entre la nouvelle quantité.`;
    $('#qInput').value = String(item.quantity);
    $('#qErr').hidden = true;
    openDialog($('#qtyDialog'));
    setTimeout(() => { $('#qInput').focus(); $('#qInput').select(); }, 60);
  }

  function submitQty(e) {
    e.preventDefault();
    const v = parseQty($('#qInput').value);
    if (v == null || Number.isNaN(v)) { $('#qErr').hidden = false; return; }
    closeDialog($('#qtyDialog'));
    setQuantity(qtyId, v);
  }

  /* ---------- Filtres et tri ---------- */
  function openFilters() {
    const counts = Object.fromEntries(STATUSES.map((s) => [s.id, Store.items.filter(s.test).length]));
    $('#statusList').innerHTML = STATUSES.map((s) => `<label>
      <input type="radio" name="status" value="${s.id}" ${ui.status === s.id ? 'checked' : ''}>
      ${esc(s.label)}<span class="n">${counts[s.id]}</span></label>`).join('');
    $('#sortList').innerHTML = SORTS.map((s) => `<label>
      <input type="radio" name="sort" value="${s.id}" ${ui.sort === s.id ? 'checked' : ''}>
      ${esc(s.label)}</label>`).join('');
    openDialog($('#filterDialog'));
  }

  function resetFilters() {
    Object.assign(ui, DEFAULT_UI);
    $('#search').value = '';
    $('#searchWrap').classList.remove('has-value');
    render();
  }

  /* ================================================================
   * Fichiers : remise à l'utilisateur (télécharger / ouvrir / partager)
   * ================================================================ */
  function deliverFile(blob, filename, { title, lead, canOpen = false, onDone } = {}) {
    const file = new File([blob], filename, { type: blob.type });
    const url = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    const actions = [];
    const icon = (path) => `<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;

    if (navigator.canShare && navigator.share) {
      try {
        if (navigator.canShare({ files: [file] })) {
          actions.push({ id: 'share', html: `${icon('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>')}<span><strong>Partager / Envoyer</strong><span class="d">Courriel, Messages, Drive, Fichiers…</span></span>` });
        }
      } catch (_) { /* partage non disponible */ }
    }
    if (canOpen) {
      actions.push({ id: 'open', html: `${icon('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>')}<span><strong>Ouvrir</strong><span class="d">Voir le PDF dans le navigateur</span></span>` });
    }
    actions.push({ id: 'download', html: `${icon('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 19h14"/>')}<span><strong>Télécharger</strong><span class="d">${esc(filename)}</span></span>` });

    $('#fileDialogTitle').textContent = title || 'Fichier prêt';
    $('#fileLead').textContent = lead || '';
    const box = $('#fileActions');
    box.innerHTML = actions.map((a) => `<button class="menu-item" type="button" data-file-act="${a.id}">${a.html}</button>`).join('');
    box.onclick = async (e) => {
      const b = e.target.closest('[data-file-act]');
      if (!b) return;
      const act = b.dataset.fileAct;
      if (act === 'share') {
        try {
          await navigator.share({ files: [file], title: filename });
          if (onDone) onDone();
          closeDialog($('#fileDialog'));
        } catch (err) {
          if (err && err.name !== 'AbortError') toast('Le partage n\'a pas fonctionné. Essaie « Télécharger ».');
        }
      } else if (act === 'open') {
        window.open(url, '_blank');
        if (onDone) onDone();
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (onDone) onDone();
        closeDialog($('#fileDialog'));
      }
    };
    openDialog($('#fileDialog'));
  }

  function markExported() {
    Store.meta.lastExportAt = nowIso();
    Store.save(false);
  }

  /* ================================================================
   * Export
   * ================================================================ */
  function exportJson() {
    if (!Store.items.length) { toast('L\'inventaire est vide : rien à exporter.'); return; }
    const payload = {
      format: FORMAT,
      version: FORMAT_VERSION,
      exportedAt: nowIso(),
      inventory: { name: INVENTORY_NAME, organization: ORGANIZATION, items: Store.items },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    deliverFile(blob, `inventaire-rentree-scolaire-${dateStamp()}.json`, {
      title: 'Sauvegarde prête',
      lead: `${fmtInt(Store.items.length)} ${plural(Store.items.length, 'article', 'articles')}. Garde ce fichier en lieu sûr (courriel, Drive…) : il permet de tout récupérer avec « Importer ».`,
      onDone: markExported,
    });
  }

  const CSV_HEADERS = ['N°', 'Article', 'Catégorie', 'Quantité', 'Prix de vente', 'Quantité visée', 'Note'];

  function exportCsv() {
    if (!Store.items.length) { toast('L\'inventaire est vide : rien à exporter.'); return; }
    const cell = (v) => {
      const s = String(v ?? '');
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [CSV_HEADERS].concat([...Store.items].sort(byCategoryThenName).map((i) => [
      i.ref, i.name, i.category, i.quantity,
      i.price != null ? i.price.toFixed(2).replace('.', ',') : '',
      i.target ?? '', i.note,
    ]));
    const text = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    deliverFile(blob, `inventaire-rentree-scolaire-${dateStamp()}.csv`, {
      title: 'Fichier Excel prêt',
      lead: 'Fichier .csv qui s\'ouvre dans Excel, Numbers ou Google Sheets. Il peut aussi être réimporté ici.',
    });
  }

  /* ================================================================
   * Import (.json de sauvegarde ou .csv de tableur)
   * ================================================================ */
  let pendingImport = null;

  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delim = [';', '\t', ','].map((d) => [d, firstLine.split(d).length])
      .sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
        } else field += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }

  const CSV_COLUMNS = {
    ref: ['n°', 'no', 'no.', 'numero', 'num', '#', 'n'],
    name: ['article', 'articles', 'nom', 'name', 'item', 'produit', 'description', 'materiel'],
    category: ['categorie', 'category', 'type', 'section'],
    quantity: ['quantite', 'qte', 'qty', 'quantity', 'nombre', 'nb', 'stock', 'inventaire'],
    price: ['prix de vente', 'prix', 'price', 'prix unitaire', 'cout', 'prix ($)', 'prix de vente ($)'],
    target: ['quantite visee', 'visee', 'objectif', 'cible', 'target', 'besoin'],
    note: ['note', 'notes', 'remarque', 'remarques', 'commentaire', 'commentaires'],
  };

  function itemsFromCsv(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('Le fichier ne contient pas de lignes d\'articles.');
    const header = rows[0].map((h) => norm(h));
    const cols = {};
    for (const [key, names] of Object.entries(CSV_COLUMNS)) {
      const idx = header.findIndex((h) => names.includes(h));
      if (idx !== -1) cols[key] = idx;
    }
    if (cols.name === undefined) {
      throw new Error('Colonne « Article » introuvable. La première ligne doit contenir les titres : '
        + CSV_HEADERS.join(', ') + '.');
    }
    return rows.slice(1).map((r) => {
      const o = {};
      for (const [key, idx] of Object.entries(cols)) o[key] = (r[idx] ?? '').trim();
      return o;
    }).filter((o) => o.name);
  }

  function itemsFromJson(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { throw new Error('Ce fichier .json est illisible.'); }
    const list = Array.isArray(d) ? d
      : Array.isArray(d?.inventory?.items) ? d.inventory.items
        : Array.isArray(d?.items) ? d.items : null;
    if (!list) throw new Error('Ce fichier ne ressemble pas à une sauvegarde d\'inventaire.');
    return list;
  }

  async function handleImportFile(file) {
    if (!file) return;
    let raw;
    try {
      const text = await file.text();
      const isJson = /\.json$/i.test(file.name) || /^\s*[[{]/.test(text);
      raw = isJson ? itemsFromJson(text) : itemsFromCsv(text);
    } catch (err) {
      await confirmBox('Import impossible', err.message || String(err), 'OK');
      return;
    }
    const valid = raw.filter((o) => sanitizeItem(o));
    if (!valid.length) {
      await confirmBox('Import impossible', 'Aucun article valide n\'a été trouvé dans ce fichier.', 'OK');
      return;
    }
    pendingImport = valid;
    const empty = Store.items.length === 0;
    $('#importLead').textContent = `${fmtInt(valid.length)} ${plural(valid.length, 'article trouvé', 'articles trouvés')} dans « ${file.name} ».`;
    const preview = valid.slice(0, 8).map((o) => {
      const s = sanitizeItem(o);
      return `<li><span>${esc(s.name)}</span><span>${o.quantity !== undefined ? fmtInt(s.quantity) : '—'}</span></li>`;
    }).join('');
    $('#importPreview').innerHTML = `<strong>Aperçu</strong><ul>${preview}`
      + (valid.length > 8 ? `<li class="more">… et ${fmtInt(valid.length - 8)} autres</li>` : '') + '</ul>';
    $('#importMerge').querySelector('strong').textContent = empty ? 'Importer' : 'Fusionner';
    $('#importMerge').querySelector('.d').textContent = empty
      ? 'Ajouter ces articles à l\'inventaire'
      : 'Met à jour les articles du même nom et ajoute les nouveaux';
    $('#importReplace').hidden = empty;
    openDialog($('#importDialog'));
  }

  function applyImport(mode) {
    if (!pendingImport) return;
    const previous = Store.items.map((i) => Object.assign({}, i));
    let added = 0, updated = 0;
    if (mode === 'replace') {
      Store.items = pendingImport.map(sanitizeItem).filter(Boolean);
      added = Store.items.length;
    } else {
      const byId = new Map(Store.items.map((i) => [i.id, i]));
      const byName = new Map(Store.items.map((i) => [norm(i.name), i]));
      for (const o of pendingImport) {
        const existing = (typeof o.id === 'string' && byId.get(o.id)) || byName.get(norm(o.name));
        if (existing) {
          // Seuls les champs présents (et non vides) dans le fichier sont mis à jour.
          const merged = sanitizeItem(Object.assign({}, existing,
            Object.fromEntries(Object.entries(o).filter(([k, v]) => k !== 'id' && k !== 'createdAt' && v !== ''))));
          Object.assign(existing, merged, { id: existing.id, createdAt: existing.createdAt, updatedAt: nowIso() });
          updated++;
        } else {
          const n = sanitizeItem(o);
          if (Store.items.some((i) => i.id === n.id)) n.id = uid();
          Store.items.push(n);
          added++;
        }
      }
    }
    pendingImport = null;
    Store.save();
    closeDialog($('#importDialog'));
    closeDialog($('#menuDialog'));
    resetFilters();
    const parts = [];
    if (added) parts.push(`${fmtInt(added)} ${plural(added, 'ajouté', 'ajoutés')}`);
    if (updated) parts.push(`${fmtInt(updated)} ${plural(updated, 'mis à jour', 'mis à jour')}`);
    toast(`Import terminé : ${parts.join(', ')}`, () => {
      Store.items = previous;
      Store.save();
      render();
      hideToast();
    });
  }

  /* ================================================================
   * PDF
   * ================================================================ */
  const C = {
    forest: [36, 64, 47], forestDark: [24, 43, 32], wheat: [212, 169, 79], wheatSoft: [243, 230, 196],
    paper: [245, 241, 228], paperDim: [235, 229, 210], zebra: [250, 248, 241],
    ink: [32, 28, 20], inkSoft: [90, 84, 68], clay: [181, 80, 47], line: [216, 208, 184], mist: [201, 211, 196],
    sheetGray: [214, 212, 205],
  };

  function describeSelection() {
    const parts = [];
    if (ui.category !== null) parts.push(`catégorie « ${ui.category || NO_CATEGORY} »`);
    if (ui.status !== 'all') parts.push(STATUSES.find((s) => s.id === ui.status).label.toLowerCase());
    if (ui.search.trim()) parts.push(`recherche « ${ui.search.trim()} »`);
    return parts.join(' · ');
  }

  function startPdf() {
    if (!Store.items.length) { toast('L\'inventaire est vide : rien à mettre dans le PDF.'); return; }
    closeDialog($('#menuDialog'));
    if (!filtersActive()) { makePdf(Store.items, ''); return; }
    const shown = visibleItems();
    $('#pdfAllD').textContent = `${fmtInt(Store.items.length)} ${plural(Store.items.length, 'article', 'articles')}`;
    $('#pdfShownD').textContent = `${fmtInt(shown.length)} ${plural(shown.length, 'article', 'articles')} · ${describeSelection()}`;
    $('#pdfShown').disabled = !shown.length;
    $('#pdfAll').onclick = () => { closeDialog($('#pdfDialog')); makePdf(Store.items, ''); };
    $('#pdfShown').onclick = () => { closeDialog($('#pdfDialog')); makePdf(shown, describeSelection()); };
    openDialog($('#pdfDialog'));
  }

  function makePdf(sourceItems, selection) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      toast('Le module PDF n\'est pas chargé. Recharge la page et réessaie.');
      return;
    }
    let blob;
    try {
      blob = buildPdf(sourceItems, selection);
    } catch (err) {
      console.error(err);
      toast('Erreur pendant la création du PDF.');
      return;
    }
    deliverFile(blob, `inventaire-rentree-scolaire-${dateStamp()}.pdf`, {
      title: 'PDF prêt',
      lead: `${fmtInt(sourceItems.length)} ${plural(sourceItems.length, 'article', 'articles')}${selection ? ' · ' + selection : ''}.`,
      canOpen: true,
    });
  }

  function buildPdf(sourceItems, selection) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 40;
    const today = new Date();
    const items = [...sourceItems].sort(byCategoryThenName);
    const hasTarget = items.some((i) => i.target != null);
    const hasNote = items.some((i) => i.note);
    const hasRef = items.some((i) => i.ref);
    const units = items.reduce((s, i) => s + i.quantity, 0);
    const sp = (s) => plainSpaces(s);

    doc.setProperties({
      title: `${INVENTORY_NAME} — ${ORGANIZATION}`,
      subject: 'Inventaire du matériel scolaire',
      author: ORGANIZATION,
      creator: 'Inventaire CDC Mékinac',
    });

    // --- En-tête : bande forêt avec coutures ---
    const bandH = 104;
    doc.setFillColor(...C.forest);
    doc.rect(0, 0, W, bandH, 'F');
    doc.setLineDashPattern([5, 3.5], 0);
    doc.setLineWidth(1);
    doc.setDrawColor(...C.wheat);
    doc.line(14, 9, W - 14, 9);
    doc.line(14, bandH - 9, W - 14, bandH - 9);
    doc.setLineDashPattern([], 0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.wheat);
    doc.text('CDC MÉKINAC', M, 36, { charSpace: 1.6 });

    doc.setFont('times', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(255, 255, 255);
    doc.text('Inventaire', M, 68);
    const w1 = doc.getTextWidth('Inventaire ');
    doc.setFont('times', 'bolditalic');
    doc.setTextColor(...C.wheatSoft);
    doc.text('· Rentrée scolaire', M + w1, 68);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.mist);
    doc.text('Matériel scolaire', W - M, 36, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(fmtDate(today), W - M, 52, { align: 'right' });

    // --- Résumé ---
    let y = bandH + 26;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...C.forestDark);
    const summary = `${fmtInt(items.length, ' ')} ${plural(items.length, 'article', 'articles')}`
      + `   ·   ${fmtInt(units, ' ')} ${plural(units, 'unité', 'unités')} en inventaire`;
    doc.text(summary, M, y);
    if (selection) {
      y += 15;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.inkSoft);
      doc.text(doc.splitTextToSize(sp(`Sélection : ${selection}`), W - 2 * M), M, y);
    }
    y += 14;

    // --- Tableau groupé par catégorie ---
    const columns = [];
    if (hasRef) columns.push({ key: 'ref', label: 'N°' });
    columns.push({ key: 'name', label: 'Article' });
    if (hasNote) columns.push({ key: 'note', label: 'Note' });
    columns.push({ key: 'qty', label: 'Quantité' });
    if (hasTarget) columns.push({ key: 'target', label: 'Visée' });
    columns.push({ key: 'price', label: 'Prix de vente' });

    const body = [];
    let current;
    let stripe = 0;
    items.forEach((i, idx) => {
      if (idx === 0 || i.category !== current) {
        current = i.category;
        stripe = 0;
        const n = items.filter((x) => x.category === current).length;
        body.push([{
          content: `${(current || NO_CATEGORY).toLocaleUpperCase('fr-CA')}  (${n})`,
          colSpan: columns.length,
          styles: {
            fillColor: C.sheetGray, textColor: C.ink, fontStyle: 'bold', fontSize: 10, halign: 'center',
            cellPadding: { top: 7, bottom: 6, left: 8, right: 8 },
          },
        }]);
        body[body.length - 1]._cat = null; // une rangée de catégorie : pas besoin de « suite »
      }
      const row = columns.map((c) => {
        switch (c.key) {
          case 'ref': return i.ref;
          case 'name': return i.name;
          case 'note': return i.note || '';
          case 'qty': return { content: fmtInt(i.quantity, ' '), _zero: i.quantity === 0 };
          case 'target': return i.target != null ? fmtInt(i.target, ' ') : '—';
          case 'price': return i.price != null ? fmtPrice(i.price, ' ') : '—';
          default: return '';
        }
      });
      row._stripe = stripe++ % 2 === 1; // alternance qui recommence dans chaque catégorie
      row._cat = current || NO_CATEGORY;
      body.push(row);
    });

    const colStyles = {};
    columns.forEach((c, idx) => {
      if (c.key === 'ref') colStyles[idx] = { cellWidth: 30, halign: 'right', textColor: C.inkSoft };
      if (c.key === 'name') colStyles[idx] = { cellWidth: 'auto', fontStyle: 'bold', textColor: C.ink };
      if (c.key === 'note') colStyles[idx] = { cellWidth: hasNote ? 150 : 0, textColor: C.inkSoft, fontSize: 8.5 };
      if (c.key === 'qty') colStyles[idx] = { cellWidth: 62, halign: 'right', fontStyle: 'bold' };
      if (c.key === 'target') colStyles[idx] = { cellWidth: 50, halign: 'right', textColor: C.inkSoft };
      if (c.key === 'price') colStyles[idx] = { cellWidth: 80, halign: 'right' };
    });

    const firstRowCategory = {}; // page -> catégorie de la première rangée (si elle continue)
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M, top: 56, bottom: 54 },
      head: [columns.map((c) => c.label)],
      body,
      theme: 'plain',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica', fontSize: 9.5, textColor: C.ink,
        cellPadding: { top: 6, bottom: 6, left: 8, right: 8 },
        lineWidth: 0, overflow: 'linebreak', valign: 'middle',
      },
      headStyles: { fillColor: C.forest, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, lineWidth: 0 },
      columnStyles: colStyles,
      didDrawCell: (data) => {
        if (data.section !== 'body') return;
        const page = doc.getCurrentPageInfo().pageNumber;
        if (!(page in firstRowCategory)) firstRowCategory[page] = data.row.raw._cat;
      },
      didParseCell: (data) => {
        if (data.section === 'head') {
          const key = columns[data.column.index]?.key;
          if (key === 'ref' || key === 'qty' || key === 'target' || key === 'price') data.cell.styles.halign = 'right';
        }
        if (data.section === 'body' && data.row.raw._stripe) data.cell.styles.fillColor = C.zebra;
        if (data.section === 'body' && data.cell.raw && data.cell.raw._zero) {
          data.cell.styles.textColor = C.clay;
        }
      },
    });

    // --- Pieds de page et en-têtes de suite ---
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setLineDashPattern([4, 3], 0);
      doc.setDrawColor(...C.clay);
      doc.setLineWidth(0.7);
      doc.line(M, H - 38, W - M, H - 38);
      if (p > 1) doc.line(M, 40, W - M, 40);
      doc.setLineDashPattern([], 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...C.inkSoft);
      doc.text(`${ORGANIZATION} · Inventaire de la rentrée scolaire · ${fmtDate(today)}`, M, H - 24);
      doc.text(`Page ${p} de ${pages}`, W - M, H - 24, { align: 'right' });
      if (p > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...C.forestDark);
        doc.text('CDC MÉKINAC · INVENTAIRE — RENTRÉE SCOLAIRE', M, 32, { charSpace: 0.6 });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.inkSoft);
        const cont = firstRowCategory[p];
        doc.text(cont ? `${cont} (suite)` : '(suite)', W - M, 32, { align: 'right' });
      }
    }

    return doc.output('blob');
  }

  /* ================================================================
   * Liste de départ (articles de la feuille, voir liste-depart.js)
   * ================================================================ */
  const starterList = () => (Array.isArray(window.LISTE_DEPART) ? window.LISTE_DEPART : []);
  const missingStarterItems = () => {
    const names = new Set(Store.items.map((i) => norm(i.name)));
    return starterList().filter((o) => !names.has(norm(o.name)));
  };

  /** Ajoute les articles de la feuille absents de l'inventaire, sans toucher aux autres. */
  function addStarterItems() {
    const added = missingStarterItems().map(sanitizeItem).filter(Boolean);
    Store.items.push(...added);
    Store.save();
    return added.length;
  }

  async function loadStarterFromMenu() {
    const missing = missingStarterItems().length;
    if (!missing) { toast('Tous les articles de la feuille sont déjà dans l\'inventaire.'); return; }
    const ok = await confirmBox('Ajouter la liste de la feuille ?',
      `${fmtInt(missing)} ${plural(missing, 'article de la feuille sera ajouté', 'articles de la feuille seront ajoutés')} (quantité 0). Les articles déjà présents ne sont pas modifiés.`,
      'Ajouter');
    if (!ok) return;
    const previous = Store.items.slice();
    const n = addStarterItems();
    closeDialog($('#menuDialog'));
    resetFilters();
    toast(`${fmtInt(n)} ${plural(n, 'article ajouté', 'articles ajoutés')}`, () => {
      Store.items = previous;
      Store.save();
      render();
      hideToast();
    });
  }

  /* ================================================================
   * Menu
   * ================================================================ */
  function openMenu() {
    const note = $('#backupNote');
    const { lastExportAt, updatedAt } = Store.meta;
    if (!Store.items.length) {
      note.hidden = true;
    } else {
      note.hidden = false;
      if (!lastExportAt) {
        note.textContent = 'Aucune sauvegarde exportée pour l\'instant. Pense à exporter régulièrement : si les données du navigateur sont effacées, l\'inventaire est perdu.';
        note.classList.add('stale');
      } else {
        const changed = updatedAt && updatedAt > lastExportAt;
        note.textContent = `Dernière sauvegarde exportée : ${fmtDateTime(new Date(lastExportAt))}.`
          + (changed ? ' Des changements ont été faits depuis.' : '');
        note.classList.toggle('stale', !!changed);
      }
    }
    openDialog($('#menuDialog'));
  }

  async function clearAll() {
    if (!Store.items.length) { toast('L\'inventaire est déjà vide.'); return; }
    const ok = await confirmBox('Effacer tout l\'inventaire ?',
      `Les ${fmtInt(Store.items.length)} articles seront supprimés de cet appareil. As-tu exporté une sauvegarde ?`,
      'Tout effacer');
    if (!ok) return;
    const previous = Store.items;
    Store.items = [];
    Store.save();
    closeDialog($('#menuDialog'));
    resetFilters();
    toast('Inventaire effacé.', () => {
      Store.items = previous;
      Store.save();
      render();
      hideToast();
    });
  }

  /* ================================================================
   * Événements
   * ================================================================ */
  function bindEvents() {
    $('#list').addEventListener('click', (e) => {
      const empty = e.target.closest('[data-empty]');
      if (empty) {
        const a = empty.dataset.empty;
        if (a === 'add') openItem();
        else if (a === 'starter') { addStarterItems(); resetFilters(); toast('Liste de la feuille chargée.'); }
        else if (a === 'import') $('#importFile').click();
        else resetFilters();
        return;
      }
      const card = e.target.closest('.item');
      if (!card) return;
      const id = card.dataset.id;
      const step = e.target.closest('[data-step]');
      if (step) { bump(id, Number(step.dataset.step)); return; }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'qty') openQty(id);
      else if (act.dataset.act === 'edit') openItem(id);
    });

    $('#activeFilters').addEventListener('click', (e) => {
      if (e.target.closest('#resetFilters')) resetFilters();
    });

    const search = $('#search');
    search.addEventListener('input', () => {
      ui.search = search.value;
      $('#searchWrap').classList.toggle('has-value', search.value !== '');
      renderActiveFilters();
      renderList();
    });
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') search.blur(); });
    $('#searchClear').addEventListener('click', () => {
      search.value = '';
      search.dispatchEvent(new Event('input'));
      search.focus();
    });

    $('#chips').addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      ui.category = 'all' in c.dataset ? null : c.dataset.cat;
      render();
    });

    $('#modeAdd').addEventListener('click', () => setMode('add'));
    $('#modeRemove').addEventListener('click', () => setMode('remove'));

    $('#filterBtn').addEventListener('click', openFilters);
    $('#filterDialog').addEventListener('change', (e) => {
      if (e.target.name === 'status') ui.status = e.target.value;
      if (e.target.name === 'sort') ui.sort = e.target.value;
      render();
    });
    $('#filterReset').addEventListener('click', () => {
      ui.status = DEFAULT_UI.status;
      ui.sort = DEFAULT_UI.sort;
      $('#filterDialog').querySelectorAll('input[value="all"], input[value="category"]').forEach((i) => { i.checked = true; });
      render();
    });

    $('#addBtn').addEventListener('click', () => openItem());
    $('#itemForm').addEventListener('submit', submitItem);
    $('#iName').addEventListener('input', checkDuplicateName);
    $('#iDelete').addEventListener('click', deleteItem);

    $('#qtyForm').addEventListener('submit', submitQty);
    $('#qtyDialog').querySelector('.qty-quick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-delta]');
      if (!b) return;
      const cur = parseQty($('#qInput').value);
      const base = Number.isFinite(cur) ? cur : 0;
      $('#qInput').value = String(clampQty(base + Number(b.dataset.delta)));
      $('#qErr').hidden = true;
    });

    $('#toastUndo').addEventListener('click', () => {
      const fn = toastUndo;
      hideToast();
      if (fn) fn();
    });

    $('#menuBtn').addEventListener('click', openMenu);
    $('#mPdf').addEventListener('click', startPdf);
    $('#mExport').addEventListener('click', () => { closeDialog($('#menuDialog')); exportJson(); });
    $('#mExportCsv').addEventListener('click', () => { closeDialog($('#menuDialog')); exportCsv(); });
    $('#mImport').addEventListener('click', () => $('#importFile').click());
    $('#mClear').addEventListener('click', clearAll);
    $('#mStarter').addEventListener('click', loadStarterFromMenu);
    $('#importFile').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      await handleImportFile(f);
    });
    $('#importMerge').addEventListener('click', () => applyImport('merge'));
    $('#importReplace').addEventListener('click', async () => {
      const ok = await confirmBox('Remplacer tout l\'inventaire ?',
        `Les ${fmtInt(Store.items.length)} articles actuels seront remplacés par ceux du fichier.`, 'Remplacer');
      if (ok) applyImport('replace');
    });

    // Synchronise si l'inventaire est ouvert dans deux onglets.
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) { Store.load(); render(); }
    });
  }

  /* ================================================================
   * Démarrage
   * ================================================================ */
  Store.load();
  if (!Store.ok) $('#storageWarning').classList.add('show');
  else {
    try {
      localStorage.setItem(STORAGE_KEY + '.test', '1');
      localStorage.removeItem(STORAGE_KEY + '.test');
    } catch (e) {
      Store.ok = false;
      $('#storageWarning').classList.add('show');
    }
  }
  bindEvents();
  if (Store.fresh && Store.ok && starterList().length) {
    const n = addStarterItems();
    render();
    toast(`Liste de la feuille chargée : ${fmtInt(n)} articles.`);
  } else {
    render();
  }

  // Demande au navigateur de ne pas effacer les données automatiquement.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
  // Fonctionnement hors connexion.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
