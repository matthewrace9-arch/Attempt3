/* Safe localStorage wrapper (private mode / blocked storage never crashes). */
(function () {
  const OB = (window.OB = window.OB || {});
  const memory = {};

  OB.Storage = {
    load(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw == null) return memory[key] !== undefined ? memory[key] : fallback;
        return JSON.parse(raw);
      } catch (e) {
        return memory[key] !== undefined ? memory[key] : fallback;
      }
    },
    save(key, value) {
      memory[key] = value;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* storage unavailable — keep in memory for this session */
      }
    },
    remove(key) {
      delete memory[key];
      try {
        window.localStorage.removeItem(key);
      } catch (e) {}
    },
  };
})();
