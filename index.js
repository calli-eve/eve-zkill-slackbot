import fetch from 'node-fetch';
import moment from 'moment';
import config from './config.json' assert { type: 'json' };
import { validateConfig } from './config.schema.js';
import { updateHealthMetrics, checkHealth } from './health.js';

// Validate configuration
const validatedConfig = validateConfig(config);

// Create a set of watched IDs for faster lookups
const WATCHED_IDS = new Set(validatedConfig.watchedIds);

// Cache for ESI lookups
const cache = {
    characters: new Map(),
    ships: new Map(),
    systems: new Map(),
    corporations: new Map(),
    alliances: new Map(),
    killmails: new Map()
};

// Create a simple HTTP server for health checks
const server = new (await import('http')).createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(checkHealth()));
    } else {
        res.writeHead(404);
        res.end();
    }
});
server.listen(8080);

const fetchFromESI = async (path) => {
    try {
        const response = await fetch(`https://esi.evetech.net/latest${path}`, {
            headers: {
                'User-Agent': validatedConfig.userAgent
            }
        });
        if (!response.ok) throw new Error(`ESI HTTP error! status: ${response.status}`);
        updateHealthMetrics('esi');
        return await response.json();
    } catch (error) {
        console.error(`ESI Error (${path}):`, error);
        return null;
    }
};

const getCharacterInfo = async (characterId) => {
    if (!characterId) return { name: 'Unknown' };
    if (cache.characters.has(characterId)) return cache.characters.get(characterId);
    
    const info = await fetchFromESI(`/characters/${characterId}/`);
    if (info) {
        cache.characters.set(characterId, info);
        return info;
    }
    return { name: 'Unknown' };
};

const getShipInfo = async (shipTypeId) => {
    if (!shipTypeId) return { name: 'Unknown Ship' };
    if (cache.ships.has(shipTypeId)) return cache.ships.get(shipTypeId);
    
    const info = await fetchFromESI(`/universe/types/${shipTypeId}/`);
    if (info) {
        cache.ships.set(shipTypeId, info);
        return info;
    }
    return { name: 'Unknown Ship' };
};

const getSystemInfo = async (systemId) => {
    if (!systemId) return { name: 'Unknown System' };
    if (cache.systems.has(systemId)) return cache.systems.get(systemId);
    
    const info = await fetchFromESI(`/universe/systems/${systemId}/`);
    if (info) {
        cache.systems.set(systemId, info);
        return info;
    }
    return { name: 'Unknown System' };
};

const getCorpInfo = async (corpId) => {
    if (!corpId) return { name: 'Unknown' };
    if (cache.corporations.has(corpId)) return cache.corporations.get(corpId);
    
    const info = await fetchFromESI(`/corporations/${corpId}/`);
    if (info) {
        cache.corporations.set(corpId, info);
        return info;
    }
    return { name: 'Unknown' };
};

const getAllianceInfo = async (allianceId) => {
    if (!allianceId) return null;
    if (cache.alliances.has(allianceId)) return cache.alliances.get(allianceId);

    const info = await fetchFromESI(`/alliances/${allianceId}/`);
    if (info) {
        cache.alliances.set(allianceId, info);
        return info;
    }
    return null;
};

const getKillmailData = async (killID, hash) => {
    const cacheKey = `${killID}-${hash}`;
    if (cache.killmails.has(cacheKey)) return cache.killmails.get(cacheKey);

    try {
        const response = await fetch(
            `https://esi.evetech.net/v1/killmails/${killID}/${hash}/`,
            { headers: { 'User-Agent': validatedConfig.userAgent } }
        );

        if (!response.ok) {
            console.error(`Failed to fetch killmail ${killID}: HTTP ${response.status}`);
            return null;
        }

        updateHealthMetrics('esi');
        const killmail = await response.json();
        cache.killmails.set(cacheKey, killmail);
        return killmail;
    } catch (error) {
        console.error(`Error fetching killmail ${killID}:`, error);
        return null;
    }
};

