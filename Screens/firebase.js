import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBirJULZZ7osY22kv7NzcJNORC4hDlfdpE",
    authDomain: "hand-hero-256f0.firebaseapp.com",
    databaseURL: "https://hand-hero-256f0-default-rtdb.firebaseio.com",
    projectId: "hand-hero-256f0",
    storageBucket: "hand-hero-256f0.appspot.com",
    messagingSenderId: "845272489242",
    appId: "1:845272489242:web:80e0d0497e68de88f5e0a3",
    measurementId: "G-KJ84JF13FG"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

console.log("Firebase connected ✅");

export { auth, db };