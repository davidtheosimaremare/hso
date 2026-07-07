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

// Helpers for stock notes parsing (Matches SalesOrderDetailView.vue exactly)
const parseStockFromNote = (note: string | null) => {
    if (!note) return { qty: 0, isReady: false, hasInfo: false }
    const lower = note.toLowerCase()
    
    if (lower.includes('no stock') || lower.includes('non stock') || lower.includes('kosong') || lower.includes('indent')) {
        return { qty: 0, isReady: false, hasInfo: true }
    }
    
    const match = lower.match(/(?:stock|stok|sisa)\s*[:.]?\s*(\d+)/)
    if (match) {
        return { qty: parseInt(match[1]), isReady: false, hasInfo: true }
    }
    
    if (lower.includes('stock') || lower.includes('stok') || lower.includes('ready')) {
        return { qty: 999999, isReady: true, hasInfo: true } 
    }
    
    return { qty: 0, isReady: false, hasInfo: false}
}

const getNoteType = (note: string | null) => {
    if (!note) return 'unknown'
    const n = note.toLowerCase()
    if (n.includes('no stock')) return 'no_stock'
    if (n.includes('stock')) return 'stock'
    return 'unknown'
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
        const smtpFrom = Deno.env.get('SMTP_FROM') || 'Hokiindo Shop <noreply@hokiindo.co.id>'
        const recipients = Deno.env.get('NOTIFICATION_RECIPIENTS') || smtpUser

        if (!accessToken) throw new Error('Token Accurate belum disetting!')
        if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase config missing!')
        if (!smtpUser || !smtpPass) throw new Error('SMTP user atau password belum disetting!')

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 1. Fetch List of Sales Orders from Accurate
        const timestamp = new Date().toISOString()
        let signatureHeader = {}
        if (signatureSecret) {
            const sig = await createHmacSha256(signatureSecret, timestamp)
            signatureHeader = { 'X-Api-Timestamp': timestamp, 'X-Api-Signature': sig }
        }

        console.log("Fetching open/partial SOs from Accurate...")
        const fieldsParam = 'id,number,transDate,customer,totalAmount,statusName,percentShipped'
        const listSoUrl = `${BASE_API}/sales-order/list.do?fields=${fieldsParam}&sp.pageSize=100`
        
        const listRes = await fetch(listSoUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...signatureHeader }
        })
        if (!listRes.ok) throw new Error(`Gagal fetch SO list: ${await listRes.text()}`)
        
        const listJson = await listRes.json()
        const allSos = listJson.d || []

        // Filter active SOs (Open or Partial)
        const activeSos = allSos.filter((so: any) => so.statusName === 'Open' || so.statusName === 'Partial')
        console.log(`Found ${activeSos.length} active (Open/Partial) Sales Orders.`)

        const alertHsoList: any[] = []

        // 2. Process each HSO
        for (const so of activeSos) {
            console.log(`Processing HSO: ${so.number} (${so.customer?.name || 'Unknown'})`)
            
            // Get SO Detail from Accurate
            const detailRes = await fetch(`${BASE_API}/sales-order/detail.do?id=${so.id}`, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...signatureHeader }
            })
            if (!detailRes.ok) {
                console.error(`Gagal fetch detail SO ${so.number}: ${await detailRes.text()}`)
                continue
            }
            const detailJson = await detailRes.json()
            const docData = detailJson.d
            if (!docData) continue

            // Fetch PO items matching this SO description
            const { data: poItems, error: poError } = await supabase
                .from('accurate_purchase_order_items')
                .select(`
                    *,
                    header:accurate_purchase_orders(
                        id, number, trans_date, status_name, vendor_name
                    )
                `)
                .ilike('detail_notes', `%${so.number}%`)
            
            if (poError) {
                console.error(`Error querying PO items for ${so.number}:`, poError)
                continue
            }

            // Fetch shipment records for this HSO
            const { data: shipments, error: shipError } = await supabase
                .from('shipments')
                .select('*')
                .eq('so_id', String(so.id))

            if (shipError) {
                console.error(`Error querying shipments for ${so.number}:`, shipError)
                continue
            }

            // Map PO items
            const hpoDetails = (poItems || []).map((item: any) => ({
                poNumber: item.header?.number,
                itemCode: item.item_code,
                quantity: item.quantity
            }))

            const itemsToPurchase: any[] = []
            const itemsReadyToDeliver: any[] = []

            const rawItems = docData.detailItem || []
            rawItems.forEach((item: any) => {
                const code = item.item?.no || '-'
                const qty_order = item.quantity || 0
                const qty_shipped = item.shipQuantity || 0
                const qty_remaining = qty_order - qty_shipped

                // Calculate stock & to order
                const note = item.detailNotes || ''
                const stockInfo = parseStockFromNote(note)
                let qty_to_order = 0
                if (stockInfo.isReady) {
                    qty_to_order = 0
                } else if (stockInfo.hasInfo) {
                    qty_to_order = Math.max(0, qty_order - stockInfo.qty)
                } else {
                    qty_to_order = qty_order
                }

                // Check HPOs
                const itemHpos = hpoDetails.filter((p: any) => p.itemCode === code)
                const totalPo = itemHpos.reduce((sum: number, hpo: any) => sum + (hpo.quantity || 0), 0)

                // Category A: Needs PO / Under Ordered
                if (qty_to_order > 0) {
                    if (totalPo < qty_to_order) {
                        const statusText = totalPo === 0 ? 'PERLU DIPESAN' : 'KURANG DIPESAN'
                        itemsToPurchase.push({
                            code: code,
                            name: item.item?.name || item.detailName,
                            qty_order: qty_order,
                            qty_to_order: qty_to_order,
                            total_po: totalPo,
                            shortage: qty_to_order - totalPo,
                            status: statusText
                        })
                    }
                }

                // Category B: Arrived at Hokiindo but not fully shipped to customer
                if (qty_remaining > 0) {
                    // Check if there is an associated shipment with hokiindo_date (Arrived Hokiindo)
                    const itemShipments = (shipments || []).filter((s: any) => s.item_code === code)
                    const hasArrivedHokiindo = itemShipments.some((s: any) => s.hokiindo_date || s.current_status === 'Already in Hokiindo Raya')

                    if (hasArrivedHokiindo) {
                        itemsReadyToDeliver.push({
                            code: code,
                            name: item.item?.name || item.detailName,
                            qty_order: qty_order,
                            qty_shipped: qty_shipped,
                            qty_remaining: qty_remaining,
                            status: 'READY DI HOKIINDO'
                        })
                    }
                }
            })

            if (itemsToPurchase.length > 0 || itemsReadyToDeliver.length > 0) {
                alertHsoList.push({
                    number: so.number,
                    customer: so.customer?.name || 'Unknown',
                    itemsToPurchase,
                    itemsReadyToDeliver
                })
            }
        }

        console.log(`HSO Alert List compiled: ${alertHsoList.length} HSOs require notifications.`)

        if (alertHsoList.length === 0) {
            return new Response(JSON.stringify({ s: true, message: "Tidak ada data HSO yang butuh reminder hari ini." }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 3. Construct HTML Email Content
        const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'
        
        let htmlBody = `
        <html>
        <head>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333333; background-color: #f4f6f8; margin: 0; padding: 20px; }
                .container { max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e1e4e8; }
                .header { background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); color: #ffffff; padding: 30px 20px; text-align: center; }
                .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
                .header p { margin: 5px 0 0 0; opacity: 0.9; font-size: 14px; }
                .content { padding: 30px 25px; }
                .intro { font-size: 14px; color: #555555; margin-bottom: 25px; border-bottom: 1px solid #eeeeee; padding-bottom: 15px; }
                .hso-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 25px; padding: 20px; }
                .hso-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 15px; }
                .hso-number { font-size: 16px; font-weight: 700; color: #0f172a; }
                .hso-customer { font-size: 14px; font-weight: 600; color: #475569; }
                .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 15px 0 8px 0; }
                .section-title.purchase { color: #b91c1c; }
                .section-title.delivery { color: #059669; }
                
                table { width: 100%; border-collapse: collapse; margin-bottom: 15px; background: #ffffff; font-size: 13px; border-radius: 6px; overflow: hidden; border: 1px solid #e2e8f0; }
                th { background-color: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 10px 12px; border-bottom: 1px solid #cbd5e1; }
                td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
                
                .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
                .badge.red { background-color: #fef2f2; color: #991b1b; border: 1px solid #fee2e2; }
                .badge.amber { background-color: #fffbeb; color: #92400e; border: 1px solid #fef3c7; }
                .badge.green { background-color: #ecfdf5; color: #065f46; border: 1px solid #d1fae5; }
                
                .btn-link { display: inline-block; background-color: #dc2626; color: #ffffff !important; text-decoration: none; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; text-align: center; }
                .footer { background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>HSO LOGISTICS TRACKER</h1>
                    <p>Laporan Rekap Harian Status Pesanan & Logistik</p>
                </div>
                <div class="content">
                    <p class="intro">Halo Tim Hokiindo Raya,<br>Berikut adalah rekap harian untuk Sales Order (HSO) yang memerlukan tindakan tindak lanjut pembelian (PO) atau pengiriman barang hari ini (${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}):</p>
        `

        alertHsoList.forEach(hso => {
            const hsoLink = `${appUrl}/sales-orders/${hso.number.replace(/\//g, '-')}`
            htmlBody += `
            <div class="hso-card">
                <div class="hso-header">
                    <div>
                        <span class="hso-number">${hso.number}</span>
                        <span style="margin: 0 8px; color: #cbd5e1;">|</span>
                        <span class="hso-customer">${hso.customer}</span>
                    </div>
                    <div>
                        <a href="${hsoLink}" class="btn-link" target="_blank">Lihat Detail HSO</a>
                    </div>
                </div>
            `

            // Category A: Needs PO
            if (hso.itemsToPurchase.length > 0) {
                htmlBody += `
                <div class="section-title purchase">⚠️ KEKURANGAN PEMBELIAN (BUTUH PO KE PRINCIPLE)</div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 25%;">Kode Produk</th>
                            <th style="width: 40%;">Nama Produk</th>
                            <th style="width: 12%; text-align: center;">Qty Order</th>
                            <th style="width: 12%; text-align: center;">Kekurangan</th>
                            <th style="width: 11%; text-align: center;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                `
                hso.itemsToPurchase.forEach((item: any) => {
                    const badgeClass = item.status === 'PERLU DIPESAN' ? 'red' : 'amber'
                    htmlBody += `
                    <tr>
                        <td style="font-family: monospace; font-weight: bold;">${item.code}</td>
                        <td>${item.name}</td>
                        <td style="text-align: center; font-weight: bold;">${item.qty_to_order}</td>
                        <td style="text-align: center; color: #b91c1c; font-weight: bold;">${item.shortage}</td>
                        <td style="text-align: center;"><span class="badge ${badgeClass}">${item.status}</span></td>
                    </tr>
                    `
                })
                htmlBody += `
                    </tbody>
                </table>
                `
            }

            // Category B: Ready to Deliver
            if (hso.itemsReadyToDeliver.length > 0) {
                htmlBody += `
                <div class="section-title delivery">📦 BARANG READY GUDANG (BELUM DIKIRIM KE CUSTOMER)</div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 25%;">Kode Produk</th>
                            <th style="width: 45%;">Nama Produk</th>
                            <th style="width: 15%; text-align: center;">Qty Ready</th>
                            <th style="width: 15%; text-align: center;">Belum Dikirim</th>
                        </tr>
                    </thead>
                    <tbody>
                `
                hso.itemsReadyToDeliver.forEach((item: any) => {
                    htmlBody += `
                    <tr>
                        <td style="font-family: monospace; font-weight: bold;">${item.code}</td>
                        <td>${item.name}</td>
                        <td style="text-align: center; color: #059669; font-weight: bold;">${item.qty_order}</td>
                        <td style="text-align: center; color: #b91c1c; font-weight: bold;">${item.qty_remaining}</td>
                    </tr>
                    `
                })
                htmlBody += `
                    </tbody>
                </table>
                `
            }

            htmlBody += `</div>`
        })

        htmlBody += `
                </div>
                <div class="footer">
                    <p>Email ini dikirimkan secara otomatis oleh sistem <strong>HSO Logistics Tracker</strong> Hokiindo Raya.</p>
                    <p>&copy; 2026 PT Hokiindo Raya. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `

        // 4. Send email using Nodemailer
        console.log(`Connecting to SMTP: ${smtpHost}:${smtpPort} as ${smtpUser}...`)
        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465, // True for 465, false for other ports
            auth: {
                user: smtpUser,
                pass: smtpPass
            }
        })

        console.log(`Sending email digest to: ${recipients}...`)
        const mailOptions = {
            from: smtpFrom,
            to: recipients,
            subject: `[Reminder HSO] Rekap Logistik & Kekurangan PO - ${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'numeric', day: 'numeric' })}`,
            html: htmlBody
        }

        const info = await transporter.sendMail(mailOptions)
        console.log("Email sent successfully! MessageId:", info.messageId)

        return new Response(JSON.stringify({ s: true, message: `Berhasil mengirim email digest reminder ke ${recipients}.`, messageId: info.messageId }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error("Function Error:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
