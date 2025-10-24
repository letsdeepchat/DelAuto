const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Agent = require('../../database/models/Agent');

const router = express.Router();

// POST /api/auth/login - Agent login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find agent by email
    const agent = await Agent.findOne({ email, is_active: true });
    if (!agent) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, agent.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: agent._id,
        email: agent.email,
        name: agent.name,
        role: agent.role,
      },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '24h' },
    );

    res.json({
      message: 'Login successful',
      token,
      agent: {
        id: agent._id,
        name: agent.name,
        email: agent.email,
        role: agent.role,
        phone: agent.phone,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register - Admin only: Register new agent (for seeding/testing)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, role = 'agent' } = req.body;

    if (!name || !email || !password || !phone) {
      return res
        .status(400)
        .json({ error: 'Name, email, password, and phone are required' });
    }

    // Check if agent already exists
    const existingAgent = await Agent.findOne({ $or: [{ email }, { phone }] });
    if (existingAgent) {
      return res
        .status(409)
        .json({ error: 'Agent with this email or phone already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create agent
    const agent = new Agent({
      name,
      email,
      password: hashedPassword,
      phone,
      role,
    });

    await agent.save();

    res.status(201).json({
      message: 'Agent registered successfully',
      agent: {
        id: agent._id,
        name: agent.name,
        email: agent.email,
        role: agent.role,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
