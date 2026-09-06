const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
    secret: 'nafis-math-secret-key-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const ADMIN_PASSWORD = "math_aliaa_2026"; 

function requireAuth(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    } else {
        res.redirect('/login');
    }
}

const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error(err.message);
    console.log('Connected to the SQLite database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, class TEXT NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS tests (id INTEGER PRIMARY KEY AUTOINCREMENT, test_name TEXT NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS scores (student_id INTEGER, test_id INTEGER, score REAL, PRIMARY KEY (student_id, test_id), FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE, FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE)`);
});

function getLeaderboard(className, callback) {
    let query = `
        SELECT s.id, s.name, s.class, COUNT(sc.score) as test_count, SUM(sc.score) as total_score, ROUND(AVG(sc.score), 2) as avg_score
        FROM students s LEFT JOIN scores sc ON s.id = sc.student_id
    `;
    let params = [];
    if (className) {
        query += ` WHERE s.class = ? `;
        params.push(className);
    }
    query += ` GROUP BY s.id ORDER BY total_score DESC, avg_score DESC `;

    db.all(query, params, (err, rows) => {
        if (err) return callback(err);
        let currentRank = 1;
        const rankedRows = rows.map((row, index) => {
            if (index > 0 && row.total_score < rows[index - 1].total_score) { currentRank = index + 1; }
            return { ...row, total_score: row.total_score || 0, avg_score: row.avg_score || 0, rank: row.total_score > 0 ? currentRank : '-' };
        });
        callback(null, rankedRows);
    });
}

app.get('/', (req, res) => {
    const activeTab = req.query.tab || 'all';
    let classFilter = null;
    if (activeTab === 'A') classFilter = 'أ';
    if (activeTab === 'B') classFilter = 'ب';
    if (activeTab === 'C') classFilter = 'ج';

    getLeaderboard(classFilter, (err, leaderboard) => {
        db.get("SELECT COUNT(*) as count FROM students", (err, sCount) => {
            db.get("SELECT COUNT(*) as count FROM tests", (err, tCount) => {
                const statsQuery = `SELECT s.class, ROUND(AVG(sc.score), 2) as class_avg, COUNT(sc.score) as class_tests_count FROM students s LEFT JOIN scores sc ON s.id = sc.student_id GROUP BY s.class`;
                db.all(statsQuery, [], (err, classStats) => {
                    const stats = { 'أ': { avg: 0, count: 0 }, 'ب': { avg: 0, count: 0 }, 'ج': { avg: 0, count: 0 } };
                    if (classStats) {
                        classStats.forEach(row => {
                            if (stats[row.class]) { stats[row.class].avg = row.class_avg || 0; stats[row.class].count = row.class_tests_count || 0; }
                        });
                    }
                    res.render('index', { leaderboard, activeTab, studentCount: sCount.count, testCount: tCount.count, chartData: stats, isAdmin: req.session.isAdmin || false });
                });
            });
        });
    });
});

app.get('/login', (req, res) => { res.render('login', { error: req.query.error ? 'كلمة المرور غير صحيحة!' : null }); });
app.post('/login', (req, res) => { if (req.body.password === ADMIN_PASSWORD) { req.session.isAdmin = true; res.redirect('/admin'); } else { res.redirect('/login?error=true'); } });
app.get('/logout', (req, res) => { req.session.destroy(() => { res.redirect('/'); }); });

app.get('/admin', requireAuth, (req, res) => { db.all("SELECT * FROM students ORDER BY class, name", (err, students) => { db.all("SELECT * FROM tests", (err, tests) => { res.render('admin', { students, tests }); }); }); });
app.post('/admin/student/add', requireAuth, (req, res) => { db.run("INSERT INTO students (name, class) VALUES (?, ?)", [req.body.name, req.body.student_class], () => { res.redirect('/admin'); }); });
app.post('/admin/student/delete/:id', requireAuth, (req, res) => { db.run("DELETE FROM students WHERE id = ?", [req.params.id], () => { res.redirect('/admin'); }); });
app.post('/admin/test/add', requireAuth, (req, res) => { db.run("INSERT INTO tests (test_name) VALUES (?)", [req.body.test_name], function(err) { res.redirect(`/admin/test/scores/${this.lastID}`); }); });
app.get('/admin/test/scores/:id', requireAuth, (req, res) => { db.get("SELECT * FROM tests WHERE id = ?", [req.params.id], (err, test) => { db.all(`SELECT s.id, s.name, s.class, sc.score FROM students s LEFT JOIN scores sc ON s.id = sc.student_id AND sc.test_id = ? ORDER BY s.class, s.name`, [req.params.id], (err, students) => { res.render('enter-scores', { test, students }); }); }); });
app.post('/admin/test/scores/:id', requireAuth, (req, res) => { const stmt = db.prepare(`INSERT OR REPLACE INTO scores (student_id, test_id, score) VALUES (?, ?, ?)`); for (let studentId in req.body.scores) { if (req.body.scores[studentId] !== '') { stmt.run(studentId, req.params.id, parseFloat(req.body.scores[studentId])); } else { db.run(`DELETE FROM scores WHERE student_id = ? AND test_id = ?`, [studentId, req.params.id]); } } stmt.finalize(() => { res.redirect('/admin'); }); });
app.post('/admin/test/delete/:id', requireAuth, (req, res) => { db.run("DELETE FROM tests WHERE id = ?", [req.params.id], () => { res.redirect('/admin'); }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`الموقع يعمل الآن على الرابط: http://localhost:${PORT}`); });
