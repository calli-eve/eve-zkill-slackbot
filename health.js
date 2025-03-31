import fetch from 'node-fetch';
import config from './config.json' assert { type: 'json' };

let lastPollTime = Date.now();
let lastEsiCall = Date.now();
let lastSlackPost = Date.now();

export function updateHealthMetrics(type) {
    switch(type) {
        case 'poll':
            lastPollTime = Date.now();
            break;
        case 'esi':
            lastEsiCall = Date.now();
            break;
        case 'slack':
            lastSlackPost = Date.now();
            break;
    }
}

export function checkHealth() {
    const now = Date.now();
    const MAX_POLL_INTERVAL = 30000; // 30 seconds
    const MAX_ESI_INTERVAL = 60000;  // 1 minute
    const MAX_SLACK_INTERVAL = 60000; // 1 minute

    const health = {
        status: 'healthy',
        details: {
            redisq: {
                status: 'healthy',
                lastPoll: now - lastPollTime
            },
            esi: {
                status: 'healthy',
                lastCall: now - lastEsiCall
            },
            slack: config.slackWebhookUrl ? {
                status: 'healthy',
                lastPost: now - lastSlackPost
            } : null
        }
    };

    // Check RedisQ polling
    if (now - lastPollTime > MAX_POLL_INTERVAL) {
        health.status = 'unhealthy';
        health.details.redisq.status = 'unhealthy';
    }

    // Check ESI calls
    if (now - lastEsiCall > MAX_ESI_INTERVAL) {
        health.status = 'unhealthy';
        health.details.esi.status = 'unhealthy';
    }

    // Check Slack posts if configured
    if (config.slackWebhookUrl && now - lastSlackPost > MAX_SLACK_INTERVAL) {
        health.status = 'unhealthy';
        health.details.slack.status = 'unhealthy';
    }

    return health;
} 