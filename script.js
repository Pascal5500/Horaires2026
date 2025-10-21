// --- DÉCLARATION DES VARIABLES GLOBALES ET DONNÉES DE BASE ---
const DEPARTMENTS = ["Accueil", "Départs", "Terrain", "Carts"];
const ADMIN_PASSWORD = '1000'; 
let isAdminMode = false;
let currentDisplayFilter = 'all'; 

// Ces variables ne sont plus stockées dans LocalStorage, elles viennent de Firebase
let employees = [];
let shifts = ["------"]; 
let scheduleData = {}; 

// --- FONCTIONS DE SAUVEGARDE ET DE LECTURE (MISE À JOUR FIREBASE) ---

// Sauvegarde vers Firebase
function saveEmployees() {
    db.ref('employees').set(employees);
}
function saveShifts() {
    const shiftsToSave = shifts.filter(s => s !== "------");
    db.ref('shifts').set(shiftsToSave);
}
function saveSchedule() {
    db.ref('scheduleData').set(scheduleData);
}

// Fonction pour synchroniser toutes les données de la base de données
function syncDataFromFirebase() {
    // Écoute des changements d'employés
    db.ref('employees').on('value', (snapshot) => {
        employees = snapshot.val() || [];
        renderAdminLists();
        generateSchedule(); 
    });

    // Écoute des changements de plages horaires
    db.ref('shifts').on('value', (snapshot) => {
        const storedShifts = snapshot.val() || ['8h-16h', '16h-24h', 'Congé', 'Fermé'];
        shifts = ["------"];
        storedShifts.forEach(shift => {
            if (shift !== "------" && !shifts.includes(shift)) {
                shifts.push(shift);
            }
        });
        renderAdminLists();
        generateSchedule();
    });

    // Écoute des changements d'horaire
    db.ref('scheduleData').on('value', (snapshot) => {
        scheduleData = snapshot.val() || {};
        generateSchedule(); // Le tableau se met à jour immédiatement
    });
}

// --- FONCTIONS D'AUTHENTIFICATION (inchangées) ---
function authenticateAdmin() {
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput.value === ADMIN_PASSWORD) {
        isAdminMode = true;
        passwordInput.value = '';
        passwordInput.placeholder = 'Mode Admin Activé';
        passwordInput.disabled = true; 
        document.getElementById('adminAuthButton').disabled = true;
        document.getElementById('adminPanel').style.display = 'block';
        generateSchedule();
        alert("Mode Administrateur activé.");
    } else {
        alert("Mot de passe incorrect. Le mode admin n'est pas activé.");
        passwordInput.value = '';
        isAdminMode = false; 
        document.getElementById('adminPanel').style.display = 'none';
        generateSchedule(); 
    }
}

function disableAdminMode() {
    isAdminMode = false;
    const passwordInput = document.getElementById('adminPassword');
    passwordInput.disabled = false;
    document.getElementById('adminAuthButton').disabled = false;
    passwordInput.placeholder = '';
    document.getElementById('adminPanel').style.display = 'none';
    generateSchedule();
    alert("Mode Administrateur désactivé.");
}


// --- GESTION DES EMPLOYÉS ET PLAGES HORAIRES (ADMIN) ---

function addEmployee() {
    const nameInput = document.getElementById('newEmployeeName');
    const deptInput = document.getElementById('newEmployeeDept');
    const name = nameInput.value.trim();
    const dept = deptInput.value;

    if (name && dept) {
        employees.push({ id: Date.now(), name, dept }); 
        nameInput.value = '';
        saveEmployees(); // Sauvegarde vers Firebase
    }
}

function removeEmployee(id) {
    employees = employees.filter(emp => emp.id !== Number(id)); 
    // Supprimer les entrées d'horaire pour cet employé
    Object.keys(scheduleData).forEach(key => {
        if (key.startsWith(`${id}-`)) {
            delete scheduleData[key];
        }
    });
    saveEmployees(); // Sauvegarde vers Firebase
    saveSchedule(); // Sauvegarde de l'horaire mis à jour
}

function addShift() {
    const shiftInput = document.getElementById('newShift');
    const newShift = shiftInput.value.trim();

    if (newShift && newShift !== "------" && !shifts.includes(newShift)) {
        shifts.push(newShift);
        saveShifts(); // Sauvegarde vers Firebase
        shiftInput.value = '';
    }
}

function removeShift(shift) {
    shifts = shifts.filter(s => s !== shift);
    saveShifts(); // Sauvegarde vers Firebase
}

function renderAdminLists() {
    // La logique de rendu des listes reste la même (elle utilise les variables globales mises à jour par Firebase)
    const shiftsList = document.getElementById('shiftsList');
    shiftsList.innerHTML = '';
    
    shifts.filter(s => s !== "------").forEach(shift => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        const safeShift = shift.replace(/'/g, "\\'"); 
        li.innerHTML = `${shift} <button class="btn btn-sm btn-danger" onclick="removeShift('${safeShift}')">X</button>`;
        shiftsList.appendChild(li);
    });

    const listContainer = document.getElementById('employeesListContainer');
    listContainer.innerHTML = '';

    DEPARTMENTS.forEach(dept => {
        const deptEmployees = employees.filter(emp => emp.dept === dept);
        const colDiv = document.createElement('div');
        colDiv.className = 'col-md-3 mb-3';
        colDiv.innerHTML = `
            <h6>${dept}</h6>
            <ul class="list-group">
                ${deptEmployees.map(emp => `
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        ${emp.name} 
                        <button class="btn btn-sm btn-danger" onclick="removeEmployee(${emp.id})">X</button>
                    </li>
                `).join('')}
            </ul>
        `;
        listContainer.appendChild(colDiv);
    });
}

