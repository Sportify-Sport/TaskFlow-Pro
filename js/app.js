let currentView = 'tasks';
let currentViewMode = 'list';

// Priority sorting order
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// Cache for tasks to avoid repeated fetch when toggling descriptions
window._allTasksMap = {};

// Chart instances (for admin dashboard)
let priorityChartInstance = null;
let activityChartInstance = null;
let activityWeekOffset = 0;

// ====================
// DOM References
// ====================
// Task view search/filter elements
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const priorityFilter = document.getElementById('priority-filter');
const sortOption = document.getElementById('sort-option');

// ====================
// Event Listeners for Task View Filters
// ====================
if (searchInput) {
    searchInput.addEventListener('input', loadTasks);
}
if (searchBtn) {
    searchBtn.addEventListener('click', loadTasks);
}
if (priorityFilter) {
    priorityFilter.addEventListener('change', loadTasks);
}
if (sortOption) {
    sortOption.addEventListener('change', loadTasks);
}

// ====================
// Initialization on Window Load
// ====================
window.addEventListener('load', async () => {
    if (await checkAuth()) {
        // Show main section and load tasks by default
        // If you have a showView for 'tasks', call it to set active nav and reset filters
        const tasksNavBtn = document.querySelector("button.nav-btn[onclick*=\"showView('tasks'\"]");
        if (tasksNavBtn) {
            showView('tasks', { target: tasksNavBtn });
        } else {
            loadTasks();
        }
    }
});

// ====================
// Navigation: Show View
// ====================
function showView(view, event) {
    // Hide all views
    document.querySelectorAll('.view').forEach(v => {
        v.style.display = 'none';
    });

    // Update nav buttons active class
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }

    currentView = view;

    // Show selected view
    const viewEl = document.getElementById(`${view}-view`);
    if (viewEl) {
        viewEl.style.display = 'block';
    }

    // Load view data
    if (view === 'tasks') {
        // Reset filters when clicking 'My Tasks'
        if (searchInput) searchInput.value = '';
        if (priorityFilter) priorityFilter.value = 'all';
        if (sortOption) sortOption.value = 'closest';
        // Optionally reset view mode to list:
        // currentViewMode = 'list';
        // document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        // const defaultViewBtn = document.querySelector(".view-btn[onclick*=\"setView('list'\"]");
        // if (defaultViewBtn) defaultViewBtn.classList.add('active');

        loadTasks();
    } else if (view === 'create') {
        // Nothing special needed here
    } else if (view === 'admin' && window.currentUser && window.currentUser.isAdmin) {
        loadAdminDashboard();
    }
}

