/**
 * certificates.js — Verified Digital Certificate System
 *
 * Handles organizer-controlled certificate configuration,
 * bulk issuance for top-ranking teams & individuals,
 * QR code embedding, and public verification lookup.
 */

const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { pool } = require('../db');
const { requireTeacher, requireStudent } = require('./auth');

const router = express.Router();

/**
 * Helper to generate an official Certificate ID
 * Format: APTI-YYYY-[8-char-hex]
 */
function generateCertificateId() {
    const year = new Date().getFullYear();
    const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `APTI-${year}-${rand}`;
}

// ─── 1. Public Certificate Verification ───────────────────────────────────────

/**
 * GET /api/certificates/verify/:certId
 * Public lookup for validating authenticity via QR code or manual search
 */
router.get('/verify/:certId', async (req, res) => {
    try {
        const certId = req.params.certId.toUpperCase().trim();
        const result = await pool.query(
            `SELECT c.*, t.email AS organizer_email
             FROM certificates c
             LEFT JOIN teachers t ON t.id = c.organizer_id
             WHERE c.certificate_id = $1`,
            [certId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                isValid: false,
                status: 'Invalid',
                message: 'No certificate exists with this ID. Verification failed.'
            });
        }

        const cert = result.rows[0];
        const isValid = cert.status === 'Valid';

        res.json({
            isValid,
            certificate: {
                id: cert.certificate_id,
                status: cert.status,
                studentName: cert.student_name,
                eventName: cert.event_name,
                category: cert.category,
                certType: cert.cert_type,
                teamName: cert.team_name,
                teamRank: cert.team_rank,
                teamScore: cert.team_score,
                individualRank: cert.individual_rank,
                individualScore: cert.individual_score,
                title: cert.title,
                description: cert.description,
                styleTheme: cert.style_theme,
                organizerName: cert.organizer_name,
                organizerDesignation: cert.organizer_designation,
                institutionName: cert.institution_name,
                issueDate: cert.issue_date,
                revocationReason: cert.revocation_reason,
                revokedAt: cert.revoked_at,
                issuedAt: cert.created_at
            }
        });
    } catch (e) {
        console.error('Verify certificate error:', e.message);
        res.status(500).json({ error: 'Failed to verify certificate' });
    }
});

// ─── 2. Student: View My Certificates ─────────────────────────────────────────

/**
 * GET /api/certificates/my-certificates
 * Returns all certificates awarded to the authenticated student
 */
router.get('/my-certificates', requireStudent, async (req, res) => {
    try {
        // Auto-link any unlinked certificates awarded to this student by display_name or username
        await pool.query(
            `UPDATE certificates SET student_id = $1 
             WHERE student_id IS NULL AND (LOWER(student_name) = LOWER($2) OR LOWER(student_name) = LOWER($3))`,
            [req.student.id, req.student.displayName, (req.student.email || '').split('@')[0]]
        ).catch(() => {});

        const result = await pool.query(
            `SELECT c.*, r.code as room_code, r.battle_name, t.name as tournament_name
             FROM certificates c
             LEFT JOIN rooms r ON r.id = c.room_id
             LEFT JOIN tournaments t ON t.id = c.tournament_id
             WHERE c.student_id = $1 OR (c.student_id IS NULL AND LOWER(c.student_name) = LOWER($2))
             ORDER BY c.created_at DESC`,
            [req.student.id, req.student.displayName]
        );
        res.json({ certificates: result.rows });
    } catch (e) {
        console.error('My certificates error:', e.message);
        res.status(500).json({ error: 'Failed to fetch certificates' });
    }
});

// ─── 3. Organizer: Manage Configurations ──────────────────────────────────────

/**
 * GET /api/certificates/config
 * Load certificate config for a room or tournament
 */
router.get('/config', requireTeacher, async (req, res) => {
    try {
        let { roomId, tournamentId, roomCode } = req.query;

        // Auto-resolve roomId from roomCode if provided
        if ((!roomId || isNaN(parseInt(roomId))) && roomCode) {
            const rRes = await pool.query('SELECT id FROM rooms WHERE code = $1', [roomCode.toUpperCase()]);
            if (rRes.rows.length > 0) roomId = rRes.rows[0].id;
        }

        let query = 'SELECT * FROM certificate_configs WHERE ';
        const params = [];

        if (roomId) {
            query += 'room_id = $1';
            params.push(parseInt(roomId));
        } else if (tournamentId) {
            query += 'tournament_id = $1';
            params.push(parseInt(tournamentId));
        } else {
            return res.status(400).json({ error: 'roomId or tournamentId required' });
        }

        const result = await pool.query(query, params);
        res.json({ config: result.rows[0] || null });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load certificate configuration' });
    }
});

