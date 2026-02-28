const fs = require('fs');
const pdf = require('pdf-parse');

async function parse() {
  const dataBuffer = fs.readFileSync(process.argv[2]);
  const data = await pdf(dataBuffer);
  console.log(data.text);
}
parse();
