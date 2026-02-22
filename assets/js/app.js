/* file: assets/js/app.js
   ✅ FIX cho chị:
   - Lưu nhiều file Topics JSON (Topic Packs) trong IndexedDB
   - Tải 1 lần nhớ mãi
   - Chọn luân phiên học các pack đã import
   - Không lỗi topicActive/board khi import/đổi pack
   - Không có dữ liệu mẫu thừa (chỉ 1 topic trống ở pack mặc định)

   Ghi chú:
   - Topics được lưu kèm packId.
   - Topic.id được "namespacing" theo packId để tránh trùng id giữa các file.
*/

(function () {
  // ---------------- Utils ----------------
  function now() {
    return Date.now();
  }

  function randomInt(max) {
    return Math.floor(Math.random() * max);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function clampInt(v, min, max) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }

  function safeFileBaseName(fileName) {
    const s = String(fileName || "topics").trim();
    const noExt = s.replace(/\.[^/.]+$/, "");
    return noExt || "topics";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.style.display = "none"), 1800);
  }

  window.addEventListener("error", (e) => {
    toast("JS lỗi: " + (e?.message || "unknown"));
  });

  // ---------------- IndexedDB ----------------
  const DB_NAME = "jp_vocab_offline_db_v62";
  const DB_VERSION = 1;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
        if (!db.objectStoreNames.contains("topics")) db.createObjectStore("topics", { keyPath: "id" });
        if (!db.objectStoreNames.contains("vocab")) db.createObjectStore("vocab", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(db, storeName, mode = "readonly") {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function idbGet(db, storeName, key) {
    return new Promise((resolve, reject) => {
      const req = tx(db, storeName, "readonly").get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function idbPut(db, storeName, value) {
    return new Promise((resolve, reject) => {
      const req = tx(db, storeName, "readwrite").put(value);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  function idbDelete(db, storeName, key) {
    return new Promise((resolve, reject) => {
      const req = tx(db, storeName, "readwrite").delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  function idbClear(db, storeName) {
    return new Promise((resolve, reject) => {
      const req = tx(db, storeName, "readwrite").clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  function idbGetAll(db, storeName) {
    return new Promise((resolve, reject) => {
      const req = tx(db, storeName, "readonly").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // ---------------- Schema helpers ----------------
  function normalizeTopicSchema(topic) {
    if (!topic || typeof topic !== "object") return topic;
    topic.id = String(topic.id ?? "").trim() || uid("t");
    topic.packId = String(topic.packId ?? "").trim() || "pack_default";
    topic.name = String(topic.name ?? "").trim();
    topic.icon = String(topic.icon ?? "").trim();
    topic.image = String(topic.image ?? "").trim();
    if (!Array.isArray(topic.labels)) topic.labels = [];
    topic.labels = topic.labels.map((x) => String(x ?? "").trim()).filter((x) => x.length > 0);
    return topic;
  }

  function normalizeVocabSchema(v) {
    if (!v || typeof v !== "object") return v;
    v.id = String(v.id ?? "").trim() || uid("v");
    v.topicId = String(v.topicId ?? "").trim();
    v.jp = String(v.jp ?? "").trim();
    v.kana = String(v.kana ?? "").trim();
    v.meaning = String(v.meaning ?? "").trim();
    v.example = String(v.example ?? "").trim();
    v.hanviet = String(v.hanviet ?? "").trim();
    v.icon = String(v.icon ?? "").trim();
    v.image = String(v.image ?? "").trim();
    return v;
  }

  function normalizeTileSchema(tile) {
    if (!tile || typeof tile !== "object") return tile;

    if (!Array.isArray(tile.vocabIds)) {
      const id = String(tile.vocabId ?? "").trim();
      tile.vocabIds = id ? [id] : [];
      delete tile.vocabId;
    }

    if (!tile.extras || typeof tile.extras !== "object") tile.extras = {};
    tile.extras.showGrammar = Boolean(tile.extras.showGrammar);
    tile.extras.showKanji = Boolean(tile.extras.showKanji);

    if (typeof tile.stage !== "number") tile.stage = 0;
    if (typeof tile.label !== "string") tile.label = "";
    if (typeof tile.revealAt !== "number") tile.revealAt = 0;

    return tile;
  }

  // ---------------- Default data (NO sample content) ----------------
  function defaultPack() {
    return { id: "pack_default", name: "Mặc định", createdAt: now() };
  }

  function defaultTopics() {
    // 1 topic trống để hệ thống không lỗi khi chưa import gì
    return [
      {
        id: "pack_default__t_default",
        packId: "pack_default",
        name: "Chủ đề của chị",
        icon: "📘",
        image: "",
        labels: [],
      },
    ].map(normalizeTopicSchema);
  }

  function defaultVocab() {
    return [];
  }

  function defaultMetaState() {
    return {
      key: "state",
      value: {
        players: [],
        settings: {
          timerSeconds: 10,
          boardSize: 5,
          boardMode: "AUTO",
          boardCols: 10,
          dealMode: "ALL",
          dealK: 10,
          difficulty: 1,
        },
        ui: { historyVisible: false },
        packs: {
          topicPacks: [defaultPack()],
          activeTopicPackId: "pack_default",
        },
        board: { topicIdActive: "pack_default__t_default", tiles: [] },
        dealing: { leaderBag: [], leaderDrawn: [], rounds: [] },
      },
    };
  }

  // ---------------- App state ----------------
  const app = {
    db: null,
    topicsAll: [],
    vocab: [],
    meta: null,
    topicsActive: [],
  };

  function getActivePackId() {
    return String(app.meta?.value?.packs?.activeTopicPackId || "pack_default");
  }

  function getTopicPacks() {
    const packs = app.meta?.value?.packs?.topicPacks;
    return Array.isArray(packs) ? packs : [defaultPack()];
  }

  function setTopicPacks(packs) {
    if (!app.meta.value.packs) app.meta.value.packs = { topicPacks: [defaultPack()], activeTopicPackId: "pack_default" };
    app.meta.value.packs.topicPacks = packs;
  }

  function topicsById() {
    return new Map(app.topicsAll.map((t) => [t.id, t]));
  }

  function vocabById() {
    return new Map(app.vocab.map((v) => [v.id, v]));
  }

  function playerIds() {
    return app.meta.value.players
      .slice()
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => p.id);
  }

  function ensureLeaderBag() {
    const st = app.meta.value;
    const ids = playerIds();

    st.dealing.leaderBag = (st.dealing.leaderBag || []).filter((id) => ids.includes(id));
    st.dealing.leaderDrawn = (st.dealing.leaderDrawn || []).filter((id) => ids.includes(id));

    const known = new Set([...(st.dealing.leaderBag || []), ...(st.dealing.leaderDrawn || [])]);
    const newbies = ids.filter((id) => !known.has(id));

    for (const id of shuffle(newbies)) {
      const pos = randomInt(st.dealing.leaderBag.length + 1);
      st.dealing.leaderBag.splice(pos, 0, id);
    }

    if (ids.length > 0 && st.dealing.leaderBag.length === 0) {
      st.dealing.leaderBag = shuffle(ids);
      st.dealing.leaderDrawn = [];
    }
  }

  function clampMetaSettings() {
    const st = app.meta.value;

    st.settings.timerSeconds = clampInt(st.settings.timerSeconds ?? 10, 1, 120);
    st.settings.boardSize = clampInt(st.settings.boardSize ?? 5, 3, 30);
    st.settings.boardMode = st.settings.boardMode === "SQUARE" ? "SQUARE" : "AUTO";
    st.settings.boardCols = clampInt(st.settings.boardCols ?? 10, 3, 30);
    st.settings.dealMode = st.settings.dealMode === "TOPK" ? "TOPK" : "ALL";
    st.settings.dealK = clampInt(st.settings.dealK ?? 10, 1, 999999);
    st.settings.difficulty = clampInt(st.settings.difficulty ?? 1, 1, 6);

    st.ui = st.ui || { historyVisible: false };
    st.dealing = st.dealing || { leaderBag: [], leaderDrawn: [], rounds: [] };

    // packs
    if (!st.packs) st.packs = { topicPacks: [defaultPack()], activeTopicPackId: "pack_default" };
    if (!Array.isArray(st.packs.topicPacks) || st.packs.topicPacks.length === 0) st.packs.topicPacks = [defaultPack()];
    if (!st.packs.activeTopicPackId) st.packs.activeTopicPackId = "pack_default";

    st.board = st.board || { topicIdActive: "pack_default__t_default", tiles: [] };
  }

  function rebuildActiveTopicsCache() {
    const activePackId = getActivePackId();
    app.topicsActive = app.topicsAll
      .filter((t) => String(t.packId || "pack_default") === activePackId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function ensureTopicActiveValid() {
    const st = app.meta.value;
    rebuildActiveTopicsCache();
    const ids = new Set(app.topicsActive.map((t) => t.id));
    if (!ids.has(st.board.topicIdActive)) {
      st.board.topicIdActive = app.topicsActive[0]?.id || "pack_default__t_default";
    }
  }

  // ---------------- Difficulty / Tiles ----------------
  function getDifficultyConfig() {
    const d = clampInt(app.meta.value.settings.difficulty ?? 1, 1, 6);
    if (d === 1) return { wordsMin: 1, wordsMax: 1, addGrammar: false, addKanji: false, randomAddOns: false };
    if (d === 2) return { wordsMin: 2, wordsMax: 2, addGrammar: false, addKanji: false, randomAddOns: false };
    if (d === 3) return { wordsMin: 3, wordsMax: 3, addGrammar: false, addKanji: false, randomAddOns: false };
    if (d === 4) return { wordsMin: 1, wordsMax: 3, addGrammar: true, addKanji: false, randomAddOns: false };
    if (d === 5) return { wordsMin: 1, wordsMax: 3, addGrammar: false, addKanji: true, randomAddOns: false };
    return { wordsMin: 1, wordsMax: 3, addGrammar: true, addKanji: true, randomAddOns: true };
  }

  function pickExtrasForTile(cfg) {
    if (!cfg.randomAddOns) return { showGrammar: cfg.addGrammar, showKanji: cfg.addKanji };
    const r = randomInt(4);
    if (r === 0) return { showGrammar: false, showKanji: false };
    if (r === 1) return { showGrammar: true, showKanji: false };
    if (r === 2) return { showGrammar: false, showKanji: true };
    return { showGrammar: true, showKanji: true };
  }

  function getActiveTopicVocab() {
    const st = app.meta.value;
    const tid = st.board.topicIdActive;
    return app.vocab.filter((v) => v.topicId === tid);
  }

  function getBoardCols() {
    const st = app.meta.value;
    if (st.settings.boardMode === "SQUARE") return clampInt(st.settings.boardSize ?? 5, 3, 30);
    return clampInt(st.settings.boardCols ?? 10, 3, 30);
  }

  function getBoardTileCount() {
    const st = app.meta.value;
    if (st.settings.boardMode === "SQUARE") {
      const n = clampInt(st.settings.boardSize ?? 5, 3, 30);
      return n * n;
    }

    const cfg = getDifficultyConfig();
    const vocabCount = getActiveTopicVocab().length;
    const avgWords = (cfg.wordsMin + cfg.wordsMax) / 2;
    const estTiles = vocabCount > 0 ? Math.ceil(vocabCount / Math.max(1, avgWords)) : 25;

    const cols = getBoardCols();
    const rows = Math.max(3, Math.ceil(estTiles / cols));
    return cols * rows;
  }

  function assignTileLabelsForActiveTopic(tiles) {
    const st = app.meta.value;
    const tMap = topicsById();
    const topic = normalizeTopicSchema(tMap.get(st.board.topicIdActive));
    const labels = shuffle((topic?.labels || []).slice());
    let i = 0;

    for (const tile of tiles) {
      normalizeTileSchema(tile);
      tile.label = labels.length ? labels[i % labels.length] : "";
      i++;
    }
    return tiles;
  }

  function buildTiles() {
    const cfg = getDifficultyConfig();
    const vocabList = shuffle(getActiveTopicVocab());
    const tileCount = getBoardTileCount();

    let cursor = 0;
    const tiles = [];

    for (let i = 0; i < tileCount; i++) {
      const wordsThis = clampInt(
        randomInt(cfg.wordsMax - cfg.wordsMin + 1) + cfg.wordsMin,
        cfg.wordsMin,
        cfg.wordsMax,
      );

      const vocabIds = [];
      for (let k = 0; k < wordsThis; k++) {
        if (vocabList.length === 0) break;
        vocabIds.push(vocabList[cursor % vocabList.length].id);
        cursor++;
      }

      tiles.push(
        normalizeTileSchema({
          stage: 0,
          label: "",
          vocabIds,
          extras: pickExtrasForTile(cfg),
          revealAt: 0,
        }),
      );
    }

    assignTileLabelsForActiveTopic(tiles);
    return tiles;
  }

  async function ensureBoard() {
    const st = app.meta.value;
    if (!Array.isArray(st.board.tiles) || st.board.tiles.length === 0) {
      st.board.tiles = buildTiles();
      await persistMeta();
    } else {
      st.board.tiles.forEach((t) => normalizeTileSchema(t));
      const need = st.board.tiles.some((t) => !String(t.label || "").trim());
      if (need) {
        assignTileLabelsForActiveTopic(st.board.tiles);
        await persistMeta();
      }
    }
  }

  async function persistMeta() {
    await idbPut(app.db, "meta", app.meta);
  }

  async function reloadTopicsVocab() {
    app.topicsAll = (await idbGetAll(app.db, "topics"))
      .map(normalizeTopicSchema)
      .sort((a, b) => a.name.localeCompare(b.name));
    app.vocab = (await idbGetAll(app.db, "vocab")).map(normalizeVocabSchema);
    rebuildActiveTopicsCache();
  }

  // ---------------- CRUD: Topics ----------------
  async function addTopic(name, icon, image) {
    const n = String(name ?? "").trim();
    if (!n) return toast("Tên chủ đề không được trống");

    const packId = getActivePackId();
    const topic = normalizeTopicSchema({
      id: `${packId}__${uid("t")}`,
      packId,
      name: n,
      icon: String(icon ?? "").trim(),
      image: String(image ?? "").trim(),
      labels: [],
    });

    await idbPut(app.db, "topics", topic);
    await reloadTopicsVocab();

    ensureTopicActiveValid();
    toast("Đã thêm chủ đề");
  }

  async function deleteTopic(id) {
    const tid = String(id ?? "").trim();
    if (!tid) return;

    // không cho xóa nếu pack này còn đúng 1 topic
    rebuildActiveTopicsCache();
    if (app.topicsActive.length <= 1) return toast("Pack này phải có ít nhất 1 chủ đề");

    await idbDelete(app.db, "topics", tid);
    await reloadTopicsVocab();

    // nếu vocab đang trỏ vào topic bị xóa -> bỏ trỏ (để tránh lỗi)
    for (const v of app.vocab) {
      if (v.topicId === tid) {
        v.topicId = "";
        await idbPut(app.db, "vocab", v);
      }
    }
    await reloadTopicsVocab();

    ensureTopicActiveValid();
    app.meta.value.board.tiles = buildTiles();
    await persistMeta();

    toast("Đã xóa chủ đề");
  }

  // ---------------- CRUD: Vocab ----------------
  async function addVocab(payload) {
    const jp = String(payload?.jp ?? "").trim();
    const meaning = String(payload?.meaning ?? "").trim();
    const topicId = String(payload?.topicId ?? "").trim();

    if (!jp) return toast("JP không được trống");
    if (!meaning) return toast("Nghĩa không được trống");
    if (!topicId) return toast("Chưa chọn chủ đề");

    const v = normalizeVocabSchema({
      id: uid("v"),
      topicId,
      jp,
      kana: String(payload?.kana ?? "").trim(),
      meaning,
      example: String(payload?.example ?? "").trim(),
      hanviet: String(payload?.hanviet ?? "").trim(),
      icon: String(payload?.icon ?? "").trim(),
      image: String(payload?.image ?? "").trim(),
    });

    await idbPut(app.db, "vocab", v);
    await reloadTopicsVocab();

    app.meta.value.board.tiles = buildTiles();
    await persistMeta();

    toast("Đã thêm từ");
  }

  async function deleteVocab(id) {
    const vid = String(id ?? "").trim();
    if (!vid) return;

    await idbDelete(app.db, "vocab", vid);
    await reloadTopicsVocab();

    app.meta.value.board.tiles = buildTiles();
    await persistMeta();
    toast("Đã xóa từ");
  }

  // ---------------- Packs (NEW) ----------------
  function ensurePackExists(packId) {
    const packs = getTopicPacks();
    if (!packs.some((p) => p.id === packId)) {
      packs.push({ id: packId, name: "Bộ mới", createdAt: now() });
      setTopicPacks(packs);
    }
  }

  async function setActivePack(packId) {
    const st = app.meta.value;
    const pid = String(packId || "pack_default");
    ensurePackExists(pid);
    st.packs.activeTopicPackId = pid;

    await reloadTopicsVocab();
    ensureTopicActiveValid();

    st.board.tiles = buildTiles();
    await persistMeta();

    toast("Đã đổi bộ chủ đề");
  }

  async function deletePack(packId) {
    const pid = String(packId || "").trim();
    if (!pid) return;
    if (pid === "pack_default") return toast("Không xóa pack Mặc định");

    // xóa topics thuộc pack
    const allTopics = await idbGetAll(app.db, "topics");
    const toDelTopicIds = allTopics
      .map(normalizeTopicSchema)
      .filter((t) => t.packId === pid)
      .map((t) => t.id);

    for (const id of toDelTopicIds) {
      await idbDelete(app.db, "topics", id);
    }

    // xóa vocab thuộc các topic của pack (topicId bắt đầu bằng `${pid}__`)
    const allVocab = await idbGetAll(app.db, "vocab");
    for (const v0 of allVocab.map(normalizeVocabSchema)) {
      if (String(v0.topicId || "").startsWith(pid + "__")) {
        await idbDelete(app.db, "vocab", v0.id);
      }
    }

    // remove pack from meta
    const packs = getTopicPacks().filter((p) => p.id !== pid);
    setTopicPacks(packs);

    // nếu đang active pack đó -> chuyển về default
    if (getActivePackId() === pid) {
      app.meta.value.packs.activeTopicPackId = "pack_default";
    }

    await reloadTopicsVocab();
    ensureTopicActiveValid();
    app.meta.value.board.tiles = buildTiles();
    await persistMeta();

    toast("Đã xóa bộ chủ đề");
  }

  // ---------------- Import Topics (FIX) ----------------
  async function importTopicsAsPack(topicsArr, packName) {
    if (!Array.isArray(topicsArr)) throw new Error("File topics không đúng format");

    const newPackId = uid("pack");
    const cleanName = String(packName || "Bộ chủ đề").trim() || "Bộ chủ đề";

    // lưu pack vào meta
    const packs = getTopicPacks();
    packs.push({ id: newPackId, name: cleanName, createdAt: now() });
    setTopicPacks(packs);

    // chuẩn hóa topics và namespace id để không đụng
    // mapping: oldId -> newId
    const idMap = new Map();

    for (const raw of topicsArr) {
      const oldId = String(raw?.id ?? "").trim() || uid("t");
      const newId = `${newPackId}__${oldId}`;
      idMap.set(oldId, newId);
    }

    // ghi vào DB
    for (const raw of topicsArr) {
      const oldId = String(raw?.id ?? "").trim() || uid("t");
      const topic = normalizeTopicSchema({
        id: idMap.get(oldId) || `${newPackId}__${uid("t")}`,
        packId: newPackId,
        name: String(raw?.name ?? "").trim(),
        icon: String(raw?.icon ?? "").trim(),
        image: String(raw?.image ?? "").trim(),
        labels: Array.isArray(raw?.labels) ? raw.labels : [],
      });

      if (!topic.name) continue;
      await idbPut(app.db, "topics", topic);
    }

    // set active pack sang pack mới để chị “check” ngay
    await persistMeta();
    await setActivePack(newPackId);
  }

  // ---------------- Players / Dealing (giữ như cũ) ----------------
  async function addPlayer(name) {
    const n = String(name ?? "").trim();
    if (!n) return toast("Tên người chơi không được trống");

    app.meta.value.players.push({
      id: uid("p"),
      name: n,
      joinedAt: now(),
      pinned: false,
    });

    ensureLeaderBag();
    await persistMeta();
    toast("Đã thêm người chơi");
  }

  async function togglePinPlayer(pid) {
    const p = app.meta.value.players.find((x) => x.id === pid);
    if (!p) return;
    p.pinned = !p.pinned;
    await persistMeta();
  }

  async function deletePlayer(pid) {
    app.meta.value.players = app.meta.value.players.filter((p) => p.id !== pid);
    ensureLeaderBag();
    await persistMeta();
    toast("Đã xóa người chơi");
  }

  function latestRound() {
    const rounds = app.meta.value.dealing.rounds || [];
    return rounds.length ? rounds[0] : null;
  }

  function cardLabel(card) {
    if (!card) return "-";
    if (card.kind === "LEADER") return "3♣";
    if (card.kind === "NUM") return String(card.value);
    return "-";
  }

  function getMaxNumberInRound(round) {
    if (!round) return null;
    const vals = Object.values(round.assignments || {})
      .filter((c) => c && c.kind === "NUM")
      .map((c) => c.value);
    if (!vals.length) return null;
    return Math.max(...vals);
  }

  async function dealTickets() {
    const st = app.meta.value;
    const players = st.players.slice().sort((a, b) => a.joinedAt - b.joinedAt);
    if (players.length === 0) return toast("Chưa có người chơi");

    ensureLeaderBag();

    let leaderPlayerId = st.dealing.leaderBag.shift();
    if (!leaderPlayerId) {
      ensureLeaderBag();
      leaderPlayerId = st.dealing.leaderBag.shift();
    }
    if (!leaderPlayerId) return toast("Không chọn được leader");

    st.dealing.leaderDrawn.push(leaderPlayerId);

    const nonLeader = players.filter((p) => p.id !== leaderPlayerId);
    const assignments = {};
    assignments[leaderPlayerId] = { kind: "LEADER" };

    const dealMode = st.settings.dealMode === "TOPK" ? "TOPK" : "ALL";
    const K = clampInt(st.settings.dealK ?? 10, 1, 999999);

    let receivers = nonLeader;
    if (dealMode === "TOPK") receivers = nonLeader.slice(0, Math.min(K, nonLeader.length));

    const nums = shuffle(Array.from({ length: receivers.length }, (_, i) => i + 1));
    receivers.forEach((p, idx) => {
      assignments[p.id] = { kind: "NUM", value: nums[idx] };
    });

    const prevRounds = st.dealing.rounds || [];
    const roundNo = prevRounds.length ? prevRounds[0].roundNo + 1 : 1;

    const round = {
      roundNo,
      createdAt: now(),
      leaderPlayerId,
      assignments,
    };

    st.dealing.rounds = [round, ...prevRounds].slice(0, 30);

    await persistMeta();
    toast(`Đã phát phiếu vòng #${roundNo}`);
  }

  // ---------------- Board actions ----------------
  async function newBoard() {
    app.meta.value.board.tiles = buildTiles();
    await persistMeta();
  }

  function msLeft(tile) {
    if (!tile.revealAt) return 0;
    return Math.max(0, tile.revealAt - now());
  }

  async function onTileClick(tileIndex) {
    const st = app.meta.value;
    const tiles = st.board.tiles || [];
    const tile = tiles[tileIndex];
    if (!tile) return;

    normalizeTileSchema(tile);

    if (tile.stage === 0) {
      tile.stage = 1;
      tile.revealAt = now() + clampInt(st.settings.timerSeconds ?? 10, 1, 120) * 1000;
      await persistMeta();
      renderTiles();
      return;
    }

    if (tile.stage === 1) {
      tile.stage = 2;
      await persistMeta();
      renderTiles();
    }
  }

  // ---------------- UI: Panels toggle tabs ----------------
  const PANEL_IDS = ["panelSettings", "panelTopics", "panelVocab", "panelIO"];
  const PANEL_BY_BTN = new Map([
    ["btnOpenSettings", "panelSettings"],
    ["btnOpenTopics", "panelTopics"],
    ["btnOpenVocab", "panelVocab"],
    ["btnOpenIO", "panelIO"],
  ]);

  function setActiveTab(panelIdOrNull) {
    for (const [btnId, pid] of PANEL_BY_BTN.entries()) {
      const btn = document.getElementById(btnId);
      if (!btn) continue;
      btn.classList.toggle("active", panelIdOrNull === pid);
    }
  }

  function hideAllPanels() {
    PANEL_IDS.forEach((id) => document.getElementById(id)?.classList.add("hidden"));
    setActiveTab(null);
  }

  function togglePanel(panelId) {
    const el = document.getElementById(panelId);
    if (!el) return;

    const isHidden = el.classList.contains("hidden");
    hideAllPanels();

    if (isHidden) {
      el.classList.remove("hidden");
      setActiveTab(panelId);
      document.getElementById("panelStackTop")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function setHistoryVisible(visible) {
    app.meta.value.ui.historyVisible = Boolean(visible);
    await persistMeta();
    renderHeader();
    renderRounds();
  }

  // ---------------- DOM elements ----------------
  const elTopicActive = document.getElementById("topicActive");
  const elTimerLabel = document.getElementById("timerLabel");
  const elVocabCount = document.getElementById("vocabCount");
  const elTopicCount = document.getElementById("topicCount");
  const elPlayerCount = document.getElementById("playerCount");
  const elDifficultyLabel = document.getElementById("difficultyLabel");

  const elTilesBox = document.getElementById("tilesBox");
  const elPlayersBox = document.getElementById("playersBox");
  const elShowingCount = document.getElementById("showingCount");
  const elMaxNumberLabel = document.getElementById("maxNumberLabel");
  const elCurrentCall = document.getElementById("currentCall");
  const elRoundsWrap = document.getElementById("roundsWrap");
  const elRoundsBox = document.getElementById("roundsBox");

  const elTimerInput = document.getElementById("timerInput");
  const elBoardModeSelect = document.getElementById("boardModeSelect");
  const elBoardSizeInput = document.getElementById("boardSizeInput");
  const elBoardSizeLabel = document.getElementById("boardSizeLabel");
  const elBoardSizeHint = document.getElementById("boardSizeHint");
  const elDealMode = document.getElementById("dealMode");
  const elDealK = document.getElementById("dealK");
  const elDifficultySelect = document.getElementById("difficultySelect");

  const elPlayerName = document.getElementById("playerName");
  const elPlayerSearch = document.getElementById("playerSearch");

  const elTopicsTable = document.getElementById("topicsTable");
  const elTopicName = document.getElementById("topicName");
  const elTopicIcon = document.getElementById("topicIcon");
  const elTopicImage = document.getElementById("topicImage");

  const elVocabTopic = document.getElementById("vocabTopic");
  const elVocabJp = document.getElementById("vocabJp");
  const elVocabKana = document.getElementById("vocabKana");
  const elVocabMeaning = document.getElementById("vocabMeaning");
  const elVocabExample = document.getElementById("vocabExample");
  const elVocabHanviet = document.getElementById("vocabHanviet");
  const elVocabIcon = document.getElementById("vocabIcon");
  const elVocabImage = document.getElementById("vocabImage");
  const elVocabSearch = document.getElementById("vocabSearch");
  const elVocabTable = document.getElementById("vocabTable");

  const elJsonFile = document.getElementById("jsonFile");
  const elTopicsFile = document.getElementById("topicsFile");
  const elVocabFile = document.getElementById("vocabFile");
  const elVocabImportMode = document.getElementById("vocabImportMode");

  // ---------------- Render helpers ----------------
  function syncBoardSizeUi() {
    const st = app.meta.value;
    if (st.settings.boardMode === "AUTO") {
      elBoardSizeLabel.textContent = "Kích thước bảng (AUTO)";
      elBoardSizeHint.textContent = "AUTO: đây là số cột hiển thị.";
      elBoardSizeInput.value = String(st.settings.boardCols ?? 10);
    } else {
      elBoardSizeLabel.textContent = "Kích thước bảng (SQUARE)";
      elBoardSizeHint.textContent = "SQUARE: N x N.";
      elBoardSizeInput.value = String(st.settings.boardSize ?? 5);
    }
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  // ---------------- Pack switch UI (auto inject into panelIO) ----------------
  function ensurePackUi() {
    const panelIO = document.getElementById("panelIO");
    if (!panelIO) return;

    if (document.getElementById("topicPackSelect")) return;

    const marker = elTopicsFile?.parentElement?.parentElement; // gần khối topics import
    const host = marker ? marker.parentElement : panelIO;

    const wrap = document.createElement("div");
    wrap.style.marginTop = "10px";
    wrap.innerHTML = `
      <hr />
      <div class="panelHeader">
        <h3 style="margin:0;">Bộ chủ đề (đã tải lên)</h3>
        <span class="badge" id="packCountBadge">0</span>
      </div>
      <div class="hint">Chị tải Topics JSON nhiều lần, mỗi file sẽ thành 1 “Bộ”. Chọn bộ để học luân phiên.</div>
      <div class="twoCols" style="margin-top:10px;">
        <div>
          <div class="small">Chọn bộ chủ đề</div>
          <select class="select" id="topicPackSelect"></select>
        </div>
        <div class="flex" style="align-self:end; justify-content:flex-end;">
          <button class="btn primary" id="btnUsePack">Dùng bộ này</button>
          <button class="btn danger" id="btnDeletePack">Xóa bộ này</button>
        </div>
      </div>
    `;

    host.appendChild(wrap);

    document.getElementById("btnUsePack").addEventListener("click", async () => {
      const sel = document.getElementById("topicPackSelect");
      await setActivePack(sel.value);
      renderAll();
    });

    document.getElementById("btnDeletePack").addEventListener("click", async () => {
      const sel = document.getElementById("topicPackSelect");
      const pid = sel.value;
      if (pid === "pack_default") return toast("Không xóa pack Mặc định");
      await deletePack(pid);
      renderAll();
    });
  }

  function renderPackSelect() {
    const sel = document.getElementById("topicPackSelect");
    const badge = document.getElementById("packCountBadge");
    if (!sel) return;

    const packs = getTopicPacks();
    if (badge) badge.textContent = String(packs.length);

    sel.innerHTML = "";
    const frag = document.createDocumentFragment();

    for (const p of packs.slice().sort((a, b) => a.createdAt - b.createdAt)) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || p.id;
      frag.appendChild(opt);
    }

    sel.appendChild(frag);
    sel.value = getActivePackId();
  }

  // ---------------- Render ----------------
  function renderHeader() {
    const st = app.meta.value;
    const tMap = topicsById();
    const topic = tMap.get(st.board.topicIdActive);
    const activePack = getTopicPacks().find((p) => p.id === getActivePackId());

    elTopicActive.textContent = topic
      ? `${topic.icon ? topic.icon + " " : ""}${topic.name}${activePack?.name ? " — " + activePack.name : ""}`
      : "-";

    elTimerLabel.textContent = String(st.settings.timerSeconds ?? 10);
    elVocabCount.textContent = String(app.vocab.length);

    // topicCount = số topic của pack đang dùng (dễ hiểu cho chị)
    elTopicCount.textContent = String(app.topicsActive.length);

    elPlayerCount.textContent = String(st.players.length);
    elDifficultyLabel.textContent = String(st.settings.difficulty ?? 1);

    elTimerInput.value = String(st.settings.timerSeconds);
    elBoardModeSelect.value = st.settings.boardMode;
    syncBoardSizeUi();

    elDealMode.value = st.settings.dealMode;
    elDealK.value = String(st.settings.dealK);
    elDifficultySelect.value = String(st.settings.difficulty ?? 1);

    const round = latestRound();
    const maxNum = getMaxNumberInRound(round);
    elMaxNumberLabel.textContent = maxNum === null ? "-" : String(maxNum);

    elRoundsWrap.classList.toggle("hidden", !st.ui.historyVisible);
    document.getElementById("btnToggleHistory").textContent = st.ui.historyVisible ? "Ẩn phiếu" : "Check phiếu";
    document.getElementById("btnHideHistoryInline").classList.toggle("hidden", !st.ui.historyVisible);
  }

  function renderTopicSelect() {
    elVocabTopic.innerHTML = "";
    const frag = document.createDocumentFragment();

    for (const t of app.topicsActive) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = `${t.icon ? t.icon + " " : ""}${t.name}`;
      frag.appendChild(opt);
    }

    elVocabTopic.appendChild(frag);
    elVocabTopic.value = app.meta.value.board.topicIdActive;
  }

  function renderTopicsTable() {
    const rows = app.topicsActive
      .map(
        (t) => `
        <tr>
          <td>${escapeHtml(t.name)}</td>
          <td>${escapeHtml(t.icon || "")}</td>
          <td class="mono">${escapeHtml(t.image || "")}</td>
          <td>
            <button class="btn" data-act="useTopic" data-id="${t.id}">Dùng</button>
            <button class="btn danger" data-act="delTopic" data-id="${t.id}">Xóa</button>
          </td>
        </tr>
      `,
      )
      .join("");

    elTopicsTable.innerHTML = `
      <table class="table">
        <thead><tr><th>Tên</th><th>Icon</th><th>Ảnh</th><th>Hành động</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="small">Pack này chưa có chủ đề.</td></tr>`}</tbody>
      </table>
    `;

    elTopicsTable.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const act = btn.getAttribute("data-act");
        const id = btn.getAttribute("data-id");

        if (act === "useTopic") {
          app.meta.value.board.topicIdActive = id;
          app.meta.value.board.tiles = buildTiles();
          await persistMeta();
          renderAll();
          return;
        }

        if (act === "delTopic") {
          await deleteTopic(id);
          renderAll();
        }
      });
    });
  }

  function renderVocabTable() {
    const q = (elVocabSearch.value || "").trim().toLowerCase();
    const tMap = topicsById();

    const activeTopicIds = new Set(app.topicsActive.map((t) => t.id));

    const list = app.vocab
      .map((v) => ({ v, topic: tMap.get(v.topicId) }))
      .filter((x) => activeTopicIds.has(x.v.topicId)) // chỉ hiển thị vocab thuộc pack đang học
      .filter((x) => {
        if (!q) return true;
        const s = `${x.v.jp} ${x.v.meaning} ${x.topic?.name || ""} ${x.v.kana || ""}`.toLowerCase();
        return s.includes(q);
      })
      .slice(0, 4000);

    const rows = list
      .map(
        ({ v, topic }) => `
        <tr>
          <td>${escapeHtml(topic?.name || "-")}</td>
          <td><b>${escapeHtml(v.jp)}</b><div class="small">${escapeHtml(v.kana || "")}</div></td>
          <td>${escapeHtml(v.meaning)}</td>
          <td class="small">${escapeHtml(v.example || "")}</td>
          <td>${escapeHtml(v.icon || "")}<div class="mono">${escapeHtml(v.image || "")}</div></td>
          <td><button class="btn danger" data-act="delVocab" data-id="${v.id}">Xóa</button></td>
        </tr>
      `,
      )
      .join("");

    elVocabTable.innerHTML = `
      <table class="table">
        <thead><tr><th>Topic</th><th>JP</th><th>Nghĩa</th><th>Ví dụ</th><th>Cover</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="small">Pack này chưa có từ.</td></tr>`}</tbody>
      </table>
      <div class="hint">Hiển thị tối đa 4000 dòng để tránh lag.</div>
    `;

    elVocabTable.querySelectorAll("button[data-act='delVocab']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        await deleteVocab(id);
        renderAll();
      });
    });
  }

  function renderCoverForVocabOrTopic(v, topic) {
    const wrap = document.createElement("div");
    wrap.className = "flex";
    wrap.style.gap = "6px";
    wrap.style.alignItems = "center";

    const imgSrc = (v?.image || "").trim() || (topic?.image || "").trim();
    if (imgSrc) {
      const img = document.createElement("img");
      img.src = imgSrc;
      img.alt = "";
      img.className = "coverImg";
      wrap.appendChild(img);
      return wrap;
    }

    const icon = (v?.icon || "").trim() || (topic?.icon || "").trim();
    const span = document.createElement("div");
    span.className = "bigIcon";
    span.textContent = icon || "📌";
    wrap.appendChild(span);
    return wrap;
  }

  function renderTileStage0(mid, topic, vocabFirst, tile) {
    mid.appendChild(renderCoverForVocabOrTopic(vocabFirst, topic));
    const t = document.createElement("div");
    t.className = "small";
    const text = (tile?.label || "").trim() || "";
    t.innerHTML = text ? `${escapeHtml(text)}` : "";
    mid.appendChild(t);
  }

  function renderTileStage1(mid, vocabs) {
    const lines = (vocabs || [])
      .map((v) => `<div style="font-size:20px;font-weight:700;line-height:1.2;">${escapeHtml(v?.jp || "?")}</div>`)
      .join(`<div style="height:10px"></div>`);
    mid.innerHTML = lines || `<div style="font-size:20px;font-weight:700;">?</div>`;
  }

  function renderTileStage2(mid, vocabs, extras) {
  const exEnabled = Boolean(extras?.showGrammar);

  const blocks = (vocabs || []).map((v) => {
    const kanaLine = v?.kana
      ? `<div class="small">Cách đọc: ${escapeHtml(v.kana)}</div>`
      : "";

    const hanLine = v?.hanviet
      ? `<div class="small">Hán việt: ${escapeHtml(v.hanviet)}</div>`
      : "";

    const meaningLine = v?.meaning
      ? `<div style="margin-top:6px;"><b>Nghĩa:</b> ${escapeHtml(v.meaning)}</div>`
      : "";

    const exampleLine =
      exEnabled && v?.example
        ? `<div class="small" style="margin-top:6px;"><b>Ngữ pháp/Ví dụ:</b> ${escapeHtml(v.example)}</div>`
        : "";

    return `
      <div>
        <div style="font-size:20px;font-weight:700;line-height:1.2;">
          ${escapeHtml(v?.jp || "?")}
        </div>
        ${kanaLine}
        ${hanLine}
        ${meaningLine}
        ${exampleLine}
      </div>
    `;
  });

  mid.innerHTML = blocks.join(
    `<div style="height:10px;border-top:1px solid #eee;margin:10px 0;"></div>`
  );
}

  function renderTiles() {
    const st = app.meta.value;
    elTilesBox.innerHTML = "";
    elTilesBox.style.gridTemplateColumns = `repeat(${getBoardCols()}, minmax(0, 1fr))`;

    const tMap = topicsById();
    const vMap = vocabById();
    const topic = tMap.get(st.board.topicIdActive);

    const frag = document.createDocumentFragment();

    st.board.tiles.forEach((rawTile, idx) => {
      const tile = normalizeTileSchema(rawTile);
      const vocabs = (tile.vocabIds || []).map((id) => vMap.get(id) || null).filter(Boolean);

      const div = document.createElement("div");
      div.className = "tile" + (tile.stage === 0 ? " locked" : "");
      div.tabIndex = 0;

      const top = document.createElement("div");
      top.className = "flex";
      top.style.justifyContent = "space-between";

      const left = document.createElement("div");
      left.className = "small";
      left.textContent = `#${idx + 1}`;

      const right = document.createElement("div");
      right.className = "small";
      const remain = msLeft(tile);
      right.textContent = tile.stage === 1 && remain > 0 ? `${Math.ceil(remain / 1000)}s` : "";

      top.appendChild(left);
      top.appendChild(right);

      const mid = document.createElement("div");
      mid.style.marginTop = "8px";

      if (tile.stage === 0) renderTileStage0(mid, topic, vocabs[0], tile);
      else if (tile.stage === 1) renderTileStage1(mid, vocabs);
      else renderTileStage2(mid, vocabs, tile.extras);

      div.appendChild(top);
      div.appendChild(mid);

      div.addEventListener("click", async () => onTileClick(idx));
      div.addEventListener("keydown", async (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          await onTileClick(idx);
        }
      });

      frag.appendChild(div);
    });

    elTilesBox.appendChild(frag);
  }

  function renderCurrentCall() {
    elCurrentCall.innerHTML = "";

    const round = latestRound();
    if (!round) {
      elCurrentCall.appendChild(
        Object.assign(document.createElement("div"), { className: "small", textContent: "Chưa có vòng nào." }),
      );
      return;
    }

    const st = app.meta.value;
    const playersById = new Map(st.players.map((p) => [p.id, p]));
    const leader = playersById.get(round.leaderPlayerId);

    const leaderChip = document.createElement("span");
    leaderChip.className = "badge";
    leaderChip.innerHTML = `3♣: <b>${escapeHtml(leader?.name || "?")}</b>`;
    elCurrentCall.appendChild(leaderChip);

    const nums = Object.entries(round.assignments || {})
      .filter(([_, c]) => c && c.kind === "NUM")
      .map(([pid, c]) => ({ pid, value: c.value }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 20);

    nums.forEach((x) => {
      const p = playersById.get(x.pid);
      const chip = document.createElement("span");
      chip.className = "badge";
      chip.textContent = `${x.value}: ${p?.name || "?"}`;
      elCurrentCall.appendChild(chip);
    });
  }

  function renderPlayers() {
  const st = app.meta.value;
  const q = (elPlayerSearch.value || "").trim().toLowerCase();
  const round = latestRound();
  const assignments = round?.assignments || {};

  // helper lấy "thứ tự phiếu" để sort
  function getSortKey(playerId) {
    const card = assignments[playerId];
    if (!card) return { group: 3, num: 999999 }; // chưa có phiếu -> cuối
    if (card.kind === "LEADER") return { group: 0, num: 0 }; // leader -> đầu
    if (card.kind === "NUM") return { group: 1, num: Number(card.value) || 999999 }; // số 1..N
    return { group: 2, num: 999999 };
  }

  const list = st.players
    .slice()
    .map((p) => ({ p, card: assignments[p.id] || null }))
    .filter(({ p, card }) => {
      if (!q) return true;
      const name = String(p.name || "").toLowerCase();
      const cardStr = card ? cardLabel(card).toLowerCase() : "-";
      const numStr = card && card.kind === "NUM" ? String(card.value) : "";
      const special = card && card.kind === "LEADER" ? "3bich 3♣ leader" : "";
      return `${name} ${cardStr} ${numStr} ${special}`.includes(q);
    })
    .sort((a, b) => {
      // ✅ Sort theo phiếu sau mỗi lần phát
      const ka = getSortKey(a.p.id);
      const kb = getSortKey(b.p.id);

      if (ka.group !== kb.group) return ka.group - kb.group;
      if (ka.num !== kb.num) return ka.num - kb.num;

      // cùng nhóm + cùng số -> fallback theo tên/giờ vào cho ổn định
      const an = String(a.p.name || "").toLowerCase();
      const bn = String(b.p.name || "").toLowerCase();
      if (an !== bn) return an.localeCompare(bn);

      return (a.p.joinedAt || 0) - (b.p.joinedAt || 0);
    });

  elPlayersBox.innerHTML = "";
  if (!list.length) {
    elPlayersBox.appendChild(
      Object.assign(document.createElement("div"), {
        className: "small",
        textContent: "Không có người chơi phù hợp.",
      }),
    );
    elShowingCount.textContent = `0/${st.players.length}`;
    return;
  }

  const frag = document.createDocumentFragment();

  list.forEach(({ p, card }) => {
    const row = document.createElement("div");
    row.className = "playerRow" + (p.pinned ? " pinned" : "");

    const left = document.createElement("div");
    left.innerHTML = `<b>${escapeHtml(p.name)}</b><div class="small">Phiếu: ${escapeHtml(cardLabel(card))}</div>`;

    const right = document.createElement("div");
    right.className = "flex";
    right.style.justifyContent = "flex-end";

    const btnPin = document.createElement("button");
    btnPin.className = "btn";
    btnPin.textContent = p.pinned ? "Bỏ ghim" : "Ghim";
    btnPin.addEventListener("click", async () => {
      await togglePinPlayer(p.id);
      renderPlayers();
    });

    const btnDel = document.createElement("button");
    btnDel.className = "btn danger";
    btnDel.textContent = "Xóa";
    btnDel.addEventListener("click", async () => {
      await deletePlayer(p.id);
      renderAll();
    });

    right.appendChild(btnPin);
    right.appendChild(btnDel);

    row.appendChild(left);
    row.appendChild(right);
    frag.appendChild(row);
  });

  elPlayersBox.appendChild(frag);
  elShowingCount.textContent = `${list.length}/${st.players.length}`;
}

  function renderRounds() {
    const st = app.meta.value;
    if (!st.ui.historyVisible) return;

    elRoundsBox.innerHTML = "";
    const rounds = st.dealing.rounds || [];
    if (!rounds.length) {
      elRoundsBox.appendChild(Object.assign(document.createElement("div"), { className: "small", textContent: "Chưa có vòng nào." }));
      return;
    }

    const playersById = new Map(st.players.map((p) => [p.id, p]));

    rounds.slice(0, 30).forEach((r) => {
      const wrap = document.createElement("div");
      wrap.className = "card";
      wrap.style.border = "1px solid #eee";

      const leaderName = playersById.get(r.leaderPlayerId)?.name || "?";
      const maxNum = getMaxNumberInRound(r);

      const chips = [];
      chips.push(`<span class="badge">3♣: ${escapeHtml(leaderName)}</span>`);

      const nums = Object.entries(r.assignments || {})
        .filter(([_, c]) => c && c.kind === "NUM")
        .map(([pid, c]) => ({ pid, value: c.value }))
        .sort((a, b) => a.value - b.value)
        .slice(0, 25);

      nums.forEach((x) => {
        const p = playersById.get(x.pid);
        chips.push(`<span class="badge">${x.value}: ${escapeHtml(p?.name || "?")}</span>`);
      });

      const totalNums = Object.values(r.assignments || {}).filter((c) => c && c.kind === "NUM").length;
      if (totalNums > 25) chips.push(`<span class="badge">... +${totalNums - 25}</span>`);

      wrap.innerHTML = `
        <div class="flex" style="justify-content:space-between;">
          <div><b>Vòng #${r.roundNo}</b> <span class="small">(${formatTime(r.createdAt)})</span></div>
          <div class="badge">Leader: ${escapeHtml(leaderName)} — 3♣</div>
        </div>
        <div class="hint">Max số: <b>${maxNum ?? "-"}</b></div>
        <div class="flex" style="margin-top:8px;">${chips.join("")}</div>
      `;

      elRoundsBox.appendChild(wrap);
    });
  }

  function renderAll() {
    ensurePackUi();
    renderPackSelect();

    renderHeader();
    renderTopicSelect();
    renderTopicsTable();
    renderVocabTable();
    renderCurrentCall();
    renderPlayers();
    renderRounds();
    renderTiles();
  }

  // ---------------- Export / CSV ----------------
  async function exportAllJson() {
    const topics = (await idbGetAll(app.db, "topics")).map(normalizeTopicSchema);
    const vocab = (await idbGetAll(app.db, "vocab")).map(normalizeVocabSchema);
    const payload = { topics, vocab, state: app.meta.value };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "offline_export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportRoundCsv() {
    const round = latestRound();
    if (!round) return toast("Chưa có vòng nào");

    const st = app.meta.value;
    const rows = [];
    rows.push(["roundNo", "playerName", "card"].join(","));

    for (const p of st.players.slice().sort((a, b) => a.joinedAt - b.joinedAt)) {
      const c = round.assignments?.[p.id] || null;
      rows.push([round.roundNo, JSON.stringify(p.name), JSON.stringify(cardLabel(c))].join(","));
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `round_${round.roundNo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------------- Events ----------------
  function bindPanelButtons() {
    document.querySelectorAll("button.tab[data-panel]").forEach((btn) => {
      btn.addEventListener("click", () => togglePanel(btn.getAttribute("data-panel")));
    });

    document.querySelectorAll("button[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pid = btn.getAttribute("data-close");
        document.getElementById(pid)?.classList.add("hidden");
        setActiveTab(null);
      });
    });
  }

  function bindEvents() {
    bindPanelButtons();

    document.getElementById("btnResetAll").addEventListener("click", async () => {
      await idbClear(app.db, "topics");
      await idbClear(app.db, "vocab");
      await idbClear(app.db, "meta");

      await bootstrapIfEmpty();
      await loadAllFromDb();

      hideAllPanels();
      renderAll();
      toast("Đã reset toàn bộ");
    });

    document.getElementById("btnNewBoard").addEventListener("click", async () => {
      await newBoard();
      renderAll();
      toast("Đã tạo bảng mới");
    });

    document.getElementById("btnDeal").addEventListener("click", async () => {
      await dealTickets();
      renderAll();
    });

    document.getElementById("btnAddPlayer").addEventListener("click", async () => {
      await addPlayer(elPlayerName.value);
      elPlayerName.value = "";
      renderAll();
    });

    document.getElementById("playerSearch").addEventListener("input", () => renderPlayers());
    document.getElementById("btnClearSearch").addEventListener("click", () => {
      elPlayerSearch.value = "";
      renderPlayers();
    });

    document.getElementById("btnToggleHistory").addEventListener("click", async () => {
      await setHistoryVisible(!app.meta.value.ui.historyVisible);
      renderAll();
    });

    document.getElementById("btnHideHistoryInline").addEventListener("click", async () => {
      await setHistoryVisible(false);
      renderAll();
    });

    document.getElementById("timerInput").addEventListener("change", async (e) => {
      app.meta.value.settings.timerSeconds = clampInt(e.target.value, 1, 120);
      await persistMeta();
      renderHeader();
    });

    document.getElementById("boardModeSelect").addEventListener("change", async (e) => {
      const st = app.meta.value;
      st.settings.boardMode = e.target.value === "SQUARE" ? "SQUARE" : "AUTO";
      syncBoardSizeUi();
      st.board.tiles = buildTiles();
      await persistMeta();
      renderAll();
    });

    document.getElementById("boardSizeInput").addEventListener("change", async (e) => {
      const st = app.meta.value;
      const n = clampInt(e.target.value, 3, 30);
      if (st.settings.boardMode === "AUTO") st.settings.boardCols = n;
      else st.settings.boardSize = n;

      st.board.tiles = buildTiles();
      await persistMeta();
      renderAll();
    });

    document.getElementById("dealMode").addEventListener("change", async (e) => {
      app.meta.value.settings.dealMode = e.target.value === "TOPK" ? "TOPK" : "ALL";
      await persistMeta();
      renderHeader();
    });

    document.getElementById("dealK").addEventListener("change", async (e) => {
      app.meta.value.settings.dealK = clampInt(e.target.value, 1, 999999);
      await persistMeta();
      renderHeader();
    });

    document.getElementById("difficultySelect").addEventListener("change", async (e) => {
      app.meta.value.settings.difficulty = clampInt(e.target.value, 1, 6);
      app.meta.value.board.tiles = buildTiles();
      await persistMeta();
      renderAll();
      toast("Đã đổi độ khó và tạo lại bảng");
    });

    document.getElementById("btnAddTopic").addEventListener("click", async () => {
      await addTopic(elTopicName.value, elTopicIcon.value, elTopicImage.value);
      elTopicName.value = "";
      elTopicIcon.value = "";
      elTopicImage.value = "";
      renderAll();
    });

    document.getElementById("btnClearTopicForm").addEventListener("click", () => {
      elTopicName.value = "";
      elTopicIcon.value = "";
      elTopicImage.value = "";
    });

    document.getElementById("btnAddVocab").addEventListener("click", async () => {
      await addVocab({
        topicId: elVocabTopic.value,
        jp: elVocabJp.value,
        kana: elVocabKana.value,
        meaning: elVocabMeaning.value,
        example: elVocabExample.value,
        hanviet: elVocabHanviet.value,
        icon: elVocabIcon.value,
        image: elVocabImage.value,
      });

      elVocabJp.value = "";
      elVocabKana.value = "";
      elVocabMeaning.value = "";
      elVocabExample.value = "";
      elVocabHanviet.value = "";
      elVocabIcon.value = "";
      elVocabImage.value = "";
      renderAll();
    });

    document.getElementById("btnClearVocabForm").addEventListener("click", () => {
      elVocabJp.value = "";
      elVocabKana.value = "";
      elVocabMeaning.value = "";
      elVocabExample.value = "";
      elVocabHanviet.value = "";
      elVocabIcon.value = "";
      elVocabImage.value = "";
    });

    document.getElementById("vocabSearch").addEventListener("input", () => renderVocabTable());
    document.getElementById("btnExportCsv").addEventListener("click", () => exportRoundCsv());

    document.getElementById("btnExport").addEventListener("click", async () => {
      await exportAllJson();
    });

    document.getElementById("btnClearVocabOnly").addEventListener("click", async () => {
      await idbClear(app.db, "vocab");
      await reloadTopicsVocab();
      app.meta.value.board.tiles = buildTiles();
      await persistMeta();
      renderAll();
      toast("Đã xóa toàn bộ vocab");
    });

    document.getElementById("btnClearTopicsOnly").addEventListener("click", async () => {
      // chỉ reset topics của pack đang active (đúng ý chị, không phá pack khác)
      const pid = getActivePackId();
      const all = (await idbGetAll(app.db, "topics")).map(normalizeTopicSchema);
      for (const t of all) {
        if (t.packId === pid) await idbDelete(app.db, "topics", t.id);
      }

      // tạo lại 1 topic trống cho pack đó
      const fallback = normalizeTopicSchema({
        id: `${pid}__t_default_${Date.now()}`,
        packId: pid,
        name: "Chủ đề của chị",
        icon: "📘",
        image: "",
        labels: [],
      });
      await idbPut(app.db, "topics", fallback);

      await reloadTopicsVocab();
      app.meta.value.board.topicIdActive = app.topicsActive[0].id;
      app.meta.value.board.tiles = buildTiles();
      await persistMeta();

      renderAll();
      toast("Đã reset topics của bộ hiện tại");
    });

    // FULL JSON (topics+vocab+state) - giữ như cũ
    elJsonFile.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // nếu là full export của app thì merge lại
        if (data && typeof data === "object" && (Array.isArray(data.topics) || Array.isArray(data.vocab) || data.state)) {
          // import đơn giản: ghi topics/vocab/state y như file (chị dùng khi backup/restore)
          if (Array.isArray(data.topics)) {
            for (const t of data.topics.map(normalizeTopicSchema)) await idbPut(app.db, "topics", t);
          }
          if (Array.isArray(data.vocab)) {
            for (const v of data.vocab.map(normalizeVocabSchema)) await idbPut(app.db, "vocab", v);
          }
          if (data.state && typeof data.state === "object") {
            app.meta.value = data.state;
            clampMetaSettings();
            await persistMeta();
          }
        }

        await loadAllFromDb();
        renderAll();
        toast("Import JSON OK");
      } catch (err) {
        toast("Lỗi JSON: " + (err?.message || String(err)));
      } finally {
        e.target.value = "";
      }
    });

    // ✅ TOPICS FILE: IMPORT THÀNH 1 PACK MỚI (đây là fix chính)
    elTopicsFile.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const topicsArr = Array.isArray(data?.topics) ? data.topics : null;
        if (!topicsArr) throw new Error("File Topics phải có dạng: {\"topics\":[...]}");

        await importTopicsAsPack(topicsArr, safeFileBaseName(file.name));
        await loadAllFromDb();
        renderAll();
        toast("Đã thêm 1 bộ chủ đề mới (nhớ luôn)");
      } catch (err) {
        toast("Lỗi TOPICS JSON: " + (err?.message || String(err)));
      } finally {
        e.target.value = "";
      }
    });

    elVocabFile.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const mode = (elVocabImportMode?.value || "MERGE") === "REPLACE" ? "REPLACE" : "MERGE";

        // import vocab: gắn vào topicId trực tiếp (chị xuất vocab chuẩn topicId theo pack đang dùng là ngon nhất)
        const vocabArr = Array.isArray(data?.vocab) ? data.vocab : Array.isArray(data) ? data : null;
        if (!Array.isArray(vocabArr)) throw new Error("File Vocab phải có {\"vocab\":[...]} hoặc mảng [...]");

        if (mode === "REPLACE") {
          // chỉ replace vocab của pack đang active (đỡ phá pack khác)
          const pid = getActivePackId();
          const all = (await idbGetAll(app.db, "vocab")).map(normalizeVocabSchema);
          for (const v of all) {
            if (String(v.topicId || "").startsWith(pid + "__")) {
              await idbDelete(app.db, "vocab", v.id);
            }
          }
        }

        for (const raw of vocabArr) {
          const jp = String(raw?.jp ?? "").trim();
          const meaning = String(raw?.meaning ?? "").trim();
          const topicId = String(raw?.topicId ?? "").trim();
          if (!jp || !meaning || !topicId) continue;

          await idbPut(
            app.db,
            "vocab",
            normalizeVocabSchema({
              id: String(raw?.id ?? uid("v")),
              topicId,
              jp,
              kana: raw?.kana ?? "",
              meaning,
              example: raw?.example ?? "",
              hanviet: raw?.hanviet ?? "",
              icon: raw?.icon ?? "",
              image: raw?.image ?? "",
            }),
          );
        }

        await loadAllFromDb();
        renderAll();
        toast(`Import VOCAB OK (${mode})`);
      } catch (err) {
        toast("Lỗi VOCAB JSON: " + (err?.message || String(err)));
      } finally {
        e.target.value = "";
      }
    });
  }

  // ---------------- Bootstrap ----------------
  async function bootstrapIfEmpty() {
    const meta = await idbGet(app.db, "meta", "state");
    const topics = await idbGetAll(app.db, "topics");
    const vocab = await idbGetAll(app.db, "vocab");

    if (!meta) await idbPut(app.db, "meta", defaultMetaState());

    if (!topics.length) {
      for (const t of defaultTopics()) await idbPut(app.db, "topics", t);
    }

    if (!vocab.length) {
      for (const v of defaultVocab()) await idbPut(app.db, "vocab", v);
    }
  }

  async function loadAllFromDb() {
    app.meta = await idbGet(app.db, "meta", "state");
    if (!app.meta) {
      app.meta = defaultMetaState();
      await idbPut(app.db, "meta", app.meta);
    }

    clampMetaSettings();
    await reloadTopicsVocab();

    // đảm bảo active pack hợp lệ
    const packs = getTopicPacks();
    if (!packs.some((p) => p.id === getActivePackId())) {
      app.meta.value.packs.activeTopicPackId = "pack_default";
      await persistMeta();
      await reloadTopicsVocab();
    }

    ensureTopicActiveValid();

    // normalize tiles
    const tiles = app.meta.value.board?.tiles || [];
    tiles.forEach((t) => normalizeTileSchema(t));
    if (!tiles.length) app.meta.value.board.tiles = buildTiles();
    else assignTileLabelsForActiveTopic(tiles);

    ensureLeaderBag();
    await persistMeta();
    await ensureBoard();
  }

  // ---------------- init ----------------
  (async function init() {
    app.db = await openDb();
    await bootstrapIfEmpty();
    await loadAllFromDb();
    bindEvents();
    renderAll();

    setInterval(() => {
      renderHeader();
      renderTiles();
    }, 250);
  })();
})();