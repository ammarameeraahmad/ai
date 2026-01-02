/**
 * Firebase Configuration - Realtime Database
 */

const firebaseConfig = {
    apiKey: "AIzaSyDHoZr41Ppf66IOkIXHwQgNNNRWrCj10fY",
    authDomain: "argamada-ac6cc.firebaseapp.com",
    // ✅ GANTI URL INI (pakai region asia-southeast1)
    databaseURL: "https://argamada-ac6cc-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "argamada-ac6cc",
    storageBucket: "argamada-ac6cc.firebasestorage.app",
    messagingSenderId: "1066501585148",
    appId: "1:1066501585148:web:08d17b0c9fb87202f93f79"
};

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
    console.log('✅ Firebase initialized successfully!');
} catch (error) {
    console.error('❌ Firebase initialization error:', error);
}

// Initialize Realtime Database
const database = firebase.database();

// Test connection
database.ref('.info/connected').on('value', (snapshot) => {
    if (snapshot.val() === true) {
        console.log('🟢 Connected to Firebase Realtime Database');
    } else {
        console.log('🔴 Disconnected from Firebase');
    }
});