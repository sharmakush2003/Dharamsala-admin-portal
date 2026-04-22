const fs = require('fs');

try {
    const raw = fs.readFileSync('live_debug_data.json', 'utf8');
    const clean = raw.replace(/^\uFEFF/, '');
    let data = JSON.parse(clean);
    
    // Handle different wrapper layouts
    const records = data.value || data.data || (Array.isArray(data) ? data : []);
    
    console.log(`Searching 2026-12 in ${records.length} records...`);

    records.forEach((r, idx) => {
        Object.keys(r).forEach(k => {
            const val = r[k];
            if (val && val.toString().includes('2026-12')) {
                if (k.toLowerCase().includes("room")) {
                    console.log(`!!! FOUND IT !!! Index ${idx} | Key: ${k} | Value: ${val}`);
                    console.log(JSON.stringify(r, null, 2));
                }
            }
        });
    });
} catch (e) {
    console.error(e.message);
    console.log("Raw Data Start (first 100 chars):", fs.readFileSync('live_debug_data.json', 'utf8').substring(0, 100));
}
