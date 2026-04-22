// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyA7gv7ytuuULPFA64es9ohuYVUQT4jXN4U",
    authDomain: "dharamshala-hms-ca455.firebaseapp.com",
    projectId: "dharamshala-hms-ca455",
    storageBucket: "dharamshala-hms-ca455.firebasestorage.app",
    messagingSenderId: "1025603966798",
    appId: "1:1025603966798:web:8f509f6e8d1e359565301f"
};


// Initialize Firebase
console.log("Current Firebase Config:", firebaseConfig);
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();


// Theme Management
function toggleTheme() {
    const body = document.body;
    const isDark = body.getAttribute('data-theme') !== 'light';
    const newTheme = isDark ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('hms-theme', newTheme);

    // Update Icon
    const icon = document.getElementById('themeIcon');
    icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    lucide.createIcons();
    showToast(`Switched to ${newTheme.toUpperCase()} mode`, "success");
}

function loadTheme() {
    const saved = localStorage.getItem('hms-theme') || 'dark';
    document.body.setAttribute('data-theme', saved);
    setTimeout(() => {
        const icon = document.getElementById('themeIcon');
        if (icon) {
            icon.setAttribute('data-lucide', saved === 'light' ? 'sun' : 'moon');
            lucide.createIcons();
        }
    }, 100);
}

// Initialize Theme Immediately
loadTheme();

// Auth State Monitor
auth.onAuthStateChanged(user => {
    const loading = document.getElementById('loadingOverlay');
    const overlay = document.getElementById('loginOverlay');
    const content = document.getElementById('protectedContent');
    
    // Hide loading screen
    if (loading) loading.style.display = 'none';

    if (user) {
        overlay.style.display = 'none';
        content.style.display = 'flex';
        loadData(); // Data only loads for authorized users
    } else {
        overlay.style.display = 'flex';
        content.style.display = 'none';
    }
});


async function handleLogout() {
    if (confirm("Are you sure you want to sign out?")) {
        try {
            await auth.signOut();
            showToast("Signed out", "success");
        } catch (error) {
            showToast("Error signing out", "error");
        }
    }
}

// Login Handler - Wait for page to load
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const pass = document.getElementById('loginPassword').value;
            const btn = document.getElementById('loginBtn');
            const err = document.getElementById('errorMsg');

            btn.innerText = "Verifying Admin...";
            btn.disabled = true;
            err.style.display = "none";

            try {
                await auth.signInWithEmailAndPassword(email, pass);
                showToast("Access Granted", "success");
            } catch (error) {
                console.error("Auth Error Object:", error);

                let message = "Invalid Credentials. Access Denied.";

                // Detailed helpful messages
                if (error.code === "auth/invalid-api-key" || error.code === "auth/api-key-not-valid") {
                    message = "CRITICAL: Firebase API Key is invalid. Please check script.js.";
                } else if (error.code === "auth/operation-not-allowed") {
                    message = "CRITICAL: Email/Password login is NOT enabled in Firebase Console.";
                } else if (firebaseConfig.messagingSenderId === "hshhs") {
                    message = "DIAGNOSTIC: 'messagingSenderId' is still a placeholder. Check config.";
                } else {
                    message = `Login Failed: [${error.code}] - ${error.message}`;
                }

                err.innerText = message;
                err.style.display = "block";
                btn.innerText = "Unlock Dashboard";
                btn.disabled = false;

                // Show a helpful debug link if it's not solved
                console.log("%c Firebase Auth Troubleshooting: %c\n1. Check if Email/Pass is enabled.\n2. Verify Project ID matches.\n3. Verify your domain is authorized.", "color: white; background: #ef4444; font-weight: bold; padding: 2px 4px; border-radius: 4px;", "color: #ef4444; font-weight: bold;");
            }

        };
    }
});

const API_URL = "https://script.google.com/macros/s/AKfycbz6dfl7Yk7s7tJ8Xg0VXdaZbZmVU2z0_T5kM7EvFHxvXPsEuIklA4IcC27PnnyuypC5Dw/exec";
let rawSheetData = [];
let bookingData = [];
let historyData = [];
let filteredData = [];
let errorRows = []; // Global storage for spreadsheet errors
let filteredBillingData = [];
let pendingPrintTask = null;
let stats = {};
let sessionApiCalls = 0;
let currentAllotTimestamp = '';
let currentAllotEmail = '';  // Secondary identifier for GAS row lookup
let activeStatusFilter = 'pending'; // Default filter
let customMode = false;
let selectedRooms = [];
let currentRoomMapFilter = 'all'; // Default Room Map filter

// --- SEQUENTIAL RECEIPT NUMBER GENERATOR ---
// Scans all loaded data to find the highest existing receipt number,
// then returns the next one. Always starts from 101.
// This ensures continuity across sessions and devices without any extra DB.
function getNextReceiptNumber() {
    const allData = [...bookingData, ...historyData];
    let maxNum = 100; // Numbers will start from 101
    allData.forEach(r => {
        const receiptNo = r["Check In Bill No"] || r["Receipt No"] || "";
        // Match both IN-XXX and OUT-XXX patterns
        const match = receiptNo.match(/(?:IN|OUT)-(\d+)/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
        }
    });
    return maxNum + 1;
}

// --- PROPERTY CONFIGURATION ---
const ROOM_CATEGORIES = {
    "Non Attached": ["3", "6", "8", "9", "10", "11", "12", "13", "122", "123", "124"],
    "Non AC": ["114", "115", "116", "117", "118", "119", "120", "121", "126", "127", "129", "130", "131", "132", "133", "134", "135", "136", "137", "138", "139"],
    "2 Bed AC": ["16", "17", "18", "109", "110", "111", "112", "113", "211", "212", "213", "214", "215", "216", "217", "218", "219", "220", "221", "222", "223", "224", "225", "226", "227"],
    "3 Bed AC": ["101", "102", "103", "104", "105", "106", "201", "202", "203", "204", "205", "206", "207", "208", "209"],
    "4 Bed AC": ["210"],
    "Non AC Hall": ["15", "107", "108"]
};

// --- DATE FORMATTER ---
function getFormattedDateTime(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    
    return {
        date: `${day}/${month}/${year}`,
        time: `${hours}:${minutes} ${ampm}`,
        full: `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`
    };
}

// --- ANIMATED COUNTER LOGIC ---
function animateCounter(id, endValue, duration = 1500) {
    const el = document.getElementById(id);
    if (!el) return;

    el.classList.add('stat-pulse'); // Add pulse effect
    
    let startValue = 0;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (easeOutExpo)
        const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        
        const currentValue = Math.floor(easeProgress * endValue);
        el.innerText = currentValue;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.innerText = endValue;
            setTimeout(() => el.classList.remove('stat-pulse'), 500); // Remove after animation
        }
    }

    requestAnimationFrame(update);
}

const ROOM_RATES = {
    "Non Attached": 300,
    "Non AC": 500,
    "2 Bed AC": 800,
    "3 Bed AC": 1000,
    "4 Bed AC": 1200,
    "Non AC Hall": 400,
    "Other": 400
};

// Default mapping (Can be updated when user provides actual numbers)
function getRoomCategory(num) {
    for (const [cat, rooms] of Object.entries(ROOM_CATEGORIES)) {
        if (rooms.includes(num.toString())) return cat;
    }
    return "Other";
}

// --- GLOBAL HMS LOGIC ---
// Unifies status determination to ensure consistency between Table, Map, and Stats
function getApplicationStatus(r) {
    const roomNum = (r["Room Number"] || "").toString().trim();
    const rawStatus = (r["Booking Status"] || "").toLowerCase();

    if (rawStatus.includes("cleaning")) return "Under Cleaning";
    if (rawStatus.includes("checked-out")) return "Checked-Out";
    if (roomNum !== "" && roomNum !== "Pending") return "Booked";

    return r["Booking Status"] || "Pending";
}
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupSearch();
    setupNavigation();
    setupFilters();
    setupModalListeners();
});

function setupModalListeners() {
    const catSel = document.getElementById("categorySelect");
    if (catSel) {
        catSel.addEventListener('change', (e) => {
            updateRoomList(e.target.value);
            // Auto-fill rate based on category
            const rateInput = document.getElementById("roomRate");
            if (rateInput && ROOM_RATES[e.target.value]) {
                rateInput.value = ROOM_RATES[e.target.value];
            }
        });
    }
}

function setupFilters() {
    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeStatusFilter = btn.getAttribute('data-filter');
            applyFilters();
        });
    });

    // Date Filter Listeners
    ['regDateStart', 'regDateEnd'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', applyFilters);
    });

    // Search Input Listener
    const searchInput = document.getElementById('registrySearch');
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }
}

function applyFilters() {
    let baseData = [...bookingData];
    
    // --- 1. Filter by Status ---
    if (activeStatusFilter !== 'all') {
        baseData = baseData.filter(r => {
            const status = getApplicationStatus(r).toLowerCase();
            if (activeStatusFilter === 'pending') return status === 'pending';
            if (activeStatusFilter === 'booked') return status === 'booked';
            if (activeStatusFilter === 'cleaning') return status.includes('cleaning');
            return true;
        });
    }

    // --- 2. Optional Date Filtering (Inactive by Default) ---
    const startDate = document.getElementById('regDateStart')?.value;
    const endDate = document.getElementById('regDateEnd')?.value;

    if (startDate || endDate) {
        baseData = baseData.filter(r => {
            const dateStr = r["Timestamp"] || "";
            if (!dateStr) return false;
            const date = new Date(dateStr).toISOString().split('T')[0];
            if (startDate && date < startDate) return false;
            if (endDate && date > endDate) return false;
            return true;
        });
    }

    // --- 3. Search Query ---
    const searchQuery = document.getElementById('registrySearch')?.value.toLowerCase();
    if (searchQuery) {
        baseData = baseData.filter(r => {
            const name = (r["Guest Name"] || r["Head of Family Name"] || "").toLowerCase();
            const room = (r["Room Number"] || "").toString().toLowerCase();
            const phone = (r["Contact Number"] || r["Mobile Number"] || "").toString().toLowerCase();
            const id = (r["ID Number"] || r["Identity Number"] || "").toString().toLowerCase();
            const city = (r["City"] || r["Residence City / Town"] || "").toLowerCase();
            
            return name.includes(searchQuery) || 
                   room.includes(searchQuery) || 
                   phone.includes(searchQuery) || 
                   id.includes(searchQuery) ||
                   city.includes(searchQuery);
        });
    }

    const label = document.getElementById("activeFilterLabel");
    if (label) {
        const prefix = searchQuery ? `Found ${baseData.length} matching` : `Showing ${activeStatusFilter.charAt(0).toUpperCase() + activeStatusFilter.slice(1)} Guests (${baseData.length})`;
        label.innerText = prefix;
    }

    filteredData = baseData;
    renderTable(filteredData);
}

