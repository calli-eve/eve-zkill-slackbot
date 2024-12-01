import WebSocket from 'ws';
import fetch from 'node-fetch';
import moment from 'moment';
import config from './config.json' assert { type: 'json' };
import { validateConfig } from './config.schema.js';

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
    alliances: new Map()
};

const fetchFromESI = async (path) => {
    try {
        const response = await fetch(`https://esi.evetech.net/latest${path}`, {
            headers: {
                'User-Agent': validatedConfig.userAgent
            }
        });
        if (!response.ok) throw new Error(`ESI HTTP error! status: ${response.status}`);
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

const formatSlackMessage = async (killmail, relevanceCheck) => {
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
                            image_url: `https://images.evetech.net/types/${killmail.victim.ship_type_id}/icon?size=128`,
                            alt_text: shipType.name
                        }
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `Estimated value: ${new Intl.NumberFormat('en-US', {
                                maximumFractionDigits: 0
                            }).format(killmail.zkb.totalValue)} ISK`
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
    } catch (error) {
        console.error('Error posting to Slack:', error);
    }
};

const checkKillmailRelevance = (killmail) => {
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

const connectWebSocket = () => {
    const ws = new WebSocket('wss://zkillboard.com/websocket/');

    ws.on('open', () => {
        console.log('Connected to zKillboard WebSocket');
        
        const subscription = {
            action: "sub",
            channel: "killstream"
        };
        
        ws.send(JSON.stringify(subscription));
    });

    ws.on('message', async (data) => {
        try {
            const killmail = JSON.parse(data);
            const relevanceCheck = checkKillmailRelevance(killmail);
            
            if (relevanceCheck.isRelevant) {
                const message = await formatSlackMessage(killmail, relevanceCheck);
                if (message) {
                    await postToSlack(message);
                }
            }
        } catch (error) {
            console.error('Error processing killmail:', error);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed. Reconnecting in 5 seconds...');
        setTimeout(connectWebSocket, 5000);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        ws.close();
    });
};

console.log('Starting zKillboard WebSocket listener...');
console.log(`Watching ${validatedConfig.watchedIds.length} entities`);
connectWebSocket(); 