const express = require('express');
const cors = require('cors');
require('dotenv').config(); // 환경변수 로드
const { OpenAI } = require('openai');
const { initializeDB, supabase } = require('./database');
const crypto = require('crypto');

// OpenAI 설정 (.env 파일에서 API 키를 가져옵니다)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정 (프론트엔드 통신 허용 및 JSON 데이터 처리)
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*';
app.use(cors({
  origin: allowedOrigins
}));
app.use(express.json());

// 1. 데이터베이스 초기화 실행
initializeDB();

// 기본 테스트용 라우트 (서버가 잘 켜졌는지 브라우저에서 확인하는 용도)
app.get('/', (req, res) => {
  res.send('SHT Book 백엔드 서버가 정상적으로 작동 중입니다! 🚀');
});

// ==========================================
// 주요 API (프론트엔드 - 백엔드 통신 창구)
// ==========================================

// [API 0-1] 게스트 계정 생성 (POST /api/auth/guest)
app.post('/api/auth/guest', async (req, res) => {
  const guestEmail = `guest_${crypto.randomUUID()}@sht.local`;
  const guestPassword = 'guest_placeholder';
  
  try {
    const { data, error } = await supabase
      .from('users')
      .insert([
        { email: guestEmail, password_hash: guestPassword }
      ])
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ message: '게스트가 성공적으로 생성되었습니다.', user_id: data[0].id });
  } catch (err) {
    return res.status(500).json({ error: '서버 에러' });
  }
});

// [API 0-2] 정식 회원가입 및 기존 유저 병합 (POST /api/auth/register)
app.post('/api/auth/register', async (req, res) => {
  const { user_id, email, password } = req.body;
  if (!user_id || !email || !password) return res.status(400).json({ error: '정보가 누락되었습니다.' });

  try {
    // 1. 이메일이 이미 존재하는지 (기존 가입 유저인지) 확인
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      // 기존 유저 존재: 데이터 병합(Merge)
      const existingId = existingUser.id;
      
      if (existingId !== parseInt(user_id)) {
        await supabase.from('poop_logs').update({ user_id: existingId }).eq('user_id', user_id);
        await supabase.from('pee_logs').update({ user_id: existingId }).eq('user_id', user_id);
        await supabase.from('reports').update({ user_id: existingId }).eq('user_id', user_id);
        // 병합 완료 후 게스트 유저는 삭제 (에러 무시)
        await supabase.from('users').delete().eq('id', user_id);
      }
      return res.json({ message: '기존 계정으로 로그인되어 로컬 데이터가 병합되었습니다.', user_id: existingId });
    }

    // 2. 신규 가입 (현재 게스트 계정의 이메일 업데이트)
    const { data, error } = await supabase
      .from('users')
      .update({ email: email, password_hash: password })
      .eq('id', user_id)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    if (data.length === 0) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

    return res.json({ message: '회원가입 완료! 데이터가 성공적으로 보존되었습니다.', user_id: data[0].id });
  } catch (err) {
    return res.status(500).json({ error: '서버 에러' });
  }
});

// [API 1] 대변 기록 보내기 (POST /api/logs/poop)
app.post('/api/logs/poop', async (req, res) => {
  const { user_id, bristol_type, color_id, symptoms } = req.body;
  
  try {
    const { data, error } = await supabase
      .from('poop_logs')
      .insert([
        { user_id: user_id, bristol_type: bristol_type, color_id: color_id, symptoms_flags: symptoms }
      ])
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    return res.json({ message: '대변 기록이 성공적으로 클라우드에 저장되었습니다.', log_id: data[0].id });
  } catch (err) {
    return res.status(500).json({ error: '서버 내부 오류' });
  }
});

// [API 2] 소변 기록 보내기 (POST /api/logs/pee)
app.post('/api/logs/pee', async (req, res) => {
  const { user_id, urine_color_id, foam_level, symptoms } = req.body;
  
  try {
    const { data, error } = await supabase
      .from('pee_logs')
      .insert([
        { user_id: user_id, urine_color_id: urine_color_id, foam_level: foam_level, symptoms_flags: symptoms }
      ])
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ message: '소변 기록이 성공적으로 클라우드에 저장되었습니다.', log_id: data[0].id });
  } catch (err) {
    return res.status(500).json({ error: '서버 내부 오류' });
  }
});

