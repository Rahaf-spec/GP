  import { auth, db } from "./firebase.js";
        import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
        import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const snapshot = await get(ref(db, `scores/${user.uid}`));
                    if (snapshot.exists()) {
                        let allGames = Object.values(snapshot.val()).sort((a, b) => a.createdAt - b.createdAt);
                        const last10 = allGames.slice(-10);
                        renderCharts(last10);
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
            // ألوان مستوحاة من واجهتك (btn-green, btn-purple, btn-pink)
            const colorPurple = '#a55eea'; 
            const colorGreen = '#26de81';
            const colorPink = '#ff006e';
            const colorBrown = '#8d5524';

            const labels = games.map((_, i) => `لعبة ${i + 1}`);

            // إعدادات الخطوط لتطابق Cairo
            Chart.defaults.font.family = "'Cairo', sans-serif";
            Chart.defaults.color = '#4a2c2a';

            // 1. رسم الدقة (خطي - أخضر)
            new Chart(document.getElementById('accuracyChart'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'الدقة %',
                        data: games.map(g => g.details.accuracy),
                        borderColor: colorGreen,
                        backgroundColor: 'rgba(38, 222, 129, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 4
                    }]
                },
                options: { responsive: true }
            });

            // 2. رسم وقت الاستجابة (أعمدة - بنفسجي)
            new Chart(document.getElementById('reactionChart'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'الثواني',
                        data: games.map(g => g.details.averageReactionTime),
                        backgroundColor: colorPurple,
                        borderRadius: 10
                    }]
                },
                options: { responsive: true }
            });

            // 3. رسم الأخطاء (أعمدة - وردي)
            new Chart(document.getElementById('wrongMovesChart'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'الأخطاء',
                        data: games.map(g => g.details.wrongMoves),
                        backgroundColor: colorPink,
                        borderRadius: 10
                    }]
                },
                options: {
                    responsive: true,
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            });
        }