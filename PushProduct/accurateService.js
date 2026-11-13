/**
 * PushProduct - Accurate Online Open API Service
 * Directly interacts with Accurate Online Open API via Bearer Token & HMAC-SHA256 Signature.
 */
(function (root, factory) {
  const service = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = service;
  }
  if (typeof window !== 'undefined') {
    window.AccurateService = service;
  }
  if (typeof self !== 'undefined') {
    self.AccurateService = service;
  }
  if (root) {
    root.AccurateService = service;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  async function createHmacSha256(secret, message) {
    if (!secret || !secret.trim()) return null;
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(secret.trim());
      const msgData = encoder.encode(message);
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, msgData);
      return btoa(String.fromCharCode(...new Uint8Array(signature)));
    } catch (e) {
      console.error('[AccurateService HMAC Error]:', e);
      return null;
    }
  }

  async function getHeaders(accessToken, signatureSecret) {
    const cleanToken = (accessToken || '').trim().replace(/^Bearer\s+/i, '');
    const timestamp = new Date().toISOString();
    const headers = {
      'Authorization': `Bearer ${cleanToken}`,
      'Accept': 'application/json, text/plain, */*'
    };

    if (signatureSecret && signatureSecret.trim()) {
      const signature = await createHmacSha256(signatureSecret, timestamp);
      if (signature) {
        headers['X-Api-Timestamp'] = timestamp;
        headers['X-Api-Signature'] = signature;
      }
    }

    return headers;
  }

  async function fetchCategories({ accessToken, signatureSecret, hostUrl = 'https://zeus.accurate.id/accurate/api' }) {
    if (!accessToken || !accessToken.trim()) {
      throw new Error('Accurate Access Token belum diisi.');
    }

    const base = hostUrl.trim().replace(/\/+$/, '');
    const headers = await getHeaders(accessToken, signatureSecret);

    // Try primary endpoint: /item-category/list.do
    const targetUrl = new URL(`${base}/item-category/list.do`);
    targetUrl.searchParams.append('fields', 'id,name,no');
    targetUrl.searchParams.append('sp.pageSize', '200');
    targetUrl.searchParams.append('sp.page', '1');

    let res;
    try {
      res = await fetch(targetUrl.toString(), {
        method: 'GET',
        headers
      });
    } catch (fetchErr) {
      throw new Error(`Gagal menghubungi server Accurate: ${fetchErr.message}`);
    }

    if (!res.ok) {
      const text = await res.text();
      let errMsg = text;
      try {
        const j = JSON.parse(text);
        errMsg = j.message || j.error || (j.d ? JSON.stringify(j.d) : text);
      } catch (e) {}
      throw new Error(`Accurate API Error (${res.status}): ${errMsg}`);
    }

    const json = await res.json();
    const list = json.d || json.data || json.rows || (Array.isArray(json) ? json : []);

    const categories = [];
    const seen = new Set();

    for (const item of list) {
      const name = (item.name || item.categoryName || item.text || item.title || '').trim();
      if (name && !seen.has(name.toUpperCase())) {
        seen.add(name.toUpperCase());
        categories.push(name);
      }
    }

    return {
      success: true,
      categories,
      count: categories.length,
      rawCount: list.length
    };
  }

  async function findItemByNo({ accessToken, signatureSecret, hostUrl = 'https://zeus.accurate.id/accurate/api', itemNo }) {
    if (!itemNo || !itemNo.trim()) return null;
    const base = hostUrl.trim().replace(/\/+$/, '');
    const headers = await getHeaders(accessToken, signatureSecret);

    const targetUrl = new URL(`${base}/item/list.do`);
    targetUrl.searchParams.append('filter.keywords.val', itemNo.trim());
    targetUrl.searchParams.append('fields', 'id,no,name');
    targetUrl.searchParams.append('sp.pageSize', '10');

    try {
      const res = await fetch(targetUrl.toString(), { method: 'GET', headers });
      if (!res.ok) return null;
      const json = await res.json();
      const list = json.d || [];
      const match = list.find(it => (it.no || '').trim().toUpperCase() === itemNo.trim().toUpperCase());
      return match || null;
    } catch (e) {
      console.warn('[AccurateService findItemByNo error]:', e);
      return null;
    }
  }

  async function saveItem({
    accessToken,
    signatureSecret,
    hostUrl = 'https://zeus.accurate.id/accurate/api',
    item
  }) {
    if (!accessToken || !accessToken.trim()) {
      throw new Error('Accurate Access Token belum diatur di Pengaturan.');
    }
    if (!item || !item.name) {
      throw new Error('Data barang tidak lengkap (Nama barang wajib ada).');
    }

    const base = hostUrl.trim().replace(/\/+$/, '');
    const headers = await getHeaders(accessToken, signatureSecret);
    headers['Content-Type'] = 'application/json';

    const itemNo = (item.code || '').trim().toUpperCase();

    // Check if item already exists by item code (no)
    let existingItem = null;
    if (itemNo) {
      try {
        existingItem = await findItemByNo({ accessToken, signatureSecret, hostUrl, itemNo });
      } catch (e) {}
    }

    const payload = {
      no: itemNo,
      name: (item.name || '').trim(),
      itemType: (item.itemType || 'INVENTORY').toUpperCase() === 'PERSEDIAAN' ? 'INVENTORY' : (item.itemType || 'INVENTORY'),
      itemCategoryName: (item.category || '').trim(),
      unit1Name: (item.unit || 'pcs').trim(),
      unitPrice: typeof item.pricelist === 'number' ? item.pricelist : parseFloat(item.pricelist) || 0,
      vendorPrice: typeof item.sieportalPrice === 'number' ? item.sieportalPrice : parseFloat(item.sieportalPrice) || 0
    };

    if (existingItem && existingItem.id) {
      payload.id = existingItem.id;
    }

    const targetUrl = `${base}/item/save.do`;
    let res;
    try {
      res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    } catch (fetchErr) {
      throw new Error(`Gagal menghubungi server Accurate: ${fetchErr.message}`);
    }

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(`Respon tidak valid dari Accurate (${res.status}): ${text.slice(0, 150)}`);
    }

    if (!res.ok || json.s === false) {
      let errMsg = json.d;
      if (Array.isArray(errMsg)) errMsg = errMsg.join(', ');
      else if (typeof errMsg === 'object') errMsg = JSON.stringify(errMsg);
      throw new Error(errMsg || json.message || `Error status ${res.status}`);
    }

    const savedId = json.r?.id || (existingItem ? existingItem.id : null);
    const actionDesc = existingItem ? 'diperbarui' : 'dibuat';

    return {
      success: true,
      isUpdated: Boolean(existingItem),
      id: savedId,
      no: payload.no || json.r?.no,
      name: payload.name,
      message: `Barang "${payload.name}" berhasil ${actionDesc} di Accurate Online!`,
      data: json.r || json.d
    };
  }

  async function testConnection({ accessToken, signatureSecret, hostUrl = 'https://zeus.accurate.id/accurate/api' }) {
    return await fetchCategories({ accessToken, signatureSecret, hostUrl });
  }

  return {
    createHmacSha256,
    fetchCategories,
    findItemByNo,
    saveItem,
    testConnection
  };
});
