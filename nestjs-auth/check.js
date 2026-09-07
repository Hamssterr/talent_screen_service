const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://postgres:postgres@localhost:5432/local_auth_oauth"
  });

  try {
    await client.connect();
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log("Tables in public schema:");
    res.rows.forEach(r => console.log(r.table_name));
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
check();
