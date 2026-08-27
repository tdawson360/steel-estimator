// Client-side reconciliation of in-memory state with a PUT save response.
// The server is authoritative for totals, and the response tree carries the
// DB-assigned IDs for rows created by this save, so after reconciling the
// screen shows exactly what the database holds.
//
// Every merge here is IDENTITY-PRESERVING: when nothing changed at a level,
// the ORIGINAL reference is returned. This matters — the component's autosave
// effect fires on any state reference change, so a steady-state save must
// reconcile to the very same objects or autosave would loop forever.

function withPatch(orig, patch) {
  for (const k of Object.keys(patch)) {
    if (orig[k] !== patch[k]) return { ...orig, ...patch };
  }
  return orig;
}

function mergeArr(list, fn) {
  if (!Array.isArray(list)) return list;
  let changed = false;
  const out = list.map((o, i) => {
    const m = fn(o, i);
    if (m !== o) changed = true;
    return m;
  });
  return changed ? out : list;
}

// Map client-side IDs (existing DB ints or temp Date.now()-style numbers) to
// the server rows for a flat collection (breakout groups, adjustments).
// Existing IDs map to themselves; temp entries map positionally onto the rows
// the server created this save — both sides are in payload order (the server
// returns rows in primary-key order, and creates happen in payload order).
export function serverIdMap(list, savedRows) {
  const map = new Map();
  if (!Array.isArray(list) || !Array.isArray(savedRows)) return map;
  const savedIds = new Set(savedRows.map(r => r.id));
  const matched = new Set(list.map(e => Number(e.id)).filter(id => savedIds.has(id)));
  const created = savedRows.filter(r => !matched.has(r.id));
  let k = 0;
  for (const e of list) {
    if (savedIds.has(Number(e.id))) map.set(e.id, Number(e.id));
    else if (k < created.length) map.set(e.id, created[k++].id);
  }
  return map;
}

export function applyIdMap(list, idMap) {
  return mergeArr(list, e => {
    const nid = idMap.get(e.id);
    return nid !== undefined ? withPatch(e, { id: nid }) : e;
  });
}

function mergeRecap(recapObj, savedRows) {
  if (!recapObj || !Array.isArray(savedRows)) return recapObj;
  const byType = new Map(savedRows.map(r => [r.costType, r]));
  let changed = false;
  const out = {};
  for (const [ct, entry] of Object.entries(recapObj)) {
    const s = byType.get(ct);
    const m = (s && entry && entry.total !== s.total) ? { ...entry, total: s.total } : entry;
    if (m !== entry) changed = true;
    out[ct] = m;
  }
  return changed ? out : recapObj;
}

// Merge the saved DB tree (PUT response, ordered by sortOrder — i.e. payload
// order) into the client items state. Applies server IDs everywhere and the
// server-authoritative numbers: material totalCost/stockWeight/fabWeight,
// material fab quantity+totalCost (quantity carries the auto-galv weight
// sync), item fab totalCost, recap totals. Input fields (rates, lengths,
// pieces, descriptions) are never touched.
export function reconcileItems(items, savedItems, bgIdMap = new Map()) {
  return mergeArr(items, (item, i) => {
    const s = savedItems?.[i];
    if (!s) return item;

    // Labor groups: patch ONLY the id (temp → DB). rate/collapsed/colorIndex
    // are client-authoritative inputs the server echoes back unchanged, so a
    // steady-state save must return the original references (autosave loops
    // otherwise — see the file header). Collapse state lives on these group
    // objects, so no separate id-keyed React state needs remapping.
    const lgMap = serverIdMap(item.laborGroups || [], s.laborGroups || []);
    const laborGroups = mergeArr(item.laborGroups, g => {
      const nid = lgMap.get(g.id);
      return nid !== undefined ? withPatch(g, { id: nid }) : g;
    });

    const materials = mergeArr(item.materials, (mat, mi) => {
      const sm = s.materials?.[mi];
      if (!sm) return mat;
      const fabrication = mergeArr(mat.fabrication, (f, fi) => {
        const sf = sm.fabrication?.[fi];
        if (!sf) return f;
        const lgPatch = (f.laborGroupId != null && lgMap.has(f.laborGroupId))
          ? { laborGroupId: lgMap.get(f.laborGroupId) }
          : {};
        return withPatch(f, { id: sf.id, quantity: sf.quantity, totalCost: sf.totalCost, ...lgPatch });
      });
      const children = mergeArr(mat.children, (c, ci) => {
        const sc = sm.children?.[ci];
        if (!sc) return c;
        const cfab = mergeArr(c.fabrication, (cf, cfi) => {
          const scf = sc.fabrication?.[cfi];
          return scf ? withPatch(cf, { id: scf.id }) : cf;
        });
        const patched = withPatch(c, { id: sc.id });
        if (patched === c && cfab === c.fabrication) return c;
        return { ...patched, ...(cfab !== c.fabrication ? { fabrication: cfab } : {}) };
      });
      const patched = withPatch(mat, {
        id: sm.id,
        totalCost: sm.totalCost,
        stockWeight: sm.stockWeight,
        fabWeight: sm.fabWeight,
      });
      if (patched === mat && fabrication === mat.fabrication && children === mat.children) return mat;
      return {
        ...patched,
        ...(fabrication !== mat.fabrication ? { fabrication } : {}),
        ...(children !== mat.children ? { children } : {}),
      };
    });

    const fabrication = mergeArr(item.fabrication, (f, fi) => {
      const sf = s.fabrication?.[fi];
      return sf ? withPatch(f, { id: sf.id, totalCost: sf.totalCost }) : f;
    });
    const snapshots = mergeArr(item.snapshots, (sn, si) => {
      const ss = s.snapshots?.[si];
      return ss ? withPatch(sn, { id: ss.id }) : sn;
    });
    const recapCosts = mergeRecap(item.recapCosts, s.recapCosts);

    const bgPatch = (item.breakoutGroupId && bgIdMap.has(item.breakoutGroupId))
      ? { breakoutGroupId: bgIdMap.get(item.breakoutGroupId) }
      : {};
    const patched = withPatch(item, { id: s.id, ...bgPatch });

    if (patched === item && materials === item.materials && fabrication === item.fabrication &&
        snapshots === item.snapshots && recapCosts === item.recapCosts &&
        laborGroups === item.laborGroups) {
      return item;
    }
    return {
      ...patched,
      ...(materials !== item.materials ? { materials } : {}),
      ...(fabrication !== item.fabrication ? { fabrication } : {}),
      ...(snapshots !== item.snapshots ? { snapshots } : {}),
      ...(recapCosts !== item.recapCosts ? { recapCosts } : {}),
      ...(laborGroups !== item.laborGroups ? { laborGroups } : {}),
    };
  });
}