/**
 * POST /api/certificates/config
 * Save / Update certificate configuration
 */
router.post('/config', requireTeacher, async (req, res) => {
    try {
        let {
            roomId, roomCode, tournamentId, isEnabled, topTeamsCount, topIndividualsCount,
            title, description, category, styleTheme, organizerName, organizerDesignation,
            institutionName, institutionLogoUrl, issueDate
        } = req.body;

        // Auto-resolve roomId from roomCode if provided
        if ((!roomId || isNaN(parseInt(roomId))) && roomCode) {
            const rRes = await pool.query('SELECT id FROM rooms WHERE code = $1', [roomCode.toUpperCase()]);
            if (rRes.rows.length > 0) roomId = rRes.rows[0].id;
        }

        // Verify ownership
        if (roomId) {
            const check = await pool.query('SELECT teacher_id FROM rooms WHERE id = $1', [roomId]);
            if (check.rows.length === 0 || check.rows[0].teacher_id !== req.teacher.id) {
                return res.status(403).json({ error: 'Unauthorized to configure this room' });
            }
        } else if (tournamentId) {
            const check = await pool.query('SELECT organizer_teacher_id FROM tournaments WHERE id = $1', [tournamentId]);
            if (check.rows.length === 0 || check.rows[0].organizer_teacher_id !== req.teacher.id) {
                return res.status(403).json({ error: 'Unauthorized to configure this tournament' });
            }
        } else {
            return res.status(400).json({ error: 'roomId or tournamentId required' });
        }

        const query = `
            INSERT INTO certificate_configs (
                organizer_id, room_id, tournament_id, is_enabled, top_teams_count, top_individuals_count,
                title, description, category, style_theme, organizer_name, organizer_designation,
                institution_name, institution_logo_url, issue_date, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
            ON CONFLICT (${roomId ? 'room_id' : 'tournament_id'}) DO UPDATE SET
                is_enabled = EXCLUDED.is_enabled,
                top_teams_count = EXCLUDED.top_teams_count,
                top_individuals_count = EXCLUDED.top_individuals_count,
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                style_theme = EXCLUDED.style_theme,
                organizer_name = EXCLUDED.organizer_name,
                organizer_designation = EXCLUDED.organizer_designation,
                institution_name = EXCLUDED.institution_name,
                institution_logo_url = EXCLUDED.institution_logo_url,
                issue_date = EXCLUDED.issue_date,
                updated_at = NOW()
            RETURNING *
        `;

        const result = await pool.query(query, [
            req.teacher.id,
            roomId ? parseInt(roomId) : null,
            tournamentId ? parseInt(tournamentId) : null,
            isEnabled !== false,
            topTeamsCount || 3,
            topIndividualsCount || 3,
            title || 'Certificate of Excellence',
            description || 'For outstanding aptitude and performance.',
            category || 'Rank',
            styleTheme || 'gold',
            organizerName || req.teacher.displayName,
            organizerDesignation || 'Quiz Master / Organizer',
            institutionName || null,
            institutionLogoUrl || null,
            issueDate || new Date().toISOString().split('T')[0]
        ]);

        res.json({ success: true, config: result.rows[0] });
    } catch (e) {
        console.error('Save certificate config error:', e.message);
        res.status(500).json({ error: 'Failed to save certificate configuration' });
    }
});

// Helper to award badges (+XP) when a certificate is issued
async function awardBadgeForCertificate(client, studentId, roomId, category) {
    if (!studentId) return;
    try {
        const cat = (category || '').toLowerCase();
        let achievementCode = 'first_battle';
        if (cat.includes('winner') || cat.includes('1st') || cat.includes('first')) achievementCode = 'first_win';
        else if (cat.includes('mvp')) achievementCode = 'mvp';
        else if (cat.includes('speed')) achievementCode = 'speed_demon';
        else if (cat.includes('team')) achievementCode = 'team_player';
        else if (cat.includes('quiz') || cat.includes('master')) achievementCode = 'quiz_master';
        else if (cat.includes('top') || cat.includes('rank')) achievementCode = 'consistent_scorer';

        const def = await client.query('SELECT * FROM achievement_definitions WHERE code = $1', [achievementCode]);
        if (def.rows.length > 0) {
            const ach = def.rows[0];
            await client.query(
                `INSERT INTO player_achievements (student_id, achievement_id, room_id, is_new)
                 VALUES ($1, $2, $3, TRUE)
                 ON CONFLICT (student_id, achievement_id) DO NOTHING`,
                [studentId, ach.id, roomId || null]
            );
            await client.query(
                `INSERT INTO player_profiles (student_id, total_xp, level)
                 VALUES ($1, $2, 1)
                 ON CONFLICT (student_id) DO UPDATE SET total_xp = player_profiles.total_xp + $2`,
                [studentId, ach.xp_reward || 50]
            );
        }
    } catch (e) {
        console.error('awardBadgeForCertificate error:', e.message);
    }
}