async function loadData() {
    const icon = document.querySelector('[data-lucide="rotate-ccw"]');
    if (icon) icon.classList.add('spinning');
    
    const statusLabel = document.getElementById("statusLabel");
    if (statusLabel) {
        statusLabel.innerText = "Syncing...";
        statusLabel.parentElement.style.borderColor = "rgba(79, 70, 229, 0.4)"; // Soft blue during sync
        statusLabel.parentElement.style.background = "rgba(79, 70, 229, 0.05)";
    }

    try {
        const res = await fetch(`${API_URL}?t=${Date.now()}`);
        const data = await res.json();
        
        // Update Session API Counter
        sessionApiCalls++;
        const apiCounter = document.getElementById('sessionApiCounter');
        if (apiCounter) apiCounter.innerText = sessionApiCalls;

        // Process and map original row numbers
        const fullData = data.map((r, idx) => ({ ...r, _sheetRow: idx + 2 }));

        rawSheetData = fullData; 
        
        // Separate Active vs Historical based on new 'Booking Status' column
        bookingData = fullData.filter(r => {
            const hasGuest = r["Guest Name"] || r["Head of Family Name"] || r["Mobile Number"] || r["Contact Number"];
            const status = String(r["Booking Status"] || "").toLowerCase();
            
            const isCleaning = status.includes("cleaning");
            const isCheckedOut = status === "checked-out" || status === "checkout";

            return hasGuest && !isCleaning && !isCheckedOut;
        });

        historyData = data.filter(r => {
            const status = String(r["Booking Status"] || "").toLowerCase();
            return status.includes("checked-out") || status.includes("checkout");
        });

        // --- SORT LATEST AT TOP ---
        const sortByTimestamp = (a, b) => {
            const dateA = new Date(a["Timestamp"] || 0);
            const dateB = new Date(b["Timestamp"] || 0);
            return dateB - dateA; // Descending (Newest first)
        };
        bookingData.sort(sortByTimestamp);
        historyData.sort((a, b) => {
            const dateA = new Date(a["Checkout Timestamp"] || a["Timestamp"] || 0);
            const dateB = new Date(b["Checkout Timestamp"] || b["Timestamp"] || 0);
            return dateB - dateA;
        });

        applyFilters(); 
        updateStats(); // Replaces renderReports
        renderRoomMap(); // Replaces updateRoomGrid
        renderBilling(); // Keep existing billing render

        // New Logic: Check and perform any pending print tasks
        if (pendingPrintTask) {
            const task = pendingPrintTask;
            const searchBase = task.type === 'CHECK-IN' ? bookingData : historyData;

            // Find the correct guest record using timestamp as unique ID
            const guestRecord = searchBase.find(r => r["Timestamp"] === task.timestamp);

            if (guestRecord) {
                console.log("Record Found - Printing Invoice...");
                generateReceipt(task.type, {
                    ...guestRecord,
                    receiptNo: guestRecord["Check In Bill No"] || guestRecord["Receipt No"] || task.receiptNo,
                    dateTime: getFormattedDateTime(),
                    guestName: guestRecord["Guest Name"] || guestRecord["Head of Family Name"] || "N/A",
                    room: guestRecord["Room Number"],
                    phone: guestRecord["Contact Number"] || guestRecord["Mobile Number"] || "N/A",
                    identity: guestRecord["ID Number"] || guestRecord["Identity Number"],
                    address: guestRecord["City"] || guestRecord["Residence City / Town"],
                    advance: task.advance || guestRecord["Total Amount Deposited"], // Use task.advance if available (from verification)
                    rate: guestRecord["Room Rate"],
                    days: guestRecord["Expected Days"] || task.days,
                    stayDays: task.stayDays,
                    donation: task.donation,
                    otherAcc: task.otherAcc,
                    confirmedTotal: task.finalSettlement // Pass final settlement from verification
                });
                window.print();
                pendingPrintTask = null; // Mark task as finished
            }
        }

    } catch (err) {
        console.error("CRITICAL: Error in loadData:", err);
        showToast("System Error: " + err.message, "error");
    } finally {
        if (icon) icon.classList.remove('spinning');
        if (statusLabel) {
            statusLabel.innerText = "System Live";
            statusLabel.parentElement.style.borderColor = "rgba(16, 185, 129, 0.25)";
            statusLabel.parentElement.style.background = "rgba(16, 185, 129, 0.05)";
        }
        lucide.createIcons();
    }
}

function updateStats() {
    // Total rooms should be exactly the number of rooms defined in ROOM_CATEGORIES (76)
    const allDefinedRooms = new Set();
    Object.values(ROOM_CATEGORIES).forEach(arr => arr.forEach(r => allDefinedRooms.add(r)));
    const actualTotal = allDefinedRooms.size; // This will return exactly 76

    let occupiedCount = 0;
    bookingData.forEach(r => {
        if (getApplicationStatus(r) === "Booked") {
            const roomVal = (r["Room Number"] || "").toString();
            // Split by comma and filter out empty strings or "Pending"
            const individualRooms = roomVal.split(',').map(s => s.trim()).filter(s => s !== "" && s !== "Pending");
            occupiedCount += individualRooms.length;
        }
    });

    const cleaningCount = historyData.filter(r => getApplicationStatus(r) === "Under Cleaning").length;

    // Available rooms are those that are NOT booked and NOT under cleaning
    const availableCount = actualTotal - occupiedCount - cleaningCount;

    animateCounter("total", actualTotal);
    animateCounter("booked", occupiedCount);
    animateCounter("available", availableCount);

    // renderReports removed
    setupStatCardClicks();
}


function renderTable(data) {
    const tableBody = document.getElementById("tableBody");
    const now = new Date();

    if (data.length === 0) {
        tableBody.innerHTML = "<tr><td colspan='5' style='text-align: center; color: #64748b; padding: 50px;'>No guests matching this filter.</td></tr>";
        return;
    }

    tableBody.innerHTML = "";
    errorRows = []; // Clear previous errors

    data.forEach((r, index) => {
        const sheetRow = r._sheetRow || "Unknown";
        try {
            const roomNum = r["Room Number"] || "Pending";
            const status = getApplicationStatus(r);
            
            // Validation: Ensure names are strings before processing
            const rawGuestName = r["Guest Name"] || r["Head of Family Name"] || "";
            if (typeof rawGuestName !== 'string' && typeof rawGuestName !== 'undefined' && rawGuestName !== null) {
                throw new Error(`Column 'Guest Name' has a numeric value (${rawGuestName}). Please change it to text in the spreadsheet.`);
            }

            const guestName = rawGuestName.toString();
            const phone = (r["Contact Number"] || r["Mobile Number"] || "").toString().trim();
        const displayName = guestName || (status === "Under Cleaning" ? "ROOM CLEANING" : "N/A");
        const displayPhone = phone || "-";
        const statusClass = status === "Booked" ? "tag-booked" : (status === "Under Cleaning" ? "tag-cleaning" : "tag-pending");

        const registrationTime = r["Timestamp"] ? new Date(r["Timestamp"]) : null;
        const isNew = registrationTime && (now - registrationTime) < (30 * 60 * 1000); // 30 minutes

        // Stay Duration logic removed

        const canAllot = guestName.trim() !== "" && phone !== "" && phone !== "-";

        const row = document.createElement("tr");
        if (isNew) {
            row.className = "new-guest-highlight stagger-row";
        } else {
            row.className = "stagger-row";
        }
        row.style.animationDelay = `${index * 0.1}s`;

        row.innerHTML = `
            <td>
                <div
                    style="font-weight: 700; cursor: ${!canAllot && status === 'Pending' ? 'pointer; color: #ef4444; text-decoration: underline dotted;' : 'default;'}"
                    ${!canAllot && status === 'Pending' ? `onclick="showIncompleteModal('${displayName.replace(/'/g, "&apos;")}', ${!guestName.trim()}, ${!phone || phone === '-'})"` : ''}
                >
                    ${displayName}${isNew ? '<span class="new-guest-badge">NEW</span>' : ''}
                </div>
                <div style="font-size: 0.7rem; color: #64748b;">${registrationTime ? registrationTime.toLocaleString() : 'N/A'}</div>
            </td>
            <td><span style="font-weight: 800; color: #111827; font-size: 1.25rem;">${roomNum}</span></td>
            <td>
                <div style="font-weight: 600;">${displayPhone}</div>
                <div style="font-size: 0.7rem; color: #64748b;">${r["ID Number"] || r["Identity Number"] || 'NO ID'}</div>
            </td>
            <td><span class="status-tag ${statusClass}">${status}</span></td>
            <td>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    ${status === "Pending" && canAllot ? `
                        <button onclick="openAllotModal(${index})" class="btn-allot">Allot Room</button>
                        <button onclick="openCustomAllotModal(${index})" class="btn-custom-allot">Allot Custom</button>
                    ` : ''}
                    ${status === "Pending" && !canAllot ? `<span style="font-size:0.7rem; color:#ef4444; font-weight:700;">⚠ Incomplete</span>` : ''}
                    ${status === "Booked" ? `<button onclick="printCheckinReceipt(${index}, 'active')" class="btn-profile" title="Print Check-In Receipt"><i data-lucide="printer" style="width: 14px; height: 14px;"></i></button>` : ''}
                    ${status === "Booked" ? `<button onclick="confirmCheckout(${index})" class="btn-checkout">Check Out</button>` : ''}
                </div>
            </td>
        `;

        tableBody.appendChild(row);
        } catch (e) {
            const rowId = r._sheetRow || (index + 1);
            console.error(`Error processing spreadsheet row ${rowId}:`, e);
            errorRows.push({ index: rowId, timestamp: r["Timestamp"], error: e.message });
        }
    });

    // --- Update Warning Badge ---
    const badge = document.getElementById("warningBadge");
    const countEl = document.getElementById("warningCount");
    if (badge && countEl) {
        if (errorRows.length > 0) {
            badge.style.display = "flex";
            countEl.innerText = errorRows.length;
        } else {
            badge.style.display = "none";
        }
    }

    if (errorRows.length > 0 && !window._warningShownThisSession) {
        const firstErr = errorRows[0];
        showToast(`Data Error at Sheet Row ${firstErr.index} (${firstErr.timestamp}): ${firstErr.error}`, "error");
        window._warningShownThisSession = true;
    }
    lucide.createIcons();
}

function showWarningDetails() {
    const modal = document.getElementById("warningsModal");
    const list = document.getElementById("warningsList");
    if (!modal || !list) return;

    list.innerHTML = "";
    errorRows.forEach(err => {
        const item = document.createElement("div");
        item.style.padding = "12px";
        item.style.background = "#fff1f2";
        item.style.border = "1px solid #fecaca";
        item.style.borderRadius = "8px";
        item.innerHTML = `
            <div style="font-weight: 800; color: #991b1b; font-size: 0.85rem;">ROW ${err.index}</div>
            <div style="font-size: 0.8rem; color: #b91c1c; margin-top: 4px;">${err.error}</div>
            <div style="font-size: 0.7rem; color: #64748b; margin-top: 4px;">Timestamp: ${err.timestamp || 'N/A'}</div>
        `;
        list.appendChild(item);
    });

    modal.style.display = "flex";
    lucide.createIcons();
}

// --- CUSTOM MANUAL BILLING LOGIC ---
let activeCustomBillType = 'CHECK-IN';

function switchCustomBillType(type) {
    activeCustomBillType = type;
    const btnIn = document.getElementById("btnCustomIn");
    const btnOut = document.getElementById("btnCustomOut");
    const checkinFields = document.getElementById("checkinFields");
    const checkoutFields = document.getElementById("checkoutFields");
    const billNoLabel = document.getElementById("custBillNoLabel");
    const billNoInput = document.getElementById("custBillNo");

    if (type === 'CHECK-IN') {
        if (btnIn) btnIn.classList.add('active');
        if (btnOut) btnOut.classList.remove('active');
        if (checkinFields) checkinFields.style.display = 'grid';
        if (checkoutFields) checkoutFields.style.display = 'none';
        if (billNoLabel) billNoLabel.innerText = 'Deposit Receipt No. (e.g. DEP-101)';
        if (billNoInput) billNoInput.placeholder = 'e.g. DEP-101';
    } else {
        if (btnOut) btnOut.classList.add('active');
        if (btnIn) btnIn.classList.remove('active');
        if (checkinFields) checkinFields.style.display = 'none';
        if (checkoutFields) checkoutFields.style.display = 'block';
        if (billNoLabel) billNoLabel.innerText = 'Check-Out Bill No. (e.g. OUT-101)';
        if (billNoInput) billNoInput.placeholder = 'e.g. OUT-101';
    }
    lucide.createIcons();
}

