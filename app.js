// ==================== THEME MANAGEMENT ====================
(function initTheme() {
    const savedTheme = localStorage.getItem('credfolio_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
})();

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('credfolio_theme', newTheme);
    
    updateThemeToggleIcons(newTheme);
    
    if (state.token) {
        renderCertificates();
    }
}

function updateThemeToggleIcons(theme) {
    const iconName = theme === 'dark' ? 'sun' : 'moon';
    
    const dbToggle = document.getElementById('btn-dashboard-theme-toggle');
    if (dbToggle) {
        dbToggle.innerHTML = `<i data-lucide="${iconName}"></i>`;
    }
    
    const authToggle = document.getElementById('btn-auth-theme-toggle');
    if (authToggle) {
        authToggle.innerHTML = `<i data-lucide="${iconName}"></i>`;
    }
    
    if (window.lucide) {
        lucide.createIcons();
    }
}

// ==================== APP STATE ====================
let state = {
    token: null,
    username: null,
    certificates: [],
    categories: [], // Dynamic user categories
    currentCategoryFilter: 'all',
    searchQuery: '',
    sortBy: 'newest',
    
    // File upload temp storage
    uploadFile: null,
    editFile: null,
    
    // Inline renaming tracking
    renameCategoryId: null
};


// Default pre-seeded categories
const DEFAULT_CATEGORIES = [
    { id: "Education", name: "Education", icon: "graduation-cap" },
    { id: "Work", name: "Experience", icon: "briefcase" },
    { id: "Achievement", name: "Achievements", icon: "award" },
    { id: "Course", name: "Courses & Certs", icon: "scroll" }
];

// Available icons for custom sections
const AVAILABLE_ICONS = [
    'folder', 'graduation-cap', 'briefcase', 'award', 'scroll', 
    'book-open', 'code', 'file-text', 'globe', 'terminal', 
    'heart', 'star', 'cpu', 'database', 'users',
    'key', 'link', 'map', 'shield', 'check-square'
];

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventHandlers();
    setupDataProtection();
});

function initApp() {
    const currentTheme = localStorage.getItem('credfolio_theme') || 'light';
    updateThemeToggleIcons(currentTheme);
    
    // Always show login screen on app load
    showAuth();
    
    // Initialize Lucide icons
    lucide.createIcons();
}



// ==================== CATEGORIES STORAGE & HANDLING ====================
function loadCategories(username) {
    if (!username) return;
    const cached = localStorage.getItem(`credfolio_categories_${username}`);
    if (cached) {
        try {
            state.categories = JSON.parse(cached);
        } catch (e) {
            state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
        }
    } else {
        state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
        saveCategories();
    }
}

function saveCategories() {
    if (!state.username) return;
    localStorage.setItem(`credfolio_categories_${state.username}`, JSON.stringify(state.categories));
}

// ==================== PROFILE GENERATOR ====================
function renderProfile(username) {
    if (!username) return;
    
    const avatarEl = document.getElementById('profile-avatar');
    const initials = username.substring(0, 2).toUpperCase();
    avatarEl.textContent = initials;
    
    // Hashing username for a dynamic, beautiful avatar gradient color
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    avatarEl.style.background = `linear-gradient(135deg, hsl(${hue}, 70%, 52%) 0%, hsl(${(hue + 45) % 360}, 80%, 42%) 100%)`;
    
    document.getElementById('session-username').textContent = username;
}

// ==================== UI STATE SWITCHERS ====================
function showAuth() {
    document.getElementById('dashboard-container').classList.remove('active');
    document.getElementById('auth-container').classList.add('active');
    switchAuthView('register');
}

function showDashboard() {
    document.getElementById('auth-container').classList.remove('active');
    document.getElementById('dashboard-container').classList.add('active');
    
    // Load categories & render profile
    loadCategories(state.username);
    renderProfile(state.username);
    
    // Reset filters
    state.currentCategoryFilter = 'all';
    state.searchQuery = '';
    state.sortBy = 'newest';
    
    document.getElementById('search-input').value = '';
    document.getElementById('sort-select').value = 'newest';
    
    renderSidebarCategories();
    renderCategoryDropdowns();
    
    fetchCertificates();
}

function switchAuthView(viewName) {
    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    
    if (viewName === 'login') {
        registerView.classList.remove('active');
        loginView.classList.add('active');
    } else {
        loginView.classList.remove('active');
        registerView.classList.add('active');
    }
}

// ==================== SIDEBAR CATEGORIES RENDERING ====================
function renderSidebarCategories() {
    const container = document.getElementById('sidebar-categories');
    if (!container) return;
    
    container.innerHTML = '';
    
    // 1. Render "All Files" static tab
    const allWrapper = document.createElement('div');
    const isAllActive = state.currentCategoryFilter === 'all';
    allWrapper.className = `menu-item-container ${isAllActive ? 'active' : ''}`;
    allWrapper.innerHTML = `
        <button class="menu-item full-width" data-category="all">
            <i data-lucide="folder"></i>
            <span>All Files</span>
        </button>
    `;
    allWrapper.querySelector('.menu-item').addEventListener('click', () => setFilter('all'));
    container.appendChild(allWrapper);
    
    // 2. Render user custom categories
    state.categories.forEach(cat => {
        const catWrapper = document.createElement('div');
        const isCatActive = state.currentCategoryFilter === cat.id;
        const isRenameMode = state.renameCategoryId === cat.id;
        
        catWrapper.className = `menu-item-container ${isCatActive ? 'active' : ''}`;
        
        if (isRenameMode) {
            // Renaming mode inputs
            catWrapper.innerHTML = `
                <div class="menu-item" style="width: 100%; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="${cat.icon || 'folder'}"></i>
                    <input type="text" class="category-rename-input" id="rename-input-${cat.id}" value="${cat.name}" />
                    <div class="rename-actions">
                        <button class="btn-category-action btn-rename-confirm" title="Save"><i data-lucide="check"></i></button>
                        <button class="btn-category-action btn-rename-cancel" title="Cancel"><i data-lucide="x"></i></button>
                    </div>
                </div>
            `;
            
            const renameInput = catWrapper.querySelector('.category-rename-input');
            renameInput.focus();
            renameInput.select();
            
            // Events
            renameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') confirmRename(cat.id);
                if (e.key === 'Escape') cancelRename();
            });
            
            catWrapper.querySelector('.btn-rename-confirm').addEventListener('click', (e) => {
                e.stopPropagation();
                confirmRename(cat.id);
            });
            
            catWrapper.querySelector('.btn-rename-cancel').addEventListener('click', (e) => {
                e.stopPropagation();
                cancelRename();
            });
        } else {
            // Static view mode
            catWrapper.innerHTML = `
                <button class="menu-item" data-category="${cat.id}">
                    <i data-lucide="${cat.icon || 'folder'}"></i>
                    <span title="${cat.name}">${cat.name}</span>
                </button>
                <div class="category-actions">
                    <button class="btn-category-action edit" title="Rename"><i data-lucide="edit-2"></i></button>
                    <button class="btn-category-action delete" title="Delete"><i data-lucide="trash-2"></i></button>
                </div>
            `;
            
            catWrapper.querySelector('.menu-item').addEventListener('click', () => setFilter(cat.id));
            
            catWrapper.querySelector('.btn-category-action.edit').addEventListener('click', (e) => {
                e.stopPropagation();
                startRenameCategory(cat.id);
            });
            
            catWrapper.querySelector('.btn-category-action.delete').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteCategory(cat.id, cat.name);
            });
        }
        
        container.appendChild(catWrapper);
    });
    
    // Refresh icons
    lucide.createIcons();
}