// ====================
// API Call Helper
// ====================
async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('idToken');
    const response = await fetch(`${config.api.endpoint}${endpoint}`, {
        ...options,
        headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    if (!response.ok) {
        throw new Error(`API call failed: ${response.status}`);
    }
    return response.json();
}

// ====================
// Task Loading, Filtering, Sorting
// ====================
async function loadTasks() {
    try {
        const tasks = await apiCall('/tasks');
        // Cache tasks by ID for toggleDescription
        window._allTasksMap = {};
        tasks.forEach(task => {
            window._allTasksMap[task.taskId] = task;
        });

        const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';
        const selectedPriority = priorityFilter ? priorityFilter.value : 'all';
        const selectedSort = sortOption ? sortOption.value : 'closest';

        let filteredTasks = tasks.filter(task => {
            const titleMatch = task.title && task.title.toLowerCase().includes(searchQuery);
            const descriptionMatch = task.description && task.description.toLowerCase().includes(searchQuery);
            const dueDateMatch = task.dueDate && task.dueDate.includes(searchQuery);
            return titleMatch || descriptionMatch || dueDateMatch;
        });

        if (selectedPriority !== 'all') {
            filteredTasks = filteredTasks.filter(task => task.priority === selectedPriority);
        }

        // Sort by priority first (high -> low), then by due date according to selectedSort
        filteredTasks.sort((a, b) => {
            const pa = PRIORITY_ORDER[a.priority] ?? Number.MAX_SAFE_INTEGER;
            const pb = PRIORITY_ORDER[b.priority] ?? Number.MAX_SAFE_INTEGER;
            if (pa !== pb) {
                return pa - pb;
            }
            // Same priority: compare dueDate
            if (a.dueDate && b.dueDate) {
                if (selectedSort === 'closest') {
                    return a.dueDate < b.dueDate ? -1 : (a.dueDate > b.dueDate ? 1 : 0);
                } else {
                    return a.dueDate > b.dueDate ? -1 : (a.dueDate < b.dueDate ? 1 : 0);
                }
            } else if (a.dueDate) {
                return selectedSort === 'closest' ? -1 : 1;
            } else if (b.dueDate) {
                return selectedSort === 'closest' ? 1 : -1;
            } else {
                return 0;
            }
        });

        const tasksHtml = filteredTasks.map(task => {
            let descriptionHtml;
            const desc = task.description || '';
            if (desc.length > 200) {
                const truncated = desc.substring(0, 200) + '...';
                descriptionHtml = `
                    <p class="task-description truncated" id="description-${task.taskId}">${truncated}</p>
                    <button class="see-more-btn" onclick="toggleDescription(this, '${task.taskId}')" aria-expanded="false" aria-controls="description-${task.taskId}">See more</button>
                `;
            } else {
                descriptionHtml = `<p class="task-description">${desc || 'No description'}</p>`;
            }
            return `
                <div class="task-card ${task.priority}-priority" data-task-id="${task.taskId}">
                    <h3>${task.title}</h3>
                    ${descriptionHtml}
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                        <small>
                            Priority: ${task.priority} | 
                            Due: ${task.dueDate || 'No due date'} |
                            Status: ${task.status}
                        </small>
                        <button onclick="deleteTask('${task.taskId}')" class="btn-danger">Delete</button>
                    </div>
                </div>
            `;
        }).join('');

        const tasksListEl = document.getElementById('tasks-list');
        if (tasksListEl) {
            tasksListEl.innerHTML = tasksHtml || '<p>No tasks found.</p>';
        }
    } catch (error) {
        console.error('Error loading tasks:', error);
        const tasksListEl = document.getElementById('tasks-list');
        if (tasksListEl) {
            tasksListEl.innerHTML = '<p>Error loading tasks.</p>';
        }
    }
}

// ====================
// Toggle Full/Truncated Description
// ====================
function toggleDescription(button, taskId) {
    const task = window._allTasksMap && window._allTasksMap[taskId];
    if (!task) return;
    const taskCard = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
    if (!taskCard) return;
    const descriptionP = taskCard.querySelector('.task-description');
    if (!descriptionP) return;
    const fullDescription = task.description || '';
    if (descriptionP.classList.contains('truncated')) {
        descriptionP.textContent = fullDescription;
        descriptionP.classList.remove('truncated');
        button.textContent = 'See less';
        button.setAttribute('aria-expanded', 'true');
    } else {
        const truncated = fullDescription.substring(0, 200) + '...';
        descriptionP.textContent = truncated;
        descriptionP.classList.add('truncated');
        button.textContent = 'See more';
        button.setAttribute('aria-expanded', 'false');
    }
}

// ====================
// Change View Mode: List / Grid
// ====================
function setView(view, event) {
    currentViewMode = view;
    const tasksContainer = document.getElementById('tasks-list');
    if (tasksContainer) {
        tasksContainer.classList.remove('list-view', 'grid-view');
        tasksContainer.classList.add(`${view}-view`);
    }
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
}

// ====================
// Delete Task
// ====================
async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) {
        return;
    }
    try {
        await apiCall(`/tasks/${taskId}`, { method: 'DELETE' });
        loadTasks();
    } catch (error) {
        alert('Error deleting task');
        console.error('Error deleting task:', error);
    }
}

// ====================
// Task Creation Form Handler
// ====================
const taskFormEl = document.getElementById('task-form');
if (taskFormEl) {
    taskFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const taskData = {
            title: document.getElementById('task-title').value,
            description: document.getElementById('task-description').value,
            priority: document.getElementById('task-priority').value,
            dueDate: document.getElementById('task-due-date').value
        };
        try {
            await apiCall('/tasks', {
                method: 'POST',
                body: JSON.stringify(taskData)
            });
            alert('Task created successfully!');
            taskFormEl.reset();
            // Navigate to tasks view
            const tasksNavBtn = document.querySelector("button.nav-btn[onclick*=\"showView('tasks'\"]");
            if (tasksNavBtn) {
                showView('tasks', { target: tasksNavBtn });
            } else {
                loadTasks();
            }
        } catch (error) {
            console.error('Error creating task:', error);
        }
    });
}

