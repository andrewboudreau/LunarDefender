// ===========================================
// Lunar Defender - Bot AI
// ===========================================

export function getBotInput(ship, rocks) {
    if (!ship || rocks.length === 0) {
        return { left: false, right: false, up: false, space: false };
    }

    const distance = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    // Find nearest rock
    let nearestRock = null;
    let nearestDist = Infinity;
    for (const rock of rocks) {
        const d = distance(ship, rock);
        if (d < nearestDist) {
            nearestDist = d;
            nearestRock = rock;
        }
    }

    if (!nearestRock) {
        return { left: false, right: false, up: false, space: false };
    }

    // Calculate angle to rock
    const targetAngle = Math.atan2(
        nearestRock.y - ship.y,
        nearestRock.x - ship.x
    );

    // Normalize angles
    let angleDiff = targetAngle - ship.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Bot inputs
    const input = {
        left: angleDiff < -0.1,
        right: angleDiff > 0.1,
        up: nearestDist > 150 && Math.abs(angleDiff) < 0.5, // Thrust toward if far and aimed
        space: Math.abs(angleDiff) < 0.2 && nearestDist < 400 // Shoot if aimed at rock
    };

    return input;
}
