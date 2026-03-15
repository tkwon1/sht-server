const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkData() {
  const { data: poopData, error: poopErr } = await supabase.from('poop_logs').select('*').order('created_at', { ascending: false }).limit(1);
  const { data: reportData, error: reportErr } = await supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(1);
  
  if (poopErr || reportErr) {
    console.error("에러 발생:", poopErr || reportErr);
  } else {
    console.log("최근 대변 기록:", poopData);
    console.log("최근 AI 리포트:", reportData);
  }
}

checkData();
