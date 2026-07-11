import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
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
    const smtpFrom = Deno.env.get('SMTP_FROM') || 'Hokiindo Shop <noreply@hokiindo.co.id>'

    if (!smtpUser || !smtpPass) {
      throw new Error('SMTP user atau password belum disetting!')
    }

    const { to, subject, html } = await req.json()

    if (!to || !subject || !html) {
      throw new Error('Parameter to, subject, dan html wajib diisi!')
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

    const recipients = Array.isArray(to) ? to.join(',') : to
    console.log(`Sending custom email to: ${recipients}...`)

    const info = await transporter.sendMail({
      from: smtpFrom,
      to: recipients,
      subject: subject,
      html: html
    })

    console.log("Email sent successfully! MessageId:", info.messageId)

    return new Response(JSON.stringify({ s: true, message: `Email berhasil dikirim ke ${recipients}.`, messageId: info.messageId }), {
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
