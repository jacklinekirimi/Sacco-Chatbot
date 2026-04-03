// ======== DOM ELEMENTS ========
const signupForm = document.getElementById("signupForm");
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

// ======== FORM SUBMIT ========
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Simple frontend password validation
  if (passwordInput.value.length < 8) {
    alert("Password must be at least 8 characters long");
    return;
  }

  // Collect form data
  const data = {
    firstName: document.getElementById("firstName").value,
    lastName: document.getElementById("lastName").value,
    membershipNumber: document.getElementById("membershipNumber").value,
    email: document.getElementById("email").value,
    password: passwordInput.value
  };
  
  // Validate email
if (!data.email.endsWith(".com")) {
  alert("Please enter a valid email ending with .com");
  return;
}

  try {
    // Send data to backend
    const response = await fetch("http://localhost:3000/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (response.ok) {
      // Auto-login: store user info in localStorage (demo for session)
      localStorage.setItem("userId", result.userId);
      localStorage.setItem("userFirstName", result.firstName);

      // Optional: show welcome message (could be a toast)
      alert(`Welcome, ${result.firstName}! Redirecting to chat...`);

      // Redirect to chat interface
      window.location.href = "/chat.html";
    } else {
      alert(result.message || "Sign up failed");
    }

  } catch (error) {
    console.error("Signup error:", error);
    alert("Server error. Please try again later.");
  }
});
