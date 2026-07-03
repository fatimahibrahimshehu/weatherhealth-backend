const API_BASE = "https://weatherhealth-backend.onrender.com/api/auth";

// ---- Tab Switching ----
function switchTab(tab) {
  const loginTab = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");

  if (tab === "login") {
    loginTab.classList.add("active");
    signupTab.classList.remove("active");
    loginForm.style.display = "flex";
    signupForm.style.display = "none";
  } else {
    signupTab.classList.add("active");
    loginTab.classList.remove("active");
    signupForm.style.display = "flex";
    loginForm.style.display = "none";
  }
}

// ---- LOGIN ----
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const msg = document.getElementById("loginMsg");
  const btn = document.getElementById("loginBtn");

  msg.textContent = "";
  btn.disabled = true;
  btn.textContent = "Signing in...";

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Login failed");
    }

    // Save token and user info
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    msg.textContent = "Login successful! Redirecting...";
    msg.className = "auth-msg success";

    setTimeout(() => {
      window.location.href = "index.html";
    }, 1000);

  } catch (err) {
    msg.textContent = err.message;
    msg.className = "auth-msg error";
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign In";
  }
});

// ---- SIGNUP ----
document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("signupUsername").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const msg = document.getElementById("signupMsg");
  const btn = document.getElementById("signupBtn");

  msg.textContent = "";
  btn.disabled = true;
  btn.textContent = "Creating account...";

  try {
    const res = await fetch(`${API_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Registration failed");
    }

    // Save token and user info
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    msg.textContent = "Account created! Redirecting...";
    msg.className = "auth-msg success";

    setTimeout(() => {
      window.location.href = "index.html";
    }, 1000);

  } catch (err) {
    msg.textContent = err.message;
    msg.className = "auth-msg error";
  } finally {
    btn.disabled = false;
    btn.textContent = "Create Account";
  }
});