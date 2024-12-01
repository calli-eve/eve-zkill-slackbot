# EVE Online Killmail to Slack Bot

A Node.js application that listens to the zKillboard WebSocket feed and posts relevant killmails to Slack. The bot monitors specific corporations or alliances and posts their kills and losses in a formatted message.

## Features

- Real-time killmail monitoring via WebSocket
- Configurable corporation/alliance ID watching
- Formatted Slack messages with:
  - Kill/Loss color coding (green/red)
  - Ship icons
  - Links to zKillboard
  - Final blow and top damage information
  - Ship type counts for attackers
  - ISK value formatting
- ESI integration for resolving names
- Automatic reconnection on connection loss
- Docker support

## Configuration Options

`config.json` parameters:
```json
{
    "watchedIds": [
        98600992,  // Corp or Alliance ID
        98600993   // Can add multiple IDs
    ],
    "slackWebhookUrl": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
    "userAgent": "EVE Killmail Bot/1.0 (your@email.com)"  // Identify your app to ESI
}
```

The `userAgent` should include:
- Your application name and version
- A way to contact you (email)
This helps CCP identify who is making requests to ESI.

### Configuration Validation
The config file is validated on startup and will check:
- `watchedIds`: Must be a non-empty array of numbers
- `slackWebhookUrl`: Must be a valid Slack webhook URL starting with "https://hooks.slack.com/services/"
- `userAgent`: Must include contact information in parentheses, e.g., "YourApp/1.0 (your@email.com)"

## Installation Instructions

### 1. Prerequisites
- Docker and Docker Compose installed
- A Slack workspace with permissions to create webhooks
- Corporation or Alliance IDs you want to monitor

### 2. Create Slack Webhook
1. Go to your Slack workspace settings
2. Navigate to Apps → Create → Incoming Webhooks
3. Click "Add New Webhook to Workspace"
4. Choose the channel where you want the killmails to appear
5. Copy the webhook URL (it starts with https://hooks.slack.com/services/)

### 3. Setup Project
1. Clone this repository:
```
bash
git clone https://github.com/calli-eve/eve-zkill-slackbot
cd eve-killmail-bot
```

2. Create a `config.json` file:
```
{
    "watchedIds": [
        98600992,  // Corp or Alliance ID
        98600993   // Can add multiple IDs
    ],
    "slackWebhookUrl": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
    "userAgent": "EVE Killmail Bot/1.0 (your@email.com)"  // Identify your app to ESI
}
```
3. Build and start with Docker:
```
docker-compose up --build -d
```


