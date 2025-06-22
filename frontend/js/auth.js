let currentUser = null;

function login() {
    const authUrl = `https://${config.cognito.domain}/login?` +
        `response_type=code&` +
        `client_id=${config.cognito.clientId}&` +
        `redirect_uri=${encodeURIComponent(config.cognito.redirectUri)}&` +
        `scope=openid+email+profile`;
    
    window.location.href = authUrl;
}

function logout() {
    localStorage.removeItem('idToken');
    localStorage.removeItem('accessToken');
    
    const logoutUrl = config.cognito.redirectUri;
    
    window.location.href = logoutUrl;
}

async function checkAuth() {
    // Check for authorization code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
        // Exchange code for tokens
        await exchangeCodeForTokens(code);
        // Clean URL
        window.history.replaceState({}, document.title, "/index.html");
    }
    
    const idToken = localStorage.getItem('idToken');
    
    if (!idToken) {
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('main-section').style.display = 'none';
        return false;
    }
    
    try {
        // Decode JWT token
        const payload = JSON.parse(atob(idToken.split('.')[1]));
        
        // Check if token is expired
        if (payload.exp * 1000 < Date.now()) {
            logout();
            return false;
        }
        
        currentUser = {
            id: payload.sub,
            email: payload.email,
            groups: payload['cognito:groups'] || [],
            isAdmin: (payload['cognito:groups'] || []).includes('admins')
        };
        
        // Update UI
        document.getElementById('user-info').innerHTML = `
            <span>${currentUser.email}</span>
            ${currentUser.isAdmin ? '<span class="badge">Admin</span>' : ''}
        `;
        
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('main-section').style.display = 'block';
        
        if (currentUser.isAdmin) {
            document.getElementById('admin-nav').style.display = 'inline-block';
        }
        
        return true;
    } catch (e) {
        console.error('Invalid token:', e);
        logout();
        return false;
    }
}

async function exchangeCodeForTokens(code) {
    try {
        const response = await fetch(`https://${config.cognito.domain}/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: config.cognito.clientId,
                code: code,
                redirect_uri: config.cognito.redirectUri
            })
        });
        
        const data = await response.json();
        
        if (data.id_token) {
            localStorage.setItem('idToken', data.id_token);
            localStorage.setItem('accessToken', data.access_token);
        }
    } catch (error) {
        console.error('Error exchanging code:', error);
    }
}
