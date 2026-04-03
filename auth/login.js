const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");

// ======== PASSWORD TOGGLE ========
togglePassword.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";

  // Toggle input type
  passwordInput.type = isHidden ? "text" : "password";

  // Toggle eye icon
  togglePassword.src = isHidden
    ? "../images/icons/view.png"
    : "../images/icons/hide.png";
});


loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    email: document.getElementById("email").value,
    password: document.getElementById("password").value
  };

  try {
    const response = await fetch("http://localhost:3000/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (response.ok) {
      // Save user info for session
      console.log('Login result:', result);
      localStorage.setItem("userId", result.userId);
      localStorage.setItem("userFirstName", result.firstName);
      localStorage.setItem("userRole", result.role);
      localStorage.removeItem("chatHistory");
      localStorage.removeItem("currentSessionKey");

     // Redirect based on role
if (result.role === 'admin') {
  window.location.href = '../dashboard.html';
} else {
  window.location.href = '../chat.html';
}
    } else {
      alert(result.message || "Login failed");
    }
  } catch (error) {
    console.error(error);
    alert("Server error. Please try again later.");
  }
});
