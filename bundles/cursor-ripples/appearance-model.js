/** Optimistic live preview + debounced, serialized Host-backed Config form writes. */
export function createAppearanceModel(form, initial, normalize, failureMessage) {
  let settings = normalize(initial);
  let pending = {};
  let timer = null;
  let writing = false;
  let disposed = false;
  let error = '';
  let snapshot;
  const listeners = new Set();
  function publish() {
    const state = form.getSnapshot();
    snapshot = { settings, saving: writing || Object.keys(pending).length > 0,
      error, writable: state.writable, loaded: state.status !== 'loading' };
    for (const listener of listeners) listener();
  }
  function accept() {
    const state = form.getSnapshot();
    if (!writing && !Object.keys(pending).length && state.status === 'ready') settings = normalize(state.value);
    publish();
  }
  async function flush() {
    timer = null;
    if (disposed || writing || !Object.keys(pending).length) return;
    const patch = pending;
    pending = {};
    writing = true;
    publish();
    try {
      const ok = await form.mutate(Object.entries(patch).map(([key, value]) => ({ op: 'set', path: [key], value })));
      if (!ok) throw new Error(failureMessage());
      error = '';
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
      // No false "saved": roll back the failed batch to accepted Host state.
      settings = normalize({ ...(form.getSnapshot().value || initial), ...pending });
    } finally {
      writing = false;
      if (disposed) return;
      if (Object.keys(pending).length) timer = setTimeout(flush, 120);
      else if (!error && form.getSnapshot().status === 'ready') settings = normalize(form.getSnapshot().value);
      publish();
    }
  }
  const unsubscribe = form.subscribe(accept);
  accept();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    update(patch) {
      if (disposed || !form.getSnapshot().writable) return;
      const accepted = normalize({ ...settings, ...patch });
      for (const key of Object.keys(patch)) if (key in accepted) pending[key] = accepted[key];
      settings = accepted;
      error = '';
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 220);
      publish();
    },
    reset() { this.update(initial); },
    dispose() {
      // Flush the last deliberate edit on unload, rather than lose a quick close.
      if (timer) clearTimeout(timer);
      if (!writing && Object.keys(pending).length) void flush();
      disposed = true;
      unsubscribe();
      listeners.clear();
    },
  };
}