function autoCalcTotal() {
    const rent = parseInt(document.getElementById("custRent")?.value || 0);
    const other = parseInt(document.getElementById("custOther")?.value || 0);
    const totalField = document.getElementById("custFinalTotal");
    if (totalField) totalField.value = rent + other;
}

function handleCustomBillSubmit(event) {
    event.preventDefault();

    const isCheckOut = activeCustomBillType === 'CHECK-OUT';

    // Scrape data from the manual form
    const data = {
        guestName: document.getElementById("custName").value,
        phone: document.getElementById("custPhone").value || "N/A",
        room: document.getElementById("custRoom").value,
        identity: document.getElementById("custId").value || "N/A",
        dateTime: getFormattedDateTime(),
        receiptNo: document.getElementById("custBillNo").value.trim(),

        // Check-In specific
        address: isCheckOut
            ? (document.getElementById("custAddressOut")?.value || "N/A")
            : (document.getElementById("custAddress")?.value || "N/A"),
        rate: document.getElementById("custRate")?.value || 0,
        days: document.getElementById("custDays")?.value || 1,

        // Check-Out specific
        regNo:    document.getElementById("custRegNo")?.value || "",
        kramank:  document.getElementById("custKramank")?.value || "",
        rent:     parseInt(document.getElementById("custRent")?.value || 0),
        otherAcc: parseInt(document.getElementById("custOther")?.value || 0),
        confirmedTotal: parseInt(document.getElementById("custFinalTotal")?.value || 0)
    };

    // Call the existing receipt generator
    generateReceipt(activeCustomBillType, data);

    showToast(`Manual ${activeCustomBillType} Bill Generated`, "success");

    // Custom print delay
    setTimeout(() => {
        window.print();
    }, 500);
}

// renderReports function removed for space optimization

function renderRoomMap() {
    const grid = document.getElementById("roomGrid");
    if (!grid) return;
    grid.innerHTML = "";

    const roomStatusMap = {};
    bookingData.forEach(r => {
        const roomVal = (r["Room Number"] || "").toString();
        const individualRooms = roomVal.split(',').map(s => s.trim()).filter(s => s !== "" && s !== "Pending");
        individualRooms.forEach(roomNum => {
            roomStatusMap[roomNum] = r;
        });
    });
    
    // History data is no longer shown on map as 'Cleaning'

    const categoriesToRender = { ...ROOM_CATEGORIES, "Other": [] };

    // Distribute all rooms from ROOM_CATEGORIES
    // And also any rooms that are currently in bookingData but NOT in categories
    const processedRooms = new Set();
    Object.values(ROOM_CATEGORIES).flat().forEach(r => processedRooms.add(r));

    bookingData.forEach(r => {
        const roomVal = (r["Room Number"] || "").toString();
        const individualRooms = roomVal.split(',').map(s => s.trim()).filter(s => s !== "" && s !== "Pending");
        
        individualRooms.forEach(num => {
            if (!processedRooms.has(num)) {
                if (categoriesToRender["Other"]) {
                    categoriesToRender["Other"].push(num);
                }
                processedRooms.add(num);
            }
        });
    });

    historyData.forEach(r => {
        if (getApplicationStatus(r) === "Under Cleaning") {
            const num = (r["Room Number"] || "").toString().trim();
            if (num && num !== "Pending" && !processedRooms.has(num)) {
                categoriesToRender["Other"].push(num);
                processedRooms.add(num);
            }
        }
    });

    // Also include rooms 1-70 as a fallback if they are missing?
    // User seems to have specific numbers now, so maybe we only show what's defined + active.
    // Let's stick to showing defined categories + active others.

    // Render each category
    for (const [catName, roomList] of Object.entries(categoriesToRender)) {
        // Show empty categories if they are part of the 6 main ones
        const isMainCategory = ROOM_CATEGORIES.hasOwnProperty(catName);
        if (roomList.length === 0 && !isMainCategory) continue;

        const section = document.createElement("div");
        section.className = "category-section";

        const title = document.createElement("div");
        title.className = "category-title";
        title.innerHTML = `<span>${catName} (${roomList.length})</span>`;
        section.appendChild(title);

        const subgrid = document.createElement("div");
        subgrid.className = "category-grid";

        roomList.forEach(roomNumStr => {
            const roomBox = document.createElement("div");
            const guestData = roomStatusMap[roomNumStr];

            let status = "Available";
            if (guestData) {
                status = getApplicationStatus(guestData);
            }

            roomBox.className = `room-unit ${status.toLowerCase().replace(' ', '-')}`;

            if (status === "Booked") {
                roomBox.innerHTML = `
                    <i data-lucide="user" width="24" height="24"></i>
                    <h4>ROOM ${roomNumStr}</h4>
                    <p style="font-size: 0.6rem; opacity: 0.8;">BOOKED</p>
                `;
            } else if (status === "Under Cleaning") {
                roomBox.innerHTML = `
                    <i data-lucide="brush" width="24" height="24"></i>
                    <h4>ROOM ${roomNumStr}</h4>
                    <p style="font-size: 0.6rem; opacity: 0.8;">CLEANING</p>
                `;
            } else {
                roomBox.innerHTML = `
                    <i data-lucide="check" width="24" height="24" style="opacity: 0.3;"></i>
                    <h4>ROOM ${roomNumStr}</h4>
                    <p>Available</p>
                `;
            }
            subgrid.appendChild(roomBox);
        });

        section.appendChild(subgrid);
        grid.appendChild(section);
    }

    lucide.createIcons();

    // Reapply active filter
    filterRoomMap(currentRoomMapFilter);
}

function filterRoomMap(type) {
    currentRoomMapFilter = type;

    // Update active button state
    document.querySelectorAll('[id^="rf-"]').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('rf-' + type);
    if (activeBtn) activeBtn.classList.add('active');

    // Filter room units based on class
    document.querySelectorAll('.room-unit').forEach(unit => {
        if (type === 'all') {
            unit.style.display = 'flex';
        } else if (type === 'available') {
            unit.style.display = unit.classList.contains('available') ? 'flex' : 'none';
        } else if (type === 'booked') {
            unit.style.display = unit.classList.contains('booked') ? 'flex' : 'none';
        }
    });

    // Hide categories that have no visible rooms
    document.querySelectorAll('.category-section').forEach(section => {
        let hasVisible = false;
        section.querySelectorAll('.room-unit').forEach(u => {
            if (u.style.display !== 'none') hasVisible = true;
        });
        section.style.display = hasVisible ? 'block' : 'none';
    });
}

function showDetailsDirect(item) {
    const box = document.getElementById("modalDetails");
    box.innerHTML = "";
    const list = [
        ["NAME", item["Guest Name"] || item["Head of Family Name"] || "N/A"],
        ["MOBILE", item["Contact Number"] || item["Mobile Number"] || "N/A"],
        ["EMAIL", item["Email Address"] || item["Email ID"] || item["Contact Email Address"] || "N/A"],
        ["UNIT #", item["Room Number"] || "N/A"],
        ["CITY", item["Residence City / Town"] || "N/A"],
        ["CHECK-IN", item["Timestamp"] ? new Date(item["Timestamp"]).toLocaleString() : "N/A"],
        ["IDENTITY", item["ID Number"] || "N/A"]
    ];
    list.forEach(([lab, val]) => {
        const div = document.createElement("div");
        div.innerHTML = `<p style="font-size:0.7rem; color: #94a3b8; font-weight:800; text-transform: uppercase;">${lab}</p><p style="font-weight:700; color: white;">${val}</p>`;
        box.appendChild(div);
    });
    document.getElementById("detailsModal").style.display = "flex";
}

function switchTab(tabId) {
    const sections = {
        'bookings': 'bookingsSection',
        'roomMap': 'roomMapSection',
        'billing': 'billingSection',
        'customBill': 'customBillSection'
    };

    // Hide all
    Object.values(sections).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Remove active classes
    document.querySelectorAll('.nav-link, .tab-btn').forEach(el => el.classList.remove('active'));

    // Show selected
    const targetId = sections[tabId];
    if (targetId) {
        document.getElementById(targetId).style.display = 'block';

        // Active Sidebar Link
        const navId = 'nav' + tabId.charAt(0).toUpperCase() + tabId.slice(1);
        const navEl = document.getElementById(navId);
        if (navEl) navEl.classList.add('active');

        // Active Tab Button (Top)
        const tabBtnId = 'tabBtn' + tabId.charAt(0).toUpperCase() + tabId.slice(1);
        const tabEl = document.getElementById(tabBtnId);
        if (tabEl) tabEl.classList.add('active');
    }

    showToast(`Viewing ${tabId.toUpperCase()}`, "success");
}

function setupNavigation() {
    const navMap = {
        'navBookings': 'bookings',
        'navRoomMap': 'roomMap',
        'navBilling': 'billing',
        'tabBtnBookings': 'bookings',
        'tabBtnRoomMap': 'roomMap',
        'navCustomBill': 'customBill'
    };
    Object.keys(navMap).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onclick = () => switchTab(navMap[id]);
    });
}

function setupStatCardClicks() {
    document.getElementById('statCardTotal').onclick = () => switchTab('bookings');
    document.getElementById('statCardBooked').onclick = () => switchTab('bookings');
    document.getElementById('statCardAvailable').onclick = () => switchTab('roomMap');
}

function setupSearch() {
    document.getElementById('billingSearchInput')?.addEventListener('input', () => {
        renderBilling();
    });
}

function openCheckinModal(preSelectCat = "", preSelectRoom = "") {
    document.getElementById("checkinModal").style.display = 'flex';
    populateCategories();

    if (preSelectCat) {
        document.getElementById("categorySelect").value = preSelectCat;
        updateRoomList(preSelectCat, preSelectRoom);
        if (document.getElementById("roomRate")) {
            document.getElementById("roomRate").value = ROOM_RATES[preSelectCat] || 0;
        }
    } else {
        // Default to first category
        const firstCat = Object.keys(ROOM_CATEGORIES)[0];
        document.getElementById("categorySelect").value = firstCat;
        updateRoomList(firstCat);
        if (document.getElementById("roomRate")) {
            document.getElementById("roomRate").value = ROOM_RATES[firstCat] || 0;
        }
    }
    updateAllotmentCharges();
}
function closeCheckinModal() { document.getElementById("checkinModal").style.display = 'none'; }
function closeDetailsModal() { document.getElementById("detailsModal").style.display = 'none'; }

