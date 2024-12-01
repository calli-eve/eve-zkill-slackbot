import { z } from 'zod';

export const ConfigSchema = z.object({
    watchedIds: z.array(z.number())
        .min(1, "At least one ID must be watched")
        .describe("Array of corporation or alliance IDs to monitor"),
    
    slackWebhookUrl: z.string()
        .url("Must be a valid URL")
        .startsWith("https://hooks.slack.com/services/", "Must be a valid Slack webhook URL")
        .describe("Slack webhook URL for posting messages"),
    
    userAgent: z.string()
        .min(5, "User agent must be descriptive")
        .regex(/^.+\(.+@.+\)$/, "User agent must include contact email in parentheses")
        .describe("User agent string for ESI requests")
});

export const validateConfig = (config) => {
    try {
        return ConfigSchema.parse(config);
    } catch (error) {
        console.error("Configuration validation failed:");
        error.errors.forEach(err => {
            console.error(`- ${err.path.join('.')}: ${err.message}`);
        });
        process.exit(1);
    }
}; 