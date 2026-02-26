import fs from 'fs';
const data = fs.readFileSync('tmp/server_out4.log', 'utf16le');
console.log(data);
