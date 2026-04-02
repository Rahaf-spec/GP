import { auth, db } from "./firebase.js";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    ref,
    push,
    set,
    get
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

let scores = {
    current: 0,
    history: [],
    allHistory: []
};

let currentUser = null;

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');

    if (screenId === 'home') renderHistory();
    if (screenId === 'results') updateResults();
}

function goToLogin() {
    showScreen('login');
}

async function signUpUser() {
    const name = document.getElementById('signName').value.trim();
    const username = document.getElementById('signUser').value.trim();
    const email = document.getElementById('signEmail').value.trim();
    const password = document.getElementById('signPass').value.trim();

    if (!name || !username || !email || !password) {
        alert("Please fill all fields");
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        currentUser = userCredential.user;

        alert("Account created successfully");
        showScreen('login');
    } catch (error) {
        console.error("Sign up error:", error);
        alert(error.message);
    }
}

async function loginUser() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPass').value.trim();

    if (!email || !password) {
        alert("Please enter email and password");
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        currentUser = userCredential.user;

        await loadUserScores();
        showScreen('home');
    } catch (error) {
        console.error("Login error:", error);
        alert(error.message);
    }
}

async function startGame() {
    if (!currentUser) {
        alert("Please login first");
        showScreen('login');
        return;
    }

    const next = Math.floor(Math.random() * 11) + 10;

    scores.current = next;

    scores.allHistory.push(next);
    scores.history.push(next);

    if (scores.history.length > 5) {
        scores.history.shift();
    }

    await saveScoreToFirebase(next);
    showScreen('results');
}

async function saveScoreToFirebase(scoreValue) {
    try {
        const scoresRef = ref(db, `scores/${currentUser.uid}`);
        const newScoreRef = push(scoresRef);

        await set(newScoreRef, {
            uid: currentUser.uid,
            email: currentUser.email,
            score: scoreValue,
            createdAt: Date.now()
        });
    } catch (error) {
        console.error("Error saving score:", error);
    }
}

async function loadUserScores() {
    try {
        const snapshot = await get(ref(db, `scores/${currentUser.uid}`));

        scores.allHistory = [];
        scores.history = [];

        if (snapshot.exists()) {
            const data = snapshot.val();

            const loadedScores = Object.values(data).sort((a, b) => a.createdAt - b.createdAt);

            loadedScores.forEach((item) => {
                scores.allHistory.push(item.score);
            });
        }

        scores.history = scores.allHistory.slice(-5);

        if (scores.allHistory.length > 0) {
            scores.current = scores.allHistory[scores.allHistory.length - 1];
        } else {
            scores.current = 0;
        }

        renderHistory();
    } catch (error) {
        console.error("Error loading scores:", error);
    }
}

function toggleScoreHistory() {
    const box = document.getElementById('scoreHistoryBox');

    if (box.style.display === 'block') {
        box.style.display = 'none';
    } else {
        box.style.display = 'block';
        renderHistory();
    }
}

function renderHistory() {
    const list = document.getElementById('historyList');
    list.innerHTML = '';

    if (scores.history.length === 0) {
        list.innerHTML = `
        <div class="empty-history">
            No games played yet 🎮
        </div>`;
        return;
    }

    const reversed = [...scores.history].reverse();
    const bestLastFive = Math.max(...scores.history);

    reversed.forEach((score, i) => {
        const isBest = score === bestLastFive;

        list.innerHTML += `
        <div class="history-item ${isBest ? 'highlight-best' : ''}">
            <span>
                Game ${scores.allHistory.length - i}
                ${isBest ? '<span class="best-badge">⭐ BEST</span>' : ''}
            </span>
            <strong>${score} pts</strong>
        </div>`;
    });
}

function updateResults() {
    document.getElementById('currentScore').textContent = scores.current;
}

function showAllHistory() {
    let container = document.querySelector(".result-card .history-box");

    if (container) {
        container.remove();
        return;
    }

    container = document.createElement("div");
    container.className = "history-box";
    container.style.display = "block";

    if (scores.allHistory.length === 0) {
        container.innerHTML = `
        <div class="empty-history">
            No games played yet 🎮
        </div>`;
    } else {
        const reversed = [...scores.allHistory].reverse();
        const bestOverall = Math.max(...scores.allHistory);

        container.innerHTML = reversed.map((score, index) => {
            const isBest = score === bestOverall;

            return `
            <div class="history-item ${isBest ? 'highlight-best' : ''}">
                <span>
                    Game ${scores.allHistory.length - index}
                    ${isBest ? '<span class="best-badge">⭐ BEST</span>' : ''}
                </span>
                <strong>${score} pts</strong>
            </div>
            `;
        }).join("");
    }

    document.querySelector(".result-card").appendChild(container);
}

window.showScreen = showScreen;
window.goToLogin = goToLogin;
window.signUpUser = signUpUser;
window.loginUser = loginUser;
window.startGame = startGame;
window.toggleScoreHistory = toggleScoreHistory;
window.showAllHistory = showAllHistory;