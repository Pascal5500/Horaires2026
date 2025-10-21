// --- DÉCLARATION DES VARIABLES GLOBALES ET DONNÉES DE BASE ---
const DEPARTMENTS = ["Accueil", "Départs", "Terrain", "Carts"];
const ADMIN_PASSWORD = '1000'; 
let isAdminMode = false;
let currentDisplayFilter = 'all'; 

// Ces variables sont mises à jour par les écouteurs Firebase
let employees = [];
let shifts = ["------"]; 
let scheduleData = {}; 

// --- FONCTIONS DE SAUVEGARDE ET DE LECTURE (FIREBASE) ---

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

// Fonction pour synchroniser toutes les données de la base de données (Inchangée)
function syncDataFromFirebase() {
    db.ref('employees').on('value', (snapshot) => {
        employees = snapshot.val() || [];
        renderAdminLists();
        generateSchedule(); 
    });

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

    db.ref('scheduleData').on('value', (snapshot) => {
        scheduleData = snapshot.val() || {};
        generateSchedule();
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
    passwordInput.placeholder = 'Mot de passe admin (1000)';
    document.getElementById('adminPanel').style.display = 'none';
    generateSchedule();
    alert("Mode Administrateur désactivé.");
}


// --- GESTION DES EMPLOYÉS ET PLAGES HORAIRES (ADMIN) ---

// Les fonctions add/remove Employee/Shift restent inchangées et appellent saveXXX()
function addEmployee() {
    const nameInput = document.getElementById('newEmployeeName');
    const deptInput = document.getElementById('newEmployeeDept');
    const name = nameInput.value.trim();
    const dept = deptInput.value;

    if (name && dept) {
        employees.push({ id: Date.now(), name, dept }); 
        nameInput.value = '';
        saveEmployees();
    }
}

function removeEmployee(id) {
    employees = employees.filter(emp => emp.id !== Number(id)); 
    Object.keys(scheduleData).forEach(key => {
        if (key.startsWith(`${id}-`)) {
            delete scheduleData[key];
        }
    });
    saveEmployees();
    saveSchedule();
}

function addShift() {
    const shiftInput = document.getElementById('newShift');
    const newShift = shiftInput.value.trim();

    if (newShift && newShift !== "------" && !shifts.includes(newShift)) {
        shifts.push(newShift);
        saveShifts();
        shiftInput.value = '';
    }
}

function removeShift(shift) {
    shifts = shifts.filter(s => s !== shift);
    saveShifts();
}

function renderAdminLists() {
    // Logique de rendu des listes (inchangée)
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

// --- LOGIQUE DE LA CASE À COCHER N/D ---

function updateAvailability(event) {
    const checkbox = event.target;
    const scheduleKey = checkbox.getAttribute('data-key');
    const isChecked = checkbox.checked;

    // Met à jour la disponibilité dans l'objet de données sous une clé spécifique
    const availabilityKey = `avail-${scheduleKey}`;

    if (isChecked) {
        scheduleData[availabilityKey] = true;
    } else {
        delete scheduleData[availabilityKey];
    }
    
    // Met à jour le style de la cellule pour tous les utilisateurs
    const cell = checkbox.closest('td');
    if (isChecked) {
        cell.classList.add('not-available');
    } else {
        cell.classList.remove('not-available');
    }

    saveSchedule(); // Sauvegarde le changement dans Firebase
}


// --- NAVIGATION HEBDOMADAIRE ET AFFICHAGE (CORRIGÉ POUR DÉBUT DIMANCHE GARANTI) ---

/**
 * Crée un objet Date basé sur la date locale de minuit, ignorant le décalage UTC.
 */
function createLocalMidnightDate(dateString) {
    const parts = dateString.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; 
    const day = parseInt(parts[2]);
    
    // Créer la date locale directement à 00:00:00 Heure locale
    return new Date(year, month, day, 0, 0, 0); 
}

/**
 * Prend n'importe quelle date et retourne la date du Dimanche (jour 0) de cette même semaine.
 * @param {Date} date - L'objet Date à ajuster.
 * @returns {Date} L'objet Date ajusté au Dimanche de la semaine.
 */
function getSundayOfWeek(date) {
    const dayOfWeek = date.getDay(); 
    
    // Recule le nombre de jours nécessaires pour arriver au Dimanche (Jour 0)
    date.setDate(date.getDate() - dayOfWeek);
    return date;
}


/**
 * Détermine le Dimanche de la semaine de la date sélectionnée et génère les 7 jours.
 */
function getDates(startDate) {
    const dates = [];
    
    // Commence par la date actuellement sélectionnée dans l'input
    let selectedDate = createLocalMidnightDate(startDate);
    
    // S'assure que nous commençons la boucle par le Dimanche précédent ou actuel
    let current = getSundayOfWeek(selectedDate);
    
    // Génère les 7 jours à partir du Dimanche
    for (let i = 0; i < 7; i++) { 
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }
    
    return dates;
}

/**
 * Change la date de début de l'horaire (avance ou recule d'une semaine entière).
 */
function changeWeek(delta) {
    const startDateInput = document.getElementById('startDate');
    if (!startDateInput.value) return;

    // Commence par la date actuelle (qui devrait déjà être un dimanche si l'initialisation a fonctionné)
    let currentStartDate = createLocalMidnightDate(startDateInput.value); 
    
    // On avance ou recule la date de 7 jours
    currentStartDate.setDate(currentStartDate.getDate() + (7 * delta));

    // Formate et met à jour le champ de date
    const year = currentStartDate.getFullYear();
    const month = String(currentStartDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentStartDate.getDate()).padStart(2, '0');

    startDateInput.value = `${year}-${month}-${day}`;
    
    // Regénère l'horaire
    generateSchedule();
}

// ... Le reste du fichier script.js ne change pas
// Mise à jour de l'horaire par l'ADMIN (menu déroulant)
function updateSchedule(event) {
    const select = event.target;
    const key = select.getAttribute('data-key');
    const value = select.value;
    
    if (value === "------") {
        delete scheduleData[key];
    } else {
        scheduleData[key] = value;
    }
    
    select.parentElement.querySelector('.shift-label').textContent = value; // Pour l'impression
    saveSchedule();
}

function generateSchedule() {
    const startDateInput = document.getElementById('startDate').value;
    if (!startDateInput) return;

    const dates = getDates(startDateInput); 
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody'); 

    // 1. Générer l'en-tête du tableau
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
                    const isNotAvailable = scheduleData[`avail-${scheduleKey}`] || false; // Nouvelle clé pour N/D

                    // Ajoute la classe rouge si N/D est coché
                    if (isNotAvailable) {
                        cell.classList.add('not-available');
                    }
                    
                    // --- NOUVELLE STRUCTURE DE LA CELLULE ---
                    cell.innerHTML = `
                        <div class="d-flex flex-column align-items-center position-relative">
                            
                            <div class="form-check form-check-inline availability-check">
                                <input class="form-check-input" type="checkbox" data-key="${scheduleKey}" 
                                       id="nd-${scheduleKey}" onchange="updateAvailability(event)"
                                       ${isNotAvailable ? 'checked' : ''}>
                                <label class="form-check-label fw-bold" for="nd-${scheduleKey}">N/D</label>
                            </div>

                            <select class="shift-select" data-key="${scheduleKey}" onchange="updateSchedule(event)"
                                    ${!isAdminMode ? 'disabled' : ''} style="min-width: 90px; margin-top: 5px;">
                                ${shifts.map(shift => `<option value="${shift}" ${shift === currentShift ? 'selected' : ''}>${shift}</option>`).join('')}
                            </select>
                            
                            <span class="shift-label" style="display: none;">${currentShift}</span>
                        </div>
                    `;
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


// --- INITIALISATION (MODIFIÉ) ---

document.addEventListener('DOMContentLoaded', () => {
    syncDataFromFirebase(); 
    
    // MODIFICATION ICI: Initialise la date de début au Dimanche de cette semaine
    const today = new Date();
    const currentSunday = getSundayOfWeek(today); // Trouve le Dimanche
    
    // Formate le Dimanche pour le champ input (YYYY-MM-DD)
    const year = currentSunday.getFullYear();
    const month = String(currentSunday.getMonth() + 1).padStart(2, '0');
    const day = String(currentSunday.getDate()).padStart(2, '0');
    
    document.getElementById('startDate').value = `${year}-${month}-${day}`;

    document.getElementById('adminPanel').style.display = 'none';
});
});