// --- NAVIGATION HEBDOMADAIRE ET AFFICHAGE ---

function getDates(startDate) {
    const dates = [];
    let current = new Date(startDate);
    for (let i = 0; i < 7; i++) { 
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

function changeWeek(delta) {
    const startDateInput = document.getElementById('startDate');
    if (!startDateInput.value) return;

    let currentStartDate = new Date(startDateInput.value);
    currentStartDate.setDate(currentStartDate.getDate() + (7 * delta));

    startDateInput.value = currentStartDate.toISOString().split('T')[0];
    generateSchedule();
}

// MODIFIÉ: Met à jour Firebase, ce qui déclenche la mise à jour pour tous les employés
function updateSchedule(event) {
    const select = event.target;
    const key = select.getAttribute('data-key');
    const value = select.value;
    
    if (value === "------") {
        // Enlève l'entrée si "------" est sélectionné
        delete scheduleData[key];
    } else {
        scheduleData[key] = value;
    }
    
    select.parentElement.setAttribute('data-shift', value); 
    saveSchedule(); // Sauvegarde vers Firebase
}

function generateSchedule() {
    const startDateInput = document.getElementById('startDate').value;
    if (!startDateInput) return;

    const dates = getDates(startDateInput); 
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody'); 

    // 1. Générer l'en-tête du tableau (inchangé)
    tableHeader.innerHTML = '<th>Employé</th>';
    dates.forEach(date => {
        const day = date.toLocaleDateString('fr-FR', { weekday: 'short' });
        const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' });
        tableHeader.innerHTML += `<th>${day}<br>${dateStr}</th>`;
    });

    // 2. Générer le corps du tableau
    tableBody.innerHTML = '';
    let currentRow = 0;

    DEPARTMENTS.forEach(dept => {
        const deptEmployees = employees.filter(emp => emp.dept === dept);

        if (deptEmployees.length > 0) {
            const deptRow = tableBody.insertRow(currentRow++);
            deptRow.className = 'table-secondary fw-bold dept-header-row';
            deptRow.setAttribute('data-dept', dept); 
            deptRow.innerHTML = `<td colspan="${8}">${dept}</td>`; 
            
            deptEmployees.forEach(emp => {
                const row = tableBody.insertRow(currentRow++);
                row.className = 'employee-row'; 
                row.setAttribute('data-dept', dept);
                row.innerHTML = `<td>${emp.name}</td>`; 

                dates.forEach(date => {
                    const dateKey = date.toISOString().split('T')[0];
                    const cell = row.insertCell();
                    
                    const scheduleKey = `${emp.id}-${dateKey}`;
                    const currentShift = scheduleData[scheduleKey] || "------"; 

                    // Créer le menu déroulant
                    const select = document.createElement('select');
                    select.className = 'shift-select';
                    select.disabled = !isAdminMode; 
                    select.setAttribute('data-key', scheduleKey);
                    select.onchange = updateSchedule;
                    
                    shifts.forEach(shift => {
                        const option = document.createElement('option');
                        option.value = shift;
                        option.textContent = shift;
                        if (shift === currentShift) {
                            option.selected = true;
                        }
                        select.appendChild(option);
                    });
                    
                    cell.appendChild(select);
                    cell.setAttribute('data-shift', currentShift); 
                });
            });
        }
    });
    
    applyDisplayFilter(currentDisplayFilter);
}


// --- FONCTIONS DE FILTRAGE ET EXPORT (inchangées) ---

function filterByButton(button, dept) {
    const buttons = document.querySelectorAll('.d-flex.gap-2 button');
    buttons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    currentDisplayFilter = dept;
    applyDisplayFilter(dept);
}

function applyDisplayFilter(deptToFilter) {
    const tableBody = document.getElementById('tableBody'); 
    const rows = tableBody.rows;
    let isCurrentDeptRowVisible = false;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const deptName = row.getAttribute('data-dept');
        
        if (row.classList.contains('dept-header-row')) { 
            if (deptToFilter === 'all' || deptName === deptToFilter) {
                isCurrentDeptRowVisible = true;
                row.style.display = '';
            } else {
                isCurrentDeptRowVisible = false;
                row.style.display = 'none';
            }
        } else if (row.classList.contains('employee-row')) { 
            if (isCurrentDeptRowVisible) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        }
    }
}

function filterScheduleForAction(deptToFilter) {
    applyDisplayFilter(deptToFilter);
}

function getSelectedDept() {
    return document.getElementById('deptSelector').value;
}

function printSchedule() {
    const dept = getSelectedDept();
    filterScheduleForAction(dept); 
    window.print();
    filterScheduleForAction(currentDisplayFilter); 
}

function exportPDF() {
    const dept = getSelectedDept();
    filterScheduleForAction(dept);
    
    const table = document.getElementById('scheduleTable');
    
    html2canvas(table, { scale: 2 }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('l', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const imgHeight = canvas.height * pdfWidth / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight);
        
        const filename = dept === 'all' ? 'Horaire_Complet.pdf' : `Horaire_${dept}.pdf`;
        pdf.save(filename);

        filterScheduleForAction(currentDisplayFilter); 
    });
}


// --- INITIALISATION (MODIFIÉ: Appel à la synchronisation Firebase) ---

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialise la connexion aux données
    syncDataFromFirebase(); 
    
    // 2. Le reste de l'initialisation reste le même
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('startDate').value = today;

    document.getElementById('adminPanel').style.display = 'none';
});