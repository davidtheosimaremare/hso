import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import nodemailer from "npm:nodemailer"

const BASE_API = 'https://zeus.accurate.id/accurate/api'

// Helper: Native HMAC-SHA256 Signature for Accurate API
async function createHmacSha256(secret: string, message: string) {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const msgData = encoder.encode(message)
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const signature = await crypto.subtle.sign("HMAC", key, msgData)
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

function calculateDaysAgo(dateStr: string | null | undefined): number {
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

function formatCurrency(val: any): string {
  const num = typeof val === 'number' ? val : parseFloat(String(val || 0).replace(/,/g, ''))
  if (isNaN(num)) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num)
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const accessToken = Deno.env.get('ACCURATE_ACCESS_TOKEN')
    const signatureSecret = Deno.env.get('ACCURATE_SIGNATURE_SECRET')
    
    // SMTP Configurations
    const smtpHost = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
    const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '587')
    const smtpUser = Deno.env.get('SMTP_USER') || ''
    const smtpPass = Deno.env.get('SMTP_PASSWORD') || ''
    const smtpFrom = Deno.env.get('SMTP_FROM') || 'HSO Workspace <workspace@hokiindo.co.id>'

    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase config missing!')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Optional manual payload override
    const body = await req.json().catch(() => ({}))
    const forceMode = body?.mode // 'test' | 'production' | undefined

    // 1. Load settings from system_settings
    let settings = {
      mode: 'test',
      test_recipients: ['davidtheosimaremare@gmail.com'],
      production_recipients: ['sales@hokiindo.co.id', 'info@hokiindo.co.id', 'purchasing@hokiindo.co.id'],
      custom_recipients: [] as string[],
      day_of_week: 'Jumat',
      send_time: '08:00',
      stagnant_threshold_days: 5,
      is_active: true
    }

    const { data: dbSettings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'weekly_recap_settings')
      .maybeSingle()

    if (dbSettings?.value && typeof dbSettings.value === 'object') {
      settings = { ...settings, ...dbSettings.value }
    }

    if (forceMode) {
      settings.mode = forceMode
    }

    const isTestMode = settings.mode === 'test'
    let recipients: string[] = []
    if (isTestMode) {
      recipients = settings.test_recipients?.length > 0 ? settings.test_recipients : ['davidtheosimaremare@gmail.com']
    } else {
      recipients = settings.production_recipients?.length > 0 
        ? settings.production_recipients 
        : ['sales@hokiindo.co.id', 'info@hokiindo.co.id', 'purchasing@hokiindo.co.id']
      if (settings.custom_recipients?.length) {
        recipients = [...recipients, ...settings.custom_recipients]
      }
    }

    // 2. Fetch Active SOs from Accurate API or Supabase fallback
    let soList: any[] = []
    if (accessToken) {
      try {
        const timestamp = new Date().toISOString()
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${accessToken}`,
          'X-Api-Timestamp': timestamp
        }
        if (signatureSecret) {
          headers['X-Api-Signature'] = await createHmacSha256(signatureSecret, timestamp)
        }
        const accurateUrl = new URL(`${BASE_API}/sales-order/list.do`)
        accurateUrl.searchParams.append('fields', 'id,number,transDate,customer,totalAmount,statusName,percentShipped,description,poNumber,detailItem')
        accurateUrl.searchParams.append('limit', '2000')

        const res = await fetch(accurateUrl.toString(), { headers })
        const json = await res.json()
        if (json?.d && Array.isArray(json.d)) {
          soList = json.d
        }
      } catch (err) {
        console.warn('Failed fetching directly from Accurate API in Edge Function:', err)
      }
    }

    // Filter active SOs
    const activeSos = soList.filter(so => {
      const st = String(so.statusName || so.status || '').toLowerCase().trim()
      return st === 'menunggu diproses' || st === 'sebagian diproses'
    })

    // 3. Fetch linked POs and Shipments from Supabase
    const [poItemsRes, shipmentsRes] = await Promise.all([
      supabase
        .from('accurate_purchase_order_items')
        .select('hso_number, quantity, item_code, item_name, header:accurate_purchase_orders(id, number, trans_date, vendor_name, status_name)')
        .not('hso_number', 'is', null),
      supabase
        .from('shipments')
        .select('*')
    ])

    const soHpoMap: Record<string, any[]> = {}
    ;(poItemsRes?.data || []).forEach((p: any) => {
      if (p.hso_number && p.header?.number) {
        const key = p.hso_number.trim().toUpperCase()
        if (!soHpoMap[key]) soHpoMap[key] = []
        soHpoMap[key].push({
          po_number: p.header.number,
          vendor_name: p.header.vendor_name || 'Vendor',
          trans_date: p.header.trans_date,
          status_name: p.header.status_name,
          quantity: p.quantity
        })
      }
    })

    const soShipmentMap: Record<string, any[]> = {}
    ;(shipmentsRes?.data || []).forEach((s: any) => {
      const keys = [
        s.so_number ? String(s.so_number).trim().toUpperCase() : null,
        s.so_id ? String(s.so_id).trim().toUpperCase() : null
      ].filter(Boolean)
      keys.forEach((k: any) => {
        if (!soShipmentMap[k]) soShipmentMap[k] = []
        soShipmentMap[k].push(s)
      })
    })

    // 4. Categorize tasks
    const siapKirimList: any[] = []
    const belumDipesanList: any[] = []
    const logistikStagnanList: any[] = []
    const thresholdDays = settings.stagnant_threshold_days || 5

    activeSos.forEach(so => {
      const soNumber = (so.number || `HSO ${so.id}`).trim()
      const soKey = soNumber.toUpperCase()
      const customerName = so.customer?.name || so.customer || '-'
      const amount = Math.round(so.totalAmount || 0)
      const percentShipped = Number(so.percentShipped || 0)
      const transDate = so.transDate || '-'
      const daysSinceCreated = calculateDaysAgo(transDate)

      const linkedHpos = soHpoMap[soKey] || []
      const linkedShipments = soShipmentMap[soKey] || soShipmentMap[String(so.id)] || []

      const entry = {
        so_number: soNumber,
        customer_name: customerName,
        trans_date: transDate,
        days_since_created: daysSinceCreated,
        amount,
        amount_formatted: formatCurrency(amount),
        status_name: so.statusName || 'Menunggu diproses',
        percent_shipped: percentShipped,
        hpo_list: Array.from(new Set(linkedHpos.map(h => h.po_number))),
        shipment_count: linkedShipments.length,
        link: `https://hso.hokiindo.co.id/sales-orders/${soNumber.replace(/\//g, '-')}`
      }

      // Check Siap Kirim
      const hasArrivedInHokiindo = linkedShipments.some((s: any) => {
        const st = String(s.current_status || '').toLowerCase()
        return st.includes('already in hokiindo') || st.includes('tiba di hokiindo') || Boolean(s.hokiindo_date)
      })
      const isWarehouseReady = String(so.description || '').toLowerCase().includes('ready')
      if (percentShipped < 100 && (hasArrivedInHokiindo || isWarehouseReady)) {
        siapKirimList.push({
          ...entry,
          reason: hasArrivedInHokiindo ? 'Stok telah tiba di gudang Hokiindo (Perlu kirim ke Customer)' : 'Barang tercatat siap di gudang'
        })
      }

      // Check Belum Dipesan
      const hasNoHpo = linkedHpos.length === 0
      if (percentShipped < 100 && hasNoHpo) {
        belumDipesanList.push({
          ...entry,
          reason: 'Belum ada penerbitan PO Vendor (HPO)'
        })
      }

      // Check Logistik Stagnan
      if (linkedShipments.length > 0 && percentShipped < 100) {
        linkedShipments.forEach((s: any) => {
          const lastDate = s.eta_date || s.airway_bill_date || s.po_date || s.updated_at || s.created_at
          const daysStagnant = calculateDaysAgo(lastDate)
          const st = String(s.current_status || '').toLowerCase()
          const isDelivered = st.includes('delivered to customer') || st.includes('selesai')
          if (!isDelivered && daysStagnant >= thresholdDays) {
            logistikStagnanList.push({
              ...entry,
              shipment_id: s.id,
              current_status: s.current_status || 'Menunggu Update',
              days_stagnant: daysStagnant,
              reason: `Status "${s.current_status || 'Belum update'}" tidak ada pergerakan selama ${daysStagnant} hari`
            })
          }
        })
      }
    })

    const counts = {
      siap_kirim: siapKirimList.length,
      belum_dipesan: belumDipesanList.length,
      logistik_stagnan: logistikStagnanList.length,
      total_tasks: siapKirimList.length + belumDipesanList.length + logistikStagnanList.length
    }

    const dateFormatted = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())
    const subjectPrefix = isTestMode ? '[TEST] ' : ''
    const subject = `${subjectPrefix}📋 Rekap Tugas Mingguan HSO (${counts.siap_kirim} Siap Kirim, ${counts.belum_dipesan} Belum Dipesan, ${counts.logistik_stagnan} Stagnan) - ${dateFormatted}`

    // Simple HTML compilation
    const renderTableRows = (items: any[]) => {
      if (items.length === 0) {
        return `<tr><td colspan="5" style="padding: 16px; text-align: center; color: #10b981; font-weight: bold; background-color: #f0fdf4;">✓ Tidak ada tugas dalam kategori ini (Semua beres).</td></tr>`
      }
      return items.slice(0, 30).map(item => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 12px; font-weight: bold; font-family: monospace;">
            <a href="${item.link}" style="color: #2563eb; text-decoration: none;">${item.so_number}</a>
          </td>
          <td style="padding: 10px 12px; color: #334155;">
            <b>${item.customer_name}</b>
          </td>
          <td style="padding: 10px 12px; color: #475569; font-size: 12px;">
            ${item.reason || '-'}
          </td>
          <td style="padding: 10px 12px; text-align: right; font-family: monospace; color: #334155;">
            ${item.amount_formatted}
          </td>
          <td style="padding: 10px 12px; text-align: center;">
            <a href="${item.link}" style="background-color: #2563eb; color: #ffffff; padding: 4px 8px; border-radius: 4px; text-decoration: none; font-size: 11px; font-weight: bold;">Buka SO →</a>
          </td>
        </tr>
      `).join('')
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }</style>
      </head>
      <body>
        <div style="max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 24px; color: #ffffff;">
            <h1 style="margin: 0; font-size: 20px; font-weight: 800;">📋 Rekap Tugas Mingguan HSO (Hokiindo Operations)</h1>
            <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Rekapan status pesanan per ${dateFormatted}. Target tindak lanjut operasional antar tim.</p>
          </div>

          <div style="padding: 24px;">
            <!-- KPI Badges -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
              <tr>
                <td width="33%" style="padding: 4px;">
                  <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 11px; font-weight: bold; color: #166534; text-transform: uppercase;">1. Siap Kirim</div>
                    <div style="font-size: 28px; font-weight: 800; color: #15803d; margin: 4px 0;">${counts.siap_kirim}</div>
                    <div style="font-size: 11px; color: #166534;">Tugas Sales & Gudang</div>
                  </div>
                </td>
                <td width="33%" style="padding: 4px;">
                  <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 11px; font-weight: bold; color: #92400e; text-transform: uppercase;">2. Belum Dipesan</div>
                    <div style="font-size: 28px; font-weight: 800; color: #b45309; margin: 4px 0;">${counts.belum_dipesan}</div>
                    <div style="font-size: 11px; color: #92400e;">Tugas Purchasing (HPO)</div>
                  </div>
                </td>
                <td width="33%" style="padding: 4px;">
                  <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 11px; font-weight: bold; color: #9f1239; text-transform: uppercase;">3. Logistik Stagnan</div>
                    <div style="font-size: 28px; font-weight: 800; color: #be123c; margin: 4px 0;">${counts.logistik_stagnan}</div>
                    <div style="font-size: 11px; color: #9f1239;">Tugas Logistik (> ${thresholdDays} Hari)</div>
                  </div>
                </td>
              </tr>
            </table>

            <!-- Section 1 -->
            <div style="margin-bottom: 28px;">
              <h3 style="font-size: 15px; color: #166534; margin: 0 0 10px 0; border-bottom: 2px solid #86efac; padding-bottom: 6px;">
                📦 Tugas 1: HSO Siap Kirim ke Customer (${counts.siap_kirim} Order)
              </h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px; border-collapse: collapse;">
                <tr style="background: #f8fafc; font-weight: bold; border-bottom: 2px solid #cbd5e1;">
                  <td style="padding: 8px 12px;">No. HSO</td>
                  <td style="padding: 8px 12px;">Customer</td>
                  <td style="padding: 8px 12px;">Keterangan</td>
                  <td style="padding: 8px 12px; text-align: right;">Nilai</td>
                  <td style="padding: 8px 12px; text-align: center;">Aksi</td>
                </tr>
                ${renderTableRows(siapKirimList)}
              </table>
            </div>

            <!-- Section 2 -->
            <div style="margin-bottom: 28px;">
              <h3 style="font-size: 15px; color: #92400e; margin: 0 0 10px 0; border-bottom: 2px solid #fde68a; padding-bottom: 6px;">
                📝 Tugas 2: HSO Aktif Belum Dipesan ke Vendor (${counts.belum_dipesan} Order)
              </h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px; border-collapse: collapse;">
                <tr style="background: #f8fafc; font-weight: bold; border-bottom: 2px solid #cbd5e1;">
                  <td style="padding: 8px 12px;">No. HSO</td>
                  <td style="padding: 8px 12px;">Customer</td>
                  <td style="padding: 8px 12px;">Keterangan</td>
                  <td style="padding: 8px 12px; text-align: right;">Nilai</td>
                  <td style="padding: 8px 12px; text-align: center;">Aksi</td>
                </tr>
                ${renderTableRows(belumDipesanList)}
              </table>
            </div>

            <!-- Section 3 -->
            <div style="margin-bottom: 28px;">
              <h3 style="font-size: 15px; color: #9f1239; margin: 0 0 10px 0; border-bottom: 2px solid #fecdd3; padding-bottom: 6px;">
                ⏳ Tugas 3: Status Logistik Tidak Ada Pergerakan > ${thresholdDays} Hari (${counts.logistik_stagnan} Pengiriman)
              </h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px; border-collapse: collapse;">
                <tr style="background: #f8fafc; font-weight: bold; border-bottom: 2px solid #cbd5e1;">
                  <td style="padding: 8px 12px;">No. HSO</td>
                  <td style="padding: 8px 12px;">Customer</td>
                  <td style="padding: 8px 12px;">Status Terakhir</td>
                  <td style="padding: 8px 12px; text-align: right;">Nilai</td>
                  <td style="padding: 8px 12px; text-align: center;">Aksi</td>
                </tr>
                ${renderTableRows(logistikStagnanList)}
              </table>
            </div>

            <!-- Portal CTA -->
            <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; text-align: center; margin-top: 24px;">
              <p style="margin: 0 0 10px 0; font-size: 13px; color: #475569;">Buka portal HSO untuk melihat seluruh detail pesanan, mutasi barang, dan alokasi stok:</p>
              <a href="https://hso.hokiindo.co.id/sales-orders?status=Menunggu+diproses,Sebagian+diproses" style="background-color: #1e3a8a; color: #ffffff; padding: 8px 20px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: bold; display: inline-block;">
                Buka Portal Sales Orders HSO →
              </a>
            </div>
          </div>

          <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 11px; color: #94a3b8;">
            Email ini dikirimkan secara otomatis oleh Sistem Operasional HSO (PT Hokiindo Raya).<br>
            Mode: <b>${settings.mode.toUpperCase()}</b> | Target: ${recipients.join(', ')}
          </div>
        </div>
      </body>
      </html>
    `

    // 5. Send Email via nodemailer
    if (smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      })

      const mailOptions = {
        from: smtpFrom,
        to: recipients,
        subject,
        html: emailHtml
      }

      await transporter.sendMail(mailOptions)
    } else {
      console.warn('SMTP credentials missing, invoking send-custom-email edge function fallback...')
      await supabase.functions.invoke('send-custom-email', {
        body: {
          to: recipients,
          subject,
          html: emailHtml,
          from_name: 'HIR HSO Weekly Task Bot'
        }
      })
    }

    // 6. Update system_settings last_sent_at
    await supabase
      .from('system_settings')
      .upsert({
        key: 'weekly_recap_settings',
        value: {
          ...settings,
          last_sent_at: new Date().toISOString(),
          last_sent_status: 'SUCCESS',
          last_counts: counts
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' })

    return new Response(JSON.stringify({
      success: true,
      mode: settings.mode,
      recipients,
      counts
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (err: any) {
    console.error('send-weekly-recap error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})

