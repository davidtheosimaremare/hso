// src/lib/weeklyTaskDigest.js
// Logic for compiling HSO Weekly Task Recap:
// 1. Siap Kirim (Ready to ship / Arrived in Hokiindo)
// 2. Belum Dipesan (Active SO with no vendor PO issued)
// 3. Logistik Stagnan (Shipment with no status movement for > threshold days)

import { supabase } from '@/lib/supabase'

export const DEFAULT_RECAP_SETTINGS = {
  mode: 'test', // 'test' | 'production'
  test_recipients: ['davidtheosimaremare@gmail.com'],
  production_recipients: ['sales@hokiindo.co.id', 'info@hokiindo.co.id', 'purchasing@hokiindo.co.id'],
  custom_recipients: [],
  day_of_week: 'Jumat',
  send_time: '08:00',
  stagnant_threshold_days: 5,
  is_active: true,
  last_sent_at: null,
  last_sent_status: null
}

const SETTINGS_STORAGE_KEY = 'hir_weekly_recap_settings'

// Load settings from Supabase system_settings with localStorage fallback
export async function loadRecapSettings() {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'weekly_recap_settings')
      .maybeSingle()

    if (!error && data?.value && typeof data.value === 'object') {
      const merged = { ...DEFAULT_RECAP_SETTINGS, ...data.value }
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged))
      return merged
    }
  } catch (err) {
    console.warn('[WeeklyRecap] Failed to load settings from Supabase:', err)
  }

  // Fallback to localStorage
  try {
    const local = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (local) {
      return { ...DEFAULT_RECAP_SETTINGS, ...JSON.parse(local) }
    }
  } catch (e) {}

  return { ...DEFAULT_RECAP_SETTINGS }
}

// Save settings to Supabase system_settings and localStorage
export async function saveRecapSettings(settings) {
  const merged = { ...DEFAULT_RECAP_SETTINGS, ...settings, updated_at: new Date().toISOString() }
  
  // Save local
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged))
  } catch (e) {}

  // Save Supabase
  try {
    const { error } = await supabase
      .from('system_settings')
      .upsert({
        key: 'weekly_recap_settings',
        value: merged,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' })
    
    if (error) throw error
    return { success: true, settings: merged }
  } catch (err) {
    console.warn('[WeeklyRecap] Failed to save settings to Supabase:', err)
    return { success: false, error: err.message, settings: merged }
  }
}

// Helper: Calculate days between date and today
function calculateDaysAgo(dateStr) {
  if (!dateStr || dateStr === '-') return 0
  let targetTime = 0
  const s = String(dateStr).trim()
  
  if (s.includes('/')) {
    const parts = s.split('/')
    if (parts.length === 3) {
      let year = parseInt(parts[2], 10)
      if (year < 100) year += 2000
      targetTime = new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime()
    }
  } else if (s.includes('-')) {
    const parts = s.split('-')
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        targetTime = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime()
      } else {
        let year = parseInt(parts[2], 10)
        if (year < 100) year += 2000
        targetTime = new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime()
      }
    }
  } else {
    targetTime = new Date(s).getTime()
  }

  if (!targetTime || isNaN(targetTime)) return 0
  const diffMs = Date.now() - targetTime
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

// Format currency IDR
export function formatCurrency(val) {
  const num = typeof val === 'number' ? val : parseFloat(String(val || 0).replace(/,/g, ''))
  if (isNaN(num)) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num)
}

