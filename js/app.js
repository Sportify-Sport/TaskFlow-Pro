let currentView = 'tasks';
let currentViewMode = 'list';

// DOM references for search and filter elements
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const priorityFilter = document.getElementById('priority-filter');
const sortOption = document.getElementById('sort-option');
// At top of loadTasks (or in a scope accessible to it):
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// Event listeners for dynamic updates
searchInput.addEventListener('input', loadTasks);
searchBtn.addEventListener('click', loadTasks);
priorityFilter.addEventListener('change', loadTasks);
sortOption.addEventListener('change', loadTasks);

function formatDateYYYYMMDD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Initialize app
window.addEventListener('load', async () => {
    if (await checkAuth()) {
        loadTasks();
    }
});

function showView(view) {
    // Hide all views
    document.querySelectorAll('.view').forEach(v => {
        v.style.display = 'none';
    });
    
    // Show selected view
    document.getElementById(`${view}-view`).style.display = 'block';
    
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    currentView = view;
    
    // Load view data
    if (view === 'tasks') {
        loadTasks();
    } else if (view === 'admin' && currentUser.isAdmin) {
        loadAdminDashboard();
    }
}

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

async function loadTasks() {
    const tasks = await apiCall('/tasks');
    const searchQuery = searchInput.value.toLowerCase();
    const selectedPriority = priorityFilter.value;
    const selectedSort = sortOption.value;

    // Filter based on search text
    let filteredTasks = tasks.filter(task => {
        const titleMatch = task.title.toLowerCase().includes(searchQuery);
        const descriptionMatch = (task.description || '').toLowerCase().includes(searchQuery);
        const dueDateMatch = task.dueDate ? task.dueDate.includes(searchQuery) : false;
        return titleMatch || descriptionMatch || dueDateMatch;
    });

    // Filter by selected priority if not 'all'
    if (selectedPriority !== 'all') {
        filteredTasks = filteredTasks.filter(task => task.priority === selectedPriority);
    }

    // Sort by priority first (high → medium → low), then by due date if present
    filteredTasks.sort((a, b) => {
        // 1. Compare priority
        const pa = PRIORITY_ORDER[a.priority] ?? Number.MAX_SAFE_INTEGER;
        const pb = PRIORITY_ORDER[b.priority] ?? Number.MAX_SAFE_INTEGER;
        if (pa !== pb) {
            return pa - pb;
        }
        // 2. Same priority: compare due date based on selectedSort
        if (a.dueDate && b.dueDate) {
            if (selectedSort === 'closest') {
                // earlier date first
                return a.dueDate < b.dueDate ? -1 : (a.dueDate > b.dueDate ? 1 : 0);
            } else {
                // farthest first
                return a.dueDate > b.dueDate ? -1 : (a.dueDate < b.dueDate ? 1 : 0);
            }
        } else if (a.dueDate) {
            // if only a has due date: for closest-first, put a first; for farthest-first, put b first
            return selectedSort === 'closest' ? -1 : 1;
        } else if (b.dueDate) {
            return selectedSort === 'closest' ? 1 : -1;
        } else {
            return 0;
        }
    });

    // Build HTML for tasks
    const tasksHtml = filteredTasks.map(task => {
        let descriptionHtml;
        if (task.description && task.description.length > 200) {
            const truncated = task.description.substring(0, 200) + '...';
            descriptionHtml = `
                <p class="task-description truncated" id="description-${task.taskId}">${truncated}</p>
                <button class="see-more-btn" onclick="toggleDescription(this, '${task.taskId}')" aria-expanded="false" aria-controls="description-${task.taskId}">See more</button>
            `;
        } else {
            // Use the same class so wrapping applies
            descriptionHtml = `<p class="task-description">${task.description || 'No description'}</p>`;
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

    document.getElementById('tasks-list').innerHTML = tasksHtml || '<p>No tasks found.</p>';
}


async function toggleDescription(button, taskId) {
    const tasks = await apiCall('/tasks');
    const taskCard = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
    const descriptionP = taskCard.querySelector('.task-description');
    const fullDescription = tasks.find(task => task.taskId === taskId).description;
    if (descriptionP.classList.contains('truncated')) {
        descriptionP.textContent = fullDescription;
        descriptionP.classList.remove('truncated');
        button.textContent = 'See less';
        button.setAttribute('aria-expanded', 'true');
    } else {
        descriptionP.textContent = fullDescription.substring(0, 200) + '...';
        descriptionP.classList.add('truncated');
        button.textContent = 'See more';
        button.setAttribute('aria-expanded', 'false');
    }
}

function setView(view) {
    currentViewMode = view;
    const tasksContainer = document.getElementById('tasks-list');
    tasksContainer.classList.remove('list-view', 'grid-view');
    tasksContainer.classList.add(`${view}-view`);
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
}

async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) {
        return;
    }
    
    try {
        await apiCall(`/tasks/${taskId}`, { method: 'DELETE' });
        loadTasks();
    } catch (error) {
        alert('Error deleting task');
    }
}

// Task form handler
document.getElementById('task-form')?.addEventListener('submit', async (e) => {
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
        document.getElementById('task-form').reset();
        showView('tasks');
    } catch (error) {
        //alert('Error creating task');
        console.error(error);
    }
});