// [API 3] AI 리포트 생성 및 반환 (POST /api/reports/generate)
app.post('/api/reports/generate', async (req, res) => {
  const { user_id, report_type } = req.body; 

  try {
    // 1. 실제 데이터 볼륨 파악을 위한 기간 계산
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - (report_type === '3D' ? 2 : 6)); 
    const startDateStr = startDate.toISOString();

    // 시작일 이후의 데이터베이스 기록 조회 (대변과 소변 합산)
    // 실제 프로덕션 서버라면 조인 뷰나 COUNT() 등을 쓰지만 포트폴리오용이므로 직관적인 추출
    const { data: poopData, error: poopErr } = await supabase.from('poop_logs').select('id, created_at, symptoms_flags, bristol_type').eq('user_id', user_id).gte('created_at', startDateStr);
    const { data: peeData, error: peeErr } = await supabase.from('pee_logs').select('id, created_at, symptoms_flags').eq('user_id', user_id).gte('created_at', startDateStr);
    
    if (poopErr || peeErr) {
      return res.status(500).json({ error: '데이터 검증 실패' });
    }

    // 2. 최소 데이터 충족 조건 (고유 날짜 기준 - 3일차: 최소 2일, 7일차: 최소 4일)
    const allLogs = [...(poopData || []), ...(peeData || [])];
    
    // YYYY-MM-DD 형태의 고유 날짜 갯수 추출
    const uniqueDays = new Set(
      allLogs.map(log => {
        const d = new Date(log.created_at);
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      })
    );
    const uniqueDaysCount = uniqueDays.size;

    const requiredDays = report_type === '3D' ? 2 : 4;
    
    if (uniqueDaysCount < requiredDays) {
      // 400 에러와 함께 특수 에러 코드 NEED_MORE_DATA 를 날려 프론트에서 포착하게 함
      return res.status(400).json({ error: 'NEED_MORE_DATA', target_days: requiredDays });
    }

    // 3. 임시 통합 로그 텍스트 (추후 더 정교한 요약 로직으로 고도화 가능)
    const recent_logs_summary = `최근 ${report_type === '3D' ? 3 : 7}일간 총 ${uniqueDaysCount}일 동안 ${allLogs.length}건의 배변/배뇨 데이터 발생. 전반적인 소화 및 배뇨 특이사항 여부 판단 요망.`;

    const systemPrompt = `
      당신은 10년 차 전문적인 소화기내과 및 비뇨기과 의사입니다. 전문적이면서도 따뜻한 말투로 환자에게 조언합니다.
      환자의 최근 배변/소변(브리스톨 척도, 색상, 증상 등) 기록을 분석해서 건강 상태 코멘트를 작성해 주세요.
      반드시 다음 2가지 정보를 JSON 형식으로만 반환하세요:
      1. "status_light": "green"(정상), "yellow"(주의), "red"(병원방문 필요) 중 하나.
      2. "ai_comment": 2~3문장 이내의 따뜻하고 통찰력 있는 분석 코멘트. (마크다운 없이 순수 텍스트만)
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', 
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `환자의 로그 데이터 요약: ${recent_logs_summary}` }
      ],
      response_format: { type: "json_object" }, 
      temperature: 0.7,
    });

    const aiResult = JSON.parse(response.choices[0].message.content);

    // DB(Supabase)에 리포트 결과 저장
    const { data, error } = await supabase
      .from('reports')
      .insert([
        { user_id: user_id, report_type: report_type, ai_comment: aiResult.ai_comment, status_light: aiResult.status_light }
      ])
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }
      
    const resToday = new Date();
    const resStartDate = new Date();
    resStartDate.setDate(resToday.getDate() - (report_type === '3D' ? 2 : 6)); // 오늘 포함 3일/7일

    const dateRangeStr = `${resStartDate.getMonth() + 1}/${resStartDate.getDate()} ~ ${resToday.getMonth() + 1}/${resToday.getDate()}`;

    res.json({
      message: 'AI 리포트 생성 및 클라우드 저장 완료',
      report_id: data[0].id,
      date_range: dateRangeStr,
      result: aiResult
    });

  } catch (error) {
    console.error('OpenAI API 호출 에러:', error);
    res.status(500).json({ error: `AI 분석 오류: ${error.message || '서버 통신 실패'}` });
  }
});

// [API - Oracle] 변기박사님 상담 (POST /api/oracle/ask)
app.post('/api/oracle/ask', async (req, res) => {
  const { user_id, question, locale } = req.body;
  if (!user_id || !question) return res.status(400).json({ error: '질문이나 사용자 정보가 없습니다.' });

  try {
    const isEnglish = locale === 'en';
    const systemPrompt = isEnglish
      ? `You are 'The Porcelain Oracle', an AI Poop Expert. Your icon is 🎓🚽. 
The user will ask you health concerns related to bowel movements, urination, or sexual health.
Please reply in English within 250 characters. Be concise, slightly humorous but practically helpful.`
      : `당신은 '변기박사님(The Porcelain Oracle)'이라는 재미있고 친근한 컨셉의 인공지능입니다. 당신의 아이콘은 🎓🚽입니다.
사용자가 소변, 대변, 배변 활동, 성기, 기타 성 건강 등과 관련된 고민이나 질문을 합니다.
답변은 최대한 250자 이내로 간결하고 시원하게 고민을 해소할 수 있게, 유머러스하면서도 실질적인 도움이 되도록 답변해 주세요.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.8,
    });

    const answer = response.choices[0].message.content.trim();
    
    // DB 저장 로직 추가
    await supabase.from('Oracle_Logs').insert([
      { user_id: user_id, question: question, answer: answer }
    ]);

    res.json({ answer });
  } catch (error) {
    console.error('Oracle API 에러:', error);
    res.status(500).json({ error: '변기박사님이 잠시 자리를 비웠습니다.' });
  }
});

