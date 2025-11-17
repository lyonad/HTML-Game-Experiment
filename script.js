const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const gravity = 0.5;
let jumpStrength = -12; // kept mutable (unused by skins) - slightly increased for easier gameplay
let moveSpeed = 5;      // kept mutable (unused by skins)
const friction = 0.8;
// effect movement threshold: only spawn move effects when |vx| > this
const MOVE_EFFECT_VX_THRESHOLD = 0.6;

// Color variables for skins
let bgColor = '#D3D3D3';
let platformColor = '#696969';
let playerColor = '#808080';
let foodColor = '#A9A9A9';

// Color helpers: parse simple hex/rgb(a) and choose contrasting text color
function parseColorToRGB(str) {
    if (!str) return null;
    str = String(str).trim();
    if (str.startsWith('#')) {
        let hex = str.slice(1);
        if (hex.length === 3) hex = hex.split('').map(s => s + s).join('');
        if (hex.length !== 6) return null;
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return { r, g, b, a: 1 };
    }
    const rgba = str.match(/rgba?\(([^)]+)\)/);
    if (rgba) {
        const parts = rgba[1].split(',').map(s => s.trim());
        const r = parseInt(parts[0]);
        const g = parseInt(parts[1]);
        const b = parseInt(parts[2]);
        const a = parts[3] ? parseFloat(parts[3]) : 1;
        return { r, g, b, a };
    }
    return null;
}

