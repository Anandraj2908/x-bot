import express from 'express';
import TwitterService from './twitterService.js';
import schedule from 'node-schedule';
import { configDotenv } from 'dotenv';

configDotenv();
const app = express();

const twitter = new TwitterService();
twitter.initialize().then(() => {
    console.log('Twitter service ready!');
}).catch(console.error);

function cleanTweet(inputString) {
    return inputString.replace(/[\\\/"*+!@$%^&*()_={}\[\]:;<>?|`~\n\r\t]+/g, ' ').trim();
}


app.get('/tweet', async (req, res) => {
    try {
        const prompt = 'Unique, Share bite-sized programming wisdom in concise tweets under 260 characters only single tweet, using simple language and clear examples. Avoid special formatting like \\n or **, and use simple alphabets and characters only when required. Incorporate relevant emojis (max 2-3) and hashtags #CodingTips. Focus on programming concepts and best practices. Keep the tone supportive and engaging. Your response is automated and it will be directly tweeted so do not need to interact in the response just give the response in the form of a tweet.';

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 4096,
                }
            })
        });

        const data = await response.json();
        console.log('Response from Gemini:', data);
        const message = cleanTweet(data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response');

        res.json({ success: true, response: message });

    } catch (error) {
        console.error('Error generating tweet:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


const generateAndPostTweet = async () => {
    try {
        const tweetResponse = await fetch('http://localhost:3000/tweet');
        
        if (!tweetResponse.ok) {
            throw new Error(`Failed to fetch tweet content, status: ${tweetResponse.status}`);
        }

        const tweetData = await tweetResponse.json();
        
        if (!tweetData || !tweetData.response) {
            throw new Error('Tweet data is invalid or missing');
        }

        const tweetContent = tweetData.response + " - AI Generated";
        if (tweetContent.trim() === "No response - AI Generated") {
            console.log("Tweet skipped: No meaningful response to post.");
            return;
        }

        console.log(`New Tweet Generated: ${tweetContent}`);

        
        await twitter.tweet(tweetContent);
        console.log('Tweet successfully posted!');
    } catch (error) {
        console.error('Error in generating or posting tweet:', error.message);
        
        if (error.message.includes('Failed to fetch') || error.message.includes('network')) {
            console.log('Retrying after 1 minute...');
            setTimeout(generateAndPostTweet, 60000); 
        }
    }
};

schedule.scheduleJob('*/1 * * * *', () => {
    console.log('Starting tweet generation...');
    generateAndPostTweet(); 
});

app.listen(3000, () => {
    console.log("Listening on Port: 3000");
});

export default app;