// Compile weekly task data from active HSOs, POs, and Shipments
export async function compileWeeklyTaskData(options = {}) {
  const thresholdDays = options.stagnantThresholdDays || 5

  // 1. Fetch active HSOs from accurate-list-so
  let soList = []
  try {
    const res = await supabase.functions.invoke('accurate-list-so', {
      body: { 
        fields: 'id,number,transDate,customer,totalAmount,statusName,percentShipped,description,poNumber,detailItem',
        limit: 2000 
      }
    })
    if (res.data?.d && Array.isArray(res.data.d)) {
      soList = res.data.d
    }
  } catch (err) {
    console.warn('[WeeklyRecap] Failed fetching live SOs, checking cache fallback:', err)
    try {
      const cached = localStorage.getItem('accurate_sales_orders')
      if (cached) soList = JSON.parse(cached)
    } catch (e) {}
  }

  // Filter only active SOs: Menunggu diproses & Sebagian diproses
  const activeSos = soList.filter(so => {
    const st = String(so.statusName || so.status || '').toLowerCase().trim()
    return st === 'menunggu diproses' || st === 'sebagian diproses'
  })

  // 2. Fetch linked HPO items and shipments from Supabase in parallel
  const [poItemsRes, shipmentsRes] = await Promise.all([
    supabase
      .from('accurate_purchase_order_items')
      .select('hso_number, quantity, item_code, item_name, header:accurate_purchase_orders(id, number, trans_date, vendor_name, status_name)')
      .not('hso_number', 'is', null),
    supabase
      .from('shipments')
      .select('*')
  ])

  // Build HSO -> Linked HPOs map
  const soHpoMap = {}
  const poItems = poItemsRes?.data || []
  poItems.forEach(p => {
    if (p.hso_number && p.header?.number) {
      const key = p.hso_number.trim().toUpperCase()
      if (!soHpoMap[key]) soHpoMap[key] = []
      soHpoMap[key].push({
        po_number: p.header.number,
        vendor_name: p.header.vendor_name || 'Vendor',
        trans_date: p.header.trans_date,
        status_name: p.header.status_name,
        item_code: p.item_code,
        item_name: p.item_name,
        quantity: p.quantity
      })
    }
  })

  // Build HSO / SO_ID -> Shipments map
  const soShipmentMap = {}
  const shipments = shipmentsRes?.data || []
  shipments.forEach(s => {
    const keys = [
      s.so_number ? String(s.so_number).trim().toUpperCase() : null,
      s.so_id ? String(s.so_id).trim().toUpperCase() : null
    ].filter(Boolean)

    keys.forEach(k => {
      if (!soShipmentMap[k]) soShipmentMap[k] = []
      soShipmentMap[k].push(s)
    })
  })

  // Helper: Extract project name from SO
  const extractProjectName = (soObj) => {
    const desc = soObj.description || ''
    const match = desc.match(/(?:proyek|project)\s*[:=]\s*([^\n\r;]+)/i)
    if (match && match[1]) return match[1].trim()
    const bracketMatch = desc.match(/\[([^\]]+)\]/)
    if (bracketMatch && bracketMatch[1] && !bracketMatch[1].toUpperCase().startsWith('HSO') && !bracketMatch[1].toUpperCase().startsWith('HSB')) {
      return bracketMatch[1].trim()
    }
    return '-'
  }

  // Categorize lists
  const siapKirimList = []
  const belumDipesanList = []
  const logistikStagnanList = []

  activeSos.forEach(so => {
    const soNumber = (so.number || `HSO ${so.id}`).trim()
    const soKey = soNumber.toUpperCase()
    const customerName = so.customer?.name || so.customer || '-'
    const projectName = extractProjectName(so)
    const amount = Math.round(so.totalAmount || 0)
    const percentShipped = Number(so.percentShipped || 0)
    const transDate = so.transDate || '-'
    const daysSinceCreated = calculateDaysAgo(transDate)

    const linkedHpos = soHpoMap[soKey] || []
    const linkedShipments = soShipmentMap[soKey] || soShipmentMap[String(so.id)] || []

    const soEntry = {
      so_number: soNumber,
      customer_name: customerName,
      project_name: projectName,
      trans_date: transDate,
      days_since_created: daysSinceCreated,
      amount,
      amount_formatted: formatCurrency(amount),
      status_name: so.statusName || 'Menunggu diproses',
      percent_shipped: percentShipped,
      hpo_list: Array.from(new Set(linkedHpos.map(h => h.po_number))),
      shipment_count: linkedShipments.length,
      detail_items_count: so.detailItem?.length || 0,
      link: `https://hso.hokiindo.co.id/sales-orders/${soNumber.replace(/\//g, '-')}`
    }

    // 1. Check Condition 1: SIAP KIRIM (Ready to deliver to customer)
    // Signal A: Any shipment has status already in hokiindo or hokiindo_date is set
    const hasArrivedInHokiindo = linkedShipments.some(s => {
      const st = String(s.current_status || '').toLowerCase()
      return st.includes('already in hokiindo') || st.includes('tiba di hokiindo') || Boolean(s.hokiindo_date)
    })

    // Signal B: Description notes ready stock in warehouse
    const hasStockInWarehouse = String(so.description || '').toLowerCase().includes('ready') ||
      (so.detailItem || []).some(item => {
        const note = String(item.detailNotes || item.notes || '').toLowerCase()
        return note.includes('ready') && !note.includes('no stock')
      })

    if ((hasArrivedInHokiindo || hasStockInWarehouse) && percentShipped < 100) {
      siapKirimList.push({
        ...soEntry,
        reason: hasArrivedInHokiindo ? 'Barang telah tiba di Gudang Hokiindo' : 'Tersedia stok siap kirim',
        task_action: 'Segera terbitkan Surat Jalan (DO) dan jadwalkan pengiriman ke customer'
      })
    }

    // 2. Check Condition 2: BELUM DIPESAN (No vendor PO yet)
    // If percentShipped < 100 AND no linked HPO at all OR shipments mark "Menunggu Alokasi HPO"
    const hasNoHpo = linkedHpos.length === 0
    const isWaitingHpoAllocation = linkedShipments.some(s => 
      String(s.current_status || '').toLowerCase().includes('menunggu alokasi hpo')
    )

    if ((hasNoHpo || isWaitingHpoAllocation) && percentShipped < 100) {
      // Exclude if it was already 100% ready to ship from existing stock
      if (!hasStockInWarehouse) {
        belumDipesanList.push({
          ...soEntry,
          reason: hasNoHpo ? 'Belum ada HPO Vendor yang terhubung' : 'Status masih Menunggu Alokasi HPO',
          task_action: 'Purchasing perlu segera menerbitkan Purchase Order (HPO) ke vendor'
        })
      }
    }

    // 3. Check Condition 3: LOGISTIK STAGNAN (Shipment status has no movement > thresholdDays)
    if (linkedShipments.length > 0 && percentShipped < 100) {
      linkedShipments.forEach(s => {
        const statusDate = s.status_date || s.updated_at || s.created_at
        const daysStagnant = calculateDaysAgo(statusDate)
        const currentStatus = s.current_status || 'Dalam Proses'
        const lowerStatus = currentStatus.toLowerCase()

        // Exclude delivered / closed shipments
        const isDelivered = lowerStatus.includes('already in hokiindo') || lowerStatus.includes('selesai') || lowerStatus.includes('terkirim')

        if (!isDelivered && daysStagnant >= thresholdDays) {
          logistikStagnanList.push({
            ...soEntry,
            hpo_number: s.hpo_number || linkedHpos[0]?.po_number || '-',
            vendor_name: s.vendor_name || linkedHpos[0]?.vendor_name || 'Vendor',
            current_status: currentStatus,
            last_status_date: statusDate || '-',
            days_stagnant: daysStagnant,
            reason: `Status "${currentStatus}" tidak ada pergerakan selama ${daysStagnant} hari`,
            task_action: 'Follow-up vendor / ekspedisi untuk konfirmasi jadwal keberangkatan/tiba'
          })
        }
      })
    }
  })

  // Sort lists
  siapKirimList.sort((a, b) => b.amount - a.amount)
  belumDipesanList.sort((a, b) => b.days_since_created - a.days_since_created)
  logistikStagnanList.sort((a, b) => b.days_stagnant - a.days_stagnant)

  return {
    compiled_at: new Date().toISOString(),
    total_active_sos: activeSos.length,
    threshold_days: thresholdDays,
    siap_kirim: siapKirimList,
    belum_dipesan: belumDipesanList,
    logistik_stagnan: logistikStagnanList,
    counts: {
      siap_kirim: siapKirimList.length,
      belum_dipesan: belumDipesanList.length,
      logistik_stagnan: logistikStagnanList.length
    }
  }
}

