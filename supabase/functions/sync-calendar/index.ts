import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { JWT } from "npm:google-auth-library@9.0.0"

serve(async (req) => {
  try {
    // Read the webhook payload
    const body = await req.json()
    console.log("Received webhook payload:", body)

    // We only care about INSERTs
    if (body.type !== "INSERT" || !body.record) {
      return new Response("Not an insert event, ignored", { status: 200 })
    }

    const record = body.record
    const title = record.title || "Tugas Tanpa Judul"
    const description = record.description || ""
    const targetDate = record.target_date // Format: YYYY-MM-DD
    const assignee = record.assignee || ""
    const fileUrl = record.file_url || ""

    // Create the event description
    let eventDescription = `Assignee: ${assignee}\n\n${description}`
    if (fileUrl) {
      eventDescription += `\n\nAttachment: ${fileUrl}`
    }

    // Determine event start and end
    // If target_date exists, make it an all-day event for that date
    // Otherwise, just make it an all-day event for today
    let startDate = targetDate
    if (!startDate) {
      const today = new Date()
      startDate = today.toISOString().split('T')[0]
    }
    
    // For all day events, end date must be start date + 1 day
    const endDateObj = new Date(startDate)
    endDateObj.setDate(endDateObj.getDate() + 1)
    const endDate = endDateObj.toISOString().split('T')[0]

    const event = {
      summary: `[HSO] ${title}`,
      description: eventDescription,
      start: {
        date: startDate,
        timeZone: 'Asia/Jakarta',
      },
      end: {
        date: endDate,
        timeZone: 'Asia/Jakarta',
      },
    }

    // Authenticate with Google API
    const serviceAccountJsonStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT")
    if (!serviceAccountJsonStr) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT secret is missing")
    }

    const credentials = JSON.parse(serviceAccountJsonStr)
    const client = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    })

    const calendarId = "sales@hokiindo.co.id"
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`

    console.log("Sending to Google Calendar API...")
    
    // Get access token
    const tokenInfo = await client.authorize()
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tokenInfo.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Google API error:", errorText)
      throw new Error(`Google API responded with status ${response.status}`)
    }

    const data = await response.json()
    console.log("Successfully created event:", data.htmlLink)

    return new Response(JSON.stringify({ success: true, eventLink: data.htmlLink }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    console.error("Error in sync-calendar function:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    })
  }
})
