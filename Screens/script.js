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

//  General variables
let scores = {
    current: 0,
    history: [],
    allHistory: []
};

let currentUser = null;

//  Monitoring user status (essential when returning from the game)
onAuthStateChanged(auth, (user) => {
    const urlParams = new URLSearchParams(window.location.search);
    const isGameOver = urlParams.get('status') === 'gameover';
    const isFinishedTutorial = urlParams.get('mode') === 'finished_tutorial';

    if (user) {
        currentUser = user;
        console.log("User is signed in:", user.email);
        
        // 1. Download data from Firebase
        loadUserScores(); 

        // 2. Select the screen that should be displayed
        if (isGameOver) {
            // If it returns a result, we open the results screen.
            showScreen('results');
        } else if (isFinishedTutorial) {
            // If returning from the tutorial, open the home screen.
            showScreen('home');
        } else {
            // Default state: If the site is opened while logged in, it goes directly to the homepage.
            showScreen('home');
        }

    } else {
        currentUser = null;
        console.log("No user signed in.");
        
        // If he is not registered, we will return him to the login page.
        showScreen('signin');
    }
});

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');

    if (screenId === 'home') renderHistory();
    if (screenId === 'results') updateResults();
}

// Turn off the camera after finishing the game
async function stopCamera() {
    try {
        console.log("Stopping camera...");
        await fetch("http://127.0.0.1:8000/stop");
    } catch (error) {
        console.error("Error stopping camera:", error);
    }
}
// Function to open the pop-up window
window.resetAdaptiveMode = function() {
    const modal = document.getElementById('resetModal');
    modal.style.display = 'block';
}

// Window closing function
window.closeResetModal = function() {
    const modal = document.getElementById('resetModal');
    modal.style.display = 'none';
}

// Final confirmation and data scanning function
window.confirmReset = function() {
    localStorage.setItem('adaptiveLevel', 1);
    localStorage.setItem('successStreak', 0);
    
    // Hide window and refresh page
    closeResetModal();
    location.reload();
}

// The window closes when pressed outside.
window.onclick = function(event) {
    const modal = document.getElementById('resetModal');
    if (event.target == modal) {
        closeResetModal();
    }
}
//Processing the results of the upcoming game from Phaser 
function updateResults() {
    const urlParams = new URLSearchParams(window.location.search);

    // 1. Dealing with the end of the learning phase (Tutorial)
    if (urlParams.get('mode') === 'finished_tutorial') {
        //Turn off the camera immediately
        stopCamera();
        
        // Go to the home screen instead of staying on the login screen.
        showScreen('home');

        // Clean the URL
        //window.history.replaceState({}, document.title, window.location.pathname);
        return; 
    }

    // 2. Dealing with the normal end of the game (Game Over)
    if (urlParams.get('status') === 'gameover') {
        // Receive data from the link
        const gameData = {
            correctGestures: urlParams.get('correct') || "0/0",
            accuracy: urlParams.get('acc') || "0",
            averageConfidence: urlParams.get('conf') || "0.00",
            averageReactionTime: urlParams.get('time') || "0.00",
            wrongMoves: urlParams.get('wrong') || "0",
        };

        // HTML interface update
        if (document.getElementById('display-correct')) {
            document.getElementById('display-correct').innerText = gameData.correctGestures;
            document.getElementById('display-accuracy').innerText = gameData.accuracy + "%";
            document.getElementById('display-confidence').innerText = gameData.averageConfidence;
            document.getElementById('display-time').innerText = gameData.averageReactionTime + " sec";
            document.getElementById('display-wrong').innerText = gameData.wrongMoves;
        }

        // Save the result on Firebase
        if (currentUser) {
            saveScoreToFirebase(gameData.accuracy, gameData);
        }
     
        stopCamera();
        //window.history.replaceState({}, document.title, window.location.pathname);
        return;

    }
}