function openVerificationModal(type, data) {
    const modal = document.getElementById("formModal");
    const container = document.getElementById("verificationFormContainer");
    const titleEl = document.getElementById("formModalTitle");
    const submitBtn = document.getElementById("formModalSubmitBtn");

    if (!modal || !container) return;

    // Reset Submit Button
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i data-lucide="check-circle" style="width: 18px; height: 18px; color: #10b981;"></i> <span>CONFIRM & SYNC TO SHEET</span>`;

    // Set Title
    titleEl.innerText = type === 'CHECK-IN' ? "Verify Guest Allotment" : "Verify Checkout Record";

    // Store current task globally for submission
    window.currentVerificationTask = { type, data };

    // Render Form HTML
    container.innerHTML = renderVerificationHTML(type, data);

    // Setup Live Listeners for Checkout Calculations
    if (type === 'CHECK-OUT') {
        const rate = parseInt(data.rate || 0);
        const days = data.stayDays || 0;
        const baseTotal = rate * days;
        
        ['verifyRent', 'verifyOther'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    const rent = parseInt(document.getElementById('verifyRent').value || 0);
                    const other = parseInt(document.getElementById('verifyOther').value || 0);
                    document.getElementById('verifyFinalTotal').value = rent + other;
                });
            }
        });
    }

    modal.style.display = 'flex';
    lucide.createIcons();
}


function renderVerificationHTML(type, data) {
    const timestamp = new Date().toLocaleString();
    if (type === 'CHECK-IN') {
        return `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="form-group">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; margin-bottom: 8px;">RECEIPT NO</label>
                    <input type="text" id="verifyReceipt" value="${data.receiptNo}" style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-weight: 800; color: #1e293b;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; margin-bottom: 8px;">DATE / TIME</label>
                    <input type="text" id="verifyDateTime" value="${timestamp}" readonly style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; color: #64748b;">
                </div>
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; margin-bottom: 8px;">PARTY NAME (GUEST)</label>
                    <input type="text" id="verifyName" value="${data.guestName}" style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-weight: 700;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; margin-bottom: 8px;">ROOM NO</label>
                    <input type="text" id="verifyRoom" value="${data.room}" readonly style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f1f5f9; font-weight: 800;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; margin-bottom: 8px;">CITY</label>
                    <input type="text" id="verifyCity" value="${data.address || ''}" placeholder="Enter Guest City" style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px;">
                </div>
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; margin-bottom: 8px;">DEPOSIT AMOUNT (MANUAL ENTRY)</label>
                    <input type="number" id="verifyDeposit" value="${data.advance || data.rate || ''}" placeholder="Enter Amount Collected Manually" required style="width: 100%; padding: 15px; border: 2px solid #6366f1; border-radius: 8px; font-size: 1.5rem; font-weight: 900; color: #4f46e5; background: #f5f3ff;">
                </div>
                <div class="form-group" style="grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; padding: 10px; background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 8px;">
                    <input type="checkbox" id="verifyAdminSign" style="width: 20px; height: 20px; cursor: pointer;">
                    <label for="verifyAdminSign" style="font-size: 0.85rem; font-weight: 700; color: #166534; cursor: pointer;">I, Admin, confirm all details are correct for synchronization.</label>
                </div>
            </div>
            <div style="margin-top: 15px; font-size: 0.75rem; color: #64748b; text-align: center;">
                <em>Sync to Google Sheet will occur upon confirmation, followed by auto-print.</em>
            </div>
        `;
    } else {
        return `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="form-group">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; margin-bottom: 8px;">REGISTER NO (रजि. सं.) — CHECK OUT NO</label>
                    <input type="text" id="verifyRegNo" value="${data.receiptNo || data.kramank || ''}" placeholder="e.g. OUT-101" style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-weight: 800; color: #4338ca;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; margin-bottom: 8px;">DEPOSIT NO (डिपोजिट र. सं.) — CHECK IN NO</label>
                    <input type="text" id="verifyDepositNo" value="${data.originalReceiptNo || data["Check In Bill No"] || ''}" placeholder="e.g. IN-101" style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-weight: 800; color: #dc2626;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; margin-bottom: 8px;">ROOM NO</label>
                    <input type="text" value="${data.room}" readonly style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f1f5f9; font-weight: 800;">
                </div>
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; margin-bottom: 8px;">PARTY NAME (श्रीमान्)</label>
                    <input type="text" id="verifyName" value="${data.guestName}" readonly style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f1f5f9; font-weight: 700;">
                </div>
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; margin-bottom: 8px;">ADDRESS / CITY (निवासी)</label>
                    <input type="text" id="verifyCity" value="${data.address || ''}" readonly style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f1f5f9; font-weight: 600;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; margin-bottom: 8px;">ROOM RENT (साधारण खाता) ₹</label>
                    <input type="number" id="verifyRent" value="${parseInt(data.roomRate || 0) * (parseInt(data.stayDays || 0) || 1)}" style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-weight: 700; color: #4f46e5;">
                </div>

                <div class="form-group" style="grid-column: 1 / -1;">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; margin-bottom: 8px;">OTHER CHARGES (अन्य) ₹</label>
                    <input type="number" id="verifyOther" value="0" style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-weight: 700; color: #ef4444;">
                </div>

                <div class="form-group" style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 10px; padding: 10px; background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 8px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="checkbox" id="verifyAdminSign" style="width: 18px; height: 18px; cursor: pointer;">
                        <label for="verifyAdminSign" style="font-size: 0.8rem; font-weight: 700; color: #166534; cursor: pointer;">I, Admin, confirm all checkout data is valid.</label>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="checkbox" id="verifyGuestSign" style="width: 18px; height: 18px; cursor: pointer;">
                        <label for="verifyGuestSign" style="font-size: 0.8rem; font-weight: 700; color: #166534; cursor: pointer;">Guest has signed the physical/digital record.</label>
                    </div>
                </div>
            </div>
            <div style="margin-top: 25px; padding: 20px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; text-align: center;">
                <p style="font-size: 0.75rem; color: #64748b; font-weight: 800; text-transform: uppercase; margin-bottom: 8px;">Final Settlement Amount (₹)</p>
                <input type="number" id="verifyFinalTotal" value="${parseInt(data.roomRate || 0) * (parseInt(data.stayDays || 0) || 1)}" 
                    style="width: 100%; text-align: center; border: none; background: transparent; font-size: 2.2rem; font-weight: 800; color: #1e293b; outline: none; -moz-appearance: textfield; appearance: textfield;">
                <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 700; margin-top: 5px;">(Click above amount to manually override if needed)</div>
            </div>
        `;
    }
}



async function submitVerificationToSheet() {
    const task = window.currentVerificationTask;
    if (!task) return;

    // Check Signatures
    const adminSign = document.getElementById("verifyAdminSign");
    const guestSign = document.getElementById("verifyGuestSign");
    
    if (adminSign && !adminSign.checked) {
        showToast("Please check the Admin Confirmation box.", "error");
        return;
    }
    if (guestSign && !guestSign.checked) {
        showToast("Please confirm Guest Signature has been obtained.", "error");
        return;
    }

    const rawLookupId = task.data.rawId || task.data.originalReceiptNo || "";


    const btn = document.getElementById("formModalSubmitBtn");
    btn.disabled = true;
    btn.innerHTML = `<i class="spinning" data-lucide="rotate-ccw"></i> SYNCING...`;
    lucide.createIcons();

    try {
        let payload = {};
        if (task.type === 'CHECK-IN') {
            const deposit = document.getElementById("verifyDeposit").value;
            if (!deposit || deposit <= 0) {
                showToast("Please enter a valid Deposit Amount.", "error");
                btn.disabled = false;
                btn.innerText = "CONFIRM & SYNC TO SHEET";
                return;
            }

            payload = {
                action: "checkin",
                name: document.getElementById("verifyName").value,
                phone: task.data.phone,
                idNumber: task.data.identity || "",
                room: document.getElementById("verifyRoom").value,
                advance: deposit, // Using manual entry
                rate: task.data.rate,
                days: task.data.days || 1,
                receiptNo: document.getElementById("verifyReceipt").value,
                "Check In Bill No": document.getElementById("verifyReceipt").value,
                timestamp: task.data.timestamp || "",
                email: task.data.email || "",  // fallback identifier
                city: document.getElementById("verifyCity").value
            };

            // 🔍 DEBUG: Log full payload to browser console
            console.log("%c[SYNC] CHECK-IN Payload being sent to Google Sheets:", "color:#6366f1; font-weight:bold;", payload);
            if (!payload.timestamp && !payload.email) {
                console.warn("[SYNC WARNING] Both timestamp and email are empty — GAS may not find the row!");
                showToast("Warning: No row identifier found. Sheet update may fail.", "error");
            }

            // PREPARE PRINT DATA
            generateReceipt('CHECK-IN', {
                ...task.data,
                receiptNo: payload.receiptNo,
                guestName: payload.name,
                address: payload.city,
                advance: payload.advance,
                days: payload.days,
                dateTime: getFormattedDateTime()
            });
        } else {
            const finalTotal = document.getElementById("verifyFinalTotal").value;
            payload = {
                action: "checkout",
                // SEARCH/LOOKUP FIELDS (To find the right row)
                "Check-In Rashid No": rawLookupId,
                receiptNo: rawLookupId,
                id: rawLookupId,
                rowId: rawLookupId,
                originalReceiptNo: rawLookupId,
                "Check In Bill No": rawLookupId,
                "timestamp": task.data.timestamp,
                
                // DATA FOR W, AC, AD (The same OUT Number for all)
                "Check-Out Rashid N": document.getElementById("verifyRegNo").value,
                "Check-Out Rashid No": document.getElementById("verifyRegNo").value,
                "Check Out Rashid N": document.getElementById("verifyRegNo").value,
                "Check Out Rashid No": document.getElementById("verifyRegNo").value,
                "Check Out": document.getElementById("verifyRegNo").value,
                "checkout": document.getElementById("verifyRegNo").value,
                "checkoutNo": document.getElementById("verifyRegNo").value,
                "depositNo": document.getElementById("verifyRegNo").value,
                "billNo": document.getElementById("verifyRegNo").value,
                "outNo": document.getElementById("verifyRegNo").value,
                "regNo": document.getElementById("verifyRegNo").value,
                "Check Out Rashid N ": document.getElementById("verifyRegNo").value, // Trial with trailing space
                "W": document.getElementById("verifyRegNo").value,
                "AC": document.getElementById("verifyRegNo").value,
                "AD": document.getElementById("verifyRegNo").value,
                
                // REST OF THE DATA
                "Guest Name": task.data.guestName,
                "Phone": task.data.phone,
                "Room Number": task.data.room,
                "Room Status": "Available",
                "Normal Account": document.getElementById("verifyRent").value,
                "NormalAccount": document.getElementById("verifyRent").value,
                rent: document.getElementById("verifyRent").value,
                "Others": document.getElementById("verifyOther").value,
                "Other Charges": document.getElementById("verifyOther").value,
                "otherAcc": document.getElementById("verifyOther").value,
                "Total Amount Deposited": finalTotal,
                totalCollected: finalTotal,
                "Checkout Timestamp": new Date().toISOString(),
                "Checkout Date": new Date().toLocaleDateString('en-GB') // DD/MM/YYYY
            };
            
            // PREPARE PRINT DATA
            generateReceipt('CHECK-OUT', {
                ...task.data,
                receiptNo: document.getElementById("verifyRegNo").value, // This is the OUT number
                originalReceiptNo: document.getElementById("verifyDepositNo").value, // This is the IN number
                rent: parseInt(document.getElementById("verifyRent").value || 0),
                donation: payload.donation || "0",
                otherAcc: payload.otherAcc || "0",
                confirmedTotal: finalTotal,
                dateTime: getFormattedDateTime()
            });
        }




        // Post to Google Apps Script
        await fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: new URLSearchParams(payload)
        });

        showToast("Successfully Synced with Google Sheets", "success");

        // Close modal
        document.getElementById("formModal").style.display = 'none';

        // Clear pending print task BEFORE printing to prevent double-print in loadData()
        pendingPrintTask = null;
        window.currentVerificationTask = null;

        // Print once, then refresh data
        setTimeout(() => {
            window.print();
            loadData();
        }, 800);

    } catch (err) {
        console.error(err);
        showToast("Sync Failed. Check internet connection.", "error");
        btn.disabled = false;
        btn.innerText = "CONFIRM & SYNC TO SHEET";
    }
}

function closeFormModal() {
    const modal = document.getElementById("formModal");
    if (modal) modal.style.display = 'none';
    window.currentVerificationTask = null;
    loadData();
}

function openCheckinModal() {
    const modal = document.getElementById("checkinModal");
    if (modal) modal.style.display = "flex";
    populateCategories();
}

function closeCheckinModal() {
    const modal = document.getElementById("checkinModal");
    if (modal) modal.style.display = "none";
}

function openAllotModal(index) {
    const item = filteredData[index];
    if (!item) return;

    // Reset state
    customMode = false;
    selectedRooms = [];

    const roomSelect = document.getElementById("roomSelect");
    const roomGridContainer = document.getElementById("roomGridContainer");
    const selectionToolbar = document.getElementById("selectionToolbar");

    if (roomSelect) {
        roomSelect.style.display = "block";
        roomSelect.required = true;
        roomSelect.multiple = false;
        roomSelect.style.height = "";
    }
    if (roomGridContainer) roomGridContainer.style.display = "none";
    if (selectionToolbar) selectionToolbar.style.display = "none";

    currentAllotTimestamp = item["Timestamp"] || "";
    currentAllotEmail     = item["Contact Email Address"] || item["Email"] || item["email"] || "";
    openCheckinModal();

    // Use setTimeout to ensure the modal is visible before setting values (optional but safer)
    setTimeout(() => {
        const nameEl = document.getElementById("guestName");
        const phoneEl = document.getElementById("guestPhone");
        const idEl = document.getElementById("guestId");

        if (nameEl) nameEl.value = item["Guest Name"] || item["Head of Family Name"] || "N/A";
        if (phoneEl) phoneEl.value = item["Contact Number"] || item["Mobile Number"] || "N/A";
        if (idEl) idEl.value = item["ID Number"] || "NO ID";
        
        // Store address/city for verification form
        window.currentAllotCity = item["City"] || item["Residence City / Town"] || item["Residence City/Town"] || "";

        // Reset payment fields for a fresh allotment

        if (document.getElementById("advancePaid")) document.getElementById("advancePaid").value = "";
        if (document.getElementById("roomRate")) document.getElementById("roomRate").value = "";
        if (document.getElementById("expectedDays")) document.getElementById("expectedDays").value = "1";
    }, 50);
}

function populateCategories() {
    const catSel = document.getElementById("categorySelect");
    catSel.innerHTML = "";
    Object.keys(ROOM_CATEGORIES).forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        catSel.appendChild(opt);
    });

    // Handle change
    catSel.onchange = () => updateRoomList(catSel.value);
    
    // Initial call for first category
    if (catSel.value) {
        updateRoomList(catSel.value);
    }
}

function updateRoomList(category, preSelectRoom = "") {
    const roomSel = document.getElementById("roomSelect");
    const gridEl = document.getElementById("allotRoomGrid");
    
    if (!roomSel || !gridEl) return;

    roomSel.innerHTML = '<option value="">Select Room</option>';
    gridEl.innerHTML = "";

    // Robust occupancy check - handles single rooms & multi-room strings (e.g. "101, 102")
    const occupiedSet = new Set();
    (bookingData || []).forEach(r => {
        const val = r["Room Number"] || r["Room No"] || r["roomNumber"] || "";
        const parts = val.toString().split(',').map(p => p.trim()).filter(p => p);
        parts.forEach(p => occupiedSet.add(p));
    });

    const roomList = ROOM_CATEGORIES[category] || [];
    console.log(`[DEBUG] Rendering Map for ${category}. Total rooms: ${roomList.length}. Global Occupied: ${occupiedSet.size}`);

    roomList.forEach(num => {
        const sNum = num.toString().trim();
        const isOccupied = occupiedSet.has(sNum);
        
        // --- Add to single-select dropdown (only if not occupied) ---
        if (!isOccupied) {
            const opt = document.createElement("option");
            opt.value = sNum;
            opt.textContent = `Room ${sNum}`;
            roomSel.appendChild(opt);
        }

        // --- Add to Multi-Select Grid (Visual Map) ---
        const chip = document.createElement("div");
        chip.className = `room-chip ${isOccupied ? 'occupied' : 'available'}`;
        chip.id = `chip-${sNum}`;
        chip.textContent = sNum;
        
        // Selection State
        if (selectedRooms.includes(sNum)) {
            chip.classList.add('selected');
        }

        // Action
        if (!isOccupied) {
            chip.onclick = () => toggleRoomChip(sNum, chip);
            chip.title = "Available";
        } else {
            chip.title = "Currently Occupied";
        }
        
        gridEl.appendChild(chip);
    });

    if (preSelectRoom) roomSel.value = preSelectRoom;
}

function toggleRoomChip(num, el) {
    if (selectedRooms.includes(num)) {
        selectedRooms = selectedRooms.filter(r => r !== num);
        el.classList.remove('selected');
    } else {
        selectedRooms.push(num);
        el.classList.add('selected');
    }
}

function selectAllRooms() {
    // Robust occupancy check - same as updateRoomList
    const occupiedSet = new Set();
    (bookingData || []).forEach(r => {
        const val = r["Room Number"] || r["Room No"] || r["roomNumber"] || "";
        const parts = val.toString().split(',').map(p => p.trim()).filter(p => p);
        parts.forEach(p => occupiedSet.add(p));
    });

    // Select ALL available rooms in EVERY category
    const allAvailable = [];
    Object.values(ROOM_CATEGORIES).flat().forEach(num => {
        const sNum = num.toString().trim();
        if (!occupiedSet.has(sNum)) {
            allAvailable.push(sNum);
        }
    });

    selectedRooms = allAvailable;
    
    // Sync UI for current view
    document.querySelectorAll('#allotRoomGrid .room-chip.available').forEach(chip => {
        chip.classList.add('selected');
    });

    showToast(`Selected all ${selectedRooms.length} available rooms across all categories`, "success");
}

function clearRoomSelection() {
    selectedRooms = [];
    document.querySelectorAll('#allotRoomGrid .room-chip.selected').forEach(chip => {
        chip.classList.remove('selected');
    });
}

function selectCountRooms() {
    const input = document.getElementById("numToSelect");
    const count = parseInt(input ? input.value : 0) || 0;
    
    clearRoomSelection(); // Start fresh or keep? Let's start fresh for clarity
    
    const chips = document.querySelectorAll('#allotRoomGrid .room-chip');
    for (let i = 0; i < Math.min(count, chips.length); i++) {
        const chip = chips[i];
        const num = chip.textContent.trim();
        selectedRooms.push(num);
        chip.classList.add('selected');
    }
    
    if (count > chips.length && chips.length > 0) {
        showToast(`Only ${chips.length} rooms available`, "info");
    }
}

document.getElementById("checkinForm").onsubmit = async (e) => {
    e.preventDefault();

    const guestName = document.getElementById("guestName").value;
    const phone = document.getElementById("guestPhone").value;
    
    const roomGridContainer = document.getElementById("roomGridContainer");
    let room = "";

    if (customMode) {
        room = selectedRooms.join(", ");
    } else {
        room = document.getElementById("roomSelect").value;
    }

    if (!room) {
        showToast("Please select room number(s).", "error");
        return;
    }

    const rate = document.getElementById("roomRate").value || 0;
    const days = document.getElementById("expectedDays").value || 1;
    const receiptNo = "IN-" + getNextReceiptNumber();

    const advance = document.getElementById("roomRate")?.value || 0;
    
    const receiptData = {
        receiptNo,
        guestName,
        phone,
        room,
        identity: document.getElementById("guestId").value,
        advance: advance,
        rate,
        days,
        address: window.currentAllotCity || "",
        dateTime: getFormattedDateTime(),
        timestamp: currentAllotTimestamp,
        email: currentAllotEmail
    };

    try {
        showToast("Opening Deposit Form. Invoice will print after submission.", "success");
        pendingPrintTask = {
            type: 'CHECK-IN',
            timestamp: currentAllotTimestamp,
            receiptNo: receiptNo,
            days: days
        };
        openVerificationModal('CHECK-IN', receiptData);
        closeCheckinModal();
        currentAllotTimestamp = "";
    } catch (err) {
        console.error(err);
        showToast("Error processing allotment.", "error");
    }
};

// --- NEW CUSTOM ALLOT HANDLER ---

function openCustomAllotModal(index) {
    const item = filteredData[index];
    if (!item) return;

    customMode = true;
    selectedRooms = [];
    currentAllotTimestamp = item["Timestamp"] || "";
    currentAllotEmail     = item["Contact Email Address"] || item["Email"] || "";
    
    // Toggle UI for Multi-Room
    const roomSelect = document.getElementById("roomSelect");
    const roomGridContainer = document.getElementById("roomGridContainer");
    const selectionToolbar = document.getElementById("selectionToolbar");

    if (roomSelect) roomSelect.style.display = "none";
    if (roomSelect) roomSelect.required = false; 
    if (roomGridContainer) roomGridContainer.style.display = "block";
    if (selectionToolbar) selectionToolbar.style.display = "flex";

    openCheckinModal();

    // Force category refresh to populate grid
    setTimeout(() => {
        const catSel = document.getElementById("categorySelect");
        if (catSel && catSel.value) {
            updateRoomList(catSel.value);
        }
        
        document.getElementById("guestName").value = item["Guest Name"] || item["Head of Family Name"] || "N/A";
        document.getElementById("guestPhone").value = item["Contact Number"] || item["Mobile Number"] || "N/A";
        document.getElementById("guestId").value = item["ID Number"] || "NO ID";
        window.currentAllotCity = item["City"] || item["Residence City / Town"] || "";
    }, 100);
}

// --- NUMBER TO HINDI WORDS CONVERTER ---
function numberToHindiWords(num) {
    if (num == 0) return 'शून्य';
    const ones = ['', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पन्द्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस'];
    const tens = ['', '', 'बीस', 'तीस', 'चालीस', 'पचास', 'साठ', 'सत्तर', 'अस्सी', 'नब्बे'];
    
    function helper(n) {
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 > 0 ? ' ' + ones[n % 10] : '');
        if (n < 1000) return helper(Math.floor(n / 100)) + ' सौ' + (n % 100 > 0 ? ' ' + helper(n % 100) : '');
        if (n < 100000) return helper(Math.floor(n / 1000)) + ' हजार' + (n % 1000 > 0 ? ' ' + helper(n % 1000) : '');
        if (n < 10000000) return helper(Math.floor(n / 100000)) + ' लाख' + (n % 100000 > 0 ? ' ' + helper(n % 100000) : '');
        return n.toString();
    }
    return helper(num);
}

function generateReceipt(type, data) {
    const lTemplate = document.getElementById("rasidLandscape");
    const pTemplate = document.getElementById("rasidPortrait");

    // Reset visibility
    lTemplate.style.display = "none";
    pTemplate.style.display = "none";

    // Robust value fetcher that skips "Same as above" and empty strings
    const getValFrom = (dataSource, keys, fallback = "-") => {
        for (let k of keys) {
            let val = dataSource[k];
            if (val && val.toString().trim() !== "" && !val.toString().toLowerCase().includes("same as above")) {
                return val.toString().trim();
            }
        }
        return fallback;
    };

    const setVal = (cls, val) => {
        document.querySelectorAll("." + cls).forEach(el => el.innerText = val);
    };

    if (type === 'CHECK-IN') {
        lTemplate.style.display = "block";

        setVal("printReceiptNoL", data.receiptNo || "N/A");
        
        let displayDate = "-";
        if (typeof data.dateTime === 'object') {
            displayDate = data.dateTime.date;
        } else {
            const parts = (data.dateTime || "").split(' ');
            displayDate = parts[0] || "-";
        }
        setVal("printDateL", displayDate);

        setVal("printGuestNameL", data.guestName);
        setVal("printMobileL",    data.phone || "-");
        
        // Robust address for Check-In
        const address = getValFrom(data, ["address", "City", "Residence City / Town", "Residence City/Town"]);
        setVal("printAddressL", address);
        
        setVal("printRoomNoL",    getValFrom(data, ["room", "Room Number", "Room", "Unit #"]));

        const rate     = parseInt(data.rate || 0);
        const days     = parseInt(data.days || 1);
        const advance  = parseInt(data.advance || 0);
        const totalAmt = advance > 0 ? advance : (rate * days);

        setVal("printAmountWordsL", numberToHindiWords(totalAmt) + " मात्र");
        setVal("printTotalAmountL", totalAmt);

    } else {
        pTemplate.style.display = "block";

        let displayDate = "-";
        if (typeof data.dateTime === 'object') {
            displayDate = data.dateTime.date;
        } else {
            const parts = (data.dateTime || "").split(' ');
            displayDate = parts[0] || "-";
        }
        setVal("printDateP", displayDate);

        setVal("printGuestNameP", data.guestName);
        setVal("printMobileP", data.phone || "-");
        
        // Robust address for Check-Out - Skips "Same as above"
        const address = getValFrom(data, ["address", "City", "Residence City / Town", "Residence City/Town", "Identity"]);
        setVal("printAddressP", address);

        setVal("printReceiptNoP", data.receiptNo || "-");
        setVal("printDepositNoP", data.originalReceiptNo || "-");

        const rent = parseInt(data.rent || 0);
        const other = parseInt(data.otherAcc || 0);
        const grandTotal = data.confirmedTotal || (rent + other);

        setVal("printRentP", rent || "");
        setVal("printOtherP", other || "");
        setVal("printExtraP", data.extra || "");
        
        // Robust Room No
        setVal("printRoomNoP", getValFrom(data, ["room", "Room Number", "Room", "Unit #"], "-"));
        
        setVal("printTotalAmountP", grandTotal);
        setVal("printAmountWordsP", numberToHindiWords(parseInt(grandTotal)) + " मात्र");
    }
}

async function confirmCheckout(index) {
    const item = filteredData[index];
    const name = item["Guest Name"] || item["Head of Family Name"];
    const phone = item["Contact Number"] || item["Mobile Number"];
    const timestamp = item["Timestamp"] || "";
    const advance = item["Total Amount Deposited"] || 0;
    const rate = item["Room Rate"] || 0;

    if (confirm(`Confirm CHECK-OUT for ${name} (Room ${item["Room Number"]})?`)) {
        const donation = "0";
        const otherAcc = "0";

        // Calculate stay days
        const checkinDate = new Date(timestamp);
        const diffTime = Math.abs(new Date() - checkinDate);
        const stayDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

        // Generate Check-Out Receipt No
        let checkoutReceiptNo = item["Check Out Bill No"] || item["Check In Bill No"] || item["Receipt No"] || "";
        const originalReceiptNo = item["Check In Bill No"] || item["Receipt No"] || "";
        if (checkoutReceiptNo.startsWith("IN-")) {
            checkoutReceiptNo = checkoutReceiptNo.replace("IN-", "OUT-");
        } else {
            checkoutReceiptNo = "OUT-" + Date.now().toString().slice(-6);
        }

        const receiptData = {
            rawId: originalReceiptNo,
            timestamp: timestamp,
            originalReceiptNo: originalReceiptNo,
            "Check In Bill No": originalReceiptNo,
            receiptNo: checkoutReceiptNo,
            dateTime: getFormattedDateTime(),
            guestName: name,
            room: item["Room Number"],
            phone: phone,
            idNumber: item["ID Number"] || item["ID Details"] || "",
            address: item["City"] || item["Residence City / Town"] || item["Residence City/Town"] || "N/A",
            roomRate: rate,
            stayDays: stayDays,
            donation: donation,
            otherAcc: otherAcc
        };

        // Store Print Task
        pendingPrintTask = {
            type: 'CHECK-OUT',
            timestamp: timestamp,
            donation: donation,
            otherAcc: otherAcc,
            stayDays: stayDays
        };

        // Always pass startCleaning as false
        openVerificationModal('CHECK-OUT', { ...receiptData, startCleaning: false });
    }
}


async function confirmCleaningDone(roomNum) {
    if (confirm(`Finish Cleaning Room ${roomNum}?`)) {
        showToast(`Cleaning Finished: Room ${roomNum}`, "success");
        await fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: new URLSearchParams({ action: "cleaning_done", room: roomNum })
        });
        setTimeout(loadData, 1500);
    }
}

function showIncompleteModal(name, missingName, missingPhone) {
    const missing = [];
    if (missingName) missing.push('Full Name');
    if (missingPhone) missing.push('Phone Number');
    const missingList = missing.map(m => `<li style="margin: 6px 0;">❌ ${m}</li>`).join('');

    const box = document.getElementById("modalDetails");
    box.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center;">
            <div style="font-size: 2.5rem; margin-bottom: 12px;">📋</div>
            <h3 style="font-size: 1.1rem; font-weight: 800; color: #111827; margin-bottom: 8px;">Incomplete Registration</h3>
            <p style="color: #6b7280; font-size: 0.85rem; margin-bottom: 16px;">
                The following required details are missing for <strong>${name}</strong>:
            </p>
            <ul style="list-style:none; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:14px 20px; text-align:left; margin-bottom:16px; font-weight:700; color:#dc2626;">
                ${missingList}
            </ul>
            <p style="color: #6b7280; font-size: 0.82rem; line-height: 1.6;">
                Please ask the guest to <strong>re-submit the registration form</strong> with all required details.
                A room will be allotted once their Name and Phone Number are on record.
            </p>
        </div>
    `;
    document.getElementById("detailsModal").style.display = "flex";
}

