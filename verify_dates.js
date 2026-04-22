
const targetDate = "2026-04-09";
const [tY, tM, tD] = targetDate.split('-').map(s => parseInt(s, 10));

function isDateMatch(rawDate) {
    if (!rawDate || typeof rawDate !== 'string') return false;
    if (rawDate.includes(targetDate)) return true;
    const parts = rawDate.split(/[\/\-,\s]+/).map(p => parseInt(p, 10)).filter(p => !isNaN(p));
    if (parts.length >= 3) {
        const hasYear = parts.includes(tY) || parts.includes(tY % 100);
        const hasMonth = parts.includes(tM);
        const hasDay = parts.includes(tD);
        if (hasYear && hasMonth && hasDay) return true;
    }
    return false;
}

const testCases = [
    { input: "4/9/2026", expected: true },
    { input: "04/09/2026", expected: true },
    { input: "9/4/2026", expected: false }, // Assumes M/D/YYYY for the user's region
    { input: "2026-04-09", expected: true },
    { input: "4/9/26", expected: true }
];

testCases.forEach(tc => {
    const result = isDateMatch(tc.input);
    console.log(`Input: ${tc.input} | Expected: ${tc.expected} | Result: ${result} | ${result === tc.expected ? 'PASS' : 'FAIL'}`);
});
