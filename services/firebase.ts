import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
    apiKey: "AIzaSyAhyo8ZDJgrYOMiIlmBwfWrXaNH2ovncOA",
    authDomain: "send-anything.firebaseapp.com",
    projectId: "send-anything",
    storageBucket: "send-anything.firebasestorage.app",
    messagingSenderId: "972402855262",
    appId: "1:972402855262:web:33d9a2f32a672b424313cf",
    measurementId: "G-XBLXZDRF0M"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export { app, analytics };
