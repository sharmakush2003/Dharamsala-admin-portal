const fs = require('fs');
const path = 'c:\\Users\\kushs\\OneDrive\\Documents\\Web Development\\AI Assissted Web Development\\Dharamsala Admin\\live_data_utf8.json';

try {
const dataStr = fs.readFileSync(path, 'utf8');
    // Remove BOM if present
    const cleanStr = (dataStr.charCodeAt(0) === 0xFEFF || dataStr.startsWith('\ufeff')) ? dataStr.replace(/^\ufeff/, '') : dataStr;
    const data = JSON.parse(cleanStr);
    const bookingData = data.value.filter(r => {
        const hasGuest = r["Guest Name"] || r["Head of Family Name"] || r["Mobile Number"] || r["Contact Number"];
        const status = String(r["Booking Status"] || "").toLowerCase();
        const isCleaning = status.includes("cleaning");
        const isCheckedOut = status === "checked-out" || status === "checkout";
        return hasGuest && !isCleaning && !isCheckedOut;
    });

    let occupiedCount = 0;
    bookingData.forEach(r => {
        // Mock getApplicationStatus
        const roomNum = (r["Room Number"] || "").toString().trim();
        const status = (r["Booking Status"] || "").toLowerCase();
        let derivedStatus = r["Booking Status"] || "Pending";
        if (status.includes("cleaning")) derivedStatus = "Under Cleaning";
        else if (status.includes("checked-out")) derivedStatus = "Checked-Out";
        else if (roomNum !== "" && roomNum !== "Pending") derivedStatus = "Booked";

        if (derivedStatus === "Booked") {
            const roomVal = (r["Room Number"] || "").toString();
            const individualRooms = roomVal.split(',').map(s => s.trim()).filter(s => s !== "" && s !== "Pending");
            occupiedCount += individualRooms.length;
            console.log(`Guest: ${r["Guest Name"]}, Rooms: ${roomVal}, Count: ${individualRooms.length}`);
        }
    });

    console.log(`Total Occupied Count: ${occupiedCount}`);
} catch (e) {
    console.error(e);
}
