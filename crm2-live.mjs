// Read-only adapter for the existing authenticated bridge subscriptions.
// It never saves records, changes permissions, or persists CRM data locally.
export function snapshotKey(snapshot) {
  return JSON.stringify(snapshot.docs.map(doc => [doc.id, doc.version, doc.updatedAt, doc.updatedBy, doc.data()]));
}

export function createLiveUpdates({db, collections, canApply, apply, status = () => {}, delay = 400,
  setTimer = setTimeout, clearTimer = clearTimeout}) {
  const pending = new Map(), seen = new Map(), unsubs = [], errors = new Map();
  let applyError = null;
  const report = kind => status(errors.size || applyError ? 'error' : kind, applyError || [...errors.values()][0]);
  let timer = null, stopped = false;
  const schedule = ms => {
    if (stopped || timer !== null) return;
    timer = setTimer(() => { timer = null; flush(); }, ms);
  };
  function flush() {
    if (stopped || !pending.size) return;
    if (!canApply()) { report('waiting'); schedule(1200); return; }
    const batch = new Map(pending);
    try {
      apply(batch);
      pending.clear();
      applyError = null;
      report('updated');
    } catch (error) {
      applyError = error;
      report('error');
      schedule(3000);
    }
  }
  for (const collection of collections) {
    const query = db.collection(collection);
    if (typeof query.onSnapshot !== 'function') continue;
    unsubs.push(query.onSnapshot(snapshot => {
      if (stopped) return;
      const recovered = errors.delete(collection);
      if (recovered) report('watching');
      const key = snapshotKey(snapshot);
      if (seen.get(collection) === key) return;
      seen.set(collection, key);
      pending.set(collection, snapshot);
      schedule(delay);
    }, error => { if (!stopped) { errors.set(collection, error); report('error'); } }));
  }
  report(unsubs.length ? 'watching' : 'unavailable');
  return {
    flush,
    stop() { stopped = true; if (timer !== null) clearTimer(timer); unsubs.forEach(unsubscribe => unsubscribe()); pending.clear(); },
    get pending() { return pending.size; }
  };
}
