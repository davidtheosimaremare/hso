import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '/Users/davidtheo/01_HOKIINDO/WEBSITE/hso/.env' })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function main() {
    const { data, error } = await supabase
        .from('accurate_sales_orders')
        .select('*')
        .eq('number', 'HSO-26-06-116')
        .single()
        
    if (error) {
        console.error("Error fetching SO:", error)
        return
    }
    
    console.log("SO found:", data.number)
    const items = data.detail_item || []
    
    const targetItems = items.filter(i => i.item.no === '3RH5921-1EA11')
    console.log(`Found ${targetItems.length} rows for 3RH5921-1EA11:`)
    targetItems.forEach(i => {
        console.log(`- Qty: ${i.quantity}, Note: ${i.detailNotes}`)
    })
}

main()