function showDetails(index, type) {
    const item = type === 'active' ? filteredData[index] : historyData[index];
    const box = document.getElementById("modalDetails");
    box.innerHTML = "";
    const list = [
        ["NAME", item["Guest Name"] || item["Head of Family Name"] || "N/A"],
        ["MOBILE", item["Contact Number"] || item["Mobile Number"] || "N/A"],
        ["EMAIL", item["Email Address"] || item["Email ID"] || item["Contact Email Address"] || "N/A"],
        ["UNIT #", item["Room Number"] || "Pending"],
        ["CITY", item["City"] || item["Residence City / Town"] || "N/A"],
        ["CHECK-IN", item["Timestamp"] ? new Date(item["Timestamp"]).toLocaleString() : "NONE"],
        ["IDENTITY", item["Identity Number"] || "NONE"]
    ];
    list.forEach(([lab, val]) => {
        const div = document.createElement("div");
        div.innerHTML = `<p style="font-size:0.7rem; color: #94a3b8; font-weight:800;">${lab}</p><p style="font-weight:700;">${val}</p>`;
        box.appendChild(div);
    });
    document.getElementById("detailsModal").style.display = "flex";
}

function showToast(m, t = 'success') {
    const toast = document.createElement("div");
    toast.style = "padding: 14px 24px; background: white; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 12px; border-left: 5px solid " + (t === 'success' ? '#10b981' : '#f59e0b') + "; margin-bottom: 12px; animation: slide 0.3s ease-out;";
    toast.innerHTML = `<i data-lucide="${t === 'success' ? 'check-circle' : 'alert-circle'}"></i> <span>${m}</span>`;
    document.getElementById("toastContainer").appendChild(toast);
    lucide.createIcons();
    setTimeout(() => toast.remove(), 4000);
}

