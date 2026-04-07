import { auth, db } from "./firebase.js";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    ref,
    push,
    set,
    get
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

//  ⭐⭐⭐⭐⭐⭐ المتغيرات العامة 
let scores = {
    current: 0,
    history: [],
    allHistory: []
};

let currentUser = null;

//  ⭐⭐⭐⭐⭐⭐ مراقبة حالة المستخدم (ضروري عند العودة من اللعبة) 
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        console.log("User is signed in:", user.email);
        loadUserScores(); // تحميل البيانات بمجرد التأكد من الهوية

        // التحقق إذا كنا عائدين من اللعبة لفتح شاشة النتائج فوراً
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('status') === 'gameover') {
            showScreen('results');
        }
    } else {
        currentUser = null;
        console.log("No user signed in.");
    }
});

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');

    if (screenId === 'home') renderHistory();
    if (screenId === 'results') updateResults();
}

// ⭐⭐⭐⭐⭐⭐ لايقاف الكاميرا بعد الانتهاء من اللعبة
async function stopCamera() {
    try {
        console.log("Stopping camera...");
        await fetch("http://127.0.0.1:8000/stop");
    } catch (error) {
        console.error("Error stopping camera:", error);
    }
}

//⭐⭐⭐⭐⭐⭐ معالجة نتائج اللعبة القادمة من Phaser 
function updateResults() {

    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.get('status') === 'gameover') {
        // ⭐⭐⭐⭐⭐⭐ استلام البيانات من الرابط
        const gameData = {
            correctGestures: urlParams.get('correct') || "0/0",
            accuracy: urlParams.get('acc') || "0",
            averageConfidence: urlParams.get('conf') || "0.00",
            averageReactionTime: urlParams.get('time') || "0.00"
        };

        // ⭐⭐⭐⭐⭐⭐ تحديث واجهة الـ HTML
        if (document.getElementById('display-correct')) {
            document.getElementById('display-correct').innerText = gameData.correctGestures;
            document.getElementById('display-accuracy').innerText = gameData.accuracy + "%";
            document.getElementById('display-confidence').innerText = gameData.averageConfidence;
            document.getElementById('display-time').innerText = gameData.averageReactionTime + " sec";
        }

        // ⭐⭐⭐⭐⭐⭐ حفظ النتيجة في Firebase
        if (currentUser) {
            saveScoreToFirebase(gameData.accuracy, gameData);
        }

        stopCamera();

        // ⭐⭐⭐⭐⭐⭐ تنظيف الرابط لجمالية الموقع 
        window.history.replaceState({}, document.title, window.location.pathname);
    }
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

    if (!email) { alert("Please enter email"); return; }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        currentUser = userCredential.user;
        await loadUserScores();
        showScreen('home');
    } catch (error) {
        alert("Login failed: " + error.message);
    }
}

async function saveScoreToFirebase(scoreValue, details) {
    try {
        const scoresRef = ref(db, `scores/${currentUser.uid}`);
        const newScoreRef = push(scoresRef);

        await set(newScoreRef, {
            score: scoreValue,
            details: {
                correctGestures: details.correctGestures,
                accuracy: details.accuracy,
                averageConfidence: details.averageConfidence,
                averageReactionTime: details.averageReactionTime
            },
            createdAt: Date.now()
        });

        console.log("Score saved to Firebase!");
    } catch (error) {
        console.error("Error saving score:", error);
    }
}

async function loadUserScores() {
    if (!currentUser) return;

    try {
        const snapshot = await get(ref(db, `scores/${currentUser.uid}`));
        scores.allHistory = [];

        if (snapshot.exists()) {
            const data = snapshot.val();
            const loadedScores = Object.values(data).sort((a, b) => a.createdAt - b.createdAt);
            loadedScores.forEach(item => scores.allHistory.push(item));
        }

        scores.history = scores.allHistory.slice(-5).map(item => item.score);
        scores.current = scores.allHistory.length > 0 ? scores.allHistory[scores.allHistory.length - 1].score : 0;

        renderHistory();
    } catch (error) {
        console.error("Error loading scores:", error);
    }
}

// --- وظائف الواجهة (UI Functions) ---
async function startGame() {
    if (!currentUser) {
        alert("Please login first");
        showScreen('login');
        return;
    }

    console.log("Starting camera...");

    await fetch("http://127.0.0.1:8000/start");

    setTimeout(() => {
        window.location.href = "game/game.html";
    }, 1000);
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    list.innerHTML = '';

    if (scores.history.length === 0) {
        list.innerHTML = `<div class="empty-history">No games played yet 🎮</div>`;
        return;
    }

    const reversed = [...scores.history].reverse();
    const bestLastFive = Math.max(...scores.history.map(s => parseFloat(s)));

    reversed.forEach((score, i) => {
        const isBest = parseFloat(score) === bestLastFive;
        list.innerHTML += `
        <div class="history-item ${isBest ? 'highlight-best' : ''}">
            <span>Game ${scores.allHistory.length - i} ${isBest ? '<span class="best-badge">⭐ BEST</span>' : ''}</span>
            <strong>${score}%</strong>
        </div>`;
    });
}

function toggleScoreHistory() {
    const box = document.getElementById('scoreHistoryBox');
    box.style.display = (box.style.display === 'block') ? 'none' : 'block';
    if (box.style.display === 'block') renderHistory();
}

function showAllHistory() {
    let container = document.querySelector("#home .all-games-box");
    if (container) { container.remove(); return; }

    container = document.createElement("div");
    container.className = "history-box all-games-box";
    container.style.display = "block";

    if (scores.allHistory.length === 0) {
        container.innerHTML = `<div class="empty-history">No games played yet 🎮</div>`;
    } else {
        const reversed = [...scores.allHistory].reverse();
        container.innerHTML = reversed.map((item, index) => `
            <div class="history-item">
                <div><strong>Game ${scores.allHistory.length - index}</strong></div>
                <div><strong>Score:</strong> ${item.score}%</div>
                <div><strong>Correct Gestures:</strong> ${item.details?.correctGestures || "--"}</div>
                <div><strong>Accuracy:</strong> ${item.details?.accuracy || "--"}%</div>
                <div><strong>Average Confidence:</strong> ${item.details?.averageConfidence || "--"}</div>
                <div><strong>Average Reaction Time:</strong> ${item.details?.averageReactionTime || "--"} sec</div>
            </div>
        `).join("");
    }

    document.querySelector("#home .card").appendChild(container);
}

async function saveCurrentGameResult(correctGestures, accuracy, averageConfidence, averageReactionTime) {
    if (!currentUser) return;
    document.getElementById("display-correct").textContent =
        (correctGestures != null && correctGestures !== "") ? correctGestures : "--";

    document.getElementById("display-accuracy").textContent =
        accuracy != null ? `${accuracy}%` : "--";

    document.getElementById("display-confidence").textContent =
        (averageConfidence != null && averageConfidence !== "") ? averageConfidence : "--";

    document.getElementById("display-time").textContent =
        averageReactionTime != null ? `${averageReactionTime} sec` : "--";
    await saveScoreToFirebase(accuracy, {
        correctGestures: correctGestures,
        accuracy: accuracy,
        averageConfidence: averageConfidence,
        averageReactionTime: averageReactionTime
    });

    await loadUserScores();
}

window.showScreen = showScreen;
window.signUpUser = signUpUser;
window.loginUser = loginUser;
window.startGame = startGame;
window.toggleScoreHistory = toggleScoreHistory;
window.showAllHistory = showAllHistory;
window.saveCurrentGameResult = saveCurrentGameResult;