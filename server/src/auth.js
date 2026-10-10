/**
 * Authentication middleware and route handlers for teacher accounts.
 *
 * Security approach (MVP):
 *   - Teachers register with email + password.
 *   - Passwords stored as bcrypt hashes (cost factor 12).
 *   - JWT issued on login; expires in 8 hours.
 *   - JWT_SECRET MUST be set in .env; the server refuses to start without it.
 *   - Tokens are sent in the Authorization header (Bearer scheme) from the frontend.
 *   - Socket.IO host events use a short-lived hostToken embedded in the JWT payload,
 *     stored server-side per room so the client cannot forge ownership.
 *
 * Remaining limitations (documented honestly):
 *   - No refresh tokens — after 8h the teacher must log in again.
 *   - No email verification or password reset.
 *   - Rate limiting on auth endpoints only; add WAF for production.
 *   - hostTokenHash in the rooms table is a SHA-256 of a random UUID, not
 *     a password. It is safe from pre-image attacks but not from theft of the
 *     in-transit JWT. Use HTTPS in production.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db');

const router = express.Router();

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('JWT_SECRET must be set in .env and be at least 32 characters long');
    }
    return secret;
}

/**
 * Middleware: require a valid teacher JWT.
 * Sets req.teacher = { id, email, displayName }.
 */
function requireTeacher(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    try {
        const payload = jwt.verify(token, getJwtSecret());
        req.teacher = { id: payload.teacherId, email: payload.email, displayName: payload.displayName };
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { email, password, displayName } = req.body;
        if (!email || !password || !displayName) {
            return res.status(400).json({ error: 'email, password, and displayName are required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const hash = await bcrypt.hash(password, 12);
        const result = await pool.query(
            'INSERT INTO teachers (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, display_name',
            [email.toLowerCase().trim(), displayName.trim(), hash]
        );
        const teacher = result.rows[0];

        const token = jwt.sign(
            { teacherId: teacher.id, email: teacher.email, displayName: teacher.display_name },
            getJwtSecret(),
            { expiresIn: '8h' }
        );

        res.status(201).json({ token, teacher: { id: teacher.id, email: teacher.email, displayName: teacher.display_name } });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'An account with that email already exists' });
        }
        console.error('Register error:', err.message);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'email and password are required' });
        }

        const result = await pool.query(
            'SELECT id, email, display_name, password_hash FROM teachers WHERE email = $1',
            [email.toLowerCase().trim()]
        );
        const teacher = result.rows[0];

        // Use constant-time compare even if teacher not found to prevent user enumeration
        const dummyHash = '$2a$12$invaliddummyhashtopreventtiming..........';
        const match = teacher
            ? await bcrypt.compare(password, teacher.password_hash)
            : await bcrypt.compare(password, dummyHash).then(() => false);

        if (!teacher || !match) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { teacherId: teacher.id, email: teacher.email, displayName: teacher.display_name },
            getJwtSecret(),
            { expiresIn: '8h' }
        );

        res.json({ token, teacher: { id: teacher.id, email: teacher.email, displayName: teacher.display_name } });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Login failed' });
    }
});

// GET /api/auth/me — verify token and return teacher info
router.get('/me', requireTeacher, (req, res) => {
    res.json({ teacher: req.teacher });
});

module.exports = { router, requireTeacher, getJwtSecret };
