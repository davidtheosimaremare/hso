import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import nodemailer from "npm:nodemailer"

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    
    // SMTP Configurations
    const smtpHost = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
    const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '587')
    const smtpUser = Deno.env.get('SMTP_USER') || ''
    const smtpPass = Deno.env.get('SMTP_PASSWORD') || ''
    const smtpFrom = Deno.env.get('SMTP_FROM') || 'Hokiindo Shop <noreply@hokiindo.co.id>'
    const fallbackEmail = Deno.env.get('FALLBACK_NOTIFICATION_EMAIL') || smtpUser

    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase configuration missing!')
    if (!smtpUser || !smtpPass) throw new Error('SMTP credentials missing!')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Calculate dates for 1 day before deadline (Tomorrow)
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    const todayStr = now.toISOString().split('T')[0]
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    console.log(`Checking tasks with deadline between ${todayStr} and ${tomorrowStr}...`)

    // Query incomplete tasks where target_date is tomorrow or today
    const { data: tasks, error: dbError } = await supabase
      .from('boq_requests')
      .select('*')
      .neq('status', 'DONE')
      .lte('target_date', tomorrowStr)
      .gte('target_date', todayStr)

    if (dbError) throw dbError

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    })

    const sentResults: any[] = []

    if (tasks && tasks.length > 0) {
      for (const task of tasks) {
        const recipient = task.assignee
        if (!recipient || !recipient.includes('@')) continue

        let targetEmail = recipient
        try {
          const { data: userData } = await supabase
            .from('user_access')
            .select('notification_email')
            .eq('email', recipient)
            .maybeSingle()
          
          if (userData?.notification_email && userData.notification_email.includes('@')) {
            targetEmail = userData.notification_email
          }
        } catch {}

        const taskNumStr = task.task_number ? `TASK-${task.task_number}` : `TASK`
        const driveLink = task.file_link || task.file_url || ''
        const project = task.project_name || task.metadata?.project_name || '-'
        const customer = task.customer_name || task.metadata?.customer_name || '-'
        const pic = task.pic_name || task.metadata?.pic_name || '-'
        const appUrl = `https://shop.hokiindo.co.id/permintaan/${task.id}`

        const formatDate = (dateStr: string) => {
          if (!dateStr) return '-'
          try {
            return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
          } catch {
            return dateStr
          }
        }

        const subject = `[PERINGATAN DEADLINE H-1] Tugas "${task.title}" (${taskNumStr}) Belum Selesai!`

        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background: #f8fafc; padding: 24px; border-radius: 16px; border: 1px solid #e2e8f0;">
            <div style="background: #dc2626; padding: 16px 20px; border-radius: 12px; margin-bottom: 20px; color: #ffffff;">
              <h2 style="margin: 0; font-size: 18px; font-weight: bold;">⚠️ Peringatan Deadline (H-1)</h2>
              <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Tugas ini jatuh tempo esok hari dan belum selesai!</p>
            </div>

            <div style="background: #ffffff; padding: 20px; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 16px;">
              <span style="display: inline-block; background: #fee2e2; color: #991b1b; font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 4px; margin-bottom: 8px;">${taskNumStr} · Status: ${task.status}</span>
              <h3 style="margin: 0 0 12px 0; font-size: 20px; color: #0f172a; font-weight: 800;">${task.title}</h3>

              <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b; font-weight: bold; width: 110px;">Deadline:</td>
                  <td style="padding: 6px 0; color: #dc2626; font-weight: bold; font-size: 14px;">${formatDate(task.target_date)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Proyek:</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${project}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Customer:</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${customer}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b; font-weight: bold;">PIC:</td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${pic}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Didelegasikan ke:</td>
                  <td style="padding: 6px 0; color: #2563eb; font-weight: bold;">${targetEmail}</td>
                </tr>
              </table>
            </div>

            <div style="background: #ffffff; padding: 20px; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 20px;">
              <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: bold; color: #475569; text-transform: uppercase;">Deskripsi Tugas:</h4>
              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${task.description || 'Tidak ada deskripsi.'}</p>
            </div>

            ${driveLink ? `
            <div style="margin-bottom: 20px; text-align: center;">
              <a href="${driveLink}" target="_blank" style="display: inline-block; background: #059669; color: #ffffff; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-size: 14px;">
                📂 Buka Lampiran Google Drive
              </a>
            </div>
            ` : ''}

            <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
              <a href="${appUrl}" target="_blank" style="display: inline-block; background: #dc2626; color: #ffffff; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-size: 14px;">
                🚨 Buka & Kerjakan Tugas Sekarang
              </a>
              <p style="margin-top: 16px; font-size: 11px; color: #94a3b8;">Peringatan otomatis ini dikirim oleh HSO Sales Order System.</p>
            </div>
          </div>
        `

        try {
          const info = await transporter.sendMail({
            from: smtpFrom,
            to: targetEmail,
            subject: subject,
            html: htmlBody
          })
          sentResults.push({ id: task.id, title: task.title, to: targetEmail, messageId: info.messageId })
        } catch (mailErr: any) {
          console.warn(`Failed sending deadline email to ${targetEmail}: ${mailErr.message}. Forwarding to fallback...`)
          if (fallbackEmail && fallbackEmail.includes('@') && targetEmail !== fallbackEmail) {
            const fallbackHtml = `
              <div style="background:#fef2f2; border:1px solid #fca5a5; border-radius:10px; padding:12px 16px; margin-bottom:16px; font-family:sans-serif; font-size:13px; color:#991b1b;">
                <strong>⚠️ Catatan Sistem (Email Fallback):</strong><br/>
                Email pengingat deadline ini ditujukan ke <u>${targetEmail}</u>, namun gagal terkirim (email tidak aktif/invalid).<br/>
                Sistem meneruskan pesan ini ke Anda.
              </div>
            ` + htmlBody

            const fallbackInfo = await transporter.sendMail({
              from: smtpFrom,
              to: fallbackEmail,
              subject: `[FORWARD / FALLBACK DEADLINE] ` + subject,
              html: fallbackHtml
            })
            sentResults.push({ id: task.id, title: task.title, to: fallbackEmail, fallback: true, messageId: fallbackInfo.messageId })
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, count: sentResults.length, sent: sentResults }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error("Deadline Reminder Function Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