function clearDates(type) {
    if (type === 'reg') {
        document.getElementById('regDateStart').value = "";
        document.getElementById('regDateEnd').value = "";
        applyFilters();
    }
}

function exportData(type) {
    let dataToExport = type === 'registry' ? filteredData : historyData;

    if (!dataToExport || dataToExport.length === 0) {
        showToast("No data available to export for this selection.", "warning");
        return;
    }

    const headers = Object.keys(dataToExport[0]);
    const csvContent = [
        headers.join(','),
        ...dataToExport.map(row => headers.map(h => {
            let cell = (row[h] || '').toString().replace(/"/g, '""');
            return `"${cell}"`;
        }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Jain_Dharamshala_${type}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} Exported Successfully`, "success");
}

// ============================================================
// UNIVERSAL PRINT PREVIEW MODAL
// Opened by both registry/history print buttons AND manual billing.
// Pre-fills from spreadsheet data; admin edits then confirms.
// ============================================================

let _ppCurrentType = null; // 'CHECK-IN' or 'CHECK-OUT'

function openPrintPreviewModal(type, item) {
    _ppCurrentType = type;

    const title   = document.getElementById('ppTitle');
    const subtitle = document.getElementById('ppSubtitle');
    const body    = document.getElementById('ppFormBody');

    // Helper: labelled input row
    function row(label, id, value = '', opts = {}) {
        const color   = opts.color    || '#64748b';
        const bgColor = opts.bg       || '#f9fafb';
        const inputType = opts.type   || 'text';
        const hint    = opts.hint     || '';
        const ro      = opts.readonly ? 'readonly style="background:#f1f5f9; color:#64748b;"' : '';
        return `
            <div>
                <label style="display:block; font-size:0.68rem; font-weight:800; color:${color}; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.5px;">${label}${hint ? ` <span style="font-weight:500; color:#94a3b8;">(${hint})</span>` : ''}</label>
                <input type="${inputType}" id="pp_${id}" value="${value}" ${ro} style="width:100%; padding:11px 14px; border:1px solid #e2e8f0; border-radius:8px; background:${bgColor}; font-weight:700; color:#1e293b; font-size:0.95rem;">
            </div>`;
    }

    function twoCol(left, right) {
        return `<div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">${left}${right}</div>`;
    }

    if (type === 'CHECK-IN') {
        title.innerText = 'यात्रि रसीद — Check-In Bill';
        subtitle.innerText = 'Verify details from sheet, edit if needed, then print.';

        const receiptNo = item['Check In Bill No'] || item['Receipt No']  || '';
        const room      = item['Room Number'] || '';
        const name      = item['Guest Name']  || item['Head of Family Name'] || '';
        const city      = item['Residence City / Town'] || item['Residence City/Town'] || item['City'] || '';
        const advance   = parseInt(item['Total Amount Deposited'] || item['Deposit'] || 0);
        const rate      = parseInt(item['Room Rate'] || item['Rate'] || 0);
        const days      = parseInt(item['Expected Days'] || item['Days'] || 1);
        const display   = advance > 0 ? advance : (rate * days);
        const tsObj = item['Timestamp'] ? getFormattedDateTime(item['Timestamp']) : getFormattedDateTime();

        body.innerHTML = [
            twoCol(
                row('रसीद नं. (Receipt No.)', 'receiptNo', receiptNo, { color: '#dc2626', bg: '#fff1f2' }),
                row('कमरा नं. (Room No.)',    'room',      room)
            ),
            twoCol(
                row('श्रीमान् (Guest Name)',  'guestName', name),
                row('मोबाईल (Mobile)',       'phone',     item['Contact Number'] || item['Mobile Number'] || '')
            ),
            twoCol(
                row('ग्राम / पता (City)',  'address',  city),
                row('दिनांक (Date)',       'date',     tsObj.date)
            ),
            twoCol(
                row('समय (Time)',         'time',     tsObj.time),
                row('डिपोजिट राशि (₹)',    'amount',   display || '', { type: 'number', color: '#4f46e5', bg: '#eef2ff' })
            )
        ].join('');

    } else { // CHECK-OUT
        title.innerText = 'अंतिम बिल — Check-Out Bill';
        subtitle.innerText = 'Verify & fill all fields. क्रमांक is required.';

        const name      = item['Guest Name']  || item['Head of Family Name'] || '';
        const room      = item['Room Number'] || item['room'] || item['Room'] || item['Unit #'] || '';
        
        // Robust variables for billing
        const checkInNo = item['Check In Bill No'] || item['Receipt No'] || item['receiptNo'] || '-';
        const billNo    = item['Check Out Bill No'] || item['Return Receipt No'] || item['Checkout Receipt No'] || (checkInNo ? checkInNo.toString().replace('IN-','OUT-') : '-');
        const regNo     = item['Check Out Bill No'] || item['Check-Out Rashid N'] || item['receiptNo'] || billNo;
        
        // Use the robust fetcher logic to resolve address/city in the modal itself
        const getValInternal = (dataSource, keys, fallback = "") => {
            for (let k of keys) {
                let val = dataSource[k];
                if (val && val.toString().trim() !== "" && !val.toString().toLowerCase().includes("same as above")) {
                    return val.toString().trim();
                }
            }
            return fallback;
        };
        const city = getValInternal(item, ["City", "Residence City / Town", "Residence City/Town", "address", "Identity"]);
        
        const rent  = parseInt(item['Normal Account'] || item['Total Amount Deposited'] || (parseInt(item['Room Rate'] || 0) * parseInt(item['Expected Days'] || 1)) || 0);
        const other = parseInt(item['Other Charges'] || 0);
        const total = (rent + other) || parseInt(item['Total Amount'] || 0);

        const checkoutDateStr = item['Checkout Timestamp'] || item['Checkout Date'] || '';
        const checkoutDate = (checkoutDateStr && checkoutDateStr !== "N/A") ? new Date(checkoutDateStr) : null;
        const tsObj = (checkoutDate && !isNaN(checkoutDate)) ? getFormattedDateTime(checkoutDate) : getFormattedDateTime();

        body.innerHTML = [
            twoCol(
                row('रजिस्टर सं. (Register No.)', 'regNo',    regNo, { hint: 'OUT' }),
                row('डिपोजिट र. सं. (Deposit No.)', 'originalReceiptNo', checkInNo, { color: '#dc2626', bg: '#fff1f2', hint: 'IN' })
            ),
            twoCol(
                row('चेकआउट बिल नं. (Bill No.)', 'receiptNo', billNo, { color: '#dc2626', bg: '#fff1f2' }),
                row('कमरा नं. (Room No.)',    'room',      room)
            ),
            twoCol(
                row('दिनांक (Date)',             'date',      tsObj.date),
                row('समय (Time)',               'time',      tsObj.time)
            ),
            twoCol(
                row('श्रीमान् (Guest Name)',     'guestName', name),
                row('मोबाईल (Mobile)',          'phone',     item['Contact Number'] || item['Mobile Number'] || '')
            ),
            row('निवासी (City / Town)',  'address',   city),
            twoCol(
                row('1. साधारण खाता — Room Rent (₹)', 'rent',  rent  || '', { type: 'number' }),
                row('2. अन्य शुल्क — Other (₹)', 'other', other || '', { type: 'number' })
            ),
            row('टोटल — Grand Total (₹)', 'total', total || '', { type: 'number', color: '#0f172a', bg: '#f8fafc' })
        ].join('');

        // Auto-calc total when rent/other changes
        setTimeout(() => {
            ['pp_rent','pp_other'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', () => {
                    const r = parseInt(document.getElementById('pp_rent')?.value || 0);
                    const o = parseInt(document.getElementById('pp_other')?.value || 0);
                    const t = document.getElementById('pp_total');
                    if (t) t.value = r + o;
                });
            });
        }, 100);
    }

    document.getElementById('printPreviewModal').style.display = 'flex';
    lucide.createIcons();
}

