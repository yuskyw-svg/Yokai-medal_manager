(async () => {
  console.log('妖怪メダルコレクション管理: 起動中...');

  // --- Configuration ---
  const CONFIG = {
    ID_REGEX: /img_medal(\d+)\.png/,
    STORAGE_KEY: 'yokai_owned_data',
    DATA_URL: chrome.runtime.getURL('data/medals.json')
  };

  // --- State ---
  let ownedData = {};
  let medalMetadata = {};
  let filters = {
    ownedStatus: 'all', // all, owned, not-owned
    tribe: 'all',
    frame: 'all',
    search: ''
  };

  // --- Load Data ---
  async function loadInitialData() {
    // Load from storage
    const storage = await chrome.storage.local.get(CONFIG.STORAGE_KEY);
    ownedData = storage[CONFIG.STORAGE_KEY] || {};

    // Load metadata from JSON
    try {
      const response = await fetch(CONFIG.DATA_URL);
      medalMetadata = await response.json();
    } catch (e) {
      console.warn('Medal metadata could not be loaded:', e);
    }
  }

  // --- DOM Extraction ---
  function getMedalId(el) {
    const img = el.querySelector('dt img');
    if (!img) return null;
    const match = img.src.match(CONFIG.ID_REGEX);
    return match ? match[1] : null;
  }

  // --- UI Components ---
  function createPanel() {
    const panel = document.createElement('div');
    panel.className = 'yokai-filter-panel';
    panel.innerHTML = `
      <div class="yokai-stats">
        <div class="yokai-stat-item">総所持率: <span id="yokai-total-rate" class="yokai-stat-value">0% (0 / 0)</span></div>
        <div id="yokai-tribe-stats" class="yokai-stats"></div>
      </div>
      <div class="yokai-filters">
        <select id="filter-owned">
          <option value="all">全表示</option>
          <option value="owned">所持済みのみ</option>
          <option value="not-owned">未所持のみ</option>
        </select>
        <select id="filter-tribe">
          <option value="all">全種族</option>
        </select>
        <select id="filter-frame">
          <option value="all">全種類</option>
        </select>
        <input type="text" id="search-name" placeholder="名前で検索...">
      </div>
      <div class="yokai-toggle">
        <button id="toggle-extension" class="yokai-btn-toggle">表示切替 (拡張ON)</button>
      </div>
    `;
    document.body.prepend(panel);
    document.body.classList.add('yokai-panel-active');

    // Add events
    document.getElementById('filter-owned').addEventListener('change', (e) => {
      filters.ownedStatus = e.target.value;
      applyFilters();
    });
    document.getElementById('filter-tribe').addEventListener('change', (e) => {
      filters.tribe = e.target.value;
      applyFilters();
    });
    document.getElementById('filter-frame').addEventListener('change', (e) => {
      filters.frame = e.target.value;
      applyFilters();
    });
    document.getElementById('search-name').addEventListener('input', debounce((e) => {
      filters.search = e.target.value;
      applyFilters();
    }, 300));

    const toggleBtn = document.getElementById('toggle-extension');
    toggleBtn.addEventListener('click', () => {
      const isDisabled = document.body.classList.toggle('yokai-extension-disabled');
      toggleBtn.textContent = isDisabled ? '表示切替 (拡張OFF)' : '表示切替 (拡張ON)';
      toggleBtn.classList.toggle('off', isDisabled);
      // OFFになっても所持フィルター以外は有効なので再適用
      applyFilters();
      // 所持状態の視覚表現をリセット or 適用
      document.querySelectorAll('#main .mainInner dl').forEach(el => {
        const id = getMedalId(el);
        if (!id) return;
        if (isDisabled) {
          // OFFの時: 所持状態の見た目を消す
          el.classList.remove('yokai-owned', 'yokai-not-owned');
        } else {
          // ONに戻った時: 所持状態を再適用
          updateMedalVisual(el, ownedData[id] && ownedData[id].owned);
        }
      });
    });

    updateDropdowns();
  }

  function updateDropdowns() {
    const tribes = new Set();
    const frames = new Set();
    Object.values(medalMetadata).forEach(m => {
      if (m.tribe) tribes.add(m.tribe);
      if (m.frame) frames.add(m.frame);
    });

    const tribeSelect = document.getElementById('filter-tribe');
    tribes.forEach(tribe => {
      const opt = document.createElement('option');
      opt.value = tribe;
      opt.textContent = tribe;
      tribeSelect.appendChild(opt);
    });

    const frameSelect = document.getElementById('filter-frame');
    frames.forEach(frame => {
      const opt = document.createElement('option');
      opt.value = frame;
      opt.textContent = frame;
      frameSelect.appendChild(opt);
    });
  }

  function updateStats() {
    const allMedals = document.querySelectorAll('#main .mainInner dl');
    let totalCount = 0;
    let ownedCount = 0;

    allMedals.forEach(el => {
      const id = getMedalId(el);
      if (id) {
        totalCount++;
        if (ownedData[id] && ownedData[id].owned) {
          ownedCount++;
        }
      }
    });

    const rate = totalCount > 0 ? Math.round((ownedCount / totalCount) * 100) : 0;
    document.getElementById('yokai-total-rate').textContent = `${rate}% (${ownedCount} / ${totalCount})`;
  }

  // --- Helpers ---
  function isExtensionEnabled() {
    return !document.body.classList.contains('yokai-extension-disabled');
  }

  // --- Logic ---
  function applyFilters() {
    const extensionOn = isExtensionEnabled();
    const medals = document.querySelectorAll('#main .mainInner dl');
    medals.forEach(el => {
      const id = getMedalId(el);
      if (!id) {
        el.classList.add('yokai-hidden');
        return;
      }

      const isOwned = ownedData[id] && ownedData[id].owned;
      const metadata = medalMetadata[id] || {};
      const name = metadata.name || '';
      const tribe = metadata.tribe || '';
      const frame = metadata.frame || '';

      let visible = true;

      // 所持フィルター: 拡張ONの時のみ有効
      if (extensionOn) {
        if (filters.ownedStatus === 'owned' && !isOwned) visible = false;
        if (filters.ownedStatus === 'not-owned' && isOwned) visible = false;
      }

      // 種族フィルター: 常に有効
      if (filters.tribe !== 'all' && tribe !== filters.tribe) visible = false;

      // 種類フィルター: 常に有効
      if (filters.frame !== 'all' && frame !== filters.frame) visible = false;

      // 名前検索: 常に有効
      if (filters.search && !name.includes(filters.search)) visible = false;

      if (visible) {
        el.classList.remove('yokai-hidden');
      } else {
        el.classList.add('yokai-hidden');
      }
    });

    // Hide empty categories (frame types)
    document.querySelectorAll('.medalLists').forEach(list => {
      const allHidden = Array.from(list.querySelectorAll('dl')).every(dl => dl.classList.contains('yokai-hidden'));
      const parentCategory = list.parentElement; 
      if (parentCategory && parentCategory.tagName.toLowerCase() === 'div') {
        if (allHidden) {
          parentCategory.classList.add('yokai-hidden');
        } else {
          parentCategory.classList.remove('yokai-hidden');
        }
      }
    });

    // Hide empty tribes
    document.querySelectorAll('.list_item').forEach(item => {
      const allHidden = Array.from(item.querySelectorAll('dl')).every(dl => dl.classList.contains('yokai-hidden'));
      if (allHidden) {
        item.classList.add('yokai-hidden');
      } else {
        item.classList.remove('yokai-hidden');
      }
    });
  }

  function toggleOwned(id, el) {
    const newState = !(ownedData[id] && ownedData[id].owned);
    ownedData[id] = { owned: newState };
    
    // Save to storage
    chrome.storage.local.set({ [CONFIG.STORAGE_KEY]: ownedData });

    // Update visual
    updateMedalVisual(el, newState);
    updateStats();
    applyFilters();
  }

  function updateMedalVisual(el, isOwned) {
    if (isOwned) {
      el.classList.add('yokai-owned');
      el.classList.remove('yokai-not-owned');
    } else {
      el.classList.add('yokai-not-owned');
      el.classList.remove('yokai-owned');
    }
  }

  function processMedal(el) {
    const id = getMedalId(el);
    if (!id) return;

    // Initial visual state (拡張ONの時のみ所持状態を表示)
    if (isExtensionEnabled()) {
      const isOwned = ownedData[id] && ownedData[id].owned;
      updateMedalVisual(el, isOwned);
    }

    // Click event (拡張ONの時のみ所持状態を切り替え)
    if (!el.dataset.yokaiBound) {
      el.addEventListener('click', (e) => {
        if (!isExtensionEnabled()) return; // OFFの時はクリック無効
        e.preventDefault();
        e.stopPropagation();
        toggleOwned(id, el);
      });
      el.dataset.yokaiBound = "true";
    }
  }

  // --- Utilities ---
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // --- Main Execution ---
  await loadInitialData();
  createPanel();

  // Watch for DOM changes (lazy loading)
  const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          const medals = node.querySelectorAll('#main .mainInner dl');
          if (medals.length > 0) {
            medals.forEach(processMedal);
            shouldUpdate = true;
          }
          // Also check if the node itself is a dl
          if (node.matches('#main .mainInner dl')) {
            processMedal(node);
            shouldUpdate = true;
          }
        }
      });
    });
    if (shouldUpdate) {
      updateStats();
      applyFilters();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Process existing medals
  document.querySelectorAll('#main .mainInner dl').forEach(processMedal);
  updateStats();
  applyFilters();

})();