function setFilter(categoryId) {
    state.currentCategoryFilter = categoryId;
    
    // Update active classes
    document.querySelectorAll('#sidebar-categories .menu-item-container').forEach(el => {
        el.classList.remove('active');
    });
    
    const activeBtn = document.querySelector(`#sidebar-categories [data-category="${categoryId}"]`);
    if (activeBtn) {
        activeBtn.closest('.menu-item-container').classList.add('active');
    }
    
    // Update title
    const titleEl = document.getElementById('current-view-title');
    if (categoryId === 'all') {
        titleEl.textContent = 'All Certificates';
    } else {
        const cat = state.categories.find(c => c.id === categoryId);
        titleEl.textContent = cat ? cat.name : 'Other';
    }
    
    renderCertificates();
}

// ==================== VAULT CLICK & PIN MODAL ====================
function handleVaultClick() {
    if (state.vaultUnlocked) {
        // Already unlocked — just navigate to vault
        setFilter('__vault__');
        return;
    }
    
    if (!state.vaultPinHash) {
        // First time — set a new PIN
        openPinModal('set');
    } else {
        // Unlock flow
        openPinModal('unlock');
    }
}

function openPinModal(mode) {
    state.vaultPinBuffer = '';
    state._pinMode = mode; // 'unlock' | 'set' | 'set-confirm'
    
    const modal = document.getElementById('pin-modal');
    const titleEl = document.getElementById('pin-modal-title');
    const subtitleEl = document.getElementById('pin-modal-subtitle');
    const lockIcon = document.getElementById('pin-lock-anim');
    
    if (mode === 'unlock') {
        titleEl.textContent = 'Secure Vault';
        subtitleEl.textContent = 'Enter your 4-digit PIN to unlock';
        lockIcon.classList.remove('unlocked');
    } else if (mode === 'set') {
        titleEl.textContent = 'Set Vault PIN';
        subtitleEl.textContent = 'Choose a 4-digit PIN for your vault';
        lockIcon.classList.remove('unlocked');
    } else if (mode === 'set-confirm') {
        titleEl.textContent = 'Confirm PIN';
        subtitleEl.textContent = 'Re-enter the same PIN to confirm';
        lockIcon.classList.remove('unlocked');
    }
    
    clearPinDots('pin-dots');
    clearPinError('pin-error');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePinModal() {
    const modal = document.getElementById('pin-modal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    state.vaultPinBuffer = '';
    state._pinNewBuffer = '';
}

function clearPinDots(dotsId) {
    for (let i = 0; i < 4; i++) {
        const dot = document.getElementById(`${dotsId.replace('-dots', '')}-dot-${i}`);
        if (dot) { dot.classList.remove('filled', 'error'); }
    }
}

function updatePinDots(dotsId, count) {
    const prefix = dotsId.replace('-dots', '');
    for (let i = 0; i < 4; i++) {
        const dot = document.getElementById(`${prefix}-dot-${i}`);
        if (dot) {
            dot.classList.toggle('filled', i < count);
            dot.classList.remove('error');
        }
    }
}


// ==================== INLINE CATEGORY RENAME ACTIONS ====================
function startRenameCategory(id) {
    state.renameCategoryId = id;
    renderSidebarCategories();
}

function cancelRename() {
    state.renameCategoryId = null;
    renderSidebarCategories();
}

function confirmRename(id) {
    const renameInput = document.getElementById(`rename-input-${id}`);
    if (!renameInput) return;
    
    const newName = renameInput.value.trim();
    if (!newName) {
        showToast('Name Required', 'Category name cannot be empty.', 'error');
        return;
    }
    
    const index = state.categories.findIndex(c => c.id === id);
    if (index !== -1) {
        const oldName = state.categories[index].name;
        state.categories[index].name = newName;
        saveCategories();
        
        showToast('Section Renamed', `Changed "${oldName}" to "${newName}".`, 'success');
        
        state.renameCategoryId = null;
        renderSidebarCategories();
        renderCategoryDropdowns();
        
        if (state.currentCategoryFilter === id) {
            document.getElementById('current-view-title').textContent = newName;
        }
        
        renderCertificates();
    }
}

// ==================== SECTION DELETION ====================
async function deleteCategory(id, name) {
    if (!confirm(`Are you sure you want to delete the section "${name}"?\nCertificates in this section will not be deleted but will default to the "Other" category.`)) {
        return;
    }
    
    // Remove from array
    state.categories = state.categories.filter(c => c.id !== id);
    saveCategories();
    
    showToast('Section Deleted', `"${name}" section has been removed.`, 'success');
    
    // Migrate certs in this category to "Other" locally
    const certs = getCerts(state.username);
    let migrated = 0;
    certs.forEach(cert => {
        if (cert.category === id) { cert.category = 'Other'; migrated++; }
    });
    if (migrated > 0) {
        saveCerts(state.username, certs);
        showToast('Updating Files', `Moved ${migrated} certificate(s) to "Other".`, 'info');
        await fetchCertificates();
    }
    
    // Reset selection if deleted category was selected
    if (state.currentCategoryFilter === id) {
        setFilter('all');
    } else {
        renderSidebarCategories();
        renderCategoryDropdowns();
        updateStatsDashboard();
        renderCertificates();
    }
}

// ==================== ADD SECTION MODAL ACTIONS ====================
function openAddSectionModal() {
    document.getElementById('new-section-name').value = '';
    document.getElementById('new-section-icon').value = 'folder';
    renderIconPicker();
    openModal(document.getElementById('add-section-modal'));
}

function renderIconPicker() {
    const grid = document.getElementById('icon-picker-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    const iconInput = document.getElementById('new-section-icon');
    const selectedIcon = iconInput.value || 'folder';
    
    AVAILABLE_ICONS.forEach(iconName => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `icon-option ${iconName === selectedIcon ? 'selected' : ''}`;
        btn.innerHTML = `<i data-lucide="${iconName}"></i>`;
        
        btn.addEventListener('click', () => {
            grid.querySelectorAll('.icon-option').forEach(el => el.classList.remove('selected'));
            btn.classList.add('selected');
            iconInput.value = iconName;
        });
        
        grid.appendChild(btn);
    });
    
    lucide.createIcons();
}

function handleAddSection(e) {
    e.preventDefault();
    const nameEl = document.getElementById('new-section-name');
    const iconEl = document.getElementById('new-section-icon');
    
    const name = nameEl.value.trim();
    const icon = iconEl.value;
    
    if (!name) {
        showToast('Input Required', 'Please enter a name for the new section.', 'error');
        return;
    }
    
    // Prevent duplicate name
    const exists = state.categories.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
        showToast('Duplicated Section', 'A section with this name already exists.', 'error');
        return;
    }
    
    const newId = 'category_' + Date.now();
    state.categories.push({ id: newId, name, icon });
    saveCategories();
    
    showToast('Section Created', `"${name}" section has been added to sidebar.`, 'success');
    closeModal(document.getElementById('add-section-modal'));
    
    renderSidebarCategories();
    renderCategoryDropdowns();
    updateStatsDashboard();
}

// ==================== CATEGORY DROPDOWNS POPULATION ====================
function renderCategoryDropdowns() {
    const uploadSelect = document.getElementById('upload-category');
    const editSelect = document.getElementById('edit-category');
    
    const htmlOptions = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('') + '<option value="Other">Other</option>';
    
    if (uploadSelect) uploadSelect.innerHTML = htmlOptions;
    if (editSelect) editSelect.innerHTML = htmlOptions;
}

// ==================== EVENT HANDLERS SETUP ====================
function setupEventHandlers() {
    // --- Theme Toggle ---
    const authThemeToggle = document.getElementById('btn-auth-theme-toggle');
    if (authThemeToggle) {
        authThemeToggle.addEventListener('click', toggleTheme);
    }
    const dashboardThemeToggle = document.getElementById('btn-dashboard-theme-toggle');
    if (dashboardThemeToggle) {
        dashboardThemeToggle.addEventListener('click', toggleTheme);
    }

    // --- Auth Switching ---
    document.getElementById('go-to-register').addEventListener('click', () => switchAuthView('register'));
    document.getElementById('go-to-login').addEventListener('click', () => switchAuthView('login'));
    
    // --- Forms Submit ---
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    
    // --- Logout ---
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    
    // --- Search, Sort ---
    document.getElementById('search-input').addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderCertificates();
    });
    
    document.getElementById('sort-select').addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        renderCertificates();
    });
    
    // --- Add Custom Section Modal ---
    document.getElementById('btn-add-section-trigger').addEventListener('click', openAddSectionModal);
    document.getElementById('btn-close-add-section').addEventListener('click', () => closeModal(document.getElementById('add-section-modal')));
    document.getElementById('btn-cancel-add-section').addEventListener('click', () => closeModal(document.getElementById('add-section-modal')));
    document.getElementById('add-section-form').addEventListener('submit', handleAddSection);
    
    // --- Modals Toggle ---
    const uploadModal = document.getElementById('upload-modal');
    const editModal = document.getElementById('edit-modal');
    const previewModal = document.getElementById('preview-modal');
    
    // Open Upload
    document.getElementById('btn-open-upload').addEventListener('click', () => openModal(uploadModal));
    document.getElementById('empty-state-upload-btn').addEventListener('click', () => openModal(uploadModal));
    
    // Close Upload
    document.getElementById('btn-close-upload').addEventListener('click', () => closeModal(uploadModal));
    document.getElementById('btn-cancel-upload').addEventListener('click', () => closeModal(uploadModal));
    
    // Close Edit
    document.getElementById('btn-close-edit').addEventListener('click', () => closeModal(editModal));
    document.getElementById('btn-cancel-edit').addEventListener('click', () => closeModal(editModal));
    
    // Close Preview
    document.getElementById('btn-close-preview').addEventListener('click', () => closeModal(previewModal));
    
    // Close on overlay click
    [uploadModal, editModal, previewModal, document.getElementById('add-section-modal')].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });
    
    // --- File Drag & Drop (Upload) ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0], 'upload'));
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        }, false);
    });
    
    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        handleFileSelection(file, 'upload');
    });
    
    document.getElementById('btn-remove-file').addEventListener('click', () => removeSelectedFile('upload'));
    
    // --- File Drag & Drop (Edit) ---
    const editDropZone = document.getElementById('edit-drop-zone');
    const editFileInput = document.getElementById('edit-file-input');
    
    editDropZone.addEventListener('click', () => editFileInput.click());
    editFileInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0], 'edit'));
    
    ['dragenter', 'dragover'].forEach(eventName => {
        editDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            editDropZone.classList.add('drag-over');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        editDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            editDropZone.classList.remove('drag-over');
        }, false);
    });
    
    editDropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        handleFileSelection(file, 'edit');
    });
    
    document.getElementById('btn-edit-remove-file').addEventListener('click', () => removeSelectedFile('edit'));
    
    // --- Form Submissions ---
    document.getElementById('upload-form').addEventListener('submit', handleUploadSubmit);
    document.getElementById('edit-form').addEventListener('submit', handleEditSubmit);
    
    // --- Backup & Restore ---
    document.getElementById('btn-backup').addEventListener('click', handleBackup);
    
    const restoreInput = document.getElementById('restore-file-input');
    document.getElementById('btn-trigger-restore').addEventListener('click', () => restoreInput.click());
    restoreInput.addEventListener('change', handleRestore);
    
}

