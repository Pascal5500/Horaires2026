// --- DÉCLARATION DES VARIABLES GLOBALES ET DONNÉES DE BASE ---
const DEPARTMENTS = ["Accueil", "Départs", "Terrain", "Carts"];
const ADMIN_PASSWORD = '1000'; 
let isAdminMode = false;
let currentDisplayFilter = 'all'; 

// Initialisation des données depuis le LocalStorage
let employees = JSON.parse(localStorage.getItem('employees')) || [];
// MODIFICATION 1 : Assurer que "------" est toujours la première option
let storedShifts = JSON.parse(localStorage.getItem('shifts')) || ['8h-16h', '16h-24h', 'Congé', 'Fermé'];
let shifts = ["------"]; // La valeur par défaut est toujours en premier
storedShifts.forEach(shift => {
    if (shift !== "------" && !shifts.includes(shift)) {
        shifts.push(shift);
    }
});

let scheduleData = JSON.parse(localStorage.getItem('scheduleData')) || {}; 

// --- FONCTIONS UTILITAIRES DE SAUVEGARDE ---

function saveData() {
    // Lors de la sauvegarde, nous sauvegardons toutes les options sauf la première ("------")
    const shiftsToSave = shifts.filter(s => s !== "------");
    localStorage.setItem('employees', JSON.stringify(employees));
    localStorage.setItem('shifts', JSON.stringify(shiftsToSave));
    localStorage.setItem('scheduleData', JSON.stringify(scheduleData));
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
        saveData();
        renderAdminLists(); 
        generateSchedule(); 
    }
}

function removeEmployee(id) {
    employees = employees.filter(emp => emp.id !== Number(id)); 
    // Mettre à jour scheduleData pour retirer les entrées de l'employé supprimé
    Object.keys(scheduleData).forEach(key => {
        if (key.startsWith(`${id}-`)) {
            delete scheduleData[key];
        }
    });
    saveData();
    renderAdminLists();
    generateSchedule();
}

function addShift() {
    const shiftInput = document.getElementById('newShift');
    const newShift = shiftInput.value.trim();

    // S'assurer que le nouveau shift n'est pas déjà présent et n'est pas la valeur par défaut
    if (newShift && newShift !== "------" && !shifts.includes(newShift)) {
        shifts.push(newShift);
        shiftInput.value = '';
        saveData();
        renderAdminLists(); 
        generateSchedule(); 
    }
}

function removeShift(shift) {
    shifts = shifts.filter(s => s !== shift);
    saveData();
    renderAdminLists();
    generateSchedule();
}

function renderAdminLists() {
    // Liste des plages horaires
    const shiftsList = document.getElementById('shiftsList');
    shiftsList.innerHTML = '';
    
    // On affiche toutes les options SAUF la valeur par défaut pour l'administration
    shifts.filter(s => s !== "------").forEach(shift => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        const safeShift = shift.replace(/'/g, "\\'"); 
        li.innerHTML = `${shift} <button class="btn btn-sm btn-danger" onclick="removeShift('${safeShift}')">X</button>`;
        shiftsList.appendChild(li);
    });

    // Listes des employés par département (inchangées)
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

function updateSchedule(event) {
    const select = event.target;
    const key = select.getAttribute('data-key');
    const value = select.value;
    
    // Si la valeur est "------", on supprime l'entrée pour garder le stockage propre
    if (value === "------") {
        delete scheduleData[key];
    } else {
        scheduleData[key] = value;
    }
    
    select.parentElement.setAttribute('data-shift', value); 
    saveData();
}

function generateSchedule() {
    const startDateInput = document.getElementById('startDate').value;
    if (!startDateInput) return;

    const dates = getDates(startDateInput); 
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody'); 

    // 1. Générer l'en-tête du tableau (7 jours)
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
            // Ligne du département 
            const deptRow = tableBody.insertRow(currentRow++);
            deptRow.className = 'table-secondary fw-bold dept-header-row';
            deptRow.setAttribute('data-dept', dept); 
            deptRow.innerHTML = `<td colspan="${8}">${dept}</td>`; 
            
            // Lignes des employés
            deptEmployees.forEach(emp => {
                const row = tableBody.insertRow(currentRow++);
                row.className = 'employee-row'; 
                row.setAttribute('data-dept', dept);
                row.innerHTML = `<td>${emp.name}</td>`; 

                dates.forEach(date => {
                    const dateKey = date.toISOString().split('T')[0];
                    const cell = row.insertCell();
                    
                    const scheduleKey = `${emp.id}-${dateKey}`;
                    
                    // MODIFICATION 2 : La valeur par défaut est désormais "------"
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
    
    // Applique le filtre d'affichage après la génération
    applyDisplayFilter(currentDisplayFilter);
}

// --- LOGIQUE DE FILTRAGE PAR BOUTON (inchangée) ---

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


// --- FONCTIONS D'EXPORTATION ET D'IMPRESSION (inchangées) ---

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

// --- INITIALISATION ---

document.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('startDate').value = today;

    document.getElementById('adminPanel').style.display = 'none';

    renderAdminLists();
    generateSchedule(); 
});