async function signUpUser() {
    const email = document.getElementById('signEmail').value.trim();
    const password = document.getElementById('signPass').value.trim();

    if (!email || !password) {
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
                averageReactionTime: details.averageReactionTime,
                wrongMoves: details.wrongMoves,
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

//--- UI Functions ---
// Function to update the level display in the interface

function updateLevelDisplay() {
    // Retrieve the level from localStorage; if it doesn't exist, consider it to be 1.
    const savedLevel = localStorage.getItem('adaptiveLevel') || 1;
    
    // Finding an element in HTML and changing the text inside it
    const levelElement = document.getElementById('current-lvl');
    if (levelElement) {
        levelElement.innerText = savedLevel;
    }
}
// Run the function immediately after the page loads.
window.onload = function() {
    updateLevelDisplay();
};
// Starting game and open camera
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
// Learning phase activation function
window.startTutorial = async function() {
    if (!currentUser) {
        alert("Please login first");
        showScreen('login');
        return;
    }

    // Operating the camera via Python as usual
    await fetch("http://127.0.0.1:8000/start");

    // Instructions for the game, including the word "tutorial" in the link.
    setTimeout(() => {
        window.location.href = "game/game.html?mode=tutorial";
    }, 1000);
}
// Adaptive mode activation function
window.startAdaptiveMode = async function() {
    if (!currentUser) {
        alert("Please login first");
        showScreen('login');
        return;
    }

    await fetch("http://127.0.0.1:8000/start");

    // The instructions for the game include the word "adaptive" in the link.
    setTimeout(() => {
        window.location.href = "game/game.html?mode=adaptive";
    }, 1000);
}
// Play Again function
window.playAgain = async function() {
    // 1.Get the mod from the current link to the results page
    const urlParams = new URLSearchParams(window.location.search);
    const lastMode = urlParams.get('mode'); 

    console.log("Replaying mode:", lastMode);

    // 2. Checking the mod and guiding the player to the correct function
    if (lastMode === 'adaptive') {
        await window.startAdaptiveMode(); 
    } else if (lastMode === 'tutorial') {
        await window.startTutorial();
    } else {
        // إذا لم يوجد مود أو كان المود عادي
        await window.startGame(); 
    }
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
                <div><strong>لعبة ${scores.allHistory.length - index}</strong></div>
                <div><strong>الدقة:</strong> ${item.details?.accuracy || "--"}%</div>
                <div><strong>الإيماءات الصحيحة:</strong> ${item.details?.correctGestures || "--"}</div>
                <div><strong>متوسط الثقة:</strong> ${item.details?.averageConfidence || "--"}</div>
                <div><strong>متوسط سرعة الإستجابة:</strong> ${item.details?.averageReactionTime || "--"} sec</div>
                <div><strong>الحركات الخاطئة/السقوط:</strong> ${item.details?.wrongMoves || "--"}</div>
            </div>
        `).join("");
    }
    

    document.querySelector("#home .card").appendChild(container);
}

async function saveCurrentGameResult(correctGestures, accuracy, averageConfidence, averageReactionTime, wrongMoves) {
    if (!currentUser) return;
    document.getElementById("display-correct").textContent =
        (correctGestures != null && correctGestures !== "") ? correctGestures : "--";

    document.getElementById("display-accuracy").textContent =
        accuracy != null ? `${accuracy}%` : "--";

    document.getElementById("display-confidence").textContent =
        (averageConfidence != null && averageConfidence !== "") ? averageConfidence : "--";

    document.getElementById("display-time").textContent =
        averageReactionTime != null ? `${averageReactionTime} sec` : "--";

    document.getElementById("display-time").textContent =
        wrongMoves != null ? `${wrongMoves}` : "--";

  
    await saveScoreToFirebase(accuracy, {
        correctGestures: correctGestures,
        accuracy: accuracy,
        averageConfidence: averageConfidence,
        averageReactionTime: averageReactionTime,
        wrongMoves: wrongMoves
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