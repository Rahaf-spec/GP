import { auth, db } from "./firebase.js"; // استيراد نفس الـ db والـ auth من ملفك
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // جلب البيانات من مسار اليوزر الحالي
        const snapshot = await get(ref(db, `scores/${user.uid}`));
        
        if (snapshot.exists()) {
            const data = snapshot.val();
            // تحويل الكائنات لمصفوفة وترتيبها زمنياً
            let allGames = Object.values(data).sort((a, b) => a.createdAt - b.createdAt);
            
            // اختيار آخر 10 ألعاب فقط
            const last10 = allGames.slice(-15);
            
            renderAllCharts(last10);
            document.getElementById('loadingText').style.display = 'none';
        } else {
            document.getElementById('loadingText').innerText = "لا توجد ألعاب مسجلة لهذا المستخدم بعد.";
        }
    } else {
        window.location.href = "index.html"; // إذا لم يسجل دخول ارجعه للهوم
    }
});

function renderAllCharts(games) {
    Chart.defaults.font.family = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"; 
    Chart.defaults.color = "#4a2c2a";
    const labels = games.map((_, i) => `لعبة ${i + 1}`);

    // رسم الدقة
    new Chart(document.getElementById('accuracyChart'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'الدقة (%)',
                data: games.map(g => parseFloat(g.details?.accuracy || 0)),
                borderColor: '#8d5524',
                backgroundColor: 'rgba(141, 85, 36, 0.1)',
                fill: true,
                tension: 0.4
            }]
        }
    });

    // رسم الوقت
    new Chart(document.getElementById('reactionChart'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'وقت الاستجابة (ثانية)',
                data: games.map(g => parseFloat(g.details?.averageReactionTime || 0)),
                backgroundColor: '#e0ac69'
            }]
        }
    });

    // رسم الأخطاء
    new Chart(document.getElementById('wrongMovesChart'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'الأخطاء',
                data: games.map(g => parseInt(g.details?.wrongMoves || 0)),
                backgroundColor: '#a56c36'
            }]
        }
    });
}