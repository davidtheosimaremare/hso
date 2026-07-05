const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function main() {
  const { data, error } = await supabase
    .from('shipments')
    .select('*')
    .limit(1);
    
  if (error) console.error(error);
  console.log(data);
}

main();