async function loadAdminDashboard() {
    if (!currentUser.isAdmin) return;
    try {
        // 1. Fetch main analytics
        const stats = await apiCall('/admin/analytics');
        // 2. Render priority donut
        renderPriorityChart(stats);
        // 3. Setup activity chart controls (which triggers initial fetch & render)
        setupActivityControls();
        // 4. Setup All Tasks section (fetch & render)
        setupAllTasksSection();
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        // Optionally display error UI in each section
    }
}

let priorityChartInstance = null;

function renderPriorityChart(stats) {
    // stats.tasksByPriority expected: { high: N1, medium: N2, low: N3 }
    const counts = [
        stats.tasksByPriority.high || 0,
        stats.tasksByPriority.medium || 0,
        stats.tasksByPriority.low || 0
    ];
    const total = counts.reduce((a, b) => a + b, 0);
    // Update center text
    const centerDiv = document.getElementById('priorityChartCenterText');
    if (centerDiv) {
        centerDiv.textContent = `Total\n${total}`;
    }
    const ctx = document.getElementById('priorityChart').getContext('2d');
    // If existing chart, destroy first
    if (priorityChartInstance) {
        priorityChartInstance.destroy();
    }
    priorityChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['High', 'Medium', 'Low'],
            datasets: [{
                data: counts,
                backgroundColor: [
                    '#e53e3e', // high (red)
                    '#f39c12', // medium (orange)
                    '#48bb78'  // low (green)
                ],
                borderWidth: 1
            }]
        },
        options: {
            maintainAspectRatio: false,
            cutout: '60%', // make donut hole large enough to show text
            plugins: {
                legend: {
                    position: 'bottom'
                },
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

    // Optionally also show textual breakdown under chart
    const textualDiv = document.getElementById('stats-textual');
    if (textualDiv) {
        textualDiv.innerHTML = `
            <p>High: ${counts[0]}</p>
            <p>Medium: ${counts[1]}</p>
            <p>Low: ${counts[2]}</p>
        `;
    }
}

let activityChartInstance = null;
let activityWeekOffset = 0; // 0 = last 7 days (including today?), 1 = previous week, etc.

function setupActivityControls() {
    const prevBtn = document.getElementById('activity-prev-week');
    const nextBtn = document.getElementById('activity-next-week');
    const labelSpan = document.getElementById('activity-week-label');

    if (!prevBtn || !nextBtn || !labelSpan) return;

    prevBtn.addEventListener('click', () => {
        activityWeekOffset++;
        fetchAndRenderActivity();
    });
    nextBtn.addEventListener('click', () => {
        if (activityWeekOffset > 0) {
            activityWeekOffset--;
            fetchAndRenderActivity();
        }
    });
    // Initial fetch:
    fetchAndRenderActivity();
}

function fetchAndRenderActivity() {
    // Compute date range for the week at offset activityWeekOffset.
    // Define "last week by default" as: from 7 days ago (inclusive) up to yesterday (inclusive).
    // If offset=0: e.g. if today is 2025-06-17, then last week = 2025-06-10 to 2025-06-16.
    // If offset=1: previous: 2025-06-03 to 2025-06-09, etc.
    const today = new Date();
    // We define endDate as yesterday:
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 1 - 7 * activityWeekOffset);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    const startStr = formatDateYYYYMMDD(startDate);
    const endStr = formatDateYYYYMMDD(endDate);

    // Update label
    const labelSpan = document.getElementById('activity-week-label');
    if (labelSpan) {
        labelSpan.textContent = `${startStr} → ${endStr}`;
    }
    // Enable/disable nextBtn if at offset 0
    const nextBtn = document.getElementById('activity-next-week');
    if (nextBtn) {
        nextBtn.disabled = (activityWeekOffset === 0);
    }

    // Fetch data from backend: assume endpoint `/admin/activity?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
    apiCall(`/admin/activity?startDate=${startStr}&endDate=${endStr}`)
        .then(data => {
            // data: array of { date: 'YYYY-MM-DD', count: N }. Ensure includes all days in range.
            // Build arrays for labels and counts in chronological order.
            const labels = [];
            const counts = [];
            const dateMap = {};
            data.forEach(item => {
                dateMap[item.date] = item.count;
            });
            // Iterate from startDate to endDate inclusive:
            const cur = new Date(startDate);
            while (cur <= endDate) {
                const dStr = formatDateYYYYMMDD(cur);
                labels.push(dStr);
                counts.push(dateMap[dStr] || 0);
                cur.setDate(cur.getDate() + 1);
            }
            renderActivityChart(labels, counts);
        })
        .catch(err => {
            console.error('Error fetching activity data:', err);
            // Optionally clear chart or show message
        });
}

