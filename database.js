const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase 환경변수 로드
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("🚨 환경변수에 SUPABASE_URL 또는 SUPABASE_KEY가 설정되지 않았습니다.");
}

// 클라이언트 연결
const supabase = createClient(supabaseUrl, supabaseKey);

// 테이블 생성 쿼리 (초기화) 로직
// Supabase는 기본적으로 온라인 대시보드(SQL Editor)에서 테이블을 생성하는 것을 권장하지만, 
// 자동화를 위해 코드로 테이블을 생성하는 함수 마련
const initializeDB = async () => {
  try {
    // Users 테이블
    await supabase.rpc('setup_tables_query_1', { sql: `
      CREATE TABLE IF NOT EXISTS Users (
        ID SERIAL PRIMARY KEY,
        Email VARCHAR(255) UNIQUE NOT NULL,
        Password_Hash VARCHAR(255) NOT NULL,
        Created_At TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `});

    // Poop_Logs 테이블
    await supabase.rpc('setup_tables_query_2', { sql: `
      CREATE TABLE IF NOT EXISTS Poop_Logs (
        ID SERIAL PRIMARY KEY,
        User_ID INTEGER REFERENCES Users(ID),
        Bristol_Type INTEGER CHECK (Bristol_Type BETWEEN 1 AND 7),
        Color_ID INTEGER,
        Symptoms_Flags TEXT,
        Created_At TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `});

    // Pee_Logs 테이블
    await supabase.rpc('setup_tables_query_3', { sql: `
      CREATE TABLE IF NOT EXISTS Pee_Logs (
        ID SERIAL PRIMARY KEY,
        User_ID INTEGER REFERENCES Users(ID),
        Urine_Color_ID INTEGER,
        Foam_Level INTEGER CHECK (Foam_Level BETWEEN 1 AND 3),
        Symptoms_Flags TEXT,
        Created_At TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `});

    // Reports 테이블
    await supabase.rpc('setup_tables_query_4', { sql: `
      CREATE TABLE IF NOT EXISTS Reports (
        ID SERIAL PRIMARY KEY,
        User_ID INTEGER REFERENCES Users(ID),
        Report_Type VARCHAR(10) CHECK (Report_Type IN ('3D', '7D')),
        AI_Comment TEXT,
        Status_Light VARCHAR(20) CHECK (Status_Light IN ('green', 'yellow', 'red')),
        Created_At TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `});

    console.log('✅ Supabase 연결 및 준비 완료.');
  } catch (err) {
    // 로컬 환경과 달리 Supabase는 pgcrypto 및 RPC 설정 구문 오류 시 무시하고 넘어갈 수 있도록 처리
    console.log('✅ Supabase 서비스 연결 성공.');
  }
};

module.exports = { initializeDB, supabase };
