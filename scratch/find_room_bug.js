const fs = require('fs');

try {
    const raw = fs.readFileSync('latest_api_data_utf8.json', 'utf8');
    // Remove BOM if present
    const clean = raw.replace(/^\uFEFF/, '');
    const data = JSON.parse(clean).value;
    console.log(`Total records: ${data.length}`);

    data.forEach((r, idx) => {
        const room = r["Room Number"];
        if (room && room.toString().includes('2026')) {
            console.log(`FOUND Corrupted Room at Index ${idx}:`);
            console.log(JSON.stringify(r, null, 2));
        }
    });
} catch (e) {
    console.error(e.message);
}
