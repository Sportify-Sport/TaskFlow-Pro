"use strict";
let currentView = 'tasks', currentViewMode = 'list';
const searchInput = document.getElementById('search-input'),
      searchBtn = document.getElementById('search-btn'),
      priorityFilter = document.getElementById('priority-filter'),
      sortOption = document.getElementById('sort-option');

// Event listeners for search/filter
if (searchInput) searchInput.addEventListener('input', () => loadTasks());
if (searchBtn) searchBtn.addEventListener('click', () => loadTasks());
if (priorityFilter) priorityFilter.addEventListener('change', () => loadTasks());
if (sortOption) sortOption.addEventListener('change', () => loadTasks());

// On load
window.addEventListener('load', async () => {
    try {
        const isAuth = await checkAuth();
        if (isAuth) await loadTasks();
    } catch (err) {
        console.error('Error during initialization:', err);
    }
});

// Attach nav-btn listeners: buttons should have class 'nav-btn' and data-view attribute, e.g. data-view="tasks"
document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', e => {
        const view = btn.dataset.view;
        showView(view, e);
    });
});

function showView(view, event) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const viewEl = document.getElementById(`${view}-view`);
    if (viewEl) viewEl.style.display = 'block';
    if (event && event.target) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
    }
    currentView = view;
    if (view === 'tasks') {
        loadTasks();
    } else if (view === 'admin') {
        if (window.currentUser && window.currentUser.isAdmin) {
            loadAdminDashboard();
        }
    }
}

async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('idToken');
    const url = `${config.api.endpoint}${endpoint}`;
    const fetchOptions = {
        ...options,
        headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
            ...options.headers
        }
    };
    const response = await fetch(url, fetchOptions);
    if (!response.ok) throw new Error(`API call failed: ${response.status}`);
    if (response.status === 204) return null;
    return response.json();
}

