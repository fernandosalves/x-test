/**
 * Example — Login Form component
 *
 * @xtest-surface
 * @element username-input   by-ref: username
 *   @alias  "user name", "email", "email address", "login field"
 *
 * @element password-input   by-ref: password
 *   @alias  "password", "pass", "secret"
 *
 * @element submit-button    by-role: button
 *   @alias  "submit", "login button", "sign in", "go"
 *
 * @element error-message    by-selector: [role=alert]
 *   @alias  "error", "error message", "alert", "warning"
 *
 * @element dashboard        by-selector: main[data-page=dashboard]
 *   @alias  "dashboard", "home page", "main page"
 */
export function renderLoginForm(): string {
    return /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Login</title>
    <style>
        body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8fafc; }
        .card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 2rem; width: 340px; }
        h1 { margin: 0 0 1.5rem; font-size: 1.3rem; color: #0f172a; }
        label { display: block; font-size: .82rem; font-weight: 600; color: #475569; margin-bottom: .25rem; }
        input { display: block; width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: .5rem .75rem; font-size: .9rem; margin-bottom: 1rem; box-sizing: border-box; }
        button[type=submit] { width: 100%; background: #4f46e5; color: white; border: none; border-radius: 6px; padding: .6rem; font-size: .95rem; cursor: pointer; font-weight: 600; }
        button[type=submit]:hover { background: #4338ca; }
        [role=alert] { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; border-radius: 6px; padding: .5rem .75rem; font-size: .85rem; margin-bottom: 1rem; }
        main[data-page=dashboard] { display: none; }
    </style>
</head>
<body>
    <div class="card" id="login-card">
        <h1>Sign in</h1>
        <p role="alert" id="error-msg" hidden></p>
        <label for="username">Email</label>
        <input data-xtest="username" id="username" type="text" name="username" placeholder="you@example.com" autocomplete="username" />
        <label for="password">Password</label>
        <input data-xtest="password" id="password" type="password" name="password" placeholder="••••••••" autocomplete="current-password" />
        <button type="submit" data-xtest="submit-button">Sign in</button>
    </div>
    <main data-page="dashboard" id="dashboard" hidden>
        <h1>Welcome back!</h1>
    </main>

    <script>
        const VALID = { username: 'ada@example.com', password: 'hunter2' };

        document.querySelector('button[type=submit]').addEventListener('click', () => {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorEl  = document.getElementById('error-msg');

            if (!username || !password) {
                errorEl.textContent = 'Please fill in all fields.';
                errorEl.hidden = false;
                document.getElementById('username').focus();
                return;
            }

            if (username === VALID.username && password === VALID.password) {
                errorEl.hidden = true;
                document.getElementById('login-card').hidden = true;
                document.getElementById('dashboard').hidden = false;
            } else {
                errorEl.textContent = 'Invalid credentials. Please try again.';
                errorEl.hidden = false;
                document.getElementById('password').value = '';
            }
        });
    </script>
</body>
</html>
    `.trim();
}
