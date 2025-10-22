// --- DÉCLARATION DES VARIABLES GLOBALES ET DONNÉES DE BASE ---
const DEPARTMENTS = ["Accueil", "Départs", "Terrain", "Carts"];
const ADMIN_PASSWORD = '1000'; 
let isAdminMode = false;
let currentDisplayFilter = 'all'; 

// Ces variables sont mises à jour par les écouteurs Firebase
let employees = [];
// Shifts spéciaux (Congé, Maladie) qui ne sont PAS des heures précises.
const SPECIAL_SHIFTS = ["------", "Congé", "Maladie", "Fermé"]; 
let scheduleData = {}; 


// --- FONCTION UTILITAIRE : GÉNÉRATION DES HEURES (30 min) ---

/**
 * Génère un tableau d'options d'heures par intervalles de 30 minutes, 
 * de "00:00" à "24:00" (pour la fin de quart).
 * @returns {string[]} Tableau des heures.
 */
function generateTimeOptions() {
    const options = ["------"];
    // Génère les heures de 00:00 à 23:30
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) {
            const hour = String(h).padStart(2, '0');
            const minute = String(m).padStart(2, '0');
            options.push(`${hour}:${minute}`);
        }
    }
    // Ajoute 24:00 (minuit le jour suivant) pour la fin de quart
    options.push("24:00");
    return options;
}

const TIME_OPTIONS = generateTimeOptions();


// --- FONCTIONS DE SAUVEGARDE ET DE LECTURE (FIREBASE) ---

function saveEmployees() {
    db.ref('employees').set(employees);
}

function saveSchedule() {
    db.ref('scheduleData').set(scheduleData);
}

function syncDataFromFirebase() {
    // Écoute des changements d'employés
    db.ref('employees').on('value', (snapshot) => {
        employees = snapshot.val() || [];
        renderAdminLists();
        generateSchedule(); 
    });

    // Écoute des changements d'horaire
    db.ref('scheduleData').on('value', (snapshot) => {
        scheduleData = snapshot.val() || {};
        generateSchedule(); 
    });
}

// --- FONCTIONS D'AUTHENTIFICATION ---
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


// --- GESTION DES EMPLOYÉS (ADMIN) ---

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

function renderAdminLists() {
    // Affiche la liste des employés par département dans le panneau admin.
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


// --- LOGIQUE DE SAISIE DOUBLE MENU ---

/**
 * Met à jour l'horaire pour une case donnée en utilisant les valeurs de début et de fin,
 * ou en utilisant une option spéciale (Congé, Maladie).
 * @param {string} scheduleKey - Clé unique de l'horaire (empId-dateKey).
 * @param {string} type - 'start' ou 'end' (pour déterminer quel menu a changé).
 * @param {Event} event - L'événement de changement.
 */
function updateShiftTime(scheduleKey, type, event) {
    const container = event.target.closest('td');
    const startTimeSelect = container.querySelector('.start-time');
    const endTimeSelect = container.querySelector('.end-time');
    
    let startValue = startTimeSelect.value;
    let endValue = endTimeSelect.value;
    
    let shiftToSave = null;

    // Si le menu de Début est une option spéciale (Congé, Maladie, etc.)
    if (SPECIAL_SHIFTS.includes(startValue) && startValue !== "------") {
        shiftToSave = startValue;
        
        // On force le menu de Fin à "------" pour éviter la confusion
        if (endTimeSelect.value !== "------") {