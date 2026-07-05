import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function backfillShipments() {
  console.log("Starting backfill for RI to Shipments...")

  // Get all receive items that have a PO
  const { data: receiveItems, error: riError } = await supabase
    .from('accurate_receive_items')
    .select('id, po_number, trans_date')
    .not('po_number', 'is', null)

  if (riError) {
    console.error("Error fetching receive items:", riError)
    return
  }

  console.log(`Found ${receiveItems.length} Receive Items with PO numbers.`)

  let updatedCount = 0

  for (const ri of receiveItems) {
    // Get items for this RI
    const { data: items, error: itemsError } = await supabase
      .from('accurate_receive_item_items')
      .select('item_code')
      .eq('receive_item_id', ri.id)

    if (itemsError || !items) continue

    for (const item of items) {
      if (!item.item_code) continue

      // Update shipments
      const { error: updateError } = await supabase
        .from('shipments')
        .update({
          current_status: 'Already in Hokiindo Raya',
          hokiindo_date: ri.trans_date,
          updated_at: new Date().toISOString()
        })
        .eq('item_code', item.item_code)
        .eq('hpo_number', ri.po_number)

      if (updateError) {
        console.error(`Error updating shipment for PO ${ri.po_number}, Item ${item.item_code}:`, updateError)
      } else {
        // Unfortunately supabase JS update doesn't return count easily without returning representation, but we can assume success
        updatedCount++
      }
    }
  }

  console.log(`Backfill complete. Fired update commands for ${updatedCount} RI items.`)
}

backfillShipments()