function closePrintPreviewModal() {
    document.getElementById('printPreviewModal').style.display = 'none';
    _ppCurrentType = null;
}

function confirmAndPrintReceipt() {
    const type = _ppCurrentType;
    if (!type) return;

    const get = id => document.getElementById('pp_' + id)?.value || '';

    if (type === 'CHECK-IN') {
        const amount = parseInt(get('amount') || 0);
        generateReceipt('CHECK-IN', {
            receiptNo:  get('receiptNo'),
            room:       get('room'),
            guestName:  get('guestName'),
            phone:      get('phone'),
            address:    get('address'),
            dateTime:   { date: get('date'), time: get('time') },
            advance:    amount,
            rate:       amount,
            days:       1
        });
    } else {
        const rent  = parseInt(get('rent')  || 0);
        const other = parseInt(get('other') || 0);
        const total = parseInt(get('total') || 0) || (rent + other);
        generateReceipt('CHECK-OUT', {
            receiptNo:         get('regNo') || get('receiptNo'),
            originalReceiptNo: get('originalReceiptNo'), // Correctly pull the IN number
            room:              get('room'),
            guestName:         get('guestName'),
            phone:             get('phone'),
            address:           get('address'),
            dateTime:          { date: get('date'), time: get('time') },
            rent:              rent,
            otherAcc:          other,
            confirmedTotal:    total
        });
    }

    closePrintPreviewModal();
    setTimeout(() => window.print(), 400);
}

function printCheckinReceipt(index, type) {
    let item;
    if (type === 'active') item = bookingData[index];
    else if (type === 'history') item = historyData[index];
    
    if (!item) return;
    openPrintPreviewModal('CHECK-IN', item);
}

function printCheckoutReceipt(index, type) {
    let item;
    if (type === 'active') item = bookingData[index];
    else if (type === 'history') item = historyData[index];

    if (!item) return;
    openPrintPreviewModal('CHECK-OUT', item);
}




