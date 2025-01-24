# EVE Online Killmail to Slack Bot

A Node.js application that monitors zKillboard's RedisQ for killmails and posts relevant ones to Slack (or console). The bot monitors specific corporations or alliances and posts their kills and losses in a formatted message.

## Features

- Real-time killmail monitoring via RedisQ
- Configurable corporation/alliance ID watching
- Optional Slack integration
- Formatted messages with:
  - Kill/Loss color coding (green/red)
  - Ship icons
  - Links to zKillboard
  - Final blow and top damage information
  - Ship type counts for attackers
  - ISK value formatting
- ESI integration for resolving names
- Automatic error recovery
- Docker support

## Configuration Options

`config.json` parameters:
```json
{
    "watchedIds": [
        98600992,  // Corp or Alliance ID
        98600993   // Can add multiple IDs
    ],
    "slackWebhookUrl": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",  // Optional
    "userAgent": "EVE Killmail Bot/1.0 (your@email.com)",  // Identify your app to ESI
    "queueId": "my-custom-queue"  // Optional, randomly generated if not provided
}
```

### Configuration Details

- `watchedIds`: Array of corporation or alliance IDs to monitor (optional)
  - Empty array or omitted to monitor all killmails
  - Specific IDs to filter for only those corporations/alliances
- `slackWebhookUrl`: Slack webhook URL for posting messages (optional - if not provided, messages will be logged to console)
- `userAgent`: Identifies your application to ESI (required)
  - Should include your application name and version
  - Must include contact email in parentheses
- `queueId`: Unique identifier for your RedisQ queue (optional)
  - If not provided, a random one will be generated
  - Consistent queueId allows for maintaining position in queue across restarts

### Configuration Examples

Monitor all killmails:
```json
{
    "watchedIds": [],  // Empty array to watch all kills
    "userAgent": "MyKillBot (example@example.com)"
}
```

Monitor specific entities:
```json
{
    "watchedIds": [
        98600992,  // Corp or Alliance ID
        98600993   // Can add multiple IDs
    ],
    "userAgent": "MyKillBot (example@example.com)"
}
```

### Configuration Validation
The config file is validated on startup and will check:
- `watchedIds`: Array of numbers. Empty array or omitted to monitor all killmails
- `slackWebhookUrl`: If provided, must be a valid Slack webhook URL starting with "https://hooks.slack.com/services/"
- `userAgent`: Must include contact information in parentheses, e.g., "YourApp/1.0 (your@email.com)"
- `queueId`: Must be a non-empty string

## Installation Instructions

### 1. Prerequisites
- Docker and Docker Compose installed
- (Optional) A Slack workspace with permissions to create webhooks
- Corporation or Alliance IDs you want to monitor

### 2. Create Slack Webhook (Optional)
1. Go to your Slack workspace settings
2. Navigate to Apps → Create → Incoming Webhooks
3. Click "Add New Webhook to Workspace"
4. Choose the channel where you want the killmails to appear
5. Copy the webhook URL (it starts with https://hooks.slack.com/services/)

### 3. Setup Project
1. Clone this repository:
```bash
git clone https://github.com/calli-eve/eve-zkill-slackbot
cd eve-killmail-bot
```

2. Create a `config.json` file:
```json
{
    "watchedIds": [
        98600992,  // Corp or Alliance ID
        98600993   // Can add multiple IDs
    ],
    "slackWebhookUrl": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",  // Optional
    "userAgent": "EVE Killmail Bot/1.0 (your@email.com)",
    "queueId": "my-custom-queue"  // Optional
}
```

3. Build and start with Docker:
```bash
docker-compose up --build -d
```

## Running Without Slack
If you don't provide a `slackWebhookUrl` in the config, the bot will output formatted killmail information to the console instead of posting to Slack. This can be useful for testing or if you want to pipe the output elsewhere.