const formatSlackMessage = async (killmail, relevanceCheck, zkb) => {
    try {
        // Fetch all required information
        const victim = await getCharacterInfo(killmail.victim.character_id);
        const victimCorp = await getCorpInfo(killmail.victim.corporation_id);
        const victimAlliance = killmail.victim.alliance_id ? 
            await getAllianceInfo(killmail.victim.alliance_id) : null;
        const shipType = await getShipInfo(killmail.victim.ship_type_id);
        const system = await getSystemInfo(killmail.solar_system_id);
        
        const time = moment(killmail.killmail_time).format('DD-MM-YYYY HH:mm');
        const isKill = relevanceCheck.reason === 'attacker';
        
        // Format victim affiliation with clickable links
        const victimAffiliation = [
            `[<https://zkillboard.com/corporation/${killmail.victim.corporation_id}/|${victimCorp.name}>]`,
            victimAlliance ? `[<https://zkillboard.com/alliance/${killmail.victim.alliance_id}/|${victimAlliance.name}>]` : ''
        ].filter(Boolean).join(' ');
        
        // Get final blow attacker info
        const finalBlowAttacker = killmail.attackers.find(a => a.final_blow);
        const finalBlowChar = await getCharacterInfo(finalBlowAttacker.character_id);
        const finalBlowField = [{
            type: "mrkdwn",
            text: "*Final Blow*"
        }, {
            type: "mrkdwn",
            text: finalBlowChar.name
        }];

        // Get top damage attacker info
        const topDamageAttacker = killmail.attackers.reduce((prev, current) => 
            (current.damage_done > prev.damage_done) ? current : prev
        );
        const topDamageChar = await getCharacterInfo(topDamageAttacker.character_id);
        const topDamageField = [{
            type: "mrkdwn",
            text: "*Top Damage*"
        }, {
            type: "mrkdwn",
            text: topDamageChar.name
        }];

        // Count and get attacker ships info
        const attackerShips = new Map();
        killmail.attackers.forEach(attacker => {
            const count = attackerShips.get(attacker.ship_type_id) || 0;
            attackerShips.set(attacker.ship_type_id, count + 1);
        });
        const [mostUsedShipId, shipCount] = [...attackerShips.entries()]
            .reduce((a, b) => (a[1] > b[1] ? a : b));
        const attackerShipInfo = await getShipInfo(mostUsedShipId);
        const attackerShipField = [{
            type: "mrkdwn",
            text: "*Attacker Ship*"
        }, {
            type: "mrkdwn",
            text: `${attackerShipInfo.name} (${shipCount})`
        }];

        return {
            attachments: [{
                color: isKill ? '#00cc00' : '#cc0000',
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `_${time}_ <https://zkillboard.com/kill/${killmail.killmail_id}/|*zKill*>\n` +
                                  `<https://zkillboard.com/character/${killmail.victim.character_id}/|${victim.name}> ${victimAffiliation}\n` +
                                  `${shipType.name} in ${system.name}`
                        },
                        fields: [...finalBlowField, ...topDamageField, ...attackerShipField],
                        accessory: {
                            type: 'image',
                            image_url: `https://images.evetech.net/types/${killmail.victim.ship_type_id}/render?size=128`,
                            alt_text: shipType.name
                        }
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `Estimated value: ${new Intl.NumberFormat('en-US', {
                                maximumFractionDigits: 0
                            }).format(zkb.totalValue)} ISK`
                        }
                    }
                ]
            }]
        };
    } catch (error) {
        console.error('Error formatting Slack message:', error);
        return null;
    }
};

const postToSlack = async (message) => {
    try {
        const response = await fetch(validatedConfig.slackWebhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(message)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        updateHealthMetrics('slack');
    } catch (error) {
        console.error('Error posting to Slack:', error);
    }
};

const checkKillmailRelevance = (killmail) => {
    // If watchedIds is empty, all kills are relevant
    if (validatedConfig.watchedIds.length === 0) {
        return {
            isRelevant: true,
            reason: 'all'
        };
    }

    // Check if victim is from watched entities
    if (WATCHED_IDS.has(killmail.victim.corporation_id) || 
        (killmail.victim.alliance_id && WATCHED_IDS.has(killmail.victim.alliance_id))) {
        return {
            isRelevant: true,
            reason: 'victim'
        };
    }

    // Check if any attacker is from watched entities
    const relevantAttacker = killmail.attackers.find(attacker => 
        WATCHED_IDS.has(attacker.corporation_id) || 
        (attacker.alliance_id && WATCHED_IDS.has(attacker.alliance_id))
    );
    
    if (relevantAttacker) {
        return {
            isRelevant: true,
            reason: 'attacker'
        };
    }

    return {
        isRelevant: false,
        reason: null
    };
};

const DELAY_BETWEEN_NO_MAILS = 5 * 60 * 1000
const BACK_OFF_ON_ERRORS = 10 * 60 * 1000

const pollRedisQ = async () => {
    console.log('Starting RedisQ polling...');
    console.log(`Using queue ID: ${validatedConfig.queueId}`);
    
    while (true) {
        try {
            const response = await fetch(`https://zkillredisq.stream/listen.php?queueID=${validatedConfig.queueId}`, {
                headers: {
                    'User-Agent': validatedConfig.userAgent
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            updateHealthMetrics('poll');
            const data = await response.json();
            if (data.package) {
                const killID = data.package.killID;
                // Fetch killmail from ESI using killID and hash
                console.log(`Fetching killmail ${killID} from ESI...`);
                const killmail = await getKillmailData(killID, data.package.zkb.hash);

                if (!killmail) {
                    console.error(`Failed to fetch killmail ${killID}, skipping...`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }

                const zkb = data.package.zkb;
                const relevanceCheck = checkKillmailRelevance(killmail);

                if (relevanceCheck.isRelevant) {
                    const message = await formatSlackMessage(killmail, relevanceCheck, zkb);
                    if(!message) return;

                    if (validatedConfig.slackWebhookUrl) {
                        await postToSlack(message);
                    } else {
                        console.log(message);
                    }
                }
                // Ratelimit is 2 requests per second
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                // Sleep for 5 minutes if no new mails
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_NO_MAILS));
            }
            
        } catch (error) {
            console.error('Error polling RedisQ:', error);
            await new Promise(resolve => setTimeout(resolve, BACK_OFF_ON_ERRORS));
            // Exit process on specific connection errors
            if (error.message.includes('502') || 
                error.message.includes('socket hang up') || 
                error.code === 'ECONNRESET') {
                console.error('Fatal connection error detected. Exiting process...');
                process.exit(1);
            }
            
        }
    }
};

console.log('Starting zKillboard RedisQ listener...');
if (validatedConfig.watchedIds.length > 0) {
    console.log(`Watching ${validatedConfig.watchedIds.length} entities`);
} else {
    console.log('Watching all killmails');
}
pollRedisQ(); 