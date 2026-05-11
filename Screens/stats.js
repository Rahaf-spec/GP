import { auth, db } from "./firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const snapshot = await get(ref(db, `scores/${user.uid}`));
            if (snapshot.exists()) {
                let allGames = Object.values(snapshot.val()).sort((a, b) => a.createdAt - b.createdAt);
                const last15 = allGames.slice(-15);
                renderCharts(last15);
                document.getElementById('loadingText').style.display = 'none';
            } else {
                document.getElementById('loadingText').innerText = "لا توجد ألعاب مسجلة بعد. ابدأ اللعب الآن!";
            }
        } catch (error) {
            console.error("Error:", error);
            document.getElementById('loadingText').innerText = "حدث خطأ أثناء جلب البيانات.";
        }
    } else {
        window.location.href = 'index.html';
    }
});

function renderCharts(games) {
    const labels = games.map((_, i) => `لعبة ${i + 1}`);

    Chart.defaults.font.family = "'Cairo', sans-serif";
    Chart.defaults.color = '#4a2c2a';

    // إعدادات مشتركة لثبات المحور عند 100%
    const percentYAxis = {
        min: 0,
        max: 100,
        ticks: {
            callback: function(value) { return value + "%" }
        }
    };

    // 1. الدقة الكلية
    new Chart(document.getElementById('accuracyChart'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'الدقة الكلية %',
                data: games.map(g => parseFloat(g.details?.accuracy || 0)),
                borderColor: '#26de81',
                backgroundColor: 'rgba(38, 222, 129, 0.1)',
                fill: true,
                tension: 0.4,
                borderWidth: 4
            }]
        },
        options: { scales: { y: percentYAxis } }
    });

    // 2. 🌟 دقة حركة الفتح (تم التحويل لنسبة مئوية)
    new Chart(document.getElementById('openGestureChart'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'دقة فتح اليد %',
                data: games.map(g => {
                    const correct = parseInt(g.details?.openOk || 0);
                    const total = parseInt(g.details?.openTotal || correct || 1); // نستخدم الإجمالي إذا وجد
                    return ((correct / total) * 100).toFixed(1);
                }),
                borderColor: '#45aaf2',
                backgroundColor: 'rgba(69, 170, 242, 0.1)',
                fill: true,
                tension: 0.3,
                borderWidth: 4
            }]
        },
        options: { scales: { y: percentYAxis } }
    });

    // 3. 🌟 دقة حركة الإغلاق (تم التحويل لنسبة مئوية)
    new Chart(document.getElementById('closeGestureChart'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'دقة إغلاق اليد %',
                data: games.map(g => {
                    const correct = parseInt(g.details?.closeOk || 0);
                    const total = parseInt(g.details?.closeTotal || correct || 1);
                    return ((correct / total) * 100).toFixed(1);
                }),
                borderColor: '#a55eea',
                backgroundColor: 'rgba(165, 94, 234, 0.1)',
                fill: true,
                tension: 0.3,
                borderWidth: 4
            }]
        },
        options: { scales: { y: percentYAxis } }
    });

    // 4. وقت الاستجابة (يبقى بالأعمدة والثواني)
    new Chart(document.getElementById('reactionChart'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'الثواني',
                data: games.map(g => parseFloat(g.details?.averageReactionTime || 0)),
                backgroundColor: '#fd9644',
                borderRadius: 10
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: function(value) { return value + " ث" } }
                }
            }
        }
    });

    // 5. الأخطاء (يبقى بالأرقام الثابتة)
    new Chart(document.getElementById('wrongMovesChart'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'عدد الأخطاء',
                data: games.map(g => parseInt(g.details?.wrongMoves || 0)),
                backgroundColor: '#fc5c65',
                borderRadius: 10
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}