// ====================
// Admin Dashboard Enhancements
// ====================

// Utility: format Date to YYYY-MM-DD
function formatDateYYYYMMDD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ------------- System Statistics + Priority Donut Chart -------------
function renderPrioritySection(stats) {
    const statsDiv = document.getElementById('stats');
    if (!statsDiv) return;
    // Original textual stats
    statsDiv.innerHTML = `
        <p>Total Tasks: ${stats.totalTasks}</p>
        <h4>Tasks by Status:</h4>
        ${Object.entries(stats.tasksByStatus || {}).map(([status, count]) => `<p>${status}: ${count}</p>`).join('')}
        <h4>Tasks by Priority:</h4>
        ${Object.entries(stats.tasksByPriority || {}).map(([priority, count]) => `<p>${priority}: ${count}</p>`).join('')}
    `;
    // Append donut chart container if not already present
    if (!document.getElementById('priorityChartContainer')) {
        const container = document.createElement('div');
        container.id = 'priorityChartContainer';
        container.className = 'chart-container';
        container.style.width = '300px';
        container.style.height = '300px';
        container.style.margin = '0 auto';
        container.style.position = 'relative';
        container.innerHTML = `
            <canvas id="priorityChart"></canvas>
            <div id="priorityChartCenterText" 
                 style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%);
                        font-size:1.1rem; font-weight:bold; pointer-events:none; text-align:center; white-space: pre-line;">
            </div>
        `;
        statsDiv.appendChild(container);
    }
    // Render donut chart
    const counts = [
        stats.tasksByPriority.high || 0,
        stats.tasksByPriority.medium || 0,
        stats.tasksByPriority.low || 0
    ];
    const total = counts.reduce((a, b) => a + b, 0);
    const centerDiv = document.getElementById('priorityChartCenterText');
    if (centerDiv) {
        centerDiv.textContent = `Total\n${total}`;
    }
    const ctx = document.getElementById('priorityChart').getContext('2d');
    if (priorityChartInstance) {
        priorityChartInstance.destroy();
    }
    priorityChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['High', 'Medium', 'Low'],
            datasets: [{
                data: counts,
                backgroundColor: ['#e53e3e', '#f39c12', '#48bb78'],
                borderWidth: 1
            }]
        },
        options: {
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const pct = total ? ((value / total) * 100).toFixed(1) : '0.0';
                            return `${label}: ${value} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ------------- Activity Chart from stats.recentTasks -------------
function setupActivitySection(stats) {
    const prevBtn = document.getElementById('activity-prev-week');
    const nextBtn = document.getElementById('activity-next-week');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            activityWeekOffset++;
            renderActivityChartFromRecentTasks(stats.recentTasks);
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (activityWeekOffset > 0) {
                activityWeekOffset--;
                renderActivityChartFromRecentTasks(stats.recentTasks);
            }
        });
    }
    activityWeekOffset = 0;
    renderActivityChartFromRecentTasks(stats.recentTasks);
}

function renderActivityChartFromRecentTasks(recentTasks) {
    const today = new Date();
    // Window: endDate = today - 7*offset days (including today)
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 7 * activityWeekOffset);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    const startStr = formatDateYYYYMMDD(startDate);
    const endStr = formatDateYYYYMMDD(endDate);
    // Update label
    const labelSpan = document.getElementById('activity-week-label');
    if (labelSpan) {
        labelSpan.textContent = `${startStr} → ${endStr}`;
    }
    // Disable Next Week if offset=0
    const nextBtn = document.getElementById('activity-next-week');
    if (nextBtn) {
        nextBtn.disabled = (activityWeekOffset === 0);
    }
    // Build labels array from startDate to endDate inclusive
    const labels = [];
    const tmp = new Date(startDate);
    while (tmp <= endDate) {
        labels.push(formatDateYYYYMMDD(tmp));
        tmp.setDate(tmp.getDate() + 1);
    }
    // Group recentTasks by date
    const countsMap = {};
    recentTasks.forEach(task => {
        if (!task.createdAt) return;
        const d = new Date(task.createdAt);
        const dateStr = formatDateYYYYMMDD(d);
        if (labels.includes(dateStr)) {
            countsMap[dateStr] = (countsMap[dateStr] || 0) + 1;
        }
    });
    const counts = labels.map(dStr => countsMap[dStr] || 0);
    // Render bar chart
    const ctx = document.getElementById('activityChart').getContext('2d');
    if (activityChartInstance) {
        activityChartInstance.destroy();
    }
    activityChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tasks Created',
                data: counts,
                backgroundColor: '#667eea'
            }]
        },
        options: {
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { maxRotation: 45, minRotation: 0 } },
                y: { beginAtZero: true, precision: 0 }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const v = context.parsed.y;
                            return `Created: ${v}`;
                        }
                    }
                }
            }
        }
    });
}

// ------------- All Tasks Section from stats.recentTasks -------------
function setupAllTasksSection(stats) {
    const allTasksList = stats.recentTasks || [];
    const searchInputAll = document.getElementById('all-tasks-search');
    // Initial render
    renderAllTasksList(allTasksList, '');
    if (searchInputAll) {
        searchInputAll.addEventListener('input', () => {
            const filterText = searchInputAll.value.trim().toLowerCase();
            renderAllTasksList(allTasksList, filterText);
        });
    }
}

function renderAllTasksList(tasks, filterText) {
    const container = document.getElementById('all-tasks-container');
    if (!container) return;
    let filtered = tasks;
    if (filterText) {
        filtered = tasks.filter(task => {
            const titleMatch = task.title && task.title.toLowerCase().includes(filterText);
            const emailMatch = task.userEmail && task.userEmail.toLowerCase().includes(filterText);
            let dateMatch = false;
            if (task.createdAt) {
                const d = new Date(task.createdAt);
                const dStr = formatDateYYYYMMDD(d);
                const localeStr = d.toLocaleDateString();
                dateMatch = dStr.includes(filterText) || localeStr.includes(filterText);
            }
            return titleMatch || emailMatch || dateMatch;
        });
    }
    if (filtered.length === 0) {
        container.innerHTML = '<p>No tasks found.</p>';
        return;
    }
    // Sort by createdAt descending
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const html = filtered.map(task => {
        const created = task.createdAt ? new Date(task.createdAt).toLocaleString() : '';
        const priorityBadge = task.priority ? `<span class="badge" style="background:${
            {
                high: '#e53e3e',
                medium: '#f39c12',
                low: '#48bb78'
            }[task.priority] || '#ccc'
        }; color:white; padding:2px 6px; border-radius:4px; font-size:0.8rem;">${task.priority}</span>` : '';
        const statusText = task.status ? ` | Status: ${task.status}` : '';
        return `
            <div class="task-card" data-task-id="${task.taskId}">
                <h4 style="margin-bottom:4px;">${task.title}</h4>
                <p style="margin:0;">User: ${task.userEmail}</p>
                <small>Created: ${created}${statusText}</small>
                <div style="margin-top:4px;">${priorityBadge}</div>
            </div>
        `;
    }).join('');
    container.innerHTML = html;
}

// ====================
// Load Admin Dashboard
// ====================
async function loadAdminDashboard() {
    if (!window.currentUser || !window.currentUser.isAdmin) return;
    try {
        const stats = await apiCall('/admin/analytics');
        // 1. System Statistics (textual + donut)
        renderPrioritySection(stats);
        // 2. Activity Chart
        setupActivitySection(stats);
        // 3. All Tasks Search & Scroll
        setupAllTasksSection(stats);
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        // Optionally show error messages in UI
    }
}

// ====================
// Add danger button style (for delete)
// ====================
const style = document.createElement('style');
style.textContent = `
    .btn-danger {
        background: #e53e3e;
        color: white;
        border: none;
        padding: 5px 15px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 14px;
    }
    .btn-danger:hover {
        background: #c53030;
    }
`;
document.head.appendChild(style);