function renderBilling() {
    const tableBody = document.getElementById("billingTableBody");
    if (!tableBody) return;

    const searchTerm = (document.getElementById("billingSearchInput")?.value || "").toLowerCase();

    // We want to show everyone, active and history, but mostly those who have a guest name
    let combinedData = [];

    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 2);

    // 1. Add from active (ONLY if staying/booked)
    bookingData.forEach((r, idx) => {
        const status = getApplicationStatus(r);
        if (status === "Booked" && (r["Guest Name"] || r["Head of Family Name"])) {
            combinedData.push({ ...r, _sourceIdx: idx, _type: 'active' });
        }
    });

    // 2. Add from history (ONLY if from last 2 days)
    historyData.forEach((r, idx) => {
        const checkoutTime = r["Checkout Timestamp"] ? new Date(r["Checkout Timestamp"]) : null;
        const registrationTime = r["Timestamp"] ? new Date(r["Timestamp"]) : null;
        const relevantTime = checkoutTime || registrationTime;

        if (relevantTime && relevantTime >= limitDate && (r["Guest Name"] || r["Head of Family Name"])) {
            combinedData.push({ ...r, _sourceIdx: idx, _type: 'history' });
        }
    });

    // Sort: In-House guests (active) first, then History, both by most recent date
    combinedData.sort((a, b) => {
        if (a._type !== b._type) {
            // 'active' comes before 'history'
            return a._type === 'active' ? -1 : 1;
        }
        const dateA = a["Timestamp"] ? new Date(a["Timestamp"]) : new Date(0);
        const dateB = b["Timestamp"] ? new Date(b["Timestamp"]) : new Date(0);
        return dateB - dateA;
    });

    // Deduplicate by Timestamp + Room
    const seen = new Set();
    const uniqueCombined = [];
    combinedData.forEach(r => {
        const id = (r["Timestamp"] || "") + (r["Room Number"] || "");
        if (!seen.has(id)) {
            uniqueCombined.push(r);
            seen.add(id);
        }
    });

    if (searchTerm) {
        combinedData = uniqueCombined.filter(r => {
            const guestName = (r["Guest Name"] || r["Head of Family Name"] || "").toString().toLowerCase();
            const phone = (r["Contact Number"] || r["Mobile Number"] || "").toString();
            const room = (r["Room Number"] || "").toString();
            const bill = (r["Check In Bill No"] || r["Receipt No"] || r["Check Out Bill No"] || "").toString().toLowerCase();

            return guestName.includes(searchTerm) || 
                   phone.includes(searchTerm) || 
                   room.includes(searchTerm) ||
                   bill.includes(searchTerm);
        });
    } else {
        combinedData = uniqueCombined;
    }

    if (combinedData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan='4' style='text-align: center; color: #64748b; padding: 50px;'>No billing records found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = "";
    combinedData.forEach((r, idx) => {
        const guestName = r["Guest Name"] || r["Head of Family Name"] || "N/A";
        const phone = r["Contact Number"] || r["Mobile Number"] || "-";
        const room = r["Room Number"] || "N/A";
        
        const status = getApplicationStatus(r);
        const isSettled = status === "Checked-Out" || status === "Under Cleaning";
        const isPending = status === "Pending";
        
        let statusLabel;
        if (isSettled) {
            statusLabel = `<span class="status-tag tag-cleaning">Checked Out</span>`;
        } else if (isPending) {
            statusLabel = `<span class="status-tag tag-pending">New Registration</span>`;
        } else {
            statusLabel = `<span class="status-tag tag-booked">In-House (Staying)</span>`;
        }

        const row = document.createElement("tr");
        row.className = "stagger-row";
        row.style.animationDelay = `${idx * 0.1}s`;
        row.innerHTML = `
            <td>
                <div style="font-weight: 800;">${guestName}</div>
                <div style="font-size: 0.7rem; color: #64748b;">Phone: ${phone}</div>
            </td>
            <td><span style="font-weight: 800; color: #1e293b;">${room}</span></td>
            <td>${statusLabel}</td>
            <td>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button onclick="printCheckinReceipt(${r._sourceIdx}, '${r._type}')" class="btn-export btn-export-green" style="padding: 6px 12px; font-size: 0.75rem;">
                        <i data-lucide="printer" style="width: 14px; height: 14px;"></i> Check-In Bill
                    </button>
                    <button onclick="${isSettled ? `printCheckoutReceipt(${r._sourceIdx}, '${r._type}')` : `alert('Guest has not checked out yet. Checkout bill is only available after checkout.');`}" class="btn-export btn-export-red" style="padding: 6px 12px; font-size: 0.75rem; opacity: ${isSettled ? '1' : '0.5'}; cursor: ${isSettled ? 'pointer' : 'not-allowed'};">
                        <i data-lucide="printer" style="width: 14px; height: 14px;"></i> Check-Out Bill
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

async function printDailyRegistry() {
    const today = new Date().toISOString().split('T')[0];
    const targetDate = prompt("Enter Date for Registry Report (YYYY-MM-DD):", today);
    if (!targetDate) return;

    const adminName = prompt("Enter Admin Name for the report:", "Admin");
    if (adminName === null) return;

    // Fuzzy Matcher: Breaks target date (YYYY-MM-DD) into parts for robust comparison
    const [tY, tM, tD] = targetDate.split('-').map(s => parseInt(s, 10));
    
    function isDateMatch(val) {
        if (!val || val === "") return false;
        
        let dateObj = null;

        // 1. Handle actual Date objects
        if (val instanceof Date) {
            dateObj = val;
        } 
        // 2. Handle Google Sheets Serial Numbers (e.g., 45392)
        else if (typeof val === 'number') {
            if (val > 30000 && val < 60000) { 
                dateObj = new Date((val - 25569) * 86400 * 1000);
            } else {
                return false; 
            }
        }
        // 3. Handle Strings (ISO, M/D/YYYY, etc)
        else if (typeof val === 'string') {
            // First try direct Date parsing (Best for ISO strings from GAS)
            const parsed = new Date(val);
            if (!isNaN(parsed.getTime())) {
                dateObj = parsed;
            } else {
                // Manual fallback for DD/MM/YYYY or similar if native fails
                const parts = val.split(/[\/\-,\s]+/).map(p => parseInt(p, 10)).filter(p => !isNaN(p));
                if (parts.length >= 3) {
                    // Try common formats: [D, M, Y] or [Y, M, D]
                    const d1 = parts[0], m1 = parts[1], y1 = parts[2];
                    const d2 = parts[2], m2 = parts[1], y2 = parts[0];
                    
                    // Match against target parts (tY, tM, tD from outer scope)
                    const match1 = (y1 === tY || y1 === tY % 100) && m1 === tM && d1 === tD;
                    const match2 = (y2 === tY || y2 === tY % 100) && m2 === tM && d2 === tD;
                    if (match1 || match2) return true;
                }
            }
        }

        // Final strict check using local date parts (IST)
        if (dateObj) {
            return dateObj.getFullYear() === tY && 
                   (dateObj.getMonth() + 1) === tM && 
                   dateObj.getDate() === tD;
        }

        return false;
    }

    // Filter rawSheetData using Name-Based & Fuzzy Matching
    const dayData = rawSheetData.filter(r => {
        const keys = Object.keys(r);
        
        // --- STRICT COLUMN CLASSIFICATION ---
        // Arrival columns
        const arrivalTimestampKey = keys.find(k => k === 'Timestamp') || keys.find(k => k.toLowerCase() === 'timestamp');
        const checkinDateKey = keys.find(k => k.toLowerCase().includes('arrival') || k.toLowerCase().includes('arriving'));
        
        // Departure columns
        const checkoutTimestampKey = keys.find(k => k.toLowerCase() === 'checkout timestamp' || k.toLowerCase() === 'check-out timestamp');
        const checkoutDateKey = keys.find(k => k.toLowerCase().includes('departure') || (k.toLowerCase().includes('checkout') && k !== checkoutTimestampKey));

        const checkinMatch = (arrivalTimestampKey && isDateMatch(r[arrivalTimestampKey])) || 
                            (checkinDateKey && isDateMatch(r[checkinDateKey]));
        
        const checkoutMatch = (checkoutTimestampKey && isDateMatch(r[checkoutTimestampKey])) || 
                             (checkoutDateKey && isDateMatch(r[checkoutDateKey]));

        if (checkinMatch || checkoutMatch) {
            // Priority: IN-OUT for same day action, otherwise separate
            if (checkinMatch && checkoutMatch) {
                r._activityType = "IN-OUT";
            } else if (checkoutMatch) {
                r._activityType = "OUT";
            } else {
                r._activityType = "IN";
            }
            return true;
        }
        return false;
    });

    if (dayData.length === 0) {
        showToast("No activity found for " + targetDate, "error");
        return;
    }

    const printWin = window.open('', 'RegistryReport');
    
    const getVal = (obj, keys) => {
        if (!obj) return '';
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) {
            if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
        }
        return '';
    };

    const inEntries = dayData.filter(r => r._activityType === "IN" || r._activityType === "IN-OUT");
    const outEntries = dayData.filter(r => {
        const isOutType = r._activityType === "OUT" || r._activityType === "IN-OUT";
        if (!isOutType) return false;
        
        // Secondary Filter: Only include in the Check-out list if an actual payment amount exists (> 0).
        // This effectively hides "Scheduled Departures" that haven't actually checked out yet.
        const amt = parseInt(getVal(r, ['AA', 'Normal Account', 'NormalAccount', 'rent']) || 0) + 
                    parseInt(getVal(r, ['AB', 'Other Charges', 'Others', 'otherAcc']) || 0);
        return amt > 0;
    });

    const maxRows = Math.max(inEntries.length, outEntries.length);
    let tableRows = "";
    
    // Totals for the summary row
    let totalIn = 0;
    let totalOut = 0;
    let totalRefund = 0;

    for (let i = 0; i < maxRows; i++) {
        const inR = inEntries[i];
        const outR = outEntries[i];

        // Part 1: Check-in
        const inReceipt = getVal(inR, ['Check In Bill No', 'Deposit Number', 'receiptNo']);
        const inRoom = getVal(inR, ['Room Number', 'Room No', 'Unit #']);
        const inAmount = getVal(inR, ['Total Amount Deposited', 'Deposit', 'Total Amount Depo!']);
        totalIn += parseFloat(inAmount) || 0;

        // Part 2: Check-out
        const outReceipt = getVal(outR, ['Check Out Bill No', 'Check-Out Rashid N', 'Check-Out Rashid No', 'Check Out Rashid N', 'Check Out Rashid No']) || 
                           getVal(outR, ['Check In Bill No', 'Deposit Number', 'receiptNo']);
        const outRoom = getVal(outR, ['Room Number', 'Room No', 'Unit #']);
        const outNormal = parseInt(getVal(outR, ['AA', 'Normal Account', 'NormalAccount', 'rent']) || 0);
        const outOther = parseInt(getVal(outR, ['AB', 'Other Charges', 'Others', 'otherAcc']) || 0);
        const outAmount = outNormal + outOther;
        totalOut += outAmount;
        
        // Attempt to find refund in the data
        const refundVal = parseFloat(getVal(outR, ['Security Refund', 'Refund', 'refundAmt', 'refund'])) || 0;
        totalRefund += refundVal;

        tableRows += `
        <tr>
            <!-- Check-in Data Partition (Col 1-3) -->
            <td contenteditable="true" style="background: #fdfdfd; cursor: text;">${inReceipt}</td>
            <td contenteditable="true" style="background: #fdfdfd; cursor: text;">${inRoom}</td>
            <td contenteditable="true" class="in-amt" style="background: #fdfdfd; cursor: text;">${inAmount}</td>
            
            <!-- Check-out Data Partition (Col 4-7) -->
            <td contenteditable="true" style="background: #fdfdfd; cursor: text;">${outReceipt}</td>
            <td contenteditable="true" style="background: #fdfdfd; cursor: text;">${outRoom}</td>
            <td contenteditable="true" class="out-amt" style="background: #fdfdfd; cursor: text;">${outR ? (outAmount > 0 ? outAmount : '0') : ''}</td>
            <td contenteditable="true" class="refund-amt" style="background: #fdfdfd; cursor: text; border-left: 2px solid #333;">${outR && refundVal > 0 ? refundVal : ''}</td>
        </tr>`;
    }

    // Add Total Row
    tableRows += `
    <tr class="summary-total-row" style="background: #f8fafc; font-weight: bold; border-top: 2px solid #1a1a1a; font-size: 14px;">
        <td colspan="2" style="text-align: right; padding-right: 15px;">TOTAL SUMMARY:</td>
        <td id="total-in-display" style="background: #eff6ff;">${totalIn}</td>
        <td colspan="2"></td>
        <td id="total-out-display" style="background: #f0fdf4;">${totalOut}</td>
        <td id="total-refund-display" style="background: #fff1f2; border-left: 2px solid #333;">${totalRefund}</td>
    </tr>`;

    printWin.document.write(`
        <html>
        <head>
            <title>Daily Registry Report - ${targetDate}</title>
            <style>
                @page { size: landscape; margin: 10mm; }
                body { font-family: 'Inter', sans-serif; padding: 20px; color: #1a1a1a; }
                .report-header { text-align: center; margin-bottom: 25px; border-bottom: 2px solid #000; padding-bottom: 15px; position: relative; }
                .report-header h1 { margin: 0; font-size: 26px; font-weight: 800; }
                .report-header h2 { margin: 5px 0; font-size: 16px; font-weight: 700; color: #444; }
                
                .no-print-toolbar { background: #f8fafc; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
                @media print { .no-print-toolbar { display: none; } }
                
                .print-btn { background: #2563eb; color: white; border: none; padding: 10px 24px; border-radius: 6px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 14px; }
                .print-btn:hover { background: #1d4ed8; }

                .meta-section { display: flex; justify-content: space-between; margin-bottom: 15px; background: #f1f5f9; padding: 10px 15px; border-radius: 6px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05); }
                .meta-item { font-size: 13px; font-weight: 600; }
                .meta-item b { color: #1e293b; font-size: 14px; }

                table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; }
                th, td { border: 1px solid #333; padding: 8px 6px; text-align: left; overflow: hidden; text-overflow: ellipsis; }
                
                th { background: #f3f4f6; color: #000; text-transform: uppercase; font-weight: 800; text-align: center; }
                .partition-header { background: #e5e7eb; border-bottom: 2px solid #000; font-size: 11px; }
                
                .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; }
                .footer-sign { width: 220px; border-top: 1px solid #000; padding-top: 5px; text-align: center; margin-top: 40px; }
            </style>
        </head>
        <body>
            <div class="no-print-toolbar">
                <div style="color: #64748b; font-size: 13px;">
                    <b style="color: #2563eb;">PREVIEW NOTE:</b> You can click on ANY cell in this table to edit its data. 
                    <span style="color: #dc2626; font-weight: bold;">[Admin MUST enter the Refund Amount for check-outs before printing]</span>
                </div>
                <button class="print-btn" onclick="window.print()">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2-0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2m-2 0v5a2 2 0 01-2 2H9a2 2 0 01-2-2v-5m0-9h10"></path></svg>
                    Finish & Print Report
                </button>
            </div>

            <div class="report-header">
                <h1>श्री जैन श्वेताम्बर विश्रांति गृह, स्टेशन रोड़, चित्तौड़गढ़ (राज.)</h1>
                <h2>DAILY GUEST REGISTRY SUMMARY - ${targetDate}</h2>
            </div>
            
            <div class="meta-section">
                <div class="meta-item">DATE: <b>${targetDate}</b></div>
                <div class="meta-item">ADMIN: <b>${adminName}</b></div>
                <div class="meta-item">GENERATE TIME: <b>${new Date().toLocaleTimeString()}</b></div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th colspan="3" class="partition-header">Check-In Data</th>
                        <th colspan="4" class="partition-header">Check-Out Data</th>
                    </tr>
                    <tr>
                        <th style="width: 15%">Receipt</th>
                        <th style="width: 10%">Room</th>
                        <th style="width: 15%">Check-in Amt</th>
                        <th style="width: 15%">Receipt</th>
                        <th style="width: 10%">Room</th>
                        <th style="width: 15%">Checkout Amt</th>
                        <th style="width: 20%">Refund Amt</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            <script>
                function updateTotals() {
                    let totalIn = 0;
                    let totalOut = 0;
                    let totalRefund = 0;
                    
                    document.querySelectorAll('.in-amt').forEach(td => {
                        totalIn += parseFloat(td.innerText.replace(/[^0-9.]/g, '')) || 0;
                    });
                    document.querySelectorAll('.out-amt').forEach(td => {
                        totalOut += parseFloat(td.innerText.replace(/[^0-9.]/g, '')) || 0;
                    });
                    document.querySelectorAll('.refund-amt').forEach(td => {
                        totalRefund += parseFloat(td.innerText.replace(/[^0-9.]/g, '')) || 0;
                    });
                    
                    document.getElementById('total-in-display').innerText = totalIn;
                    document.getElementById('total-out-display').innerText = totalOut;
                    document.getElementById('total-refund-display').innerText = totalRefund;
                }
                
                document.addEventListener('input', (e) => {
                    if (e.target.classList.contains('in-amt') || e.target.classList.contains('out-amt') || e.target.classList.contains('refund-amt')) {
                        updateTotals();
                    }
                });
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
}


function openSystemInfoModal() {
    const modal = document.getElementById('systemInfoModal');
    const iconBox = document.getElementById('sysIconBox');
    const icon = document.getElementById('sysIcon');
    const title = document.getElementById('sysTitle');
    const subtitle = document.getElementById('sysSubtitle');
    const badge = document.getElementById('sysStatusBadge');
    const label = document.getElementById('sysStatusLabel');

    if (navigator.onLine) {
        badge.className = 'status-badge online';
        label.innerText = 'System Live';
        iconBox.style.background = '#dcfce7';
        iconBox.style.color = '#10b981';
        iconBox.className = 'is-online';
        icon.setAttribute('data-lucide', 'check-circle');
        title.innerText = 'System Running Smoothly';
        title.style.color = '#0f172a';
        subtitle.innerText = 'Internet Connected. All services are operational.';
    } else {
        badge.className = 'status-badge offline';
        label.innerText = 'System Offline';
        iconBox.style.background = '#fee2e2';
        iconBox.style.color = '#dc2626';
        iconBox.className = 'is-offline';
        icon.setAttribute('data-lucide', 'wifi-off');
        title.innerText = 'System Offline';
        title.style.color = '#dc2626';
        subtitle.innerText = 'No internet connection. Waiting for reconnect...';
    }

    modal.style.display = 'flex';
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Automatically show the offline modal when internet disconnects
window.addEventListener('offline', () => {
    openSystemInfoModal();
});

// Automatically update and then dismiss the modal when internet reconnects
window.addEventListener('online', () => {
    openSystemInfoModal(); // Show the green "Smoothly" state
    showToast("Internet connection restored safely.", "success");
    
    // Auto-close it after 3 seconds so they can get back to work
    setTimeout(() => {
        const modal = document.getElementById('systemInfoModal');
        if (modal && modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    }, 2500);
});
