// FILE: supabase/functions/create-user/index.ts
// Edge Function untuk create user menggunakan Admin API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Parse request body
        let body
        try {
            body = await req.json()
        } catch (e) {
            throw new Error('Invalid JSON body')
        }

        const { email, password } = body

        if (!email || !password) {
            throw new Error('Email dan password wajib diisi!')
        }

        if (password.length < 6) {
            throw new Error('Password minimal 6 karakter!')
        }

        // Get environment variables
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Missing env vars:', { supabaseUrl: !!supabaseUrl, serviceRoleKey: !!serviceRoleKey })
            throw new Error('Server configuration error: Missing environment variables')
        }

        // Create Supabase Admin Client
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        })

        console.log(`Creating user: ${email}`)

        // Create user using Admin API
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true
        })

        if (error) {
            console.error('Auth error:', error)
            throw new Error(error.message)
        }

        console.log(`User created: ${data.user?.id}`)

        // Also add to user_access table for tracking (optional, may fail if table doesn't exist)
        try {
            await supabaseAdmin
                .from('user_access')
                .upsert({ email: email, is_active: true }, { onConflict: 'email' })
        } catch (e) {
            console.log('Note: user_access table update skipped:', e.message)
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: 'User berhasil dibuat!',
                user: { id: data.user?.id, email: data.user?.email }
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            }
        )

    } catch (error) {
        console.error('Function error:', error.message)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200 // Return 200 with error in body to avoid generic error message
            }
        )
    }
})