function renderActivityChart(labels, counts) {
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
                backgroundColor: '#667eea' // default Chart.js color, or let default
            }]
        },
        options: {
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 0
                    }
                },
                y: {
                    beginAtZero: true,
                    precision: 0
                }
            },
            plugins: {
                legend: {
                    display: false
                },
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

let allTasksList = []; // to store fetched tasks

function setupAllTasksSection() {
    const searchInput = document.getElementById('all-tasks-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderAllTasksList(allTasksList, searchInput.value.trim().toLowerCase());
        });
    }
    // Initial fetch
    fetchAllTasks();
}

async function fetchAllTasks() {
    try {
        // Adjust endpoint as per your backend
        const tasks = await apiCall('/admin/all-tasks');
        // Expect tasks: array of objects: { taskId, title, userEmail, createdAt, ... }
        // Sort if desired, e.g. by createdAt descending:
        tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        allTasksList = tasks;
        renderAllTasksList(allTasksList, (document.getElementById('all-tasks-search')?.value || '').trim().toLowerCase());
    } catch (err) {
        console.error('Error fetching all tasks:', err);
        const container = document.getElementById('all-tasks-container');
        if (container) {
            container.innerHTML = '<p>Error loading tasks.</p>';
        }
    }
}

function renderAllTasksList(tasks, filterText) {
    const container = document.getElementById('all-tasks-container');
    if (!container) return;
    let filtered = tasks;
    if (filterText) {
        filtered = tasks.filter(task => {
            // Check title
            const titleMatch = task.title && task.title.toLowerCase().includes(filterText);
            // Check userEmail
            const emailMatch = task.userEmail && task.userEmail.toLowerCase().includes(filterText);
            // Check createdAt date: format to YYYY-MM-DD or locale string
            let dateMatch = false;
            if (task.createdAt) {
                const d = new Date(task.createdAt);
                const dStr = formatDateYYYYMMDD(d);
                const localeStr = d.toLocaleDateString(); // e.g. "6/17/2025" depending on locale
                dateMatch = dStr.includes(filterText) || localeStr.includes(filterText);
            }
            return titleMatch || emailMatch || dateMatch;
        });
    }
    if (filtered.length === 0) {
        container.innerHTML = '<p>No tasks found.</p>';
        return;
    }
    // Build HTML: reuse similar structure as in loadTasks, but include userEmail and createdAt
    const html = filtered.map(task => {
        const created = task.createdAt ? new Date(task.createdAt).toLocaleString() : '';
        // Optional: priority/status badges
        const priorityBadge = task.priority ? `<span class="badge" style="background:${{
            high: '#e53e3e',
            medium: '#f39c12',
            low: '#48bb78'
        }[task.priority] || '#ccc'}">${task.priority}</span>` : '';
        const statusText = task.status ? ` | Status: ${task.status}` : '';
        return `
            <div class="task-card" data-task-id="${task.taskId}">
                <h4>${task.title}</h4>
                <p>User: ${task.userEmail}</p>
                <small>Created: ${created}${statusText}</small>
                <div style="margin-top:4px;">${priorityBadge}</div>
            </div>
        `;
    }).join('');
    container.innerHTML = html;
    // The CSS `.scroll-container` ensures scroll if >4 items.
}

// Add danger button style
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
