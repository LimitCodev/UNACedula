const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const db = mysql.createPool({
    host: 'gateway01.us-east-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '2kqqCZ3qosY8h1d.root',
    password: 'VfGjvbxL5ppCmduz',
    database: 'unacedula',
    ssl: {rejectUnauthorized: true}
});

app.get('/candidatos', async(req, res) => {
    try {
        const [candidatos] = await db.query('SELECT * FROM candidato');
        res.json({ok:true, candidatos});
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

app.listen(3000, () => console.log('UP'));
