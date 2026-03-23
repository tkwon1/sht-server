// Vercel 진입점 - index.js 로딩 에러를 캡처해서 디버깅 가능하게 함
let app;
try {
  app = require('./index');
} catch (e) {
  const express = require('express');
  app = express();
  app.all('*', (req, res) => {
    res.status(500).json({ error: e.message, type: e.constructor.name });
  });
}
module.exports = app;
