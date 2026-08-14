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

    let targetEmail = Array.isArray(to) ? to[0] : to

    // 1. Check if user_access has a mapped notification_email
    if (supabaseUrl && supabaseServiceKey && targetEmail) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const { data: userData } = await supabase
          .from('user_access')
          .select('notification_email')
          .eq('email', targetEmail)
          .maybeSingle()
        
        if (userData?.notification_email && userData.notification_email.includes('@')) {
          console.log(`Redirecting notification for ${targetEmail} -> ${userData.notification_email}`)
          targetEmail = userData.notification_email
        }
      } catch (dbErr) {
        console.warn('Notice checking user_access notification_email:', dbErr)
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

    console.log(`Sending custom email to: ${targetEmail} from ${finalFrom}...`)

    // 2. Attempt primary email send
    try {
      const info = await transporter.sendMail({
        from: finalFrom,
        to: targetEmail,
        subject: subject,
        html: html
      })

      console.log("Email sent successfully to primary recipient! MessageId:", info.messageId)
      return new Response(JSON.stringify({ s: true, message: `Email berhasil dikirim ke ${targetEmail}.`, messageId: info.messageId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (primaryError: any) {
      console.warn(`Failed to send email to ${targetEmail}: ${primaryError.message}. Triggering admin fallback...`)

      // 3. Fallback mechanism: Forward to admin/fallback email if primary recipient bounces/fails
      if (fallbackEmail && fallbackEmail.includes('@') && targetEmail !== fallbackEmail) {
        const fallbackNoticeHtml = `
          <div style="background:#fef2f2; border:1px solid #fca5a5; border-radius:10px; padding:12px 16px; margin-bottom:16px; font-family:sans-serif; font-size:13px; color:#991b1b;">
            <strong>⚠️ Catatan Sistem (Email Fallback):</strong><br/>
            Email notifikasi ini seharusnya dikirim ke <u>${targetEmail}</u>, namun gagal terkirim (email tidak aktif/invalid).<br/>
            Sistem secara otomatis meneruskan pesan ini ke Anda agar tugas/informasi tidak terlewat.
          </div>
        ` + html

        const fallbackInfo = await transporter.sendMail({
          from: smtpFrom,
          to: fallbackEmail,
          subject: `[FORWARD / FALLBACK] ` + subject,
          html: fallbackNoticeHtml
        })

        console.log("Fallback email sent successfully to admin:", fallbackEmail)
        return new Response(JSON.stringify({
          s: true,
          fallback: true,
          message: `Email utama ke ${targetEmail} tidak valid, otomatis diteruskan ke ${fallbackEmail}.`,
          messageId: fallbackInfo.messageId
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      throw primaryError
    }

  } catch (error: any) {
    console.error("Function Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200, // Return 200 so web app doesn't crash, with error message included
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
