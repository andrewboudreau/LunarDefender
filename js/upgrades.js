// ===========================================
// Lunar Defender - Upgrade System
// ===========================================

export const UPGRADES = {
    SPREAD_SHOT: {
        id: 'spread_shot',
        name: 'Spread Shot',
        desc: 'Fire 3 bullets in a cone',
        color: '#f4a',
        ammo: 30,
        type: 'primary'  // Modifies primary fire
    },
    RAPID_FIRE: {
        id: 'rapid_fire',
        name: 'Rapid Fire',
        desc: 'Shoot twice as fast',
        color: '#fa4',
        ammo: 50,
        type: 'primary'
    },
    EXPLOSIVES: {
        id: 'explosives',
        name: 'Explosive Rounds',
        desc: 'Bullets explode on impact',
        color: '#f44',
        ammo: 15,
        type: 'primary'
    },
    SHIELD: {
        id: 'shield',
        name: 'Energy Shield',
        desc: 'Protect from one crash',
        color: '#4af',
        ammo: 1,
        type: 'passive'  // Always active until used
    },
    BIG_BULLETS: {
        id: 'big_bullets',
        name: 'Heavy Rounds',
        desc: 'Larger, more powerful shots',
        color: '#a4f',
        ammo: 20,
        type: 'primary'
    },
    HOMING_MISSILES: {
        id: 'homing_missiles',
        name: 'Homing Missiles',
        desc: 'Lock-on missiles that track rocks',
        color: '#4ff',
        ammo: 8,
        type: 'secondary'  // Alt-fire weapon
    },
    PROXIMITY_MINES: {
        id: 'proximity_mines',
        name: 'Proximity Mines',
        desc: 'Deploy mines that explode near rocks',
        color: '#f4f',
        ammo: 5,
        type: 'secondary'
    }
};

export function getRandomUpgrade() {
    const keys = Object.keys(UPGRADES);
    return UPGRADES[keys[Math.floor(Math.random() * keys.length)]];
}

// Get upgrade with ammo for a ship
export function getShipUpgrade(ship, upgradeId) {
    if (!ship || !ship.upgrades) return null;
    return ship.upgrades.find(u => u.id === upgradeId);
}

export function hasUpgrade(ship, upgradeId) {
    const upgrade = getShipUpgrade(ship, upgradeId);
    return upgrade && upgrade.ammo > 0;
}

export function useUpgradeAmmo(ship, upgradeId, amount = 1) {
    const upgrade = getShipUpgrade(ship, upgradeId);
    if (upgrade) {
        upgrade.ammo -= amount;
        if (upgrade.ammo <= 0) {
            // Remove depleted upgrade
            ship.upgrades = ship.upgrades.filter(u => u.id !== upgradeId);
            return true; // Was depleted
        }
    }
    return false;
}

export function addUpgradeToShip(ship, upgradeData) {
    if (!ship.upgrades) ship.upgrades = [];

    // Check if we already have this upgrade
    const existing = ship.upgrades.find(u => u.id === upgradeData.id);
    if (existing) {
        // Add ammo to existing
        existing.ammo += upgradeData.ammo;
    } else {
        // Add new upgrade with ammo
        ship.upgrades.push({
            id: upgradeData.id,
            ammo: upgradeData.ammo,
            type: upgradeData.type
        });
    }
}
