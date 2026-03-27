const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://lewisbarron:mArEp7iHv0msihQlqPwsYTSC5TMvUmPl@dpg-d5dbsh1r0fns73age33g-a.frankfurt-postgres.render.com/maindatabase_kh55?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

client.connect()
  .then(() => {
    console.log('Connected');
    return client.query('SELECT NOW()');
  })
  .then(res => console.log(res.rows[0]))
  .catch(e => console.error(e))
  .finally(() => client.end());
