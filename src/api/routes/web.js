const express = require('express');
const router = express.Router();

// GET /login - Login page
router.get('/login', (req, res) => {
  res.render('login');
});

// GET /dashboard - Agent dashboard (protected)
router.get('/dashboard', (req, res) => {
  res.render('dashboard');
});

// GET / - Redirect to dashboard if logged in, else login
router.get('/', (req, res) => {
  res.redirect('/dashboard');
});

module.exports = router;