// ─── 4. Organizer: Bulk Issue Certificates ────────────────────────────────────

/**
 * POST /api/certificates/issue
 * Automatically identifies eligible ranks, prevents duplicates, generates QR codes,
 * and issues individual digital certificates to all eligible students.
 */
router.post('/issue', requireTeacher, async (req, res) => {
    const client = await pool.connect();
    try {
        let { roomId, roomCode, tournamentId } = req.body;

        // Auto-resolve roomId from roomCode if provided
        if ((!roomId || isNaN(parseInt(roomId))) && roomCode) {
            const rRes = await client.query('SELECT id FROM rooms WHERE code = $1', [roomCode.toUpperCase()]);
            if (rRes.rows.length > 0) roomId = rRes.rows[0].id;
        }

        if (!roomId && !tournamentId) {
            return res.status(400).json({ error: 'roomId or tournamentId required' });
        }

        await client.query('BEGIN');

        // 1. Verify Organizer Ownership & Fetch Config
        let configRes;
        let eventName = '';
        if (roomId) {
            const rCheck = await client.query(
                `SELECT r.*, qs.title FROM rooms r
                 LEFT JOIN question_sets qs ON qs.id = r.question_set_id
                 WHERE r.id = $1 AND (r.teacher_id = $2 OR $3 = 'super_admin' OR r.teacher_id IS NULL)`,
                [roomId, req.teacher.id, req.teacher.role || 'organizer']
            );
            if (rCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({ error: 'Unauthorized or room not found' });
            }
            if (!rCheck.rows[0].teacher_id) {
                await client.query('UPDATE rooms SET teacher_id = $1 WHERE id = $2', [req.teacher.id, roomId]);
            }
            eventName = rCheck.rows[0].battle_name || rCheck.rows[0].title || 'AptiQuiz Battle';
            configRes = await client.query('SELECT * FROM certificate_configs WHERE room_id = $1', [roomId]);
        } else {
            const tCheck = await client.query('SELECT * FROM tournaments WHERE id = $1 AND (organizer_teacher_id = $2 OR $3 = \'super_admin\')', [tournamentId, req.teacher.id, req.teacher.role || 'organizer']);
            if (tCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({ error: 'Unauthorized or tournament not found' });
            }
            eventName = tCheck.rows[0].name;
            configRes = await client.query('SELECT * FROM certificate_configs WHERE tournament_id = $1', [tournamentId]);
        }

        const config = configRes.rows[0] || {
            top_teams_count: 3,
            top_individuals_count: 3,
            title: 'Certificate of Excellence',
            description: 'For outstanding aptitude and performance.',
            style_theme: 'gold',
            organizer_name: req.teacher.displayName,
            organizer_designation: 'Quiz Master',
            institution_name: '',
            issue_date: new Date().toISOString().split('T')[0]
        };

        const issuedCertificates = [];
        const baseUrl = process.env.BASE_URL || 'http://localhost:5173';

        // 2. Room Battle Certificate Issuance
        if (roomId) {
            // A. Team Certificates: Top N teams
            if (config.top_teams_count > 0) {
                const teamsRes = await client.query(
                    `SELECT t.id, t.name,
                            COALESCE(SUM(rp.score), t.score, 0)::int as score,
                            DENSE_RANK() OVER (ORDER BY COALESCE(SUM(rp.score), t.score, 0) DESC) as rank
                     FROM teams t
                     LEFT JOIN room_players rp ON rp.team_id = t.id AND rp.room_id = t.room_id
                     WHERE t.room_id = $1
                     GROUP BY t.id, t.name, t.score
                     ORDER BY rank ASC`,
                    [roomId]
                );

                const eligibleTeams = teamsRes.rows.filter(t => t.rank <= config.top_teams_count);

                for (const team of eligibleTeams) {
                    // Find all players in this team
                    const membersRes = await client.query(
                        `SELECT rp.student_id, rp.display_name, s.email, res.total_score AS ind_score, res.rank AS ind_rank
                         FROM room_players rp
                         LEFT JOIN students s ON s.id = rp.student_id
                         LEFT JOIN results res ON res.player_id = rp.id AND res.room_id = $1
                         WHERE rp.room_id = $1 AND rp.team_id = $2`,
                        [roomId, team.id]
                    );

                    for (const member of membersRes.rows) {
                        const certId = generateCertificateId();
                        const verifyUrl = `${baseUrl}/verify/${certId}`;
                        const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 140 });

                        let cat = 'Top Ranker';
                        if (team.rank === 1) cat = 'Winner';
                        else if (team.rank === 2) cat = 'Runner-up';
                        else if (team.rank === 3) cat = 'Third Rank';

                        let effectiveStudentId = member.student_id;
                        if (!effectiveStudentId && member.display_name) {
                            const sLookup = await client.query('SELECT id FROM students WHERE LOWER(display_name) = LOWER($1)', [member.display_name.trim()]);
                            if (sLookup.rows.length > 0) effectiveStudentId = sLookup.rows[0].id;
                        }

                        let certInsert;
                        if (effectiveStudentId) {
                            certInsert = await client.query(
                                `INSERT INTO certificates (
                                    certificate_id, organizer_id, room_id, student_id, student_name,
                                    event_name, cert_type, team_name, team_rank, team_score,
                                    individual_rank, individual_score, category,
                                    title, description, style_theme, organizer_name, organizer_designation,
                                    institution_name, issue_date, status, qr_code_data_url
                                ) VALUES ($1, $2, $3, $4, $5, $6, 'team', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'Valid', $20)
                                ON CONFLICT (student_id, room_id, cert_type) DO UPDATE SET
                                    team_name = EXCLUDED.team_name,
                                    team_rank = EXCLUDED.team_rank,
                                    team_score = EXCLUDED.team_score,
                                    individual_rank = EXCLUDED.individual_rank,
                                    individual_score = EXCLUDED.individual_score,
                                    category = EXCLUDED.category,
                                    title = EXCLUDED.title,
                                    description = EXCLUDED.description,
                                    status = 'Valid',
                                    qr_code_data_url = EXCLUDED.qr_code_data_url,
                                    updated_at = NOW()
                                RETURNING *`,
                                [
                                    certId, req.teacher.id, roomId, effectiveStudentId, member.display_name,
                                    eventName, team.name, team.rank, team.score,
                                    member.ind_rank || null, member.ind_score || null, cat,
                                    config.title, config.description, config.style_theme,
                                    config.organizer_name, config.organizer_designation,
                                    config.institution_name, config.issue_date, qrCodeDataUrl
                                ]
                            );
                            await awardBadgeForCertificate(client, effectiveStudentId, roomId, cat);
                        } else {
                            certInsert = await client.query(
                                `INSERT INTO certificates (
                                    certificate_id, organizer_id, room_id, student_id, student_name,
                                    event_name, cert_type, team_name, team_rank, team_score,
                                    individual_rank, individual_score, category,
                                    title, description, style_theme, organizer_name, organizer_designation,
                                    institution_name, issue_date, status, qr_code_data_url
                                ) VALUES ($1, $2, $3, NULL, $4, $5, 'team', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'Valid', $19)
                                RETURNING *`,
                                [
                                    certId, req.teacher.id, roomId, member.display_name,
                                    eventName, team.name, team.rank, team.score,
                                    member.ind_rank || null, member.ind_score || null, cat,
                                    config.title, config.description, config.style_theme,
                                    config.organizer_name, config.organizer_designation,
                                    config.institution_name, config.issue_date, qrCodeDataUrl
                                ]
                            );
                        }

                        if (certInsert && certInsert.rows.length > 0) {
                            issuedCertificates.push(certInsert.rows[0]);
                        }
                    }
                }
            }

            // B. Individual Certificates: Top N Individuals
            if (config.top_individuals_count > 0) {
                const indRes = await client.query(
                    `SELECT res.rank, res.total_score, rp.student_id, rp.display_name, t.name AS team_name
                     FROM results res
                     JOIN room_players rp ON rp.id = res.player_id
                     LEFT JOIN teams t ON t.id = rp.team_id
                     WHERE res.room_id = $1 AND res.rank <= $2
                     ORDER BY res.rank ASC`,
                    [roomId, config.top_individuals_count]
                );

                for (const ind of indRes.rows) {
                    const certId = generateCertificateId();
                    const verifyUrl = `${baseUrl}/verify/${certId}`;
                    const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 140 });

                    let cat = 'Top Ranker';
                    if (ind.rank === 1) cat = 'Winner';
                    else if (ind.rank === 2) cat = 'Runner-up';
                    else if (ind.rank === 3) cat = 'Third Rank';

                    let effectiveStudentId = ind.student_id;
                    if (!effectiveStudentId && ind.display_name) {
                        const sLookup = await client.query('SELECT id FROM students WHERE LOWER(display_name) = LOWER($1)', [ind.display_name.trim()]);
                        if (sLookup.rows.length > 0) effectiveStudentId = sLookup.rows[0].id;
                    }

                    let certInsert;
                    if (effectiveStudentId) {
                        certInsert = await client.query(
                            `INSERT INTO certificates (
                                certificate_id, organizer_id, room_id, student_id, student_name,
                                event_name, cert_type, team_name, team_rank, team_score,
                                individual_rank, individual_score, category,
                                title, description, style_theme, organizer_name, organizer_designation,
                                institution_name, issue_date, status, qr_code_data_url
                            ) VALUES ($1, $2, $3, $4, $5, $6, 'individual', $7, NULL, NULL, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'Valid', $18)
                            ON CONFLICT (student_id, room_id, cert_type) DO UPDATE SET
                                individual_rank = EXCLUDED.individual_rank,
                                individual_score = EXCLUDED.individual_score,
                                category = EXCLUDED.category,
                                title = EXCLUDED.title,
                                description = EXCLUDED.description,
                                status = 'Valid',
                                qr_code_data_url = EXCLUDED.qr_code_data_url,
                                updated_at = NOW()
                            RETURNING *`,
                            [
                                certId, req.teacher.id, roomId, effectiveStudentId, ind.display_name,
                                eventName, ind.team_name || null, ind.rank, ind.total_score, cat,
                                config.title, config.description, config.style_theme,
                                config.organizer_name, config.organizer_designation,
                                config.institution_name, config.issue_date, qrCodeDataUrl
                            ]
                        );
                        await awardBadgeForCertificate(client, effectiveStudentId, roomId, cat);
                    } else {
                        certInsert = await client.query(
                            `INSERT INTO certificates (
                                certificate_id, organizer_id, room_id, student_id, student_name,
                                event_name, cert_type, team_name, team_rank, team_score,
                                individual_rank, individual_score, category,
                                title, description, style_theme, organizer_name, organizer_designation,
                                institution_name, issue_date, status, qr_code_data_url
                            ) VALUES ($1, $2, $3, NULL, $4, $5, 'individual', $6, NULL, NULL, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'Valid', $17)
                            RETURNING *`,
                            [
                                certId, req.teacher.id, roomId, ind.display_name,
                                eventName, ind.team_name || null, ind.rank, ind.total_score, cat,
                                config.title, config.description, config.style_theme,
                                config.organizer_name, config.organizer_designation,
                                config.institution_name, config.issue_date, qrCodeDataUrl
                            ]
                        );
                    }

                    if (certInsert && certInsert.rows.length > 0) {
                        issuedCertificates.push(certInsert.rows[0]);
                    }
                }
            }
        }

        // 3. Tournament Certificate Issuance
        if (tournamentId) {
            const podiumRes = await client.query('SELECT * FROM tournament_results WHERE tournament_id = $1', [tournamentId]);
            if (podiumRes.rows.length > 0) {
                const pod = podiumRes.rows[0];
                const ranks = [
                    { teamId: pod.champion_team_id, rank: 1, cat: 'Winner' },
                    { teamId: pod.runner_up_team_id, rank: 2, cat: 'Runner-up' },
                    { teamId: pod.third_place_team_id, rank: 3, cat: 'Third Rank' },
                ].filter(r => r.teamId);

                for (const r of ranks) {
                    const teamInfo = await client.query('SELECT name FROM tournament_teams WHERE id = $1', [r.teamId]);
                    const teamName = teamInfo.rows[0]?.name || 'Tournament Team';

                    const members = await client.query(
                        `SELECT s.id, s.display_name
                         FROM tournament_team_members ttm
                         JOIN students s ON s.id = ttm.student_id
                         WHERE ttm.tournament_team_id = $1`,
                        [r.teamId]
                    );

                    for (const m of members.rows) {
                        const certId = generateCertificateId();
                        const verifyUrl = `${baseUrl}/verify/${certId}`;
                        const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 140 });

                        const certInsert = await client.query(
                            `INSERT INTO certificates (
                                certificate_id, organizer_id, tournament_id, student_id, student_name,
                                event_name, cert_type, team_name, team_rank, category,
                                title, description, style_theme, organizer_name, organizer_designation,
                                institution_name, issue_date, status, qr_code_data_url
                            ) VALUES ($1, $2, $3, $4, $5, $6, 'team', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'Valid', $17)
                            ON CONFLICT (student_id, tournament_id, cert_type) DO NOTHING
                            RETURNING *`,
                            [
                                certId, req.teacher.id, tournamentId, m.id, m.display_name,
                                eventName, teamName, r.rank, r.cat,
                                config.title, config.description, config.style_theme,
                                config.organizer_name, config.organizer_designation,
                                config.institution_name, config.issue_date, qrCodeDataUrl
                            ]
                        );

                        if (certInsert.rows.length > 0) {
                            issuedCertificates.push(certInsert.rows[0]);
                        }
                    }
                }
            }
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            count: issuedCertificates.length,
            certificates: issuedCertificates
        });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Issue certificates error:', e.message);
        res.status(500).json({ error: 'Failed to issue certificates' });
    } finally {
        client.release();
    }
});

