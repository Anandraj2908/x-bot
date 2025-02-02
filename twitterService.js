import got from 'got';
import crypto from 'crypto';
import OAuth from 'oauth-1.0a';
import qs from 'querystring';
import { createInterface } from 'readline';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

class TwitterService {
    constructor() {
        this.TOKEN_PATH = path.join(process.cwd(), 'twitter_tokens.json');
        this.endpointURL = 'https://api.twitter.com/2/tweets';
        this.requestTokenURL = 'https://api.twitter.com/oauth/request_token?oauth_callback=oob&x_auth_access_type=write';
        this.authorizeURL = new URL('https://api.twitter.com/oauth/authorize');
        this.accessTokenURL = 'https://api.twitter.com/oauth/access_token';
        this.tokens = null;

        this.oauth = OAuth({
            consumer: {
                key: process.env.TWITTER_CONSUMER_KEY,
                secret: process.env.TWITTER_CONSUMER_SECRET
            },
            signature_method: 'HMAC-SHA1',
            hash_function: (baseString, key) => crypto.createHmac('sha1', key).update(baseString).digest('base64')
        });
    }

    async initialize() {
        this.tokens = await this.loadTokens();
        if (!this.tokens) {
            this.tokens = await this.authenticate();
        }
        return this;
    }

    async loadTokens() {
        try {
            const data = await fs.readFile(this.TOKEN_PATH, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return null;
        }
    }

    async saveTokens(tokens) {
        await fs.writeFile(this.TOKEN_PATH, JSON.stringify(tokens, null, 2));
    }

    async authenticate() {
        console.log('Starting authentication...');
        const oAuthRequestToken = await this.getRequestToken();
        this.authorizeURL.searchParams.append('oauth_token', oAuthRequestToken.oauth_token);
        
        console.log('Please go here and authorize:', this.authorizeURL.href);
        const pin = await this.getUserInput('Paste the PIN here: ');
        
        const tokens = await this.getAccessToken(oAuthRequestToken, pin.trim());
        await this.saveTokens(tokens);
        console.log('Authentication completed and tokens stored!');
        return tokens;
    }

    async getUserInput(prompt) {
        const readline = createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            readline.question(prompt, (out) => {
                readline.close();
                resolve(out);
            });
        });
    }

    async getRequestToken() {
        const authHeader = this.oauth.toHeader(this.oauth.authorize({
            url: this.requestTokenURL,
            method: 'POST'
        }));

        try {
            const req = await got.post(this.requestTokenURL, {
                headers: {
                    Authorization: authHeader["Authorization"]
                }
            });
            return qs.parse(req.body);
        } catch (error) {
            throw new Error('Cannot get an OAuth request token');
        }
    }

    async getAccessToken(oAuthRequestToken, pin) {
        const authHeader = this.oauth.toHeader(this.oauth.authorize({
            url: this.accessTokenURL,
            method: 'POST'
        }));

        const path = `${this.accessTokenURL}?oauth_verifier=${pin}&oauth_token=${oAuthRequestToken.oauth_token}`;
        try {
            const req = await got.post(path, {
                headers: {
                    Authorization: authHeader["Authorization"]
                }
            });
            return qs.parse(req.body);
        } catch (error) {
            throw new Error('Cannot get an OAuth access token');
        }
    }

    async tweet(message) {
        if (!this.tokens) {
            throw new Error('Not authenticated');
        }

        const token = {
            key: this.tokens.oauth_token,
            secret: this.tokens.oauth_token_secret
        };

        const data = {
            text: message
        };

        const authHeader = this.oauth.toHeader(this.oauth.authorize({
            url: this.endpointURL,
            method: 'POST'
        }, token));

        try {
            const req = await got.post(this.endpointURL, {
                json: data,
                responseType: 'json',
                headers: {
                    Authorization: authHeader["Authorization"],
                    'user-agent': "v2CreateTweetJS",
                    'content-type': "application/json",
                    'accept': "application/json"
                }
            });
            return req.body;
        } catch (error) {
            throw new Error('Failed to post tweet: ' + error.message);
        }
    }
}

export default TwitterService;