// ==================== DATA PROTECTION ====================
function setupDataProtection() {
    // Warn before closing tab if unsaved changes are present
    window.addEventListener('beforeunload', (e) => {
        const isUploadOpen = document.getElementById('upload-modal').classList.contains('active');
        const isEditOpen = document.getElementById('edit-modal').classList.contains('active');
        const isUploadSaving = document.getElementById('btn-submit-upload').disabled && isUploadOpen;
        const isEditSaving = document.getElementById('btn-submit-edit').disabled && isEditOpen;
        
        // Check input field values if modals are open but not saving yet
        let hasUnsavedInputs = false;
        if (isUploadOpen) {
            const t = document.getElementById('upload-title').value;
            const d = document.getElementById('upload-description').value;
            if (t || d || state.uploadFile) hasUnsavedInputs = true;
        }
        if (isEditOpen) {
            const t = document.getElementById('edit-title').value;
            const d = document.getElementById('edit-description').value;
            if (t || d || state.editFile) hasUnsavedInputs = true;
        }
        
        if (isUploadSaving || isEditSaving || hasUnsavedInputs) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes or uploads in progress. Are you sure you want to close this page?';
            return e.returnValue;
        }
    });
    
    // Auto refresh data on page focus
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && state.token) {
            fetchCertificates();
        }
    });
}