// Generate Task-Style Email HTML Template
export function generateWeeklyTaskEmailHtml(taskData, settings = {}) {
  const isTestMode = settings.mode === 'test'
  const activeRecipients = isTestMode 
    ? (settings.test_recipients || ['davidtheosimaremare@gmail.com']).join(', ')
    : (settings.production_recipients || ['sales@hokiindo.co.id', 'info@hokiindo.co.id', 'purchasing@hokiindo.co.id']).join(', ')

  const dateFormatted = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date())

  const totalTasks = (taskData.counts.siap_kirim || 0) + (taskData.counts.belum_dipesan || 0) + (taskData.counts.logistik_stagnan || 0)

  // Build Siap Kirim rows
  let siapKirimRows = ''
  if (taskData.siap_kirim && taskData.siap_kirim.length > 0) {
    siapKirimRows = taskData.siap_kirim.slice(0, 15).map((item, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 0 ? 'background-color: #ffffff;' : 'background-color: #f8fafc;'}">
        <td style="padding: 12px; font-family: monospace; font-weight: bold; color: #0f172a;">
          <a href="${item.link}" style="color: #0369a1; text-decoration: none;">${item.so_number}</a>
        </td>
        <td style="padding: 12px; color: #334155; font-size: 13px;">
          <strong>${item.customer_name}</strong>
          ${item.project_name && item.project_name !== '-' ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">Proyek: ${item.project_name}</div>` : ''}
        </td>
        <td style="padding: 12px; color: #166534; font-size: 12px; font-weight: 600;">
          <span style="background-color: #dcfce7; padding: 3px 8px; border-radius: 6px; display: inline-block;">
            ✓ ${item.reason}
          </span>
        </td>
        <td style="padding: 12px; text-align: right; font-weight: 700; color: #0f172a; font-family: monospace; font-size: 13px;">
          ${item.amount_formatted}
        </td>
        <td style="padding: 12px; text-align: center;">
          <a href="${item.link}" style="display: inline-block; background-color: #0284c7; color: #ffffff; padding: 6px 12px; font-size: 11px; font-weight: bold; border-radius: 6px; text-decoration: none;">
            Buka HSO &rarr;
          </a>
        </td>
      </tr>
    `).join('')
  } else {
    siapKirimRows = `
      <tr>
        <td colspan="5" style="padding: 24px; text-align: center; color: #64748b; font-style: italic;">
          ✓ Tidak ada HSO yang siap kirim tertahan saat ini. Seluruh barang ready telah diproses.
        </td>
      </tr>
    `
  }

  // Build Belum Dipesan rows
  let belumDipesanRows = ''
  if (taskData.belum_dipesan && taskData.belum_dipesan.length > 0) {
    belumDipesanRows = taskData.belum_dipesan.slice(0, 15).map((item, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 0 ? 'background-color: #ffffff;' : 'background-color: #f8fafc;'}">
        <td style="padding: 12px; font-family: monospace; font-weight: bold; color: #0f172a;">
          <a href="${item.link}" style="color: #b91c1c; text-decoration: none;">${item.so_number}</a>
        </td>
        <td style="padding: 12px; color: #334155; font-size: 13px;">
          <strong>${item.customer_name}</strong>
          ${item.project_name && item.project_name !== '-' ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">Proyek: ${item.project_name}</div>` : ''}
        </td>
        <td style="padding: 12px; color: #991b1b; font-size: 12px; font-weight: 600;">
          <span style="background-color: #fee2e2; padding: 3px 8px; border-radius: 6px; display: inline-block;">
            ⚠️ ${item.reason}
          </span>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Usia SO: ${item.days_since_created} hari (${item.trans_date})</div>
        </td>
        <td style="padding: 12px; text-align: right; font-weight: 700; color: #0f172a; font-family: monospace; font-size: 13px;">
          ${item.amount_formatted}
        </td>
        <td style="padding: 12px; text-align: center;">
          <a href="${item.link}" style="display: inline-block; background-color: #dc2626; color: #ffffff; padding: 6px 12px; font-size: 11px; font-weight: bold; border-radius: 6px; text-decoration: none;">
            Buat PO &rarr;
          </a>
        </td>
      </tr>
    `).join('')
  } else {
    belumDipesanRows = `
      <tr>
        <td colspan="5" style="padding: 24px; text-align: center; color: #64748b; font-style: italic;">
          ✓ Luar biasa! Seluruh HSO aktif telah diterbitkan Purchase Order (HPO) ke vendor.
        </td>
      </tr>
    `
  }

  // Build Logistik Stagnan rows
  let logistikStagnanRows = ''
  if (taskData.logistik_stagnan && taskData.logistik_stagnan.length > 0) {
    logistikStagnanRows = taskData.logistik_stagnan.slice(0, 15).map((item, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 0 ? 'background-color: #ffffff;' : 'background-color: #f8fafc;'}">
        <td style="padding: 12px; font-family: monospace; font-weight: bold; color: #0f172a;">
          <a href="${item.link}" style="color: #b45309; text-decoration: none;">${item.so_number}</a>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">HPO: ${item.hpo_number}</div>
        </td>
        <td style="padding: 12px; color: #334155; font-size: 13px;">
          <strong>${item.customer_name}</strong>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Vendor: ${item.vendor_name}</div>
        </td>
        <td style="padding: 12px; color: #92400e; font-size: 12px; font-weight: 600;">
          <span style="background-color: #fef3c7; padding: 3px 8px; border-radius: 6px; display: inline-block;">
            ⏳ ${item.current_status}
          </span>
          <div style="font-size: 11px; color: #b45309; font-weight: bold; margin-top: 4px;">
            ⚠️ ${item.days_stagnant} hari tanpa pergerakan (Update: ${item.last_status_date})
          </div>
        </td>
        <td style="padding: 12px; text-align: right; font-weight: 700; color: #0f172a; font-family: monospace; font-size: 13px;">
          ${item.amount_formatted}
        </td>
        <td style="padding: 12px; text-align: center;">
          <a href="${item.link}" style="display: inline-block; background-color: #d97706; color: #ffffff; padding: 6px 12px; font-size: 11px; font-weight: bold; border-radius: 6px; text-decoration: none;">
            Follow-Up &rarr;
          </a>
        </td>
      </tr>
    `).join('')
  } else {
    logistikStagnanRows = `
      <tr>
        <td colspan="5" style="padding: 24px; text-align: center; color: #64748b; font-style: italic;">
          ✓ Semua status pengiriman logistik terpantau aktif dan bergerak lancar.
        </td>
      </tr>
    `
  }

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rekap Tugas Mingguan HSO</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 24px 0;">
    <tr>
      <td align="center">
        
        <!-- MAIN CONTAINER -->
        <table width="680" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0; max-width: 680px; width: 100%;">
          
          <!-- BANNER / NOTICE JIKA TEST MODE -->
          ${isTestMode ? `
          <tr>
            <td style="background-color: #fffbeb; border-bottom: 2px solid #fde68a; padding: 10px 24px; font-size: 12px; color: #92400e; font-weight: 600; text-align: center;">
              ⚠️ <strong>MODE PENGETESAN (TEST MODE)</strong>: Email ini dikirimkan ke <u>${activeRecipients}</u> untuk pengetesan. Pengaturan ke email tim resmi (sales, info, purchasing) dapat diaktifkan melalui menu pengaturan.
            </td>
          </tr>
          ` : ''}

          <!-- HEADER -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 28px; color: #ffffff;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #38bdf8; margin-bottom: 6px;">
                      PT HOKIINDO RAYA &bull; HSO WORKSPACE
                    </div>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                      📋 Rekapan Tugas Mingguan HSO
                    </h1>
                    <div style="margin-top: 6px; font-size: 13px; color: #94a3b8;">
                      Laporan Mingguan &bull; <strong>${dateFormatted}</strong> &bull; Total <strong>${totalTasks} Task</strong> Perlu Perhatian
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 3 KPI SUMMARY BOXES -->
          <tr>
            <td style="padding: 24px 28px 12px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <!-- Card 1: Siap Kirim -->
                  <td width="32%" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 14px; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">🟢 Siap Kirim</div>
                    <div style="font-size: 26px; font-weight: 800; color: #14532d; font-family: monospace; margin: 4px 0;">
                      ${taskData.counts.siap_kirim}
                    </div>
                    <div style="font-size: 11px; color: #166534;">Tugas: Sales & Logistik (Buat DO)</div>
                  </td>
                  
                  <td width="2%">&nbsp;</td>

                  <!-- Card 2: Belum Dipesan -->
                  <td width="32%" style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 14px; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 0.5px;">🔴 Belum Dipesan</div>
                    <div style="font-size: 26px; font-weight: 800; color: #7f1d1d; font-family: monospace; margin: 4px 0;">
                      ${taskData.counts.belum_dipesan}
                    </div>
                    <div style="font-size: 11px; color: #991b1b;">Tugas: Purchasing (Terbitkan PO)</div>
                  </td>

                  <td width="2%">&nbsp;</td>

                  <!-- Card 3: Logistik Stagnan -->
                  <td width="32%" style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 14px; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px;">🟡 Logistik Stagnan</div>
                    <div style="font-size: 26px; font-weight: 800; color: #78350f; font-family: monospace; margin: 4px 0;">
                      ${taskData.counts.logistik_stagnan}
                    </div>
                    <div style="font-size: 11px; color: #92400e;">Tugas: Follow-Up Vendor/Exp</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- SECTION 1: SIAP KIRIM -->
          <tr>
            <td style="padding: 16px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <tr style="background-color: #f0fdf4; border-bottom: 1px solid #bbf7d0;">
                  <td colspan="5" style="padding: 14px 16px;">
                    <div style="font-size: 14px; font-weight: 800; color: #166534;">
                      🟢 TUGAS 1: HSO Siap Kirim (${taskData.counts.siap_kirim} Order)
                    </div>
                    <div style="font-size: 12px; color: #15803d; margin-top: 2px;">
                      Barang sudah tiba di Hokiindo atau stok ready. Mohon Tim Sales & Gudang segera jadwalkan pengiriman dan buat Surat Jalan (DO).
                    </div>
                  </td>
                </tr>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                  <th style="padding: 10px 12px; text-align: left;">No. HSO</th>
                  <th style="padding: 10px 12px; text-align: left;">Customer</th>
                  <th style="padding: 10px 12px; text-align: left;">Kondisi</th>
                  <th style="padding: 10px 12px; text-align: right;">Nilai SO</th>
                  <th style="padding: 10px 12px; text-align: center;">Aksi</th>
                </tr>
                ${siapKirimRows}
              </table>
            </td>
          </tr>

          <!-- SECTION 2: BELUM DIPESAN -->
          <tr>
            <td style="padding: 16px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <tr style="background-color: #fef2f2; border-bottom: 1px solid #fecaca;">
                  <td colspan="5" style="padding: 14px 16px;">
                    <div style="font-size: 14px; font-weight: 800; color: #991b1b;">
                      🔴 TUGAS 2: HSO Belum Dipesan (${taskData.counts.belum_dipesan} Order)
                    </div>
                    <div style="font-size: 12px; color: #b91c1c; margin-top: 2px;">
                      HSO aktif berikut belum memiliki PO Vendor (HPO) yang terhubung. Mohon Tim Purchasing segera terbitkan PO ke supplier.
                    </div>
                  </td>
                </tr>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                  <th style="padding: 10px 12px; text-align: left;">No. HSO</th>
                  <th style="padding: 10px 12px; text-align: left;">Customer</th>
                  <th style="padding: 10px 12px; text-align: left;">Status / Usia SO</th>
                  <th style="padding: 10px 12px; text-align: right;">Nilai SO</th>
                  <th style="padding: 10px 12px; text-align: center;">Aksi</th>
                </tr>
                ${belumDipesanRows}
              </table>
            </td>
          </tr>

          <!-- SECTION 3: LOGISTIK STAGNAN -->
          <tr>
            <td style="padding: 16px 28px 24px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <tr style="background-color: #fffbeb; border-bottom: 1px solid #fde68a;">
                  <td colspan="5" style="padding: 14px 16px;">
                    <div style="font-size: 14px; font-weight: 800; color: #92400e;">
                      🟡 TUGAS 3: Logistik Stagnan / Belum Ada Pergerakan (${taskData.counts.logistik_stagnan} Order)
                    </div>
                    <div style="font-size: 12px; color: #b45309; margin-top: 2px;">
                      Pengiriman tidak mengalami perubahan status lebih dari ${taskData.threshold_days} hari. Mohon Tim Logistik & Purchasing follow-up ke ekspedisi/vendor.
                    </div>
                  </td>
                </tr>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                  <th style="padding: 10px 12px; text-align: left;">No. HSO / HPO</th>
                  <th style="padding: 10px 12px; text-align: left;">Customer / Vendor</th>
                  <th style="padding: 10px 12px; text-align: left;">Status & Durasi</th>
                  <th style="padding: 10px 12px; text-align: right;">Nilai SO</th>
                  <th style="padding: 10px 12px; text-align: center;">Aksi</th>
                </tr>
                ${logistikStagnanRows}
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 28px; text-align: center; color: #64748b; font-size: 12px;">
              <div style="font-weight: 700; color: #0f172a; margin-bottom: 4px;">PT HOKIINDO RAYA &bull; Sistem Operasional HSO</div>
              <div>Email otomatis rekapan mingguan setiap hari Jumat &bull; Penerima: <strong>${activeRecipients}</strong></div>
              <div style="margin-top: 12px;">
                <a href="https://hso.hokiindo.co.id/weekly-task-recap" style="color: #0284c7; text-decoration: underline; font-weight: 600;">
                  Kelola Pengaturan & Jadwal Rekapan Mingguan
                </a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `
}

// Send Weekly Task Email using send-custom-email function
export async function sendWeeklyTaskRecapEmail(taskData, settings = {}) {
  const isTestMode = settings.mode === 'test'
  
  let recipients = []
  if (isTestMode) {
    recipients = settings.test_recipients && settings.test_recipients.length > 0 
      ? settings.test_recipients 
      : ['davidtheosimaremare@gmail.com']
  } else {
    recipients = settings.production_recipients && settings.production_recipients.length > 0
      ? settings.production_recipients
      : ['sales@hokiindo.co.id', 'info@hokiindo.co.id', 'purchasing@hokiindo.co.id']
    
    // Add custom recipients if any
    if (settings.custom_recipients && Array.isArray(settings.custom_recipients)) {
      recipients = [...recipients, ...settings.custom_recipients].filter(Boolean)
    }
  }

  const dateFormatted = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date())

  const subjectPrefix = isTestMode ? '[TEST] ' : ''
  const subject = `${subjectPrefix}📋 Rekap Tugas Mingguan HSO (${taskData.counts.siap_kirim} Siap Kirim, ${taskData.counts.belum_dipesan} Belum Dipesan, ${taskData.counts.logistik_stagnan} Stagnan) - ${dateFormatted}`

  const emailHtml = generateWeeklyTaskEmailHtml(taskData, settings)

  console.log(`[WeeklyRecap] Sending email to: ${recipients.join(', ')}...`)

  try {
    const res = await supabase.functions.invoke('send-custom-email', {
      body: {
        to: recipients,
        subject,
        html: emailHtml,
        from_name: 'HIR HSO Weekly Task Bot'
      }
    })

    if (res.error) {
      throw new Error(res.error.message || 'Gagal mengirim email')
    }

    // Record delivery log
    const logEntry = {
      timestamp: new Date().toISOString(),
      recipients: recipients,
      mode: settings.mode,
      counts: taskData.counts,
      success: true,
      subject
    }

    try {
      const currentLogs = JSON.parse(localStorage.getItem('hir_weekly_recap_logs') || '[]')
      currentLogs.unshift(logEntry)
      if (currentLogs.length > 20) currentLogs.pop()
      localStorage.setItem('hir_weekly_recap_logs', JSON.stringify(currentLogs))
    } catch (e) {}

    // Update settings last sent
    await saveRecapSettings({
      ...settings,
      last_sent_at: new Date().toISOString(),
      last_sent_status: 'SUCCESS'
    })

    return {
      success: true,
      recipients,
      data: res.data,
      log: logEntry
    }
  } catch (err) {
    console.error('[WeeklyRecap] Send error:', err)
    
    // Record failed log
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        recipients,
        mode: settings.mode,
        counts: taskData.counts,
        success: false,
        error: err.message
      }
      const currentLogs = JSON.parse(localStorage.getItem('hir_weekly_recap_logs') || '[]')
      currentLogs.unshift(logEntry)
      localStorage.setItem('hir_weekly_recap_logs', JSON.stringify(currentLogs))
    } catch (e) {}

    return {
      success: false,
      error: err.message,
      recipients
    }
  }
}