// [API] 어드민용 박사님 상담 로그 조회 (GET /api/admin/oracle_logs)
app.get('/api/admin/oracle_logs', async (req, res) => {
  try {
    const { data: oracleLogs, error } = await supabase
      .from('Oracle_Logs')
      .select('id, question, answer, created_at, user_id, Users(email)')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(oracleLogs);
  } catch (err) {
    res.status(500).json({ error: '서버 내부 오류' });
  }
});

// [API 4] 과거 통합 기록 조회 (GET /api/logs/history)
app.get('/api/logs/history', async (req, res) => {
  const user_id = req.query.user_id || 1; 

  try {
    const { data: poopData, error: poopErr } = await supabase.from('poop_logs').select('*').eq('user_id', user_id);
    const { data: peeData, error: peeErr } = await supabase.from('pee_logs').select('*').eq('user_id', user_id);
    const { data: reportData, error: reportErr } = await supabase.from('reports').select('*').eq('user_id', user_id);

    if (poopErr || peeErr || reportErr) {
      return res.status(500).json({ error: '데이터 조회 실패' });
    }

    const history = [
      ...(poopData || []).map(item => ({ ...item, log_type: 'poop' })),
      ...(peeData || []).map(item => ({ ...item, log_type: 'pee' })),
      ...(reportData || []).map(item => ({ ...item, log_type: 'report' }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(history);
  } catch (err) {
    res.status(500).json({ error: '서버 내부 오류' });
  }
});

// [API 5] 특정 기록 삭제 (DELETE /api/logs/:type/:id)
app.delete('/api/logs/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  const user_id = req.body.user_id || 1; // 쿼리 인젝션 방어용

  let tableName = '';
  if (type === 'poop') tableName = 'poop_logs';
  else if (type === 'pee') tableName = 'pee_logs';
  else if (type === 'report') tableName = 'reports';
  else return res.status(400).json({ error: '잘못된 삭제 유형입니다.' });

  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) {
      return res.status(500).json({ error: '삭제 실패' });
    }

    res.json({ message: '성공적으로 삭제되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '서버 내부 오류' });
  }
});

// [API] 관리자 유저 목록 조회 (GET /api/admin/users)
app.get('/api/admin/users', async (req, res) => {
  try {
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, email, created_at')
      .order('created_at', { ascending: false });

    if (usersErr) return res.status(500).json({ error: usersErr.message });

    const { data: poopLogs, error: poopErr } = await supabase.from('poop_logs').select('user_id');
    const { data: peeLogs, error: peeErr } = await supabase.from('pee_logs').select('user_id');

    if (poopErr || peeErr) return res.status(500).json({ error: '로그 집계 실패' });

    const poopCountMap = (poopLogs || []).reduce((acc, row) => {
      acc[row.user_id] = (acc[row.user_id] || 0) + 1;
      return acc;
    }, {});
    const peeCountMap = (peeLogs || []).reduce((acc, row) => {
      acc[row.user_id] = (acc[row.user_id] || 0) + 1;
      return acc;
    }, {});

    const result = (users || []).map(u => ({
      ...u,
      poopLogs: poopCountMap[u.id] || 0,
      peeLogs: peeCountMap[u.id] || 0,
      totalLogs: (poopCountMap[u.id] || 0) + (peeCountMap[u.id] || 0),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '서버 내부 오류' });
  }
});

// [API 6] 관리자 통계 조회 (GET /api/admin/stats)
app.get('/api/admin/stats', async (req, res) => {
  try {
    const { count: usersCount, error: usersErr } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: poopCount, error: poopErr } = await supabase.from('poop_logs').select('*', { count: 'exact', head: true });
    const { count: peeCount, error: peeErr } = await supabase.from('pee_logs').select('*', { count: 'exact', head: true });

    if (usersErr || poopErr || peeErr) {
      return res.status(500).json({ error: '통계 조회 실패' });
    }

    res.json({
      users: usersCount || 0,
      poopLogs: poopCount || 0,
      peeLogs: peeCount || 0,
      totalLogs: (poopCount || 0) + (peeCount || 0)
    });
  } catch (err) {
    res.status(500).json({ error: '서버 내부 오류' });
  }
});

// 서버 실행 (로컬 환경일 때만 포트 바인딩)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 서버가 http://localhost:${PORT} 포트에서 실행 중입니다.`);
  });
}

// Vercel 등 서버리스 환경 배포 지원을 위한 app 내보내기
module.exports = app;
