/**
 * PushProduct - Accurate Online Content Script
 * Detects pending product pushed from SiePortal and auto-fills or assists
 * entering data into Accurate Online's "Barang & Jasa" (Item) form.
 */

(function () {
  'use strict';

  let currentPendingItem = null;
  let bannerElement = null;

  // React/Angular/Vue compatible input setter
  function setNativeValue(element, value) {
    if (!element) return;
    element.focus();

    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // Find input field by associated label text or placeholder
  function findInputByLabel(keywords) {
    const labels = Array.from(document.querySelectorAll('label, .control-label, .field-label, span, div'));
    for (const kw of keywords) {
      const reg = new RegExp(`^\\s*${kw}\\s*[:*]?$|\\b${kw}\\b`, 'i');
      for (const lbl of labels) {
        if (lbl.children.length <= 1 && reg.test(lbl.innerText || '')) {
          // Check for label 'for' attribute
          if (lbl.htmlFor) {
            const el = document.getElementById(lbl.htmlFor);
            if (el) return el;
          }
          // Check parent / siblings
          const container = lbl.closest('.form-group, .field, tr, div');
          if (container) {
            const input = container.querySelector('input, textarea, select');
            if (input && input !== lbl) return input;
          }
        }
      }
    }

    // Secondary: Check placeholders
    for (const kw of keywords) {
      const input = document.querySelector(`input[placeholder*="${kw}" i], textarea[placeholder*="${kw}" i]`);
      if (input) return input;
    }

    return null;
  }

  // Attempt to fill Accurate form fields
  function executeFormFill(item) {
    if (!item) return { success: false, filledCount: 0 };

    let filledCount = 0;

    // 1. Kode Barang
    const codeInput = findInputByLabel(['Kode Barang', 'Kode', 'Item No', 'No. Barang', 'Nomor Barang']) ||
                      document.querySelector('input[name*="no" i], input[name*="itemNo" i], input[name*="code" i]');
    if (codeInput) {
      setNativeValue(codeInput, item.code);
      filledCount++;
    }

    // 2. Nama Barang / Judul
    const nameInput = findInputByLabel(['Nama Barang', 'Nama', 'Item Name', 'Deskripsi', 'Keterangan']) ||
                      document.querySelector('input[name*="name" i], textarea[name*="name" i], input[name*="itemName" i]');
    if (nameInput) {
      setNativeValue(nameInput, item.name);
      filledCount++;
    }

    // 3. Satuan
    const unitInput = findInputByLabel(['Satuan', 'Unit', 'Satuan 1', 'Unit 1']) ||
                      document.querySelector('input[name*="unit" i]');
    if (unitInput) {
      setNativeValue(unitInput, item.unit || 'pcs');
      filledCount++;
    }

    // 4. Kategori Barang
    function normalizeCat(c) {
      return (c || '').toUpperCase().replace(/[_\s-]+/g, '');
    }

    const catInput = findInputByLabel(['Kategori', 'Kategori Barang', 'Category', 'Item Category', 'Kategori Produk']) ||
                      document.querySelector('input[name*="itemCategory" i], input[name*="category" i], input[id*="itemCategory" i], input[placeholder*="kategori" i]');
    if (catInput) {
      const targetNorm = normalizeCat(item.category);
      const displayCategory = (item.category || '').replace(/_/g, ' ');

      if (catInput.tagName === 'SELECT') {
        let found = false;
        for (let i = 0; i < catInput.options.length; i++) {
          const optNorm = normalizeCat(catInput.options[i].text || catInput.options[i].value);
          if (optNorm === targetNorm || optNorm.includes(targetNorm) || targetNorm.includes(optNorm)) {
            catInput.selectedIndex = i;
            catInput.dispatchEvent(new Event('change', { bubbles: true }));
            found = true;
            break;
          }
        }
        if (!found) {
          setNativeValue(catInput, displayCategory);
        }
      } else {
        // Combobox / Autocomplete input (e.g. Dojo FilteringSelect or custom input)
        setNativeValue(catInput, displayCategory);

        // Try to trigger combobox / autocomplete selection
        catInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        catInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

        // Check if there is an adjacent dropdown arrow button
        const arrowBtn = catInput.closest('.dijitComboBox, .input-group, .form-group')?.querySelector(
          '.dijitArrowButton, .dijitDownArrowButton, .input-group-btn, [class*="arrow"], [class*="lookup"]'
        );
        if (arrowBtn && arrowBtn !== catInput) {
          arrowBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          arrowBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          arrowBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }

        // Search for popup menu / dropdown items that match
        setTimeout(() => {
          const dropOptions = document.querySelectorAll(
            '.dijitComboBoxMenu .dijitMenuItem, .dijitPopup div, .dropdown-menu li, .select2-results__option, .lookup-result-item, .v-list-item, div[role="option"], li[role="option"]'
          );
          for (const opt of dropOptions) {
            const optNorm = normalizeCat(opt.innerText);
            if (optNorm && (optNorm === targetNorm || optNorm.includes(targetNorm) || targetNorm.includes(optNorm))) {
              opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              opt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              opt.click();
              break;
            }
          }
        }, 200);
      }
      filledCount++;
    }

    // 5. Harga Jual / Pricelist
    const priceInput = findInputByLabel(['Harga Jual', 'Def. Harga Jual', 'Harga Satuan', 'Unit Price', 'Selling Price']);
    if (priceInput && item.pricelist) {
      setNativeValue(priceInput, item.pricelist.toString());
      filledCount++;
    }

    return {
      success: filledCount > 0,
      filledCount
    };
  }

  // Render floating helper banner
  function showBanner(item) {
    if (!item) return;
    currentPendingItem = item;

    if (!bannerElement) {
      bannerElement = document.createElement('div');
      bannerElement.id = 'pushproduct-accurate-banner';
      document.body.appendChild(bannerElement);
    }

    bannerElement.innerHTML = `
      <div class="pushproduct-acc-header">
        <div class="pushproduct-acc-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Data PushProduct Siap Diisi</span>
        </div>
        <button class="pushproduct-acc-close" id="pushproduct-acc-close" title="Tutup">✕</button>
      </div>

      <div class="pushproduct-acc-item-box">
        <div class="pushproduct-acc-item-title">${item.name}</div>
        <div class="pushproduct-acc-item-details">
          <span class="pushproduct-acc-item-pill" data-copy="${item.code}" title="Klik untuk salin Kode">Kode: ${item.code} 📋</span>
          <span class="pushproduct-acc-item-pill" data-copy="${(item.category || '').replace(/_/g, ' ')}" title="Klik untuk salin Kategori">Kategori: ${item.category} 📋</span>
          <span class="pushproduct-acc-item-pill" data-copy="${item.unit}" title="Klik untuk salin Satuan">Satuan: ${item.unit} 📋</span>
          <span class="pushproduct-acc-item-pill" data-copy="${item.pricelist}" style="background:#DCFCE7; color:#166534;" title="Klik untuk salin Pricelist">
            Pricelist: ${item.priceData?.formattedPricelist || 'Rp ' + item.pricelist} 📋
          </span>
        </div>
      </div>

      <div class="pushproduct-acc-actions">
        <button class="pushproduct-acc-btn-fill" id="pushproduct-acc-btn-fill">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          <span>⚡ Isi Formulir Sekarang</span>
        </button>
        <button class="pushproduct-acc-btn-copy" id="pushproduct-acc-btn-copy" title="Salin Ringkasan">
          📋 Salin Data
        </button>
      </div>
    `;

    bannerElement.querySelectorAll('.pushproduct-acc-item-pill[data-copy]').forEach(pill => {
      pill.style.cursor = 'pointer';
      pill.addEventListener('click', () => {
        const val = pill.getAttribute('data-copy');
        if (val) {
          navigator.clipboard.writeText(val);
          const oldText = pill.innerText;
          pill.innerText = '✅ Tersalin!';
          setTimeout(() => { pill.innerText = oldText; }, 1500);
        }
      });
    });

    document.getElementById('pushproduct-acc-close').addEventListener('click', () => {
      dismissBanner();
    });

    document.getElementById('pushproduct-acc-btn-fill').addEventListener('click', () => {
      const res = executeFormFill(item);
      const btn = document.getElementById('pushproduct-acc-btn-fill');
      if (res.success) {
        btn.innerHTML = `<span>✅ Berhasil Diisi (${res.filledCount} Kolom)</span>`;
        btn.style.background = '#16A34A';
        // Auto-dismiss after 4 seconds
        setTimeout(() => {
          dismissBanner();
        }, 4000);
      } else {
        alert(
          '⚠️ Kolom formulir belum terdeteksi di halaman ini.\n' +
          'Silakan pastikan Anda sudah membuka tab "Persediaan ➜ Barang & Jasa ➜ Tambah/Baru", lalu klik tombol ini lagi.'
        );
      }
    });

    document.getElementById('pushproduct-acc-btn-copy').addEventListener('click', () => {
      const summary = [
        `KODE BARANG : ${item.code}`,
        `NAMA BARANG : ${item.name}`,
        `KATEGORI    : ${item.category}`,
        `JENIS BARANG: ${item.itemType}`,
        `SATUAN      : ${item.unit}`,
        `PRICELIST   : ${item.pricelist}`
      ].join('\n');
      navigator.clipboard.writeText(summary);
      alert('📋 Data produk berhasil disalin!');
    });
  }

  function dismissBanner() {
    if (bannerElement) {
      bannerElement.remove();
      bannerElement = null;
    }
    chrome.runtime.sendMessage({ action: 'CLEAR_PENDING_ITEM' });
  }

  // Check storage on initialization
  async function checkPendingFromStorage() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_PENDING_ITEM' });
      if (response && response.success && response.item) {
        showBanner(response.item);
      }
    } catch (e) {
      // Storage query fallback
      try {
        const { pendingAccurateItem } = await chrome.storage.local.get('pendingAccurateItem');
        if (pendingAccurateItem) {
          showBanner(pendingAccurateItem);
        }
      } catch (err) {}
    }
  }

  // Automatically scan for available categories on Accurate Online pages
  async function scanCategoriesFromAccurate() {
    const foundCategories = new Set();

    // 1. Try Accurate internal session APIs (runs inside *.accurate.id origin with user session cookies)
    const apiEndpoints = [
      '/accurate/api/item-category/list.do?fields=id,name&sp.pageSize=200',
      '/accurate/api/item-category/lookup.do?fields=id,name',
      '/accurate/api/item/category-list.do'
    ];

    for (const endpoint of apiEndpoints) {
      try {
        const resp = await fetch(endpoint, {
          credentials: 'include',
          headers: { 'Accept': 'application/json, text/plain, */*' }
        });
        if (resp.ok) {
          const json = await resp.json();
          const items = json.d || json.data || json.rows || (Array.isArray(json) ? json : []);
          for (const it of items) {
            const name = (it.name || it.categoryName || it.text || it.title || '').trim();
            if (name && name.length >= 2 && name.length <= 40 && !/pilih|select|semua/i.test(name)) {
              foundCategories.add(name);
            }
          }
          if (foundCategories.size > 0) {
            console.log(`[PushProduct] Synced ${foundCategories.size} categories from Accurate API (${endpoint})`);
            break;
          }
        }
      } catch (err) {
        // Silently continue to DOM scraping
      }
    }

    // 2. Scan Table & Grid cells (e.g. on /accurate/module/item-category/list.do or item lists)
    const gridCells = document.querySelectorAll(
      'table tr td, .grid-cell, [data-property*="name" i], [data-property*="category" i], [data-label*="nama" i]'
    );
    gridCells.forEach(cell => {
      const text = (cell.innerText || '').trim();
      if (text && text.length >= 2 && text.length <= 35 && !text.includes('\n') && !/pilih|tambah|baru|edit|hapus|delete|cari|search/i.test(text)) {
        if (window.location.href.includes('item-category') || cell.closest('table')?.innerText.includes('Kategori')) {
          foundCategories.add(text);
        }
      }
    });

    // 3. Check select elements
    const selects = document.querySelectorAll('select');
    selects.forEach(sel => {
      Array.from(sel.options).forEach(opt => {
        const text = (opt.text || opt.value || '').trim();
        if (text && text.length >= 2 && text.length <= 35 && !/pilih|select|semua|all/i.test(text)) {
          foundCategories.add(text);
        }
      });
    });

    // 4. Check datalists & dropdown items
    const dropItems = document.querySelectorAll(
      '.dijitComboBoxMenu .dijitMenuItem, .dijitPopup div, .dropdown-menu li, .select2-results__option, .lookup-result-item, .v-list-item, div[role="option"], li[role="option"]'
    );
    dropItems.forEach(el => {
      const text = el.innerText?.trim();
      if (text && text.length >= 2 && text.length <= 35 && !/pilih|tambah|baru|loading|memuat/i.test(text)) {
        foundCategories.add(text);
      }
    });

    if (foundCategories.size > 0) {
      const arr = Array.from(foundCategories);
      chrome.runtime.sendMessage({
        action: 'SYNC_ACCURATE_CATEGORIES',
        payload: { categories: arr }
      });
    }

    return Array.from(foundCategories);
  }

  // Listen for direct messages from service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'INJECT_ACCURATE_ITEM' && message.payload) {
      showBanner(message.payload);
      // Try immediate fill if form is already open
      executeFormFill(message.payload);
      sendResponse({ success: true });
    } else if (message.action === 'FETCH_CATEGORIES_FROM_ACCURATE_PAGE') {
      scanCategoriesFromAccurate().then(cats => {
        sendResponse({ success: true, categories: cats });
      }).catch(err => {
        sendResponse({ success: false, error: err.message, categories: [] });
      });
      return true; // Keep message channel open for async response
    }
    return true;
  });

  // Init
  function init() {
    checkPendingFromStorage();
    setTimeout(scanCategoriesFromAccurate, 2000);

    // Watch for popup menu additions (like Dojo combobox menu)
    try {
      const observer = new MutationObserver(() => {
        const dropItems = document.querySelectorAll('.dijitComboBoxMenu .dijitMenuItem, .select2-results__option, .lookup-result-item');
        if (dropItems.length > 0) {
          scanCategoriesFromAccurate();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[PushProduct] Accurate Content Script active.');

})();
