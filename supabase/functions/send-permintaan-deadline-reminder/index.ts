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
    const smtpFrom = Deno.env.get('SMTP_FROM') || 'HIR Workspace Notification <workspace@hokiindo.co.id>'
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
        // Collect assignees from metadata or task.assignee
        const meta = task.metadata || {}
        let rawAssignees: string[] = []
        if (Array.isArray(meta.assignees) && meta.assignees.length > 0) {
          rawAssignees = meta.assignees
        } else if (task.assignee) {
          rawAssignees = task.assignee.split(',').map((s: string) => s.trim()).filter(Boolean)
        }

        if (rawAssignees.length === 0) continue

        // Resolve notification_email for each assignee
        for (const recipient of rawAssignees) {
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

          const subject = `[Peringatan Deadline H-1] Tugas: "${task.title}" (${taskNumStr})`

          const htmlBody = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; padding: 32px 16px; color: #1e293b;">
              <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
                
                <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-size: 13px; font-weight: 800; color: #0f172a;">HIR WORKSPACE</span>
                  <span style="font-size: 12px; color: #dc2626; font-weight: 700;">Pengingat Deadline H-1</span>
                </div>

                <div style="margin-bottom: 20px;">
                  <h2 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 700; color: #0f172a; line-height: 1.3;">Pengingat Deadline Tugas (H-1)</h2>
                  <p style="margin: 0; font-size: 13px; color: #64748b;">Tugas ini dijadwalkan selesai esok hari dan saat ini masih berstatus <strong>${task.status}</strong>.</p>
                </div>

                <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; background-color: #ffffff; margin-bottom: 24px;">
                  <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 4px;">ID TUGAS: ${taskNumStr}</div>
                  <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.4;">${task.title}</h3>
                  
                  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <tr style="border-top: 1px solid #f8fafc;">
                      <td style="padding: 8px 0; color: #64748b; width: 130px; font-weight: 500;">Target Deadline:</td>
                      <td style="padding: 8px 0; color: #dc2626; font-weight: 700;">${formatDate(task.target_date)}</td>
                    </tr>
                    ${project !== '-' ? `
                    <tr style="border-top: 1px solid #f8fafc;">
                      <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Proyek / Unit:</td>
                      <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${project}</td>
                    </tr>` : ''}
                    ${customer !== '-' ? `
                    <tr style="border-top: 1px solid #f8fafc;">
                      <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Pelanggan:</td>
                      <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${customer}</td>
                    </tr>` : ''}
                    ${task.description ? `
                    <tr style="border-top: 1px solid #f8fafc;">
                      <td style="padding: 8px 0; color: #64748b; font-weight: 500; vertical-align: top;">Deskripsi:</td>
                      <td style="padding: 8px 0; color: #334155; font-weight: 400; line-height: 1.5;">${task.description}</td>
                    </tr>` : ''}
                  </table>
                </div>

                <div style="text-align: center; margin-bottom: 24px;">
                  <a href="${appUrl}" target="_blank" style="display: inline-block; background-color: #dc2626; color: #ffffff; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px;">
                    Buka & Kerjakan Tugas
                  </a>
                </div>

                <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px; font-size: 12px; color: #94a3b8; text-align: center;">
                  Email notifikasi otomatis ini dikirim oleh Sistem HIR Workspace Hokiindo.
                </div>

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
              try {
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
              } catch (fErr: any) {
                console.error(`Fallback failed for ${targetEmail}:`, fErr.message)
              }
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ s: true, processedTasks: tasks?.length || 0, sentResults }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    console.error('Error in send-permintaan-deadline-reminder:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
