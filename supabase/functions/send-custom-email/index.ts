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
    const smtpHost = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
    const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '587')
    const smtpUser = Deno.env.get('SMTP_USER') || ''
    const smtpPass = Deno.env.get('SMTP_PASSWORD') || ''
    const smtpFrom = Deno.env.get('SMTP_FROM') || 'HIR Workspace Notification <workspace@hokiindo.co.id>'
    const fallbackEmail = Deno.env.get('FALLBACK_NOTIFICATION_EMAIL') || smtpUser

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!smtpUser || !smtpPass) {
      throw new Error('SMTP user atau password belum disetting!')
    }

    const { to, subject, html, from_email, from_name } = await req.json()

    if (!to || !subject || !html) {
      throw new Error('Parameter to, subject, dan html wajib diisi!')
    }

    let finalFrom = smtpFrom
    if (from_email && from_email.includes('@')) {
      const name = from_name || 'HIR Workspace Notification'
      finalFrom = `"${name}" <${from_email}>`
    }

    // Parse all target recipients (support array, string, comma-separated)
    let rawRecipients: string[] = []
    if (Array.isArray(to)) {
      rawRecipients = to.flatMap((item: any) => typeof item === 'string' ? item.split(',') : []).map((s: string) => s.trim()).filter(Boolean)
    } else if (typeof to === 'string') {
      rawRecipients = to.split(',').map((s: string) => s.trim()).filter(Boolean)
    }

    if (rawRecipients.length === 0) {
      throw new Error('Penerima email (to) tidak valid!')
    }

    // Create Supabase client for user_access lookup
    let supabase: any = null
    if (supabaseUrl && supabaseServiceKey) {
      try {
        supabase = createClient(supabaseUrl, supabaseServiceKey)
      } catch (e) {
        console.warn('Notice creating Supabase client:', e)
      }
    }

    // Resolve each recipient's configured notification_email from user_access
    const targetEmails: string[] = []
    for (const rawEmail of rawRecipients) {
      let resolved = rawEmail
      if (supabase && rawEmail.includes('@')) {
        try {
          const { data: userData } = await supabase
            .from('user_access')
            .select('notification_email')
            .eq('email', rawEmail)
            .maybeSingle()

          if (userData?.notification_email && userData.notification_email.includes('@')) {
            console.log(`Redirecting notification for ${rawEmail} -> ${userData.notification_email}`)
            resolved = userData.notification_email
          }
        } catch (dbErr) {
          console.warn(`Notice checking user_access for ${rawEmail}:`, dbErr)
        }
      }
      if (resolved && !targetEmails.includes(resolved)) {
        targetEmails.push(resolved)
      }
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    })

    console.log(`Sending custom email to ${targetEmails.length} recipient(s): ${targetEmails.join(', ')} from ${finalFrom}...`)

    const successList: string[] = []
    const failedList: string[] = []

    for (const targetEmail of targetEmails) {
      try {
        const info = await transporter.sendMail({
          from: finalFrom,
          to: targetEmail,
          subject: subject,
          html: html
        })
        console.log(`Email sent successfully to ${targetEmail}! MessageId: ${info.messageId}`)
        successList.push(targetEmail)
      } catch (primaryError: any) {
        console.warn(`Failed to send email to ${targetEmail}: ${primaryError.message}. Triggering admin fallback...`)
        failedList.push(targetEmail)

        // Fallback mechanism: Forward to admin/fallback email if primary recipient bounces/fails
        if (fallbackEmail && fallbackEmail.includes('@') && targetEmail !== fallbackEmail) {
          try {
            const fallbackNoticeHtml = `
              <div style="background:#fef2f2; border:1px solid #fca5a5; border-radius:10px; padding:12px 16px; margin-bottom:16px; font-family:sans-serif; font-size:13px; color:#991b1b;">
                <strong>⚠️ Catatan Sistem (Email Fallback):</strong><br/>
                Email notifikasi ini seharusnya dikirim ke <u>${targetEmail}</u>, namun gagal terkirim (email tidak aktif/invalid).<br/>
                Sistem secara otomatis meneruskan pesan ini ke Anda agar tugas/informasi tidak terlewat.
              </div>
            ` + html

            await transporter.sendMail({
              from: smtpFrom,
              to: fallbackEmail,
              subject: `[FORWARD / FALLBACK] ` + subject,
              html: fallbackNoticeHtml
            })
            console.log(`Fallback email sent successfully to admin (${fallbackEmail}) for ${targetEmail}`)
          } catch (fallbackErr: any) {
            console.error(`Fallback email error for ${targetEmail}:`, fallbackErr.message)
          }
        }
      }
    }

    return new Response(JSON.stringify({
      s: true,
      message: `Email diproses untuk ${targetEmails.length} penerima.`,
      successfulRecipients: successList,
      failedRecipients: failedList
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error("Function Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