// ─── 4b. Organizer: Manual Certificate Issuance (Specific Teams/Students) ───────
/**
 * POST /api/certificates/issue-manual
 * Issue certificates to specific teams and/or individual students.
 * Body: {
 *   roomId (or roomCode/tournamentId),
 *   teamIds?: number[],        // Specific team IDs to issue to
 *   studentIds?: number[],     // Specific student IDs to issue to
 *   certType: 'team' | 'individual' | 'participation',
 *   category?: string,         // 'Winner', 'Runner-up', 'Third Rank', 'Top Ranker', 'Participation'
 *   customTitle?: string,
 *   customDescription?: string
 * }
 */
router.post('/issue-manual', requireTeacher, async (req, res) => {
    const client = await pool.connect();
    try {
        let { roomId, roomCode, tournamentId, teamIds, studentIds, certType, category, styleTheme, customTitle, customDescription } = req.body;

        if (!certType || !['team', 'individual', 'participation'].includes(certType)) {
            return res.status(400).json({ error: 'certType must be team, individual, or participation' });
        }

        if ((!teamIds || teamIds.length === 0) && (!studentIds || studentIds.length === 0)) {
            return res.status(400).json({ error: 'At least one teamId or studentId required' });
        }

        // Auto-resolve roomId from roomCode if provided
        if ((!roomId || isNaN(parseInt(roomId))) && roomCode) {
            const rRes = await client.query('SELECT id FROM rooms WHERE code = $1', [roomCode.toUpperCase()]);
            if (rRes.rows.length > 0) roomId = rRes.rows[0].id;
        }

        if (!roomId && !tournamentId) {
            return res.status(400).json({ error: 'roomId or tournamentId required' });
        }

        await client.query('BEGIN');

        // Verify Organizer Ownership & Fetch Config
        let configRes;
        let eventName = '';
        if (roomId) {
            const rCheck = await client.query(
                `SELECT r.*, qs.title FROM rooms r
                 LEFT JOIN question_sets qs ON qs.id = r.question_set_id
                 WHERE r.id = $1 AND (r.teacher_id = $2 OR $3 = 'super_admin' OR r.teacher_id IS NULL)`,
                [roomId, req.teacher.id, req.teacher.role || 'organizer']
            );
            if (rCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({ error: 'Unauthorized or room not found' });
            }
            if (!rCheck.rows[0].teacher_id) {
                await client.query('UPDATE rooms SET teacher_id = $1 WHERE id = $2', [req.teacher.id, roomId]);
            }
            eventName = rCheck.rows[0].battle_name || rCheck.rows[0].title || 'AptiQuiz Battle';
            configRes = await client.query('SELECT * FROM certificate_configs WHERE room_id = $1', [roomId]);
        } else {
            const tCheck = await client.query('SELECT * FROM tournaments WHERE id = $1 AND (organizer_teacher_id = $2 OR $3 = \'super_admin\')', [tournamentId, req.teacher.id, req.teacher.role || 'organizer']);
            if (tCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({ error: 'Unauthorized or tournament not found' });
            }
            eventName = tCheck.rows[0].name;
            configRes = await client.query('SELECT * FROM certificate_configs WHERE tournament_id = $1', [tournamentId]);
        }

        const config = configRes.rows[0] || {
            top_teams_count: 3,
            top_individuals_count: 3,
            title: 'Certificate of Excellence',
            description: 'For outstanding aptitude and performance.',
            style_theme: 'gold',
            organizer_name: req.teacher.displayName,
            organizer_designation: 'Quiz Master',
            institution_name: '',
            issue_date: new Date().toISOString().split('T')[0]
        };

        const issuedCertificates = [];
        const baseUrl = process.env.BASE_URL || 'http://localhost:5173';

        // Resolve team members if teamIds provided
        let targetStudents = []; // { student_id, display_name, team_name, team_rank, team_score }

        if (teamIds && teamIds.length > 0) {
            // Verify teams belong to this room/tournament
            if (roomId) {
                const teamsRes = await client.query(
                    `SELECT t.id, t.name FROM teams t WHERE t.id = ANY($1) AND t.room_id = $2`,
                    [teamIds, roomId]
                );
                for (const team of teamsRes.rows) {
                    const membersRes = await client.query(
                        `SELECT rp.id AS player_id, rp.student_id, rp.display_name, s.email, res.total_score AS ind_score, res.rank AS ind_rank
                         FROM room_players rp
                         LEFT JOIN students s ON s.id = rp.student_id
                         LEFT JOIN results res ON res.player_id = rp.id AND res.room_id = $1
                         WHERE rp.room_id = $1 AND rp.team_id = $2`,
                        [roomId, team.id]
                    );
                    for (const member of membersRes.rows) {
                        targetStudents.push({
                            player_id: member.player_id,
                            student_id: member.student_id,
                            display_name: member.display_name,
                            team_name: team.name,
                            team_rank: null, // Will be set per team if needed
                            team_score: null,
                            individual_rank: member.ind_rank || null,
                            individual_score: member.ind_score || null,
                        });
                    }
                }
            } else if (tournamentId) {
                const teamsRes = await client.query(
                    `SELECT tt.id, tt.name FROM tournament_teams tt WHERE tt.id = ANY($1)`,
                    [teamIds]
                );
                for (const team of teamsRes.rows) {
                    const members = await client.query(
                        `SELECT s.id, s.display_name
                         FROM tournament_team_members ttm
                         JOIN students s ON s.id = ttm.student_id
                         WHERE ttm.tournament_team_id = $1`,
                        [team.id]
                    );
                    for (const m of members.rows) {
                        targetStudents.push({
                            student_id: m.id,
                            display_name: m.display_name,
                            team_name: team.name,
                            team_rank: null,
                            team_score: null,
                            individual_rank: null,
                            individual_score: null,
                        });
                    }
                }
            }
        }

        // Add individual students if provided
        if (studentIds && studentIds.length > 0) {
            // Verify students are in this room/tournament
            if (roomId) {
                const studentsRes = await client.query(
                    `SELECT rp.id AS player_id, rp.student_id, rp.display_name, s.email, res.total_score AS ind_score, res.rank AS ind_rank, t.name AS team_name
                     FROM room_players rp
                     LEFT JOIN students s ON s.id = rp.student_id
                     LEFT JOIN results res ON res.player_id = rp.id AND res.room_id = $1
                     LEFT JOIN teams t ON t.id = rp.team_id
                     WHERE rp.room_id = $1 AND (rp.student_id = ANY($2) OR rp.id = ANY($2))`,
                    [roomId, studentIds]
                );
                for (const student of studentsRes.rows) {
                    targetStudents.push({
                        player_id: student.player_id,
                        student_id: student.student_id,
                        display_name: student.display_name,
                        team_name: student.team_name || null,
                        team_rank: null,
                        team_score: null,
                        individual_rank: student.ind_rank || null,
                        individual_score: student.ind_score || null,
                    });
                }
            } else if (tournamentId) {
                const studentsRes = await client.query(
                    `SELECT s.id, s.display_name, tt.name AS team_name
                     FROM students s
                     JOIN tournament_team_members ttm ON ttm.student_id = s.id
                     JOIN tournament_teams tt ON tt.id = ttm.tournament_team_id
                     WHERE s.id = ANY($1)`,
                    [studentIds]
                );
                for (const student of studentsRes.rows) {
                    targetStudents.push({
                        student_id: student.id,
                        display_name: student.display_name,
                        team_name: student.team_name || null,
                        team_rank: null,
                        team_score: null,
                        individual_rank: null,
                        individual_score: null,
                    });
                }
            }
        }

        // Deduplicate by student_id or player_id / name
        const seen = new Set();
        targetStudents = targetStudents.filter(s => {
            const key = s.student_id ? `s_${s.student_id}` : `p_${s.player_id || s.display_name}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Issue certificates
        for (const student of targetStudents) {
            const certId = generateCertificateId();
            const verifyUrl = `${baseUrl}/verify/${certId}`;
            const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 140 });

            const certCategory = category || 'Top Ranker';
            const title = customTitle || config.title || 'Certificate of Excellence';
            const description = customDescription || config.description || 'For outstanding aptitude and performance.';

            let effectiveStudentId = student.student_id;
            if (!effectiveStudentId && student.display_name) {
                const sLookup = await client.query('SELECT id FROM students WHERE LOWER(display_name) = LOWER($1)', [student.display_name.trim()]);
                if (sLookup.rows.length > 0) effectiveStudentId = sLookup.rows[0].id;
            }

            let certInsert;
            if (effectiveStudentId) {
                certInsert = await client.query(
                    `INSERT INTO certificates (
                        certificate_id, organizer_id, room_id, tournament_id, student_id, student_name,
                        event_name, cert_type, team_name, team_rank, team_score,
                        individual_rank, individual_score, category,
                        title, description, style_theme, organizer_name, organizer_designation,
                        institution_name, issue_date, status, qr_code_data_url
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'Valid', $22)
                    ON CONFLICT (student_id, ${roomId ? 'room_id' : 'tournament_id'}, cert_type) DO UPDATE SET
                        team_name = EXCLUDED.team_name,
                        team_rank = EXCLUDED.team_rank,
                        team_score = EXCLUDED.team_score,
                        individual_rank = EXCLUDED.individual_rank,
                        individual_score = EXCLUDED.individual_score,
                        category = EXCLUDED.category,
                        title = EXCLUDED.title,
                        description = EXCLUDED.description,
                        status = 'Valid',
                        qr_code_data_url = EXCLUDED.qr_code_data_url,
                        updated_at = NOW()
                    RETURNING *`,
                    [
                        certId, req.teacher.id,
                        roomId ? parseInt(roomId) : null,
                        tournamentId ? parseInt(tournamentId) : null,
                        effectiveStudentId, student.display_name,
                        eventName, certType, student.team_name || null, student.team_rank || null, student.team_score || null,
                        student.individual_rank || null, student.individual_score || null, certCategory,
                        title, description, styleTheme || config.style_theme || 'gold',
                        config.organizer_name, config.organizer_designation,
                        config.institution_name, config.issue_date, qrCodeDataUrl
                    ]
                );
                await awardBadgeForCertificate(client, effectiveStudentId, roomId, certCategory);
            } else {
                certInsert = await client.query(
                    `INSERT INTO certificates (
                        certificate_id, organizer_id, room_id, tournament_id, student_id, student_name,
                        event_name, cert_type, team_name, team_rank, team_score,
                        individual_rank, individual_score, category,
                        title, description, style_theme, organizer_name, organizer_designation,
                        institution_name, issue_date, status, qr_code_data_url
                    ) VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'Valid', $21)
                    RETURNING *`,
                    [
                        certId, req.teacher.id,
                        roomId ? parseInt(roomId) : null,
                        tournamentId ? parseInt(tournamentId) : null,
                        student.display_name,
                        eventName, certType, student.team_name || null, student.team_rank || null, student.team_score || null,
                        student.individual_rank || null, student.individual_score || null, certCategory,
                        title, description, styleTheme || config.style_theme || 'gold',
                        config.organizer_name, config.organizer_designation,
                        config.institution_name, config.issue_date, qrCodeDataUrl
                    ]
                );
            }

            if (certInsert && certInsert.rows.length > 0) {
                issuedCertificates.push(certInsert.rows[0]);
            }
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            count: issuedCertificates.length,
            certificates: issuedCertificates
        });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Manual issue certificates error:', e.message);
        res.status(500).json({ error: 'Failed to issue certificates' });
    } finally {
        client.release();
    }
});

// ─── 5. Organizer / Admin: Revoke Certificate ─────────────────────────────────

/**
 * POST /api/certificates/:certId/revoke
 */
router.post('/:certId/revoke', requireTeacher, async (req, res) => {
    try {
        const certId = req.params.certId.toUpperCase();
        const { reason } = req.body;

        // Verify organizer ownership unless super_admin
        const certRes = await pool.query('SELECT organizer_id FROM certificates WHERE certificate_id = $1', [certId]);
        if (certRes.rows.length === 0) return res.status(404).json({ error: 'Certificate not found' });

        if (req.teacher.role !== 'super_admin' && certRes.rows[0].organizer_id !== req.teacher.id) {
            return res.status(403).json({ error: 'Unauthorized to revoke this certificate' });
        }

        await pool.query(
            `UPDATE certificates
             SET status = 'Revoked', revocation_reason = $1, revoked_at = NOW()
             WHERE certificate_id = $2`,
            [reason || 'Revoked by event organizer or platform administration', certId]
        );

        res.json({ success: true, message: 'Certificate has been revoked.' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to revoke certificate' });
    }
});

module.exports = router;

