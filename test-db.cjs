const { Client } = require("pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run test-db.cjs");
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

client.connect()
  .then(() => {
    console.log("Connected");
    return client.query("SELECT NOW()");
  })
  .then((res) => console.log(res.rows[0]))
  .catch((e) => console.error(e))
  .finally(() => client.end());