// ==================== MODAL HELPERS ====================
function openModal(modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    
    // Clean up forms
    if (modal.id === 'upload-modal') {
        document.getElementById('upload-form').reset();
        removeSelectedFile('upload');
    } else if (modal.id === 'edit-modal') {
        document.getElementById('edit-form').reset();
        removeSelectedFile('edit');
    } else if (modal.id === 'preview-modal') {
        document.getElementById('preview-frame-container').innerHTML = '';
        document.getElementById('preview-frame-container').style.display = 'none';
        document.getElementById('preview-no-preview').style.display = 'none';
    }
}

// ==================== TOAST COMPONENT ====================
function showToast(title, message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-triangle';
    if (type === 'info') iconName = 'info';
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i data-lucide="${iconName}"></i>
        </div>
        <div class="toast-content">
            <h4>${title}</h4>
            <p>${message}</p>
        </div>
    `;
    
    container.appendChild(toast);
    lucide.createIcons({ props: { width: 16, height: 16 } });
    
    setTimeout(() => {
        toast.classList.add('toast-exit');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 4500);
}

// ==================== AUTH CONTROLLERS ====================
async function handleLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('btn-login');
    
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:8px;"></div> Signing In...';
    
    try {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        
        if (!username || !password) {
            showToast('Input Required', 'Please enter username and password.', 'error');
            return;
        }
        
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            state.token = data.token;
            state.username = data.username;
            
            showToast('Access Granted', `Welcome back, ${data.username}!`, 'success');
            showDashboard();
        } else {
            showToast('Authentication Failed', data.error || 'Invalid username or password.', 'error');
        }
    } catch (err) {
        showToast('Login Error', 'An unexpected error occurred.', 'error');
        console.error(err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        passwordInput.value = '';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('register-username');
    const passwordInput = document.getElementById('register-password');
    const confirmInput = document.getElementById('register-confirm-password');
    const submitBtn = document.getElementById('btn-register');
    
    if (passwordInput.value !== confirmInput.value) {
        showToast('Registration Error', 'Passwords do not match.', 'error');
        return;
    }
    
    if (passwordInput.value.length < 4) {
        showToast('Weak Password', 'Password must be at least 4 characters.', 'error');
        return;
    }
    
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:8px;"></div> Registering...';
    
    try {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        
        if (!username) {
            showToast('Input Required', 'Please enter a username.', 'error');
            return;
        }
        
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Account Created', 'Registration successful! You can now sign in.', 'success');
            switchAuthView('login');
            
            document.getElementById('login-username').value = username;
            document.getElementById('login-password').focus();
            document.getElementById('register-form').reset();
        } else {
            showToast('Registration Failed', data.error || 'Registration failed.', 'error');
        }
    } catch (err) {
        showToast('Registration Error', 'An unexpected error occurred.', 'error');
        console.error(err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

function handleLogout() {
    state.token = null;
    state.username = null;
    state.certificates = [];
    state.categories = [];
    
    showToast('Signed Out', 'You have been safely logged out.', 'info');
    showAuth();
}

// ==================== FILE HANDLING UTILITIES ====================
function handleFileSelection(file, context) {
    if (!file) return;
    
    const limit = 10 * 1024 * 1024;
    if (file.size > limit) {
        showToast('File Too Large', 'Maximum file size permitted is 10MB.', 'error');
        return;
    }
    
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    
    if (context === 'upload') {
        state.uploadFile = file;
        document.getElementById('drop-zone').style.display = 'none';
        
        const indicator = document.getElementById('file-preview-indicator');
        document.getElementById('preview-filename').textContent = file.name;
        document.getElementById('preview-filesize').textContent = `${sizeMB} MB`;
        indicator.classList.add('active');
    } else {
        state.editFile = file;
        document.getElementById('edit-drop-zone').style.display = 'none';
        
        const indicator = document.getElementById('edit-file-preview-indicator');
        document.getElementById('edit-preview-filename').textContent = file.name;
        document.getElementById('edit-preview-filesize').textContent = `${sizeMB} MB`;
        indicator.classList.add('active');
    }
}

function removeSelectedFile(context) {
    if (context === 'upload') {
        state.uploadFile = null;
        document.getElementById('file-input').value = '';
        document.getElementById('file-preview-indicator').classList.remove('active');
        document.getElementById('drop-zone').style.display = 'block';
    } else {
        state.editFile = null;
        document.getElementById('edit-file-input').value = '';
        document.getElementById('edit-file-preview-indicator').classList.remove('active');
        document.getElementById('edit-drop-zone').style.display = 'block';
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result;
            const base64 = result.substring(result.indexOf(',') + 1);
            resolve(base64);
        };
        reader.onerror = error => reject(error);
    });
}

function formatBytes(bytesString) {
    const bytes = parseInt(bytesString, 10);
    if (isNaN(bytes) || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ==================== DATA MANAGEMENT (API) ====================
async function fetchCertificates() {
    if (!state.username || !state.token) { handleLogout(); return; }
    try {
        const response = await fetch('/api/certificates', {
            headers: { 'Authorization': 'Bearer ' + state.token }
        });
        if (!response.ok) {
            if (response.status === 401) {
                handleLogout();
                return;
            }
            throw new Error('Failed to fetch');
        }
        state.certificates = await response.json();
        renderCertificates();
        updateStatsDashboard();
    } catch (err) {
        showToast('Load Error', 'Could not load certificates from server.', 'error');
        console.error(err);
    }
}

async function handleUploadSubmit(e) {
    e.preventDefault();
    if (!state.uploadFile) {
        showToast('Input Error', 'Please select a certificate file.', 'error');
        return;
    }
    
    const title = document.getElementById('upload-title').value.trim();
    const category = document.getElementById('upload-category').value;
    const description = document.getElementById('upload-description').value.trim();
    const notes = document.getElementById('upload-notes').value.trim();
    const submitBtn = document.getElementById('btn-submit-upload');
    
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:8px;"></div> Saving...';
    
    try {
        const base64Data = await fileToBase64(state.uploadFile);
        
        const payload = {
            title,
            description,
            category,
            notes,
            fileName: state.uploadFile.name,
            fileType: state.uploadFile.type,
            fileData: base64Data
        };
        
        const response = await fetch('/api/certificates', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + state.token
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Saved!', `"${title}" has been saved.`, 'success');
            closeModal(document.getElementById('upload-modal'));
            fetchCertificates();
        } else {
            showToast('Upload Error', data.error || 'Failed to upload.', 'error');
        }
    } catch (err) {
        showToast('Error', 'An error occurred while saving the certificate.', 'error');
        console.error(err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

async function handleEditSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const title = document.getElementById('edit-title').value.trim();
    const category = document.getElementById('edit-category').value;
    const description = document.getElementById('edit-description').value.trim();
    const notes = document.getElementById('edit-notes').value.trim();
    const submitBtn = document.getElementById('btn-submit-edit');
    
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:8px;"></div> Saving...';
    
    try {
        const payload = {
            id,
            title,
            category,
            description,
            notes
        };
        
        if (state.editFile) {
            const base64Data = await fileToBase64(state.editFile);
            payload.fileName = state.editFile.name;
            payload.fileType = state.editFile.type;
            payload.fileData = base64Data;
        }
        
        const response = await fetch('/api/certificates/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + state.token
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Changes Saved', `"${title}" updated successfully.`, 'success');
            closeModal(document.getElementById('edit-modal'));
            fetchCertificates();
        } else {
            showToast('Update Error', data.error || 'Failed to update.', 'error');
        }
    } catch (err) {
        showToast('Error', 'An error occurred during edit processing.', 'error');
        console.error(err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

async function deleteCertificate(id, title) {
    if (!confirm(`Are you absolutely sure you want to delete: "${title}"?\nThis operation is permanent.`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/certificates/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + state.token
            },
            body: JSON.stringify({ id })
        });
        
        if (response.ok) {
            showToast('Deleted', `"${title}" has been permanently removed.`, 'success');
            fetchCertificates();
        } else {
            const data = await response.json();
            showToast('Delete Error', data.error || 'Failed to delete certificate.', 'error');
        }
    } catch (err) {
        showToast('Error', 'Failed to delete certificate.', 'error');
        console.error(err);
    }
}

// ==================== BACKUP & RESTORE (PREVENT DATA LOSS) ====================
async function handleBackup() {
    const backupBtn = document.getElementById('btn-backup');
    const originalContent = backupBtn.innerHTML;
    
    backupBtn.disabled = true;
    backupBtn.innerHTML = '<i class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;"></i> Backup...';
    
    try {
        // Use in-memory certificates (already fetched from server, but no fileData)
        const backupData = {
            certificates: state.certificates,
            _credfolio_categories: state.categories
        };
        
        const jsonString = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const dateStr = new Date().toISOString().slice(0, 10);
        const link = document.createElement('a');
        link.href = url;
        link.download = `credfolio_backup_${state.username}_${dateStr}.json`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast('Backup Completed', 'Certificate metadata and category config exported.', 'success');
    } catch (err) {
        showToast('Backup Failed', err.message || 'Error occurred during packaging.', 'error');
        console.error(err);
    } finally {
        backupBtn.disabled = false;
        backupBtn.innerHTML = originalContent;
    }
}

async function handleRestore(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!confirm('Importing this backup will restore custom category configurations. Note: file data is not included in metadata backups.')) {
        e.target.value = '';
        return;
    }
    
    const restoreBtn = document.getElementById('btn-trigger-restore');
    const originalContent = restoreBtn.innerHTML;
    
    restoreBtn.disabled = true;
    restoreBtn.innerHTML = '<i class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;"></i> Importing...';
    
    try {
        const reader = new FileReader();
        reader.readAsText(file);
        reader.onload = async () => {
            try {
                const parsedData = JSON.parse(reader.result);
                
                // Recover category configuration if present in backup file
                if (parsedData && parsedData._credfolio_categories) {
                    state.categories = parsedData._credfolio_categories;
                    saveCategories();
                    renderSidebarCategories();
                    renderCategoryDropdowns();
                    updateStatsDashboard();
                    showToast('Restore Complete', 'Category configurations restored successfully.', 'success');
                } else {
                    showToast('Nothing to Restore', 'No category configuration found in this backup.', 'info');
                }
                
                fetchCertificates();
            } catch (innerErr) {
                showToast('Import Error', 'Corrupted or invalid JSON backup file.', 'error');
                console.error(innerErr);
            } finally {
                restoreBtn.disabled = false;
                restoreBtn.innerHTML = originalContent;
                e.target.value = '';
            }
        };
    } catch (err) {
        showToast('Read Error', 'Failed to read the local file.', 'error');
        restoreBtn.disabled = false;
        restoreBtn.innerHTML = originalContent;
        e.target.value = '';
        console.error(err);
    }
}

// ==================== RENDERING LOGIC ====================
function getFileTypeIcon(fileType) {
    if (!fileType) return 'file';
    if (fileType.includes('pdf')) return 'file-text';
    if (fileType.includes('image')) return 'image';
    return 'file';
}

// Hash a category display string dynamically to return structured, beautiful styles
function getCategoryColors(categoryId, categoryName) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    if (categoryId === 'Education') {
        return {
            accent: 'var(--accent-indigo)',
            bg: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)',
            text: isDark ? '#a5b4fc' : '#4f46e5',
            border: isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(99, 102, 241, 0.18)'
        };
    } else if (categoryId === 'Work') {
        return {
            accent: 'var(--accent-green)',
            bg: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.08)',
            text: isDark ? '#6ee7b7' : '#059669',
            border: isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.18)'
        };
    } else if (categoryId === 'Achievement') {
        return {
            accent: 'var(--accent-yellow)',
            bg: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.08)',
            text: isDark ? '#fde047' : '#b45309',
            border: isDark ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.18)'
        };
    } else if (categoryId === 'Course') {
        return {
            accent: '#ec4899',
            bg: isDark ? 'rgba(236, 72, 153, 0.15)' : 'rgba(236, 72, 153, 0.08)',
            text: isDark ? '#fbcfe8' : '#db2777',
            border: isDark ? 'rgba(236, 72, 153, 0.25)' : 'rgba(236, 72, 153, 0.18)'
        };
    } else if (categoryId === 'Other') {
        return {
            accent: 'var(--text-muted)',
            bg: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.04)',
            text: isDark ? '#e4e4e7' : '#3f3f46',
            border: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
        };
    }
    
    // Hash category string for custom user-created dynamic categories
    let hash = 0;
    const str = categoryId + (categoryName || '');
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    
    return {
        accent: `hsl(${hue}, 65%, 55%)`,
        bg: isDark ? `hsla(${hue}, 65%, 55%, 0.12)` : `hsla(${hue}, 65%, 55%, 0.08)`,
        text: isDark ? `hsl(${hue}, 80%, 75%)` : `hsl(${hue}, 75%, 35%)`,
        border: isDark ? `hsla(${hue}, 65%, 55%, 0.25)` : `hsla(${hue}, 65%, 55%, 0.18)`
    };
}

// ==================== SHARE LINK HANDLER ====================
async function handleShareLink(certId) {
    const cert = state.certificates.find(c => c.id === certId);
    if (!cert || !cert.shareToken) {
        showToast('Share Unavailable', 'This certificate does not have a share link yet. Try re-uploading it.', 'error');
        return;
    }
    
    const shareUrl = `${window.location.origin}/share/${cert.shareToken}`;
    
    try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link Copied!', 'Public share link copied to clipboard. Anyone with the link can view this certificate.', 'success');
    } catch (err) {
        // Fallback for older browsers
        const input = document.createElement('input');
        input.value = shareUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('Link Copied!', 'Share link copied to clipboard.', 'success');
    }
}

function renderCertificates() {
    const grid = document.getElementById('certificate-grid');
    const emptyState = document.getElementById('empty-state');
    
    // 1. Filter
    let filtered = [...state.certificates];
    
    if (state.currentCategoryFilter !== 'all') {
        filtered = filtered.filter(c => c.category === state.currentCategoryFilter);
    }
    
    if (state.searchQuery.trim() !== '') {
        const query = state.searchQuery.toLowerCase().trim();
        filtered = filtered.filter(c => 
            (c.title && c.title.toLowerCase().includes(query)) ||
            (c.description && c.description.toLowerCase().includes(query)) ||
            (c.fileName && c.fileName.toLowerCase().includes(query))
        );
    }
    
    // 2. Sort
    filtered.sort((a, b) => {
        if (state.sortBy === 'newest') {
            return new Date(b.uploadDate || 0) - new Date(a.uploadDate || 0);
        } else if (state.sortBy === 'oldest') {
            return new Date(a.uploadDate || 0) - new Date(b.uploadDate || 0);
        } else if (state.sortBy === 'alpha') {
            return (a.title || '').localeCompare(b.title || '');
        }
        return 0;
    });
    
    // Update count badge
    document.getElementById('result-count').textContent = `${filtered.length} file${filtered.length === 1 ? '' : 's'}`;
    
    // 3. Display
    grid.innerHTML = '';
    
    
    if (filtered.length === 0) {
        grid.classList.remove('active');
        emptyState.classList.add('active');
        
        if (state.searchQuery.trim() !== '') {
            emptyState.querySelector('h3').textContent = 'No matching certificates';
            emptyState.querySelector('p').textContent = 'Try adjusting your search terms or filters.';
        } else if (isVaultView) {
            emptyState.querySelector('h3').textContent = '🔒 Vault is Empty';
            emptyState.querySelector('p').textContent = 'Upload certificates and check "Add to Secure Vault" to keep them protected here.';
        } else {
            emptyState.querySelector('h3').textContent = 'No certificates found';
            emptyState.querySelector('p').textContent = 'Get started by uploading your first certificate, diploma, or letter of recommendation.';
        }
    } else {
        emptyState.classList.remove('active');
        grid.classList.add('active');
        
        filtered.forEach(cert => {
            const card = document.createElement('div');
            card.className = 'certificate-card';
            
            // Resolve category configuration
            const catObj = state.categories.find(c => c.id === cert.category) || 
                           (cert.category === 'Other' ? { id: 'Other', name: 'Other' } : { id: cert.category, name: cert.category });
            
            const catColor = getCategoryColors(catObj.id, catObj.name);
            const iconName = getFileTypeIcon(cert.fileType);
            const hasShareToken = cert.shareToken && cert.shareToken.length > 0;
            
            // Set custom properties for dynamic CSS styling of custom categories
            card.style.setProperty('--category-accent-color', catColor.accent);
            card.style.setProperty('--category-badge-bg', catColor.bg);
            card.style.setProperty('--category-badge-text', catColor.text);
            card.style.setProperty('--category-badge-border', catColor.border);
            
            card.innerHTML = `
                <div class="card-preview-zone" style="position:relative;">
                    <span class="card-category-badge">${catObj.name}</span>
                    <i data-lucide="${iconName}" class="doc-type-icon"></i>
                </div>
                <div class="card-content">
                    <h3 title="${cert.title}">${cert.title}</h3>
                    <p class="card-desc" title="${cert.description || 'No description provided.'}">
                        ${cert.description || '<em style="color:var(--text-muted);">No description provided.</em>'}
                    </p>
                    <div class="card-meta">
                        <span><i data-lucide="calendar"></i> ${cert.uploadDate || 'Unknown'}</span>
                        <span title="File: ${cert.fileName}"><i data-lucide="paperclip"></i> ${cert.fileName}</span>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn btn-primary btn-preview-action" data-id="${cert.id}">
                        <i data-lucide="eye"></i> View
                    </button>
                    <button class="btn btn-secondary btn-share-link" data-id="${cert.id}" title="Copy public share link">
                        <i data-lucide="link"></i> Share
                    </button>
                    <button class="btn btn-secondary btn-edit-action" data-id="${cert.id}">
                        <i data-lucide="edit-3"></i> Edit
                    </button>
                    <button class="btn btn-danger-outline btn-delete-action" data-id="${cert.id}" data-title="${cert.title}">
                        <i data-lucide="trash-2"></i> Delete
                    </button>
                </div>
            `;
            
            grid.appendChild(card);
        });
        
        lucide.createIcons();
        attachCardActionHandlers();
    }
}

function attachCardActionHandlers() {
    // View/Preview
    document.querySelectorAll('.btn-preview-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            openPreviewModal(id);
        });
    });
    
    // Share Link
    document.querySelectorAll('.btn-share-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            shareCertificate(id);
        });
    });
    
    // Edit
    document.querySelectorAll('.btn-edit-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            openEditModal(id);
        });
    });
    
    // Delete
    document.querySelectorAll('.btn-delete-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const title = e.currentTarget.getAttribute('data-title');
            deleteCertificate(id, title);
        });
    });
}

function updateStatsDashboard() {
    const totalCountEl = document.getElementById('stat-total-count');
    const totalSizeEl = document.getElementById('stat-total-size');
    const sectionsCountEl = document.getElementById('stat-sections-count');
    
    let count = 0;
    let totalBytes = 0;
    
    state.certificates.forEach(c => {
        count++;
        if (c.fileSize) {
            totalBytes += parseInt(c.fileSize, 10);
        }
    });
    
    totalCountEl.textContent = count;
    totalSizeEl.textContent = formatBytes(totalBytes);
    
    // Sections count
    sectionsCountEl.textContent = state.categories.length;
}

// ==================== PREVIEW CONTROLLER ====================
async function openPreviewModal(id) {
    const modal = document.getElementById('preview-modal');
    const loader = document.getElementById('preview-loader');
    const container = document.getElementById('preview-frame-container');
    const noPreview = document.getElementById('preview-no-preview');
    const titleEl = document.getElementById('preview-modal-title');
    const categoryEl = document.getElementById('preview-modal-category');
    const downloadBtn = document.getElementById('btn-preview-download');
    const previewNotesContainer = document.getElementById('preview-notes-container');
    const previewNotesContent = document.getElementById('preview-notes-content');
    
    const cert = state.certificates.find(c => c.id === id);
    if (!cert) return;
    
    const catObj = state.categories.find(c => c.id === cert.category) || { id: cert.category, name: cert.category };
    const catColor = getCategoryColors(catObj.id, catObj.name);
    
    titleEl.textContent = cert.title;
    categoryEl.textContent = catObj.name;
    categoryEl.className = 'category-badge';
    categoryEl.style.backgroundColor = catColor.bg;
    categoryEl.style.color = catColor.text;
    categoryEl.style.border = `1px solid ${catColor.border}`;
    
    // Show/hide notes section
    if (previewNotesContainer && previewNotesContent) {
        if (cert.notes && cert.notes.trim()) {
            previewNotesContent.textContent = cert.notes;
            previewNotesContainer.style.display = 'block';
        } else {
            previewNotesContainer.style.display = 'none';
        }
    }
    
    // Clear download button
    downloadBtn.removeAttribute('href');
    downloadBtn.removeAttribute('download');
    
    openModal(modal);
    
    loader.style.display = 'flex';
    container.style.display = 'none';
    noPreview.style.display = 'none';
    container.innerHTML = '';
    
    const type = cert.fileType || '';
    
    try {
        // Fetch file bytes from backend
        const response = await fetch(`/api/certificates/download?id=${encodeURIComponent(id)}`, {
            headers: { 'Authorization': 'Bearer ' + state.token }
        });
        
        if (!response.ok) {
            loader.style.display = 'none';
            noPreview.style.display = 'flex';
            return;
        }
        
        const blob = await response.blob();
        const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
        
        // Set up download button
        downloadBtn.href = dataUrl;
        downloadBtn.download = cert.fileName || 'certificate';
        
        if (type.includes('pdf')) {
            const iframe = document.createElement('iframe');
            iframe.src = dataUrl;
            iframe.onload = () => {
                loader.style.display = 'none';
                container.style.display = 'block';
            };
            container.appendChild(iframe);
            // Fallback if iframe doesn't fire onload quickly
            setTimeout(() => {
                if (loader.style.display !== 'none') {
                    loader.style.display = 'none';
                    container.style.display = 'block';
                }
            }, 1500);
        } else if (type.includes('image')) {
            const img = document.createElement('img');
            img.src = dataUrl;
            img.style.maxWidth = '100%';
            img.style.maxHeight = '70vh';
            img.style.objectFit = 'contain';
            img.onload = () => {
                loader.style.display = 'none';
                container.style.display = 'flex';
                container.style.alignItems = 'center';
                container.style.justifyContent = 'center';
            };
            img.onerror = () => {
                loader.style.display = 'none';
                noPreview.style.display = 'flex';
            };
            container.appendChild(img);
        } else {
            loader.style.display = 'none';
            noPreview.style.display = 'flex';
        }
    } catch (err) {
        loader.style.display = 'none';
        noPreview.style.display = 'flex';
        console.error(err);
    }
}

// ==================== EDIT CONTROLLER ====================
function openEditModal(id) {
    const cert = state.certificates.find(c => c.id === id);
    if (!cert) return;
    
    document.getElementById('edit-id').value = cert.id;
    document.getElementById('edit-title').value = cert.title;
    document.getElementById('edit-category').value = cert.category;
    document.getElementById('edit-description').value = cert.description || '';
    document.getElementById('edit-notes').value = cert.notes || '';
    
    removeSelectedFile('edit');
    openModal(document.getElementById('edit-modal'));
}

// ==================== NOTEBOOK & SHARING ====================
document.addEventListener('DOMContentLoaded', () => {
    // Notebook Setup
    const notebookModal = document.getElementById('notebook-modal');
    const btnOpenNotebook = document.getElementById('btn-notebook-trigger');
    const btnCloseNotebook = document.getElementById('btn-close-notebook');
    const btnSaveNotebook = document.getElementById('btn-save-notebook');
    const btnDeleteNotebook = document.getElementById('btn-delete-notebook');
    const notebookTextarea = document.getElementById('notebook-textarea');
    const notebookSelect = document.getElementById('notebook-select');
    
    // Load custom notebook options
    function loadCustomNotebookOptions() {
        if (!state.username || !notebookSelect) return;
        const customNotebooks = JSON.parse(localStorage.getItem(`credfolio_notebooks_list_${state.username}`) || '[]');
        
        // Remove existing custom options to prevent duplicates
        Array.from(notebookSelect.options).forEach(opt => {
            if (opt.getAttribute('data-custom')) {
                notebookSelect.removeChild(opt);
            }
        });
        
        customNotebooks.forEach(notebook => {
            const opt = document.createElement('option');
            opt.value = notebook.id;
            opt.textContent = notebook.name;
            opt.setAttribute('data-custom', 'true');
            // Insert before the divider
            notebookSelect.insertBefore(opt, notebookSelect.options[notebookSelect.options.length - 2]);
        });
    }

    function updateDeleteButtonVisibility(notebookKey) {
        if (!btnDeleteNotebook || !notebookSelect) return;
        const selectedOption = notebookSelect.options[notebookSelect.selectedIndex];
        if (selectedOption && selectedOption.getAttribute('data-custom')) {
            btnDeleteNotebook.style.display = 'inline-flex';
        } else {
            btnDeleteNotebook.style.display = 'none';
        }
    }

    function loadNotebookContent(notebookKey) {
        if (!state.username) return;
        const savedNotes = localStorage.getItem(`credfolio_notebook_${state.username}_${notebookKey}`) || '';
        notebookTextarea.value = savedNotes;
        updateDeleteButtonVisibility(notebookKey);
    }

    if (notebookSelect) {
        notebookSelect.addEventListener('change', (e) => {
            if (e.target.value === 'create_new') {
                const newName = prompt("Enter a name for your new notebook:");
                if (newName && newName.trim()) {
                    const id = 'custom_' + Date.now();
                    const customNotebooks = JSON.parse(localStorage.getItem(`credfolio_notebooks_list_${state.username}`) || '[]');
                    customNotebooks.push({ id, name: newName.trim() });
                    localStorage.setItem(`credfolio_notebooks_list_${state.username}`, JSON.stringify(customNotebooks));
                    
                    loadCustomNotebookOptions();
                    notebookSelect.value = id;
                    loadNotebookContent(id);
                } else {
                    // Revert to default if cancelled
                    notebookSelect.value = 'default';
                    loadNotebookContent('default');
                }
            } else {
                loadNotebookContent(e.target.value);
            }
        });
    }

    if (btnDeleteNotebook) {
        btnDeleteNotebook.addEventListener('click', () => {
            const currentNotebook = notebookSelect ? notebookSelect.value : null;
            if (!currentNotebook || !currentNotebook.startsWith('custom_')) return;
            
            if (confirm("Are you sure you want to delete this custom notebook? All notes inside will be lost.")) {
                // Remove from list
                let customNotebooks = JSON.parse(localStorage.getItem(`credfolio_notebooks_list_${state.username}`) || '[]');
                customNotebooks = customNotebooks.filter(n => n.id !== currentNotebook);
                localStorage.setItem(`credfolio_notebooks_list_${state.username}`, JSON.stringify(customNotebooks));
                
                // Remove data
                localStorage.removeItem(`credfolio_notebook_${state.username}_${currentNotebook}`);
                
                showToast('Notebook deleted.', 'success');
                loadCustomNotebookOptions();
                notebookSelect.value = 'default';
                loadNotebookContent('default');
            }
        });
    }

    if (btnOpenNotebook) {
        btnOpenNotebook.addEventListener('click', () => {
            loadCustomNotebookOptions();
            loadNotebookContent(notebookSelect ? notebookSelect.value : 'default');
            openModal(notebookModal);
        });
    }

    if (btnCloseNotebook) {
        btnCloseNotebook.addEventListener('click', () => closeModal(notebookModal));
    }

    if (btnSaveNotebook) {
        btnSaveNotebook.addEventListener('click', () => {
            if (!state.username) return;
            const currentNotebook = notebookSelect ? notebookSelect.value : 'default';
            localStorage.setItem(`credfolio_notebook_${state.username}_${currentNotebook}`, notebookTextarea.value);
            showToast('Notes saved successfully securely!', 'success');
            closeModal(notebookModal);
        });
    }
});

// Share functionality
function shareCertificate(id) {
    const cert = state.certificates.find(c => c.id === id);
    if (!cert) return;
    
    // Generate a mock public link
    const mockUrl = `${window.location.origin}/shared?id=${id}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(mockUrl).then(() => {
        showToast('Public link copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy link: ', err);
        showToast('Failed to copy link', 'error');
    });
}