async function loadTasks() {
    try {
        const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const selectedPriority = priorityFilter ? priorityFilter.value : 'all';
        const selectedSort = sortOption ? sortOption.value : 'closest';
        const tasks = await apiCall('/tasks');
        if (!Array.isArray(tasks)) {
            console.warn('Expected tasks array, got:', tasks);
            const container = document.getElementById('tasks-list');
            if (container) container.innerHTML = '<p>Error loading tasks</p>';
            return;
        }
        let filteredTasks = tasks.filter(task => {
            const title = (task.title || '').toLowerCase();
            const description = (task.description || '').toLowerCase();
            const dueDate = task.dueDate ? String(task.dueDate).toLowerCase() : '';
            return !searchQuery
                || title.includes(searchQuery)
                || description.includes(searchQuery)
                || dueDate.includes(searchQuery);
        });
        if (selectedPriority !== 'all') {
            filteredTasks = filteredTasks.filter(task => task.priority === selectedPriority);
        }
        filteredTasks.sort((a, b) => {
            const aDate = a.dueDate ? new Date(a.dueDate) : null;
            const bDate = b.dueDate ? new Date(b.dueDate) : null;
            if (selectedSort === 'closest') {
                if (aDate && bDate) return aDate - bDate;
                else if (aDate) return -1;
                else if (bDate) return 1;
                else return 0;
            } else if (selectedSort === 'farthest') {
                if (aDate && bDate) return bDate - aDate;
                else if (aDate) return -1;
                else if (bDate) return 1;
                else return 0;
            } else {
                return 0;
            }
        });
        const tasksHtml = filteredTasks.map(task => {
            const desc = task.description || '';
            let descriptionHtml;
            if (desc.length > 200) {
                const truncated = desc.substring(0, 200) + '...';
                descriptionHtml = `
                    <p class="task-description truncated" id="description-${task.taskId}">${truncated}</p>
                    <button class="see-more-btn" onclick="toggleDescription(this,'${task.taskId}')" aria-expanded="false" aria-controls="description-${task.taskId}">See more</button>
                `;
            } else {
                descriptionHtml = `<p class="task-description">${desc || 'No description'}</p>`;
            }
            return `
                <div class="task-card ${task.priority}-priority" data-task-id="${task.taskId}">
                    <h3>${task.title}</h3>
                    ${descriptionHtml}
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
                        <small>Priority: ${task.priority} | Due: ${task.dueDate || 'No due date'} | Status: ${task.status}</small>
                        <button onclick="deleteTask('${task.taskId}')" class="btn-danger">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
        const container = document.getElementById('tasks-list');
        if (container) {
            container.innerHTML = tasksHtml || '<p>No tasks found.</p>';
        } else {
            console.warn('No element with id="tasks-list" found');
        }
    } catch (error) {
        console.error('Error loading tasks:', error);
        const container = document.getElementById('tasks-list');
        if (container) container.innerHTML = '<p>Error loading tasks</p>';
    }
}

async function toggleDescription(button, taskId) {
    try {
        const tasks = await apiCall('/tasks');
        const task = tasks.find(t => t.taskId === taskId);
        if (!task) return;
        const fullDescription = task.description || '';
        const taskCard = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
        if (!taskCard) return;
        const descriptionP = taskCard.querySelector('.task-description');
        if (!descriptionP) return;
        if (descriptionP.classList.contains('truncated')) {
            descriptionP.textContent = fullDescription;
            descriptionP.classList.remove('truncated');
            button.textContent = 'See less';
            button.setAttribute('aria-expanded', 'true');
        } else {
            const truncated = fullDescription.length > 200
                ? fullDescription.substring(0, 200) + '...'
                : fullDescription;
            descriptionP.textContent = truncated;
            if (fullDescription.length > 200) {
                descriptionP.classList.add('truncated');
                button.textContent = 'See more';
                button.setAttribute('aria-expanded', 'false');
            } else {
                button.style.display = 'none';
            }
        }
    } catch (err) {
        console.error('Error toggling description:', err);
    }
}

async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
        await apiCall(`/tasks/${taskId}`, { method: 'DELETE' });
        await loadTasks();
    } catch (error) {
        console.error('Error deleting task:', error);
        alert('Error deleting task');
    }
}

const taskForm = document.getElementById('task-form');
if (taskForm) {
    taskForm.addEventListener('submit', async e => {
        e.preventDefault();
        const titleEl = document.getElementById('task-title');
        const descEl = document.getElementById('task-description');
        const prioEl = document.getElementById('task-priority');
        const dueEl = document.getElementById('task-due-date');
        const taskData = {
            title: titleEl ? titleEl.value : '',
            description: descEl ? descEl.value : '',
            priority: prioEl ? prioEl.value : '',
            dueDate: dueEl ? dueEl.value : ''
        };
        try {
            await apiCall('/tasks', {
                method: 'POST',
                body: JSON.stringify(taskData)
            });
            alert('Task created successfully!');
            taskForm.reset();
            showView('tasks');
        } catch (error) {
            console.error('Error creating task:', error);
            alert('Error creating task');
        }
    });
}

async function loadAdminDashboard() {
    if (!(window.currentUser && window.currentUser.isAdmin)) return;
    try {
        const stats = await apiCall('/admin/analytics');
        const statsEl = document.getElementById('stats');
        if (statsEl) {
            let html = `<p>Total Tasks: ${stats.totalTasks}</p><h4>Tasks by Status:</h4>`;
            if (stats.tasksByStatus) {
                html += Object.entries(stats.tasksByStatus).map(
                    ([status, count]) => `<p>${status}: ${count}</p>`
                ).join('');
            }
            html += `<h4>Tasks by Priority:</h4>`;
            if (stats.tasksByPriority) {
                html += Object.entries(stats.tasksByPriority).map(
                    ([priority, count]) => `<p>${priority}: ${count}</p>`
                ).join('');
            }
            statsEl.innerHTML = html;
        }
        const allTasksEl = document.getElementById('all-tasks');
        if (allTasksEl) {
            if (Array.isArray(stats.recentTasks)) {
                allTasksEl.innerHTML = stats.recentTasks.map(task => `
                    <div class="task-card">
                        <h4>${task.title}</h4>
                        <p>User: ${task.userEmail}</p>
                        <small>Created: ${new Date(task.createdAt).toLocaleString()}</small>
                    </div>
                `).join('');
            } else {
                allTasksEl.innerHTML = '<p>No recent tasks data.</p>';
            }
        }
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
    }
}

// Inject styles for danger button and wrapping
(function() {
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
    .task-card, .task-card * {
        box-sizing: border-box;
    }
    .task-description {
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow-wrap: break-word;
    }
    `;
    document.head.appendChild(style);
})();

function setView(viewMode, event) {
    currentViewMode = viewMode;
    const tasksContainer = document.getElementById('tasks-list');
    if (tasksContainer) {
        tasksContainer.classList.remove('list-view', 'grid-view');
        tasksContainer.classList.add(`${viewMode}-view`);
    }
    if (event && event.target) {
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
    }
}