function getContrastColor(colorStr) {
    const c = parseColorToRGB(colorStr) || { r: 0, g: 0, b: 0 };
    const brightness = (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
    return brightness > 140 ? '#000' : '#fff';
}

function roundRect(ctx, x, y, w, h, r) {
    if (r < 0) r = 0;
    if (r > h / 2) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
}

// Helper function to get gradient colors for a category
function getGradientColors(category) {
    const skinId = selectedSkins[category];
    if (!skinId) return null;
    const item = shopItems.find(i => i.id === skinId);
    if (item && item.gradient && Array.isArray(item.gradient)) {
        return item.gradient;
    }
    return null;
}

let camera = { x: 0, y: 0 };

let player = {
    x: 100,
    y: 50,
    vx: 0,
    vy: 0,
    width: 24,
    height: 24,
    onGround: false,
    rotation: 0,
    standingOnPlatform: null // Track which platform player is standing on
};

let foods = [];
let platforms = [
    {x: 0, y: canvas.height - 20, width: 400, height: 20, type: 'normal'}, // initial ground
];

let score = 0;
let keys = {};
// Cheat code input buffer
let cheatBuffer = '';
const CHEAT_CODE = 'momomo';
let cheatMsg = '';
let cheatMsgTimer = 0; // frames remaining to display message
let lastPlatformEnd = 400;

// Game enhancement features
let comboCount = 0;
let comboTimer = 0;
const COMBO_TIMEOUT = 120; // frames (2 seconds at 60fps)
let comboMultiplier = 1;
let screenShake = { x: 0, y: 0, intensity: 0 };
let playerCanDoubleJump = false;
let doubleJumpUsed = false;
let speedBoostActive = false;
let speedBoostTimer = 0;
const SPEED_BOOST_DURATION = 300; // frames (5 seconds)
let powerUps = []; // Speed boost collectibles

function generatePlatform() {
    const minWidth = 80;
    const maxWidth = 150;
    const width = minWidth + Math.random() * (maxWidth - minWidth);
    const height = 20;
    const x = lastPlatformEnd + 50 + Math.random() * 100;
    const y = canvas.height - 150 - Math.random() * 150;

    // Determine platform type
    const rand = Math.random();
    let type = 'normal';
    let props = {};
    
    if (rand < 0.15) {
        // 15% chance for moving platform (horizontal)
        type = 'moving';
        props = {
            moveSpeed: 1 + Math.random() * 1.5,
            moveRange: 80 + Math.random() * 100,
            startX: x,
            direction: Math.random() > 0.5 ? 1 : -1
        };
    } else if (rand < 0.25) {
        // 10% chance for bouncy platform
        type = 'bouncy';
        props = { bounceStrength: -15 };
    } else if (rand < 0.35) {
        // 10% chance for moving platform (vertical)
        type = 'movingVertical';
        props = {
            moveSpeed: 0.5 + Math.random() * 0.8,
            moveRange: 60 + Math.random() * 80,
            startY: y,
            direction: Math.random() > 0.5 ? 1 : -1
        };
    }

    platforms.push({x, y, width, height, type, ...props});
    lastPlatformEnd = x + width;
}

function addFoodToPlatform(platform) {
    // Remove any existing food on this platform
    foods = foods.filter(f => !(f.x >= platform.x && f.x < platform.x + platform.width));
    const foodX = platform.x + Math.random() * (platform.width - 20);
    foods.push({
        x: foodX,
        y: platform.y - 25,
        width: 15,
        height: 15,
        bounceTime: 0
    });
}

function generateFood(allowInView = false) {
    if (platforms.length > 1) {
        const platform = platforms[Math.floor(Math.random() * (platforms.length - 1)) + 1]; // skip initial ground
        const foodX = platform.x + Math.random() * (platform.width - 20);
        if (allowInView || foodX > camera.x + canvas.width) {
            addFoodToPlatform(platform);
        }
    }
}

function drawGame() {
    // Draw background with gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    const bgGradientColors = getGradientColors('background');
    if (bgGradientColors && bgGradientColors.length > 1) {
        // Rainbow gradient
        const step = 1 / (bgGradientColors.length - 1);
        for (let i = 0; i < bgGradientColors.length; i++) {
            bgGradient.addColorStop(i * step, bgGradientColors[i]);
        }
    } else {
        // Normal gradient
        const rgb = parseColorToRGB(bgColor) || { r: 211, g: 211, b: 211 };
        const darkerBg = `rgb(${Math.max(0, rgb.r - 20)}, ${Math.max(0, rgb.g - 20)}, ${Math.max(0, rgb.b - 20)})`;
        bgGradient.addColorStop(0, bgColor);
        bgGradient.addColorStop(1, darkerBg);
    }
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw platforms with depth
    for (let platform of platforms) {
        const screenX = platform.x - camera.x + screenShake.x;
        const screenY = platform.y + screenShake.y;
        if (screenX + platform.width > 0 && screenX < canvas.width) {
            // Determine platform color based on type
            let platColor = platformColor;
            if (platform.type === 'bouncy') {
                platColor = '#4CAF50'; // Green for bouncy
            } else if (platform.type === 'moving' || platform.type === 'movingVertical') {
                platColor = '#2196F3'; // Blue for moving
            }
            
            // Draw platform with gradient
            const platGradient = ctx.createLinearGradient(screenX, screenY, screenX, screenY + platform.height);
            const platGradientColors = getGradientColors('platform');
            if (platGradientColors && platGradientColors.length > 1) {
                // Rainbow gradient
                const step = 1 / (platGradientColors.length - 1);
                for (let i = 0; i < platGradientColors.length; i++) {
                    platGradient.addColorStop(i * step, platGradientColors[i]);
                }
            } else {
                // Normal gradient
                const platRgb = parseColorToRGB(platColor) || { r: 105, g: 105, b: 105 };
                const lighterPlat = `rgb(${Math.min(255, platRgb.r + 30)}, ${Math.min(255, platRgb.g + 30)}, ${Math.min(255, platRgb.b + 30)})`;
                const darkerPlat = `rgb(${Math.max(0, platRgb.r - 15)}, ${Math.max(0, platRgb.g - 15)}, ${Math.max(0, platRgb.b - 15)})`;
                platGradient.addColorStop(0, lighterPlat);
                platGradient.addColorStop(1, darkerPlat);
            }
            ctx.fillStyle = platGradient;
            ctx.fillRect(screenX, screenY, platform.width, platform.height);
            
            // Draw highlight on top edge
            ctx.fillStyle = `rgba(255, 255, 255, 0.15)`;
            ctx.fillRect(screenX, screenY, platform.width, 2);
            
            // Draw border
            ctx.strokeStyle = `rgba(0, 0, 0, 0.3)`;
            ctx.lineWidth = 1;
            ctx.strokeRect(screenX, screenY, platform.width, platform.height);
        }
    }

    // Draw power-ups
    for (let powerUp of powerUps) {
        const screenX = powerUp.x - camera.x + screenShake.x;
        const screenY = powerUp.y + screenShake.y;
        if (screenX + 20 > 0 && screenX < canvas.width) {
            // Draw speed boost power-up (lightning bolt)
            ctx.save();
            ctx.translate(screenX + 10, screenY + 10);
            ctx.rotate(powerUp.rotation || 0);
            ctx.fillStyle = '#FFD700';
            ctx.strokeStyle = '#FFA500';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -8);
            ctx.lineTo(-5, 0);
            ctx.lineTo(0, 2);
            ctx.lineTo(5, 0);
            ctx.lineTo(0, 8);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }

    // Draw player with enhanced graphics
    ctx.save();
    ctx.translate(screenShake.x, screenShake.y);
    const playerScreenX = player.x - camera.x;
    const playerScreenY = player.y;
    const centerX = playerScreenX + player.width / 2;
    const centerY = playerScreenY + player.height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(player.rotation);
    
    // Get player color and gradient
    const playerRgb = parseColorToRGB(playerColor) || { r: 128, g: 128, b: 128 };
    const playerGradientColors = getGradientColors('player');
    
    // Draw player glow
    if (!player.onGround) {
        const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, player.width * 0.8);
        if (playerGradientColors && playerGradientColors.length > 1) {
            // Use first and middle colors of rainbow for glow
            const firstColor = parseColorToRGB(playerGradientColors[0]) || { r: 255, g: 0, b: 0 };
            const midColor = parseColorToRGB(playerGradientColors[Math.floor(playerGradientColors.length / 2)]) || { r: 255, g: 255, b: 0 };
            glowGradient.addColorStop(0, `rgba(${firstColor.r}, ${firstColor.g}, ${firstColor.b}, 0.4)`);
            glowGradient.addColorStop(1, `rgba(${midColor.r}, ${midColor.g}, ${midColor.b}, 0)`);
        } else {
            glowGradient.addColorStop(0, `rgba(${playerRgb.r}, ${playerRgb.g}, ${playerRgb.b}, 0.4)`);
            glowGradient.addColorStop(1, `rgba(${playerRgb.r}, ${playerRgb.g}, ${playerRgb.b}, 0)`);
        }
        ctx.fillStyle = glowGradient;
        ctx.fillRect(-player.width * 0.6, -player.height * 0.6, player.width * 1.2, player.height * 1.2);
    }
    
    // Draw player body with gradient
    const playerGradient = ctx.createLinearGradient(-player.width / 2, -player.height / 2, player.width / 2, player.height / 2);
    if (playerGradientColors && playerGradientColors.length > 1) {
        // Rainbow gradient
        const step = 1 / (playerGradientColors.length - 1);
        for (let i = 0; i < playerGradientColors.length; i++) {
            playerGradient.addColorStop(i * step, playerGradientColors[i]);
        }
    } else {
        // Normal gradient
        const lighterPlayer = `rgb(${Math.min(255, playerRgb.r + 40)}, ${Math.min(255, playerRgb.g + 40)}, ${Math.min(255, playerRgb.b + 40)})`;
        const darkerPlayer = `rgb(${Math.max(0, playerRgb.r - 20)}, ${Math.max(0, playerRgb.g - 20)}, ${Math.max(0, playerRgb.b - 20)})`;
        playerGradient.addColorStop(0, lighterPlayer);
        playerGradient.addColorStop(1, darkerPlayer);
    }
    ctx.fillStyle = playerGradient;
    
    // Draw rounded rectangle for player
    const radius = 4;
    ctx.beginPath();
    ctx.moveTo(-player.width / 2 + radius, -player.height / 2);
    ctx.lineTo(player.width / 2 - radius, -player.height / 2);
    ctx.quadraticCurveTo(player.width / 2, -player.height / 2, player.width / 2, -player.height / 2 + radius);
    ctx.lineTo(player.width / 2, player.height / 2 - radius);
    ctx.quadraticCurveTo(player.width / 2, player.height / 2, player.width / 2 - radius, player.height / 2);
    ctx.lineTo(-player.width / 2 + radius, player.height / 2);
    ctx.quadraticCurveTo(-player.width / 2, player.height / 2, -player.width / 2, player.height / 2 - radius);
    ctx.lineTo(-player.width / 2, -player.height / 2 + radius);
    ctx.quadraticCurveTo(-player.width / 2, -player.height / 2, -player.width / 2 + radius, -player.height / 2);
    ctx.closePath();
    ctx.fill();
    
    // Draw player border
    ctx.strokeStyle = `rgba(0, 0, 0, 0.4)`;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.restore();

    // Draw combo display
    if (comboCount > 1) {
        ctx.save();
        ctx.translate(screenShake.x, screenShake.y);
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';
        const comboText = `${comboCount}x COMBO!`;
        const comboX = canvas.width / 2;
        const comboY = 80;
        ctx.strokeText(comboText, comboX, comboY);
        ctx.fillText(comboText, comboX, comboY);
        ctx.restore();
    }

    // Draw foods with enhanced graphics
    for (let food of foods) {
        const screenX = food.x - camera.x + screenShake.x;
        if (screenX + food.width > 0 && screenX < canvas.width) {
            const yOffset = Math.sin(food.bounceTime) * 5;
            const foodY = food.y + yOffset;
            const foodCenterX = screenX + food.width / 2;
            const foodCenterY = foodY + food.height / 2;
            
            ctx.save();
            
            // Draw food glow
            const foodRgb = parseColorToRGB(foodColor) || { r: 169, g: 169, b: 169 };
            const glowGrad = ctx.createRadialGradient(foodCenterX, foodCenterY, 0, foodCenterX, foodCenterY, food.width * 0.8);
            glowGrad.addColorStop(0, `rgba(${foodRgb.r}, ${foodRgb.g}, ${foodRgb.b}, 0.6)`);
            glowGrad.addColorStop(1, `rgba(${foodRgb.r}, ${foodRgb.g}, ${foodRgb.b}, 0)`);
            ctx.fillStyle = glowGrad;
            ctx.fillRect(screenX - 3, foodY - 3, food.width + 6, food.height + 6);
            
            // Draw food body with gradient
            const foodGradient = ctx.createRadialGradient(
                foodCenterX - food.width * 0.2, 
                foodCenterY - food.height * 0.2, 
                0,
                foodCenterX, 
                foodCenterY, 
                food.width * 0.7
            );
            // Normal gradient using default food color
            const lighterFood = `rgb(${Math.min(255, foodRgb.r + 50)}, ${Math.min(255, foodRgb.g + 50)}, ${Math.min(255, foodRgb.b + 50)})`;
            const darkerFood = `rgb(${Math.max(0, foodRgb.r - 10)}, ${Math.max(0, foodRgb.g - 10)}, ${Math.max(0, foodRgb.b - 10)})`;
            foodGradient.addColorStop(0, lighterFood);
            foodGradient.addColorStop(1, darkerFood);
            ctx.fillStyle = foodGradient;
            ctx.beginPath();
            ctx.arc(foodCenterX, foodCenterY, food.width / 2, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw shine/reflection
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.beginPath();
            ctx.ellipse(foodCenterX - food.width * 0.15, foodCenterY - food.height * 0.15, food.width * 0.2, food.height * 0.25, -0.5, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw border
            ctx.strokeStyle = `rgba(0, 0, 0, 0.3)`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(foodCenterX, foodCenterY, food.width / 2, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
        }
    }

    // Draw cheat message (if any) at bottom-right matching the `#score` HUD style
    if (cheatMsgTimer > 0 && cheatMsg) {
        ctx.save();
        // Match CSS: font-size 2vw, padding 1vh/2vw, border-radius 1vw
        const fontSize = Math.max(12, Math.round(canvas.width * 0.02)); // ~2vw
        ctx.font = `${fontSize}px 'Oswald', sans-serif`; // Use UI font for cheat message
        const paddingX = Math.round(canvas.width * 0.02); // 2vw
        const paddingY = Math.round(canvas.height * 0.01); // 1vh
        const textWidth = ctx.measureText(cheatMsg).width;
        const rectW = Math.round(textWidth + paddingX * 2);
        const rectH = Math.round(fontSize + paddingY * 2);
        const rectX = Math.round(canvas.width - (canvas.width * 0.02) - rectW); // 2vw from right
        const rectY = Math.round(canvas.height - (canvas.height * 0.02) - rectH); // 2vh from bottom

        // background: semi-transparent black like #score
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        const radius = Math.max(4, Math.round(canvas.width * 0.01)); // ~1vw
        roundRect(ctx, rectX, rectY, rectW, rectH, radius);

        // text: white, vertically centered
        ctx.fillStyle = '#fff';
        const textX = rectX + paddingX;
        const textY = rectY + paddingY + fontSize * 0.8; // baseline adjustment
        ctx.fillText(cheatMsg, textX, textY);
        ctx.restore();
    }
}

function updatePlayer() {
    // Apply speed boost if active
    const currentMoveSpeed = speedBoostActive ? moveSpeed * 1.8 : moveSpeed;
    
    // Horizontal movement
    if (keys[37] || keys[65]) { // left arrow or A
        player.vx = -currentMoveSpeed;
    } else if (keys[39] || keys[68]) { // right arrow or D
        player.vx = currentMoveSpeed;
    } else {
        player.vx *= friction;
    }

    // Jump (ground jump)
    if ((keys[38] || keys[87] || keys[32]) && player.onGround) { // up arrow, W, or space
        player.vy = jumpStrength;
        player.onGround = false;
        doubleJumpUsed = false;
        // spawn jump effect (on jump initiation)
        spawnJumpEffect();
    }
    
    // Double jump (air jump)
    if ((keys[38] || keys[87] || keys[32]) && !player.onGround && !doubleJumpUsed && playerCanDoubleJump) {
        player.vy = jumpStrength * 0.9; // Slightly weaker than ground jump
        doubleJumpUsed = true;
        spawnJumpEffect();
        // Spawn particles for double jump
        for (let i = 0; i < 8; i++) {
            spawnParticle(player.x + player.width / 2, player.y + player.height, 
                (Math.random() - 0.5) * 4, Math.random() * 2, 30, 4, '#00FFFF');
        }
    }

    // Apply gravity
    player.vy += gravity;

    // Update rotation if in air
    if (!player.onGround) {
        player.rotation += 0.1; // spin speed
    } else {
        player.rotation = 0; // reset when on ground
        doubleJumpUsed = false; // Reset double jump when landing
    }

    // Update position
    player.x += player.vx;
    player.y += player.vy;

    // Update camera to follow player
    camera.x = Math.max(camera.x, Math.max(0, player.x - canvas.width * 0.25));

    // Prevent going left beyond camera
    player.x = Math.max(player.x, camera.x);

    // Update platform movement and move player with platform
    for (let platform of platforms) {
        if (platform.type === 'moving') {
            // Horizontal movement
            const oldX = platform.x;
            platform.x += platform.moveSpeed * platform.direction;
            const distance = Math.abs(platform.x - platform.startX);
            if (distance >= platform.moveRange) {
                platform.direction *= -1;
            }
            // Move player with horizontal platform
            if (player.standingOnPlatform === platform) {
                player.x += platform.x - oldX;
            }
        } else if (platform.type === 'movingVertical') {
            // Vertical movement
            const oldY = platform.y;
            platform.y += platform.moveSpeed * platform.direction;
            const distance = Math.abs(platform.y - platform.startY);
            if (distance >= platform.moveRange) {
                platform.direction *= -1;
            }
            // Move player with vertical platform
            if (player.standingOnPlatform === platform) {
                player.y += platform.y - oldY;
            }
        }
    }

    // Generate new platforms if needed
    while (lastPlatformEnd - camera.x < canvas.width * 2) {
        generatePlatform();
        let chance = 0.2 + Math.random() * 0.5; // 20% to 70% chance
        if (Math.random() < chance) {
            addFoodToPlatform(platforms[platforms.length - 1]);
        }
        // Small chance to spawn power-up
        if (Math.random() < 0.05) {
            const plat = platforms[platforms.length - 1];
            powerUps.push({
                x: plat.x + plat.width / 2 - 10,
                y: plat.y - 30,
                rotation: 0
            });
        }
    }

    // Update power-ups
    for (let powerUp of powerUps) {
        powerUp.rotation += 0.1;
    }

    // Check power-up collisions
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const powerUp = powerUps[i];
        if (player.x < powerUp.x + 20 && player.x + player.width > powerUp.x &&
            player.y < powerUp.y + 20 && player.y + player.height > powerUp.y) {
            // Collect power-up
            speedBoostActive = true;
            speedBoostTimer = SPEED_BOOST_DURATION;
            powerUps.splice(i, 1);
            // Spawn collection particles
            for (let j = 0; j < 15; j++) {
                spawnParticle(powerUp.x + 10, powerUp.y + 10,
                    (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 40, 5, '#FFD700');
            }
        }
    }

    // Update speed boost timer
    if (speedBoostActive) {
        speedBoostTimer--;
        if (speedBoostTimer <= 0) {
            speedBoostActive = false;
        }
    }

    // Check platform collisions
    player.onGround = false;
    player.standingOnPlatform = null;
    
    for (let platform of platforms) {
        if (player.x < platform.x + platform.width &&
            player.x + player.width > platform.x &&
            player.y < platform.y + platform.height &&
            player.y + player.height > platform.y) {
            // Collision detected
            if (player.vy >= 0 && player.y < platform.y) {
                // Landing on top
                player.y = platform.y - player.height;
                player.vy = 0;
                player.onGround = true;
                player.standingOnPlatform = platform; // Track which platform we're on
                
                // Check if bouncy platform
                if (platform.type === 'bouncy') {
                    player.vy = platform.bounceStrength;
                    player.onGround = false;
                    player.standingOnPlatform = null; // Not standing on bouncy platform after bounce
                    // Spawn bounce particles
                    for (let i = 0; i < 10; i++) {
                        spawnParticle(player.x + player.width / 2, player.y + player.height,
                            (Math.random() - 0.5) * 4, -Math.random() * 3, 30, 4, '#4CAF50');
                    }
                }
                // No screen shake for normal platforms
            } else if (player.vy < 0 && player.y + player.height > platform.y + platform.height) {
                // Hitting from below
                player.y = platform.y + platform.height;
                player.vy = 0;
            } else if (player.vx > 0 && player.x < platform.x) {
                // Hitting from left
                player.x = platform.x - player.width;
                player.vx = 0;
            } else if (player.vx < 0 && player.x + player.width > platform.x + platform.width) {
                // Hitting from right
                player.x = platform.x + platform.width;
                player.vx = 0;
            }
        }
    }

    // Update screen shake
    if (screenShake.intensity > 0) {
        screenShake.x = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.y = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.intensity *= 0.9;
        if (screenShake.intensity < 0.1) {
            screenShake.intensity = 0;
            screenShake.x = 0;
            screenShake.y = 0;
        }
    }

    // Prevent going too far left
    if (player.x < 0) player.x = 0;

    // Game over if fall off screen
    if (player.y > canvas.height && !isDead) {
        showDeathScreen();
    }
}

function checkFoodCollision() {
    for (let i = foods.length - 1; i >= 0; i--) {
        let food = foods[i];
        if (player.x < food.x + food.width &&
            player.x + player.width > food.x &&
            player.y < food.y + food.height &&
            player.y + player.height > food.y) {
            foods.splice(i, 1);
            
            // Combo system
            comboTimer = COMBO_TIMEOUT;
            comboCount++;
            comboMultiplier = Math.min(comboCount, 10); // Cap at 10x
            
            const basePoints = 10;
            const pointsEarned = basePoints * comboMultiplier;
            score += pointsEarned;
            scoreElement.textContent = `Point: ${score}`;
            
            // Spawn collection particles
            for (let j = 0; j < 12; j++) {
                spawnParticle(food.x + food.width / 2, food.y + food.height / 2,
                    (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 40, 4, '#A9A9A9');
            }
            
            // Enable double jump after first point
            if (!playerCanDoubleJump) {
                playerCanDoubleJump = true;
            }
            
            saveProgress();
            generateFood();
        }
    }
    
    // Update combo timer
    if (comboTimer > 0) {
        comboTimer--;
        if (comboTimer <= 0) {
            comboCount = 0;
            comboMultiplier = 1;
        }
    }
}

// --- Shop logic ---
const shopOverlay = document.getElementById('shop');
const shopItemsDiv = document.getElementById('shop-items');
const closeShopBtn = document.getElementById('close-shop');

// --- Death overlay logic ---
const deathOverlay = document.getElementById('death-overlay');
const deathScoreElement = document.getElementById('death-score');
const restartBtn = document.getElementById('restart-btn');
let isDead = false;

// --- Main menu logic ---
const mainMenu = document.getElementById('main-menu');
const startBtn = document.getElementById('start-btn');
const menuShopBtn = document.getElementById('menu-shop-btn');
let gameStarted = false;

// Skin items replace the previous upgrade items. Each skin changes game colors.
// Rarity: 'common', 'rare', 'epic', 'legendary'
const shopItems = [
    // Player skins
    { id: 'player_classic', type: 'player', name: 'Classic', desc: 'Default player color', price: 0, purchased: true, color: '#808080', rarity: 'common' },
    { id: 'player_mint', type: 'player', name: 'Mint Fresh', desc: 'Cool refreshing mint tone', price: 90, purchased: false, color: '#b8f2e6', rarity: 'common' },
    { id: 'player_blue', type: 'player', name: 'Ocean Blue', desc: 'Deep ocean blue', price: 150, purchased: false, color: '#9fb4ff', rarity: 'rare' },
    { id: 'player_red', type: 'player', name: 'Fire Red', desc: 'Burning crimson flames', price: 160, purchased: false, color: '#ff6b6b', rarity: 'rare' },
    { id: 'player_purple', type: 'player', name: 'Royal Purple', desc: 'Majestic purple hue', price: 180, purchased: false, color: '#9b59b6', rarity: 'rare' },
    { id: 'player_emerald', type: 'player', name: 'Emerald', desc: 'Precious green gem', price: 190, purchased: false, color: '#2ecc71', rarity: 'rare' },
    { id: 'player_neon', type: 'player', name: 'Neon Glow', desc: 'Electric neon green', price: 220, purchased: false, color: '#39ff14', rarity: 'epic' },
    { id: 'player_ghost', type: 'player', name: 'Ghost', desc: 'Ethereal translucent form', price: 200, purchased: false, color: '#cfcfe8', rarity: 'epic' },
    { id: 'player_rainbow', type: 'player', name: 'Rainbow', desc: 'Magical rainbow spectrum', price: 350, purchased: false, color: '#ff0000', rarity: 'legendary', gradient: ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'] },
    { id: 'player_gold', type: 'player', name: 'Golden King', desc: 'Premium legendary gold', price: 400, purchased: false, color: '#ffd166', rarity: 'legendary' },

    // Background skins
    { id: 'bg_classic', type: 'background', name: 'Classic', desc: 'Default background', price: 0, purchased: true, color: '#D3D3D3', rarity: 'common' },
    { id: 'bg_pastel', type: 'background', name: 'Pastel Dream', desc: 'Soft pastel paradise', price: 95, purchased: false, color: '#f7e7ff', rarity: 'common' },
    { id: 'bg_ocean', type: 'background', name: 'Ocean Breeze', desc: 'Calming ocean waves', price: 120, purchased: false, color: '#a8d8ea', rarity: 'common' },
    { id: 'bg_midnight', type: 'background', name: 'Midnight', desc: 'Dark starry night', price: 150, purchased: false, color: '#1b1f2b', rarity: 'rare' },
    { id: 'bg_forest', type: 'background', name: 'Misty Forest', desc: 'Enchanted forest mist', price: 170, purchased: false, color: '#d6eadf', rarity: 'rare' },
    { id: 'bg_sunset', type: 'background', name: 'Sunset Sky', desc: 'Warm golden sunset', price: 180, purchased: false, color: '#fff1e6', rarity: 'rare' },
    { id: 'bg_lavender', type: 'background', name: 'Lavender Fields', desc: 'Serene lavender fields', price: 190, purchased: false, color: '#e6d9f2', rarity: 'rare' },
    { id: 'bg_neon', type: 'background', name: 'Neon Night', desc: 'Vibrant neon city', price: 200, purchased: false, color: '#7f00ff', rarity: 'epic' },
    { id: 'bg_space', type: 'background', name: 'Deep Space', desc: 'Infinite cosmos', price: 250, purchased: false, color: '#2b0f4a', rarity: 'epic' },
    { id: 'bg_void', type: 'background', name: 'The Void', desc: 'Endless darkness', price: 400, purchased: false, color: '#000000', rarity: 'legendary' },

    // Platform skins
    { id: 'plat_classic', type: 'platform', name: 'Classic', desc: 'Default platforms', price: 0, purchased: true, color: '#696969', rarity: 'common' },
    { id: 'plat_moss', type: 'platform', name: 'Mossy Stone', desc: 'Ancient moss-covered', price: 110, purchased: false, color: '#6b8e23', rarity: 'common' },
    { id: 'plat_wood', type: 'platform', name: 'Oak Wood', desc: 'Rustic wooden planks', price: 120, purchased: false, color: '#8B4513', rarity: 'common' },
    { id: 'plat_stone', type: 'platform', name: 'Stone Slabs', desc: 'Carved stone blocks', price: 140, purchased: false, color: '#7d7d7d', rarity: 'rare' },
    { id: 'plat_marble', type: 'platform', name: 'Marble', desc: 'Elegant white marble', price: 160, purchased: false, color: '#f5f5dc', rarity: 'rare' },
    { id: 'plat_steel', type: 'platform', name: 'Steel', desc: 'Industrial steel beams', price: 170, purchased: false, color: '#2e3545', rarity: 'rare' },
    { id: 'plat_crystal', type: 'platform', name: 'Crystal', desc: 'Shimmering crystal', price: 210, purchased: false, color: '#b0e0e6', rarity: 'epic' },
    { id: 'plat_glass', type: 'platform', name: 'Glass', desc: 'Transparent glass', price: 220, purchased: false, color: 'rgba(180,200,230,0.85)', rarity: 'epic' },
    { id: 'plat_diamond', type: 'platform', name: 'Diamond', desc: 'Rare diamond platforms', price: 380, purchased: false, color: '#b9f2ff', rarity: 'legendary' },
    { id: 'plat_gold', type: 'platform', name: 'Golden', desc: 'Luxurious gold platforms', price: 400, purchased: false, color: '#d4af37', rarity: 'legendary' }
];

// Point/item color skins removed - using default color only

// Effects are added below via a normalization IIFE (run/jump-only set)

// Replace existing 'effects' entries with a normalized, unique set
// This helps ensure there are no duplicate ids and all effects are distinct.
(() => {
    // remove any existing effect entries in-place
    for (let i = shopItems.length - 1; i >= 0; i--) {
        if (shopItems[i].type === 'effects') shopItems.splice(i, 1);
    }
    // push a fresh set of unique effects (run/jump only)
    shopItems.push(
        { id: 'ef_none', type: 'effects', name: 'None', desc: 'No special effects', price: 0, purchased: true, appliesTo: ['run','jump'], effectSpec: { type: 'none' }, rarity: 'common' },
        { id: 'ef_trail_glow', type: 'effects', name: 'Trail Glow', desc: 'Soft glowing light trail', price: 80, purchased: false, effectSpec: { type: 'trail', color: '#80deea', count: 6, life: 50, spacing: 6, freq: 4 }, appliesTo: ['run','jump'], rarity: 'common' },
        { id: 'ef_smoke_trail', type: 'effects', name: 'Smoke Trail', desc: 'Mysterious smoke puffs', price: 90, purchased: false, effectSpec: { type: 'smoke', color: 'rgba(120,120,120,0.6)', count: 2, life: 50, size: 8, freq: 8 }, appliesTo: ['run','jump'], rarity: 'common' },
        { id: 'ef_shock_runner', type: 'effects', name: 'Shock Ripples', desc: 'Electric ground ripples', price: 120, purchased: false, effectSpec: { type: 'shock', color: 'rgba(160,200,255,0.6)', count: 2, radius: 12, life: 30 }, appliesTo: ['run','jump'], rarity: 'rare' },
        { id: 'ef_burst_jump', type: 'effects', name: 'Particle Burst', desc: 'Explosive particle burst', price: 150, purchased: false, effectSpec: { type: 'burst', color: '#ff8a65', count: 20, spread: 220, speed: 2.0, life: 45, freq: 40 }, appliesTo: ['run','jump'], rarity: 'rare' },
        { id: 'ef_halo', type: 'effects', name: 'Glow Halo', desc: 'Mystical pulsing aura', price: 160, purchased: false, effectSpec: { type: 'halo', color: '#7f00ff', radius: 18, life: 40, freq: 40 }, appliesTo: ['run','jump'], rarity: 'rare' },
        { id: 'ef_confetti_jump', type: 'effects', name: 'Confetti', desc: 'Celebratory confetti', price: 180, purchased: false, effectSpec: { type: 'confetti', colors: ['#ffd54f','#ff8a65','#4dd0e1','#ff6bcb'], count: 20, size: 6, life: 60, speed: 2.4, freq: 50 }, appliesTo: ['run','jump'], rarity: 'epic' },
        { id: 'ef_orbit_lines', type: 'effects', name: 'Orbit Lines', desc: 'Cosmic orbiting lines', price: 200, purchased: false, effectSpec: { type: 'orbit', color: '#ffd54f', rings: 2, perRing: 6, radii: [12, 26], speed: 0.03, lineLength: 12, thickness: 2 }, appliesTo: ['run','jump'], rarity: 'epic' },
        { id: 'ef_gold_sparkle', type: 'effects', name: 'Gold Sparkle', desc: 'Luxurious gold sparkles', price: 220, purchased: false, effectSpec: { type: 'sparkle', color: '#ffd166', count: 6, size: 4, life: 50, freq: 20 }, appliesTo: ['run','jump'], rarity: 'epic' },
        { id: 'ef_stardust', type: 'effects', name: 'Stardust', desc: 'Magical stardust trail', price: 300, purchased: false, effectSpec: { type: 'sparkle', color: '#ffffff', count: 10, size: 3, life: 60, freq: 15 }, appliesTo: ['run','jump'], rarity: 'legendary' },
        { id: 'ef_rainbow_trail', type: 'effects', name: 'Rainbow Trail', desc: 'Legendary rainbow trail', price: 400, purchased: false, effectSpec: { type: 'trail', color: '#ff0000', colors: ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'], count: 12, life: 60, spacing: 4, freq: 3 }, appliesTo: ['run','jump'], rarity: 'legendary' }
        );
    })();

// Track selected skin id per category
const selectedSkins = {
    player: 'player_classic',
    background: 'bg_classic',
    platform: 'plat_classic'
};

// Selected visual effects (by type)
// Only 'run' (moving on ground) and 'jump' are supported now.
const selectedEffects = {
    run: 'ef_none', // effect id to show when running/moving
    jump: 'ef_none' // effect id to show when jumping
};

// --- Save / Load progress ---
function getSaveData() {
    return {
        score: score,
        selectedSkins: selectedSkins,
        purchases: shopItems.reduce((acc, it) => { acc[it.id] = !!it.purchased; return acc; }, {}),
        colors: { playerColor, platformColor, bgColor, foodColor },
        selectedEffects: selectedEffects
    };
}

function saveProgress() {
    try {
        const data = getSaveData();
        localStorage.setItem('htmlGameSave', JSON.stringify(data));
    } catch (e) {
        console.error('Save failed', e);
    }
}

function loadProgress() {
    try {
        const raw = localStorage.getItem('htmlGameSave');
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (typeof data.score === 'number') score = data.score;
        if (data.purchases) {
            for (let it of shopItems) {
                if (data.purchases.hasOwnProperty(it.id)) it.purchased = !!data.purchases[it.id];
            }
        }
        if (data.selectedSkins) {
            for (let k in data.selectedSkins) if (data.selectedSkins[k]) selectedSkins[k] = data.selectedSkins[k];
        }
        if (data.colors) {
            if (data.colors.playerColor) playerColor = data.colors.playerColor;
            if (data.colors.platformColor) platformColor = data.colors.platformColor;
            if (data.colors.bgColor) bgColor = data.colors.bgColor;
            // foodColor always uses default - not customizable
            foodColor = '#A9A9A9';
        }
            if (data.selectedEffects) {
                // backward compatibility: map old 'idle' to new 'run'
                if (data.selectedEffects.run) selectedEffects.run = data.selectedEffects.run;
                else if (data.selectedEffects.idle) selectedEffects.run = data.selectedEffects.idle;
                if (data.selectedEffects.jump) selectedEffects.jump = data.selectedEffects.jump;
                // validate saved effect ids exist in shopItems; otherwise reset to 'ef_none'
                if (selectedEffects.run && !getEffectById(selectedEffects.run)) selectedEffects.run = 'ef_none';
                if (selectedEffects.jump && !getEffectById(selectedEffects.jump)) selectedEffects.jump = 'ef_none';
            }
        scoreElement.textContent = `Point: ${score}`;
        return true;
    } catch (e) {
        console.error('Load failed', e);
        return false;
    }
}

// Auto-save every 5 seconds
setInterval(saveProgress, 5000);

// current shop page (0 = player, 1 = background, 2 = platform)
let currentShopPage = 0;

function applySkinByCategory(category, color) {
    if (category === 'player') playerColor = color;
    if (category === 'background') bgColor = color;
    if (category === 'platform') platformColor = color;
    // Points color removed - always uses default
}

// --- Simple particle system for effects ---
let particles = [];

function spawnParticle(x, y, vx, vy, life, size, color) {
    particles.push({ x, y, vx, vy, life, size: size || 4, color, maxLife: life });
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gravity for particles
        p.life -= 1;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles() {
    for (let p of particles) {
        const denom = p.maxLife || 60;
        let alpha = 0;
        if (denom > 0) alpha = Math.max(0, Math.min(1, p.life / denom));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        // particles stored in world coords — convert to screen coords by subtracting camera.x
        ctx.fillRect(p.x - camera.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
}

// --- Orbiters: for atom-like orbiting-lines effect ---
let orbiters = []; // each orbiter: {angle, radius, speed, ringIndex, color, length, thickness}

function spawnOrbiters(effectSpec) {
    orbiters.length = 0;
    if (!effectSpec || effectSpec.type !== 'orbit') return;
    const rings = effectSpec.rings || 1;
    const perRing = effectSpec.perRing || 6;
    const radii = effectSpec.radii || [12];
    for (let r = 0; r < rings; r++) {
        const radius = radii[r] || (12 + r * 14);
        for (let i = 0; i < perRing; i++) {
            const angle = (Math.PI * 2 * i) / perRing + (r % 2 ? 0.2 : 0);
            const speed = (effectSpec.speed || 0.02) * (1 + r * 0.4) * (r % 2 ? -1 : 1);
            orbiters.push({ angle, radius, speed, ringIndex: r, color: effectSpec.color || '#fff', length: effectSpec.lineLength || 10, thickness: effectSpec.thickness || 2 });
        }
    }
}

function clearOrbiters() {
    orbiters.length = 0;
}

function updateOrbiters() {
    if (!orbiters.length) return;
    for (let o of orbiters) {
        o.angle += o.speed;
    }
}

function drawOrbiters() {
    if (!orbiters.length) return;
    // Only render orbiters when player is moving or airborne (respecting global effect rules)
    if (player.onGround && Math.abs(player.vx) <= MOVE_EFFECT_VX_THRESHOLD) return;
    const px = player.x + player.width / 2 - camera.x;
    const py = player.y + player.height / 2;
    ctx.save();
    for (let o of orbiters) {
        const ox = px + Math.cos(o.angle) * o.radius;
        const oy = py + Math.sin(o.angle) * o.radius;
        ctx.strokeStyle = o.color;
        ctx.lineWidth = o.thickness;
        ctx.beginPath();
        // draw a short line segment tangent to orbit to give 'orbiting line' look
        const tx = ox + Math.cos(o.angle + Math.PI/2) * (o.length/2);
        const ty = oy + Math.sin(o.angle + Math.PI/2) * (o.length/2);
        const tx2 = ox - Math.cos(o.angle + Math.PI/2) * (o.length/2);
        const ty2 = oy - Math.sin(o.angle + Math.PI/2) * (o.length/2);
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx2, ty2);
        ctx.stroke();
    }
    ctx.restore();
}

function getEffectById(id) {
    return shopItems.find(it => it.id === id);
}

// spawn move effect based on selectedEffects.run (only when player is moving on ground)
let moveSpawnCounter = 0;
let trailColorIndex = 0; // For cycling through rainbow colors
function maybeSpawnMoveEffect() {
    const id = selectedEffects.run; // uses the 'run' slot for move effects
    if (!id) return;
    const item = getEffectById(id);
    if (!item || !item.effectSpec) return;
    if (item.effectSpec.type === 'orbit') return; // orbit handled separately
    moveSpawnCounter++;
    const freq = item.effectSpec.freq || 30; // frames between spawns
    if (moveSpawnCounter < freq) return;
    moveSpawnCounter = 0;
    const px = player.x + player.width / 2;
    const py = player.y + player.height;
    const spec = item.effectSpec;
    switch (spec.type) {
        case 'trail':
            // Check if rainbow colors are available
            const trailColors = spec.colors && Array.isArray(spec.colors) ? spec.colors : null;
            for (let i = 0; i < (spec.count || 4); i++) {
                const rx = px - player.vx * (0.5 + Math.random());
                const ry = py + (Math.random() - 0.5) * 6;
                const vx = -player.vx * 0.2 + (Math.random() - 0.5) * 0.6;
                const vy = -0.2 + (Math.random() - 0.5) * 0.4;
                // Cycle through rainbow colors if available, otherwise use single color
                let particleColor = spec.color || '#fff';
                if (trailColors && trailColors.length > 0) {
                    particleColor = trailColors[trailColorIndex % trailColors.length];
                    trailColorIndex = (trailColorIndex + 1) % trailColors.length;
                }
                spawnParticle(rx, ry, vx, vy, spec.life || 40, spec.size || 4, particleColor);
            }
            break;
        case 'smoke':
            for (let i = 0; i < (spec.count || 2); i++) {
                const rx = px + (Math.random() - 0.5) * 10;
                const ry = py + 6;
                spawnParticle(rx, ry, (Math.random() - 0.5) * 0.4, -0.6 - Math.random() * 0.6, spec.life || 50, spec.size || 10, spec.color || 'rgba(120,120,120,0.6)');
            }
            break;
        case 'sparkle':
            for (let i = 0; i < (spec.count || 3); i++) {
                const rx = px + (Math.random() - 0.5) * 8;
                const ry = py - 6 + (Math.random() - 0.5) * 6;
                spawnParticle(rx, ry, (Math.random() - 0.5) * 0.6, -Math.random() * 0.8, spec.life || 40, spec.size || 3, spec.color || '#fff');
            }
            break;
        case 'shock':
            for (let i = 0; i < (spec.count || 3); i++) {
                const ang = Math.random() * Math.PI * 2;
                const speed = (spec.radius || 12) * (0.06 + Math.random() * 0.06);
                spawnParticle(px, py, Math.cos(ang) * speed, Math.sin(ang) * speed * 0.4 - 0.4, spec.life || 24, spec.size || 3, spec.color || 'rgba(160,200,255,0.6)');
            }
            break;
        case 'halo':
            // draw a soft pulse via a large translucent particle
            spawnParticle(px, py - 6, 0, 0, spec.life || 40, spec.radius || 22, spec.color || 'rgba(127,0,255,0.2)');
            break;
        case 'burst':
            // smaller bursts while running (jump has bigger burst)
            {
                const runCount = Math.max(2, Math.round((spec.count || 8) * 0.35));
                for (let i = 0; i < runCount; i++) {
                    const ang = -Math.PI/2 + (Math.random() - 0.5) * (Math.PI * 2);
                    const speed = (spec.speed || 2) * (0.5 + Math.random() * 0.8);
                    spawnParticle(px + (Math.random() - 0.5) * 6, py, Math.cos(ang) * speed, Math.sin(ang) * speed, spec.life || 30, spec.size || 4, spec.color || '#fff');
                }
            }
            break;
        case 'confetti':
            // fewer confetti pieces while running
            {
                const runCount = Math.max(2, Math.round((spec.count || 12) * 0.25));
                for (let i = 0; i < runCount; i++) {
                    const col = spec.colors ? spec.colors[Math.floor(Math.random() * spec.colors.length)] : '#fff';
                    const vx = (Math.random() - 0.5) * (spec.speed || 2);
                    const vy = -0.6 - Math.random() * 1.2;
                    spawnParticle(px + (Math.random() - 0.5) * 12, py, vx, vy, spec.life || 50, spec.size || 4, col);
                }
            }
            break;
        default:
            // generic fallback
            for (let i = 0; i < (spec.count || 3); i++) {
                const ang = Math.random() * Math.PI * 2;
                const speed = (spec.speed || 0.6) * (0.5 + Math.random());
                spawnParticle(px + (Math.random() - 0.5) * 8, py + (Math.random() - 0.5) * 8, Math.cos(ang) * speed, Math.sin(ang) * speed - 1, spec.life || 50, spec.size || 4, spec.color || '#fff');
            }
            break;
    }
}

function spawnJumpEffect() {
    // prefer jump-specific effect, fall back to idle-selected effect
    const id = selectedEffects.jump;
    if (!id) return;
    const item = getEffectById(id);
    if (!item || !item.effectSpec) return;
    if (item.effectSpec.type === 'orbit') return; // orbit handled separately
    const px = player.x + player.width / 2;
    const py = player.y + player.height;
    const spec = item.effectSpec;
    switch (spec.type) {
        case 'trail':
            // Check if rainbow colors are available
            const jumpTrailColors = spec.colors && Array.isArray(spec.colors) ? spec.colors : null;
            for (let i = 0; i < (spec.count || 4); i++) {
                const rx = px - player.vx * (0.5 + Math.random());
                const ry = py + (Math.random() - 0.5) * 6;
                const vx = -player.vx * 0.2 + (Math.random() - 0.5) * 0.6;
                const vy = -0.2 + (Math.random() - 0.5) * 0.4;
                // Cycle through rainbow colors if available, otherwise use single color
                let particleColor = spec.color || '#fff';
                if (jumpTrailColors && jumpTrailColors.length > 0) {
                    particleColor = jumpTrailColors[trailColorIndex % jumpTrailColors.length];
                    trailColorIndex = (trailColorIndex + 1) % jumpTrailColors.length;
                }
                spawnParticle(rx, ry, vx, vy, spec.life || 40, spec.size || 4, particleColor);
            }
            break;
        case 'burst':
            for (let i = 0; i < (spec.count || 12); i++) {
                const ang = -Math.PI/2 + (Math.random() - 0.5) * (Math.PI * 2);
                const speed = (spec.speed || 2) * (0.6 + Math.random() * 0.9);
                spawnParticle(px + (Math.random() - 0.5) * 6, py, Math.cos(ang) * speed, Math.sin(ang) * speed, spec.life || 40, spec.size || 5, spec.color || '#fff');
            }
            break;
        case 'confetti':
            for (let i = 0; i < (spec.count || 12); i++) {
                const col = spec.colors ? spec.colors[Math.floor(Math.random() * spec.colors.length)] : '#fff';
                const vx = (Math.random() - 0.5) * spec.speed || (Math.random() - 0.5) * 2;
                const vy = -1 - Math.random() * 2;
                spawnParticle(px + (Math.random() - 0.5) * 12, py, vx, vy, spec.life || 60, spec.size || 5, col);
            }
            break;
        case 'sparkle':
            for (let i = 0; i < (spec.count || 8); i++) {
                const vx = (Math.random() - 0.5) * 1.2;
                const vy = -1 - Math.random() * 1.5;
                spawnParticle(px + (Math.random() - 0.5) * 8, py, vx, vy, spec.life || 40, spec.size || 3, spec.color || '#fff');
            }
            break;
        default:
            for (let i = 0; i < (spec.count || 8); i++) {
                const ang = -Math.PI/2 + (Math.random() - 0.5) * Math.PI/3;
                const speed = (spec.speed || 2) * (0.6 + Math.random() * 0.8);
                spawnParticle(px + (Math.random() - 0.5) * 6, py, Math.cos(ang) * speed, Math.sin(ang) * speed, spec.life || 40, spec.size || 5, spec.color || '#fff');
            }
            break;
    }
}

// spawn continuous airborne effect when in air (for effects that apply to jump)
let airSpawnCounter = 0;
function maybeSpawnAirEffect() {
    // prefer jump-specific effect, fall back to idle-selected effect
    const id = selectedEffects.jump;
    if (!id) return;
    const item = getEffectById(id);
    if (!item || !item.effectSpec) return;
    if (item.effectSpec.type === 'orbit') return; // orbit handled separately
    airSpawnCounter++;
    const freq = item.effectSpec.freq || 8; // frames between spawns when airborne
    if (airSpawnCounter < freq) return;
    airSpawnCounter = 0;
    const px = player.x + player.width / 2;
    const py = player.y + player.height;
    const spec = item.effectSpec;
    // continuous airborne effects: sparkle, smoke-like drift, trail
    switch (spec.type) {
        case 'trail':
            // Check if rainbow colors are available
            const airTrailColors = spec.colors && Array.isArray(spec.colors) ? spec.colors : null;
            for (let i = 0; i < (spec.count || 4); i++) {
                const rx = px - player.vx * (0.5 + Math.random());
                const ry = py + (Math.random() - 0.5) * 6;
                const vx = -player.vx * 0.2 + (Math.random() - 0.5) * 0.6;
                const vy = -0.2 + (Math.random() - 0.5) * 0.4;
                // Cycle through rainbow colors if available, otherwise use single color
                let particleColor = spec.color || '#fff';
                if (airTrailColors && airTrailColors.length > 0) {
                    particleColor = airTrailColors[trailColorIndex % airTrailColors.length];
                    trailColorIndex = (trailColorIndex + 1) % airTrailColors.length;
                }
                spawnParticle(rx, ry, vx, vy, spec.life || 40, spec.size || 4, particleColor);
            }
            break;
        case 'sparkle':
            for (let i = 0; i < (spec.count || 4); i++) {
                const vx = (Math.random() - 0.5) * 1.2;
                const vy = -0.8 + (Math.random() - 0.5) * 0.6;
                spawnParticle(px + (Math.random() - 0.5) * 8, py + (Math.random() - 0.5) * 6, vx, vy, spec.life || 40, spec.size || 4, spec.color || '#fff');
            }
            break;
        case 'smoke':
            for (let i = 0; i < (spec.count || 2); i++) {
                spawnParticle(px + (Math.random() - 0.5) * 8, py + 6, (Math.random() - 0.5) * 0.3, -0.4 - Math.random() * 0.4, spec.life || 50, spec.size || 8, spec.color || 'rgba(120,120,120,0.6)');
            }
            break;
        default:
            for (let i = 0; i < (spec.count || 3); i++) {
                const ang = -Math.PI/2 + (Math.random() - 0.5) * Math.PI/2;
                const speed = (spec.speed || 1.5) * (0.6 + Math.random() * 0.8);
                spawnParticle(px + (Math.random() - 0.5) * 8, py + (Math.random() - 0.5) * 6, Math.cos(ang) * speed, Math.sin(ang) * speed, spec.life || 40, spec.size || 4, spec.color || '#fff');
            }
            break;
    }
}

function renderShop() {
    shopItemsDiv.innerHTML = '';
    const categories = ['player', 'background', 'platform', 'effects'];
    // pagination: show one category per page
    const category = categories[currentShopPage] || categories[0];

    const labelMap = {
        player: 'Player',
        background: 'Background',
        platform: 'Platform',
        effects: 'Effects'
    };

    // nav
    const nav = document.createElement('div');
    nav.className = 'shop-nav';
    const prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.textContent = '◀ Prev';
    prev.disabled = currentShopPage === 0;
    prev.addEventListener('click', () => { if (currentShopPage > 0) { currentShopPage--; renderShop(); } });
    const indicator = document.createElement('div');
    indicator.className = 'page-indicator';
    indicator.textContent = `${currentShopPage + 1} / ${categories.length}`;
    const next = document.createElement('button');
    next.className = 'page-btn';
    next.textContent = 'Next ▶';
    next.disabled = currentShopPage >= categories.length - 1;
    next.addEventListener('click', () => { if (currentShopPage < categories.length - 1) { currentShopPage++; renderShop(); } });
    nav.appendChild(prev);
    nav.appendChild(indicator);
    nav.appendChild(next);
    shopItemsDiv.appendChild(nav);

    const header = document.createElement('div');
    header.className = 'shop-category-header';
    header.style.margin = '8px 0 4px';
    const baseLabel = labelMap[category] || (category.charAt(0).toUpperCase() + category.slice(1));
    header.textContent = (category === 'effects') ? baseLabel : (baseLabel + ' Skins');
    shopItemsDiv.appendChild(header);

    // Show items sorted by price (cheapest → most expensive)
    const itemsForCat = shopItems
        .filter(i => i.type === category)
        .slice() // copy to avoid mutating original
        .sort((a, b) => (a.price || 0) - (b.price || 0));
    for (let item of itemsForCat) {
        const row = document.createElement('div');
        row.className = 'shop-item';
        const rarity = item.rarity || 'common';
        row.setAttribute('data-rarity', rarity);
        row.setAttribute('data-purchased', item.purchased);
        
        // Determine selected state
        let isSelected = false;
        if (category === 'effects') {
            isSelected = selectedEffects.run === item.id || selectedEffects.jump === item.id;
        } else {
            isSelected = selectedSkins[category] === item.id;
        }
        row.setAttribute('data-selected', isSelected);

        const swatch = document.createElement('div');
        swatch.className = 'swatch';
        // Handle gradient colors
        if (item.gradient && Array.isArray(item.gradient)) {
            const gradientStr = `linear-gradient(135deg, ${item.gradient.join(', ')})`;
            swatch.style.background = gradientStr;
        } else {
            swatch.style.background = item.color || (item.effectSpec && item.effectSpec.color) || '#ccc';
        }

        const meta = document.createElement('div');
        meta.className = 'meta';
        const title = document.createElement('div');
        title.className = 'item-title';
        title.textContent = item.name;
        
        // Add rarity badge
        if (item.rarity && item.rarity !== 'common') {
            const rarityBadge = document.createElement('span');
            rarityBadge.className = `rarity-badge rarity-${item.rarity}`;
            rarityBadge.textContent = item.rarity;
            title.appendChild(rarityBadge);
        }
        
        const desc = document.createElement('div');
        desc.className = 'item-desc';
        desc.textContent = item.desc;
        const priceText = document.createElement('span');
        priceText.style.fontWeight = '600';
        priceText.textContent = item.price > 0 ? ` — ${item.price} pt` : ' — FREE';
        desc.appendChild(priceText);
        
        meta.appendChild(title);
        meta.appendChild(desc);

        const leftArea = document.createElement('div');
        leftArea.className = 'left-area';
        leftArea.appendChild(swatch);
        leftArea.appendChild(meta);

        const btn = document.createElement('button');
        btn.className = 'buy-btn';
        if (rarity === 'legendary') {
            btn.classList.add('legendary');
        }
        btn.textContent = item.purchased ? (isSelected ? 'Selected' : 'Select') : (item.price > 0 ? `Buy ${item.price}pt` : 'Select');
        if (isSelected && item.purchased) {
            btn.classList.add('selected');
        }
        btn.disabled = (!item.purchased && score < item.price);
        btn.addEventListener('click', () => {
                if (!item.purchased) {
                if (score >= item.price) {
                    score -= item.price;
                    item.purchased = true;
                    // equip behavior after purchase
                        if (category === 'effects') {
                            // enforce single active effect: clear previous, then equip this one for its appliesTo types
                            selectedEffects.run = null;
                            selectedEffects.jump = null;
                            if (item.appliesTo && item.appliesTo.includes('run')) selectedEffects.run = item.id;
                            if (item.appliesTo && item.appliesTo.includes('jump')) selectedEffects.jump = item.id;
                        } else {
                        selectedSkins[category] = item.id;
                        applySkinByCategory(category, item.color);
                    }
                    scoreElement.textContent = `Point: ${score}`;
                    saveProgress();
                    updateActiveOrbiters();
                    renderShop();
                }
            } else {
                // select / equip purchased item
                if (category === 'effects') {
                    // enforce single active effect when selecting: clear previous then equip
                    selectedEffects.run = null;
                    selectedEffects.jump = null;
                    if (item.appliesTo && item.appliesTo.includes('run')) selectedEffects.run = item.id;
                    if (item.appliesTo && item.appliesTo.includes('jump')) selectedEffects.jump = item.id;
                } else {
                    selectedSkins[category] = item.id;
                    applySkinByCategory(category, item.color);
                }
                saveProgress();
                updateActiveOrbiters();
                renderShop();
            }
        });

        row.appendChild(leftArea);
        row.appendChild(btn);
        shopItemsDiv.appendChild(row);
    }
}

// Apply currently selected skins (initial load)
function applySelectedSkins() {
    for (let cat in selectedSkins) {
        const id = selectedSkins[cat];
        const item = shopItems.find(i => i.id === id);
        if (item) applySkinByCategory(cat, item.color);
    }
}

// Load any saved progress from previous sessions (then apply skins)
loadProgress();
applySelectedSkins();
// restore orbiters if orbit effect was saved
function updateActiveOrbiters() {
    const runId = selectedEffects.run;
    const jumpId = selectedEffects.jump;
    // prefer jump-specific orbit if present, otherwise run
    let orbitId = null;
    if (jumpId && getEffectById(jumpId) && getEffectById(jumpId).effectSpec && getEffectById(jumpId).effectSpec.type === 'orbit') orbitId = jumpId;
    else if (runId && getEffectById(runId) && getEffectById(runId).effectSpec && getEffectById(runId).effectSpec.type === 'orbit') orbitId = runId;

    if (orbitId) {
        const spec = getEffectById(orbitId).effectSpec;
        spawnOrbiters(spec);
    } else {
        clearOrbiters();
    }
}

updateActiveOrbiters();

// Cheat activation: grant points when correct sequence typed
function activateCheat() {
    score += 1000;
    scoreElement.textContent = `Point: ${score}`;
    cheatMsg = '+1000 pts';
    cheatMsgTimer = 180; // show for ~3 seconds at 60fps
    saveProgress();
    console.log('Cheat activated: momomo');
}

// Save when leaving the page
window.addEventListener('beforeunload', saveProgress);

function openShop() {
    if (isDead) return; // Can't open shop when dead
    renderShop();
    shopOverlay.classList.add('open');
    shopOverlay.setAttribute('aria-hidden', 'false');
}

function closeShop() {
    shopOverlay.classList.remove('open');
    shopOverlay.setAttribute('aria-hidden', 'true');
    // If game hasn't started and shop is closed, show main menu again
    if (!gameStarted) {
        mainMenu.classList.remove('hidden');
    }
}

// (renderShop is defined above for category-based skins)

closeShopBtn.addEventListener('click', closeShop);

// Shop button in top right
const shopBtn = document.getElementById('shop-btn');
if (shopBtn) {
    shopBtn.addEventListener('click', openShop);
}

// Restart button
if (restartBtn) {
    restartBtn.addEventListener('click', resetGame);
}

// Toggle shop with Q (keyCode 81)
document.addEventListener('keydown', (e) => {
    // Start game with Enter or Space from main menu
    if (!gameStarted && (e.keyCode === 13 || e.keyCode === 32)) { // Enter or Space
        startGame();
        return;
    }
    
    if (e.keyCode === 81) { // Q
        if (isDead) return; // Can't open shop when dead
        if (!gameStarted) return; // Can't open shop from menu (use menu button)
        if (shopOverlay.classList.contains('open')) closeShop(); else openShop();
    }
    // Restart game with R or Enter when dead
    if (isDead && (e.keyCode === 82 || e.keyCode === 13)) { // R or Enter
        resetGame();
    }
});

function gameLoop() {
    // Don't run game if not started
    if (!gameStarted) {
        // Draw background with gradient
        const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        const bgGradientColors = getGradientColors('background');
        if (bgGradientColors && bgGradientColors.length > 1) {
            const step = 1 / (bgGradientColors.length - 1);
            for (let i = 0; i < bgGradientColors.length; i++) {
                bgGradient.addColorStop(i * step, bgGradientColors[i]);
            }
        } else {
            const rgb = parseColorToRGB(bgColor) || { r: 211, g: 211, b: 211 };
            const darkerBg = `rgb(${Math.max(0, rgb.r - 20)}, ${Math.max(0, rgb.g - 20)}, ${Math.max(0, rgb.b - 20)})`;
            bgGradient.addColorStop(0, bgColor);
            bgGradient.addColorStop(1, darkerBg);
        }
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    // Pause game loop if dead
    if (isDead) {
        drawGame();
        drawParticles();
        drawOrbiters();
        return;
    }

    updatePlayer();
    checkFoodCollision();

    // Update food animations
    for (let food of foods) {
        food.bounceTime += 0.1;
    }

    // spawn move effect when player is on ground and moving
    if (player.onGround && Math.abs(player.vx) > MOVE_EFFECT_VX_THRESHOLD) {
        maybeSpawnMoveEffect();
    }

    // spawn continuous air/jump effect when player is airborne (jumping)
    if (!player.onGround) {
        maybeSpawnAirEffect();
    }

    updateParticles();
    updateOrbiters();

    // decrement cheat message timer
    if (cheatMsgTimer > 0) {
        cheatMsgTimer--;
        if (cheatMsgTimer === 0) cheatMsg = '';
    }

    drawGame();
    drawParticles();
    drawOrbiters();
}

function showDeathScreen() {
    isDead = true;
    deathScoreElement.textContent = score;
    deathOverlay.classList.add('show');
    deathOverlay.setAttribute('aria-hidden', 'false');
}

function hideDeathScreen() {
    isDead = false;
    deathOverlay.classList.remove('show');
    deathOverlay.setAttribute('aria-hidden', 'true');
}

function resetGame() {
    if (!gameStarted) return; // Don't reset if game hasn't started
    hideDeathScreen();
    player.x = 100;
    player.y = 50;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.rotation = 0;
    player.standingOnPlatform = null;
    camera.x = 0;
    foods = [];
    powerUps = [];
    platforms = [
        {x: 0, y: canvas.height - 300, width: 400, height: 20, type: 'normal'},
    ];
    lastPlatformEnd = 400;
    // Reset game enhancement features
    comboCount = 0;
    comboTimer = 0;
    comboMultiplier = 1;
    screenShake = { x: 0, y: 0, intensity: 0 };
    playerCanDoubleJump = false;
    doubleJumpUsed = false;
    speedBoostActive = false;
    speedBoostTimer = 0;
    // score persists across deaths
    scoreElement.textContent = `Point: ${score}`;
    for (let i = 0; i < 5; i++) {
        generatePlatform();
    }
    // Add initial foods, max 1 per platform
    for (let platform of platforms) {
        let hasFood = foods.some(f => f.x >= platform.x && f.x < platform.x + platform.width);
        let chance = 0.2 + Math.random() * 0.5;
        if (!hasFood && Math.random() < chance) {
            addFoodToPlatform(platform);
        }
    }
}

document.addEventListener('keydown', (e) => {
    keys[e.keyCode] = true;
    // track simple cheat code input via printable characters
    try {
        const k = (e.key || '').toLowerCase();
        if (k && k.length === 1 && /[a-z0-9]/.test(k)) {
            cheatBuffer += k;
            if (cheatBuffer.length > CHEAT_CODE.length) cheatBuffer = cheatBuffer.slice(-CHEAT_CODE.length);
            if (cheatBuffer === CHEAT_CODE) {
                activateCheat();
                cheatBuffer = '';
            }
        }
    } catch (err) {
        // ignore
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.keyCode] = false;
});

// Don't start game automatically - wait for menu
// resetGame(); // Commented out - will be called when start button is clicked
setInterval(gameLoop, 1000 / 60); // 60 FPS

// Main menu event listeners
if (startBtn) {
    startBtn.addEventListener('click', () => {
        startGame();
    });
}

if (menuShopBtn) {
    menuShopBtn.addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        openShop();
    });
}

function startGame() {
    gameStarted = true;
    mainMenu.classList.add('hidden');
    scoreElement.style.display = 'block';
    shopBtn.style.display = 'block';
    resetGame();
}

// Hide UI elements initially (will show when game starts)
scoreElement.style.display = 'none';
shopBtn.style.display = 'none';