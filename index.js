require("dotenv/config");
const express = require("express");
const app = express();
const port = 8080; // default port to listen
const TwitterApi = require('twitter-api-v2').default;
const { initializeApp } = require('firebase/app');
const { getFirestore, setDoc, doc, getDoc } = require('firebase/firestore');

const { Configuration, OpenAIApi } = require('openai');

const OPENAI_PROMPTS = [
    // Insert prompts here
];

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGE_ID,
    appId: process.env.FIREBASE_APP_ID,
};

initializeApp(firebaseConfig);
const db = getFirestore();
const twitterClient = new TwitterApi({
    clientId: process.env.TWITTER_CLIENT_ID || "",
    clientSecret: process.env.TWITTER_CLIENT_SECRET || "",
});

const callBackURL = "http://127.0.0.1:8080/callback";

const configuration = new Configuration({
    organization: process.env.OPEN_AI_ORG,
    apiKey: process.env.OPEN_AI_API,
});
const openai = new OpenAIApi(configuration);
// define a route handler for the default home page
app.get("/", (req, res) => {
    res.send(`Node Server running at port ${port}`);
});

app.get("/authentication", async (req, res) => {
    const { url, state, codeVerifier } = twitterClient.generateOAuth2AuthLink(callBackURL, {
        scope: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    });
    await setDoc(doc(db, "twitter", "token"), {
        codeVerifier, state
    });
    res.redirect(url);
});

app.get("/callback", async (req, res) => {
    const state = req.query.state;
    const code = req.query.code;
    const docRef = doc(db, "twitter", "token");
    const docSnap = await getDoc(docRef);
    const { codeVerifier, storedState } = docSnap.data();
    if (state !== storedState) {
        res.status(400).send("incorrect token");
    }
    const { accessToken, refreshToken } = await twitterClient.loginWithOAuth2({ code, codeVerifier, redirectUri: callBackURL });

    await setDoc(doc(db, "tokens", "demo"), {
        accessToken, refreshToken
    });
    res.sendStatus(200);
});

app.get("/generateTweet", async (req, res) => {
    const docRef = doc(db, "twitter", "token");
    const docSnap = await getDoc(docRef);
    const { refreshToken } = docSnap.data();
    const {
        client: refreshedClient,
        accessToken,
        refreshToken: newRefreshToken,
    } = await twitterClient.refreshOAuth2Token(refreshToken);
    await setDoc(doc(db, "twitter", "token"), {
        accessToken, refreshToken: newRefreshToken
    });
    const nextTweet = await openai.createCompletion("text-davinci-001", {
        prompt: `Generate a tweet with hashtags of 128 characters about ${OPENAI_PROMPTS[Math.floor(Math.random() * OPENAI_PROMPTS.length)]}`,
        max_tokens: 128,
    });
    const textTweet = nextTweet.data.choices && nextTweet.data.choices[0].text || "";
    refreshedClient.v2.tweet(
        textTweet
    ).then((data) => res.send(data.data)).catch((err) => res.send(JSON.stringify(err)));
});

// start the Express server
app.listen(port, () => {
    console.log(`server started at http://localhost:${port}`);
});