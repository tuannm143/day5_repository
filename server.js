const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`QR scan event log listening on http://localhost:${PORT}`);
});
