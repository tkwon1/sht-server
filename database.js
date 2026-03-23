const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase 환경변수 로드
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("🚨 환경변수에 SUPABASE_URL 또는 SUPABASE_KEY가 설정되지 않았습니다.");
  console.error("SUPABASE_URL:", supabaseUrl ? "설정됨" : "없음");
  console.error("SUPABASE_KEY:", supabaseKey ? "설정됨" : "없음");
}

// 클라이언트 연결 (환경변수 없으면 placeholder로 생성해 크래시 방지)
const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder'
);

// Supabase 연결 확인 (테이블은 대시보드에서 생성)
const initializeDB = async () => {
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) throw error;
    console.log('✅ Supabase 연결 및 준비 완료.');
  } catch (err) {
    console.error('⚠️ Supabase 연결 실패:', err.message);
  }
};

module.exports = { initializeDB, supabase };
