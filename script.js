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
let jumpStrength = -12; // kept mutable (unused by skins)
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

let camera = { x: 0, y: 0 };

let player = {
    x: 100,
    y: 50,
    vx: 0,
    vy: 0,
    width: 20,
    height: 20,
    onGround: false,
    rotation: 0
};

let foods = [];
let platforms = [
    {x: 0, y: canvas.height - 20, width: 400, height: 20}, // initial ground
];

let score = 0;
let keys = {};
// Cheat code input buffer
let cheatBuffer = '';
const CHEAT_CODE = 'momomo';
let cheatMsg = '';
let cheatMsgTimer = 0; // frames remaining to display message
let lastPlatformEnd = 400;

function generatePlatform() {
    const minWidth = 80;
    const maxWidth = 150;
    const width = minWidth + Math.random() * (maxWidth - minWidth);
    const height = 20;
    const x = lastPlatformEnd + 50 + Math.random() * 100;
    const y = canvas.height - 150 - Math.random() * 150;

    platforms.push({x, y, width, height});
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
    ctx.fillStyle = bgColor; // background color (skin)
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw platforms
    ctx.fillStyle = platformColor; // platform color (skin)
    for (let platform of platforms) {
        const screenX = platform.x - camera.x;
        if (screenX + platform.width > 0 && screenX < canvas.width) {
            ctx.fillRect(screenX, platform.y, platform.width, platform.height);
        }
    }

    // Draw player
    ctx.save();
    const playerScreenX = player.x - camera.x;
    const playerScreenY = player.y;
    const centerX = playerScreenX + player.width / 2;
    const centerY = playerScreenY + player.height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(player.rotation);
    ctx.fillStyle = playerColor; // player color (skin)
    ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);
    ctx.restore();

    // Draw foods
    ctx.fillStyle = foodColor; // food color (skin)
    for (let food of foods) {
        const screenX = food.x - camera.x;
        if (screenX + food.width > 0 && screenX < canvas.width) {
            const yOffset = Math.sin(food.bounceTime) * 5;
            ctx.fillRect(screenX, food.y + yOffset, food.width, food.height);
        }
    }

    // Draw cheat message (if any) at top-right matching the `#score` HUD style
    if (cheatMsgTimer > 0 && cheatMsg) {
        ctx.save();
        // Match CSS: font-size 2vw, padding 1vh/2vw, border-radius 1vw
        const fontSize = Math.max(12, Math.round(canvas.width * 0.02)); // ~2vw
        ctx.font = `${fontSize}px Montserrat, sans-serif`;
        const paddingX = Math.round(canvas.width * 0.02); // 2vw
        const paddingY = Math.round(canvas.height * 0.01); // 1vh
        const textWidth = ctx.measureText(cheatMsg).width;
        const rectW = Math.round(textWidth + paddingX * 2);
        const rectH = Math.round(fontSize + paddingY * 2);
        const rectX = Math.round(canvas.width - (canvas.width * 0.02) - rectW); // 2vw from right
        const rectY = Math.round(canvas.height * 0.02); // 2vh from top

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
    // Horizontal movement
    if (keys[37] || keys[65]) { // left arrow or A
        player.vx = -moveSpeed;
    } else if (keys[39] || keys[68]) { // right arrow or D
        player.vx = moveSpeed;
    } else {
        player.vx *= friction;
    }

    // Jump
    if ((keys[38] || keys[87] || keys[32]) && player.onGround) { // up arrow, W, or space
        player.vy = jumpStrength;
        player.onGround = false;
        // spawn jump effect (on jump initiation)
        spawnJumpEffect();
    }

    // Apply gravity
    player.vy += gravity;

    // Update rotation if in air
    if (!player.onGround) {
        player.rotation += 0.1; // spin speed
    } else {
        player.rotation = 0; // reset when on ground
    }

    // Update position
    player.x += player.vx;
    player.y += player.vy;

    // Update camera to follow player
    camera.x = Math.max(camera.x, Math.max(0, player.x - canvas.width * 0.25));

    // Prevent going left beyond camera
    player.x = Math.max(player.x, camera.x);

    // Generate new platforms if needed
    while (lastPlatformEnd - camera.x < canvas.width * 2) {
        generatePlatform();
        let chance = 0.2 + Math.random() * 0.5; // 20% to 70% chance
        if (Math.random() < chance) {
            addFoodToPlatform(platforms[platforms.length - 1]);
        }
    }

    // Check platform collisions
    player.onGround = false;
    for (let platform of platforms) {
        if (player.x < platform.x + platform.width &&
            player.x + player.width > platform.x &&
            player.y < platform.y + platform.height &&
            player.y + player.height > platform.y) {
            // Collision detected
            if (player.vy > 0 && player.y < platform.y) {
                // Landing on top
                player.y = platform.y - player.height;
                player.vy = 0;
                player.onGround = true;
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

    // Prevent going too far left
    if (player.x < 0) player.x = 0;

    // Game over if fall off screen
    if (player.y > canvas.height) {
        resetGame();
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
            score += 10;
            scoreElement.textContent = `Point: ${score}`;
            saveProgress();
            generateFood();
        }
    }
}

// --- Shop logic ---
const shopOverlay = document.getElementById('shop');
const shopItemsDiv = document.getElementById('shop-items');
const closeShopBtn = document.getElementById('close-shop');

// Skin items replace the previous upgrade items. Each skin changes game colors.
const shopItems = [
    // Player skins
    { id: 'player_classic', type: 'player', name: 'Player Classic', desc: 'Default player color', price: 0, purchased: true, color: '#808080' },
    { id: 'player_mint', type: 'player', name: 'Player Mint', desc: 'Cool mint tone', price: 90, purchased: false, color: '#b8f2e6' },
    { id: 'player_blue', type: 'player', name: 'Player Blue', desc: 'Cool blue player', price: 150, purchased: false, color: '#9fb4ff' },
    { id: 'player_red', type: 'player', name: 'Player Red', desc: 'Fiery red player', price: 160, purchased: false, color: '#ff6b6b' },
    { id: 'player_neon', type: 'player', name: 'Player Neon', desc: 'Bright neon player', price: 220, purchased: false, color: '#39ff14' },
    { id: 'player_ghost', type: 'player', name: 'Player Ghost', desc: 'Pale translucent look', price: 200, purchased: false, color: '#cfcfe8' },
    { id: 'player_gold', type: 'player', name: 'Player Gold', desc: 'Premium gold skin', price: 300, purchased: false, color: '#ffd166' },

    // Background skins
    { id: 'bg_classic', type: 'background', name: 'Background Classic', desc: 'Default background', price: 0, purchased: true, color: '#D3D3D3' },
    { id: 'bg_pastel', type: 'background', name: 'Background Pastel', desc: 'Soft pastel backdrop', price: 95, purchased: false, color: '#f7e7ff' },
    { id: 'bg_midnight', type: 'background', name: 'Background Midnight', desc: 'Dark night sky', price: 150, purchased: false, color: '#1b1f2b' },
    { id: 'bg_forest', type: 'background', name: 'Background Forest', desc: 'Misty forest green', price: 170, purchased: false, color: '#d6eadf' },
    { id: 'bg_sunset', type: 'background', name: 'Background Sunset', desc: 'Warm sunset sky', price: 180, purchased: false, color: '#fff1e6' },
    { id: 'bg_neon', type: 'background', name: 'Background Neon', desc: 'Dark neon backdrop', price: 200, purchased: false, color: '#7f00ff' },
    { id: 'bg_space', type: 'background', name: 'Background Space', desc: 'Deep space/violet', price: 210, purchased: false, color: '#2b0f4a' },

    // Platform skins
    { id: 'plat_classic', type: 'platform', name: 'Platform Classic', desc: 'Default platforms', price: 0, purchased: true, color: '#696969' },
    { id: 'plat_moss', type: 'platform', name: 'Platform Moss', desc: 'Mossy stone', price: 110, purchased: false, color: '#6b8e23' },
    { id: 'plat_wood', type: 'platform', name: 'Platform Wood', desc: 'Warm wooden platform', price: 120, purchased: false, color: '#8B4513' },
    { id: 'plat_stone', type: 'platform', name: 'Platform Stone', desc: 'Rough stone look', price: 140, purchased: false, color: '#7d7d7d' },
    { id: 'plat_steel', type: 'platform', name: 'Platform Steel', desc: 'Cool steel platform', price: 160, purchased: false, color: '#2e3545' },
    { id: 'plat_glass', type: 'platform', name: 'Platform Glass', desc: 'Semi-transparent glass', price: 200, purchased: false, color: 'rgba(180,200,230,0.85)' },
    { id: 'plat_gold', type: 'platform', name: 'Platform Gold', desc: 'Shiny gold platform', price: 280, purchased: false, color: '#d4af37' }
];

// Point/item color skins
shopItems.push(
    { id: 'pt_classic', type: 'points', name: 'Point Classic', desc: 'Default point color', price: 0, purchased: true, color: '#A9A9A9' },
    { id: 'pt_yellow', type: 'points', name: 'Point Yellow', desc: 'Bright yellow point', price: 80, purchased: false, color: '#ffd54f' },
    { id: 'pt_orange', type: 'points', name: 'Point Orange', desc: 'Vibrant orange', price: 120, purchased: false, color: '#ff8a65' },
    { id: 'pt_pink', type: 'points', name: 'Point Pink', desc: 'Soft pink point', price: 140, purchased: false, color: '#ff6bcb' },
    { id: 'pt_cyan', type: 'points', name: 'Point Cyan', desc: 'Cool cyan point', price: 160, purchased: false, color: '#4dd0e1' },
    { id: 'pt_neon', type: 'points', name: 'Point Neon', desc: 'Neon highlight', price: 220, purchased: false, color: '#39ff14' },
    { id: 'pt_gold', type: 'points', name: 'Point Gold', desc: 'Premium gold point', price: 300, purchased: false, color: '#ffd166' }
);

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
        { id: 'ef_none', type: 'effects', name: 'No Effect', desc: 'No special effects', price: 0, purchased: true, appliesTo: ['run','jump'], effectSpec: { type: 'none' } },
        { id: 'ef_trail_glow', type: 'effects', name: 'Trail Glow', desc: 'Soft glowing trail', price: 80, purchased: false, effectSpec: { type: 'trail', color: '#80deea', count: 6, life: 50, spacing: 6, freq: 4 }, appliesTo: ['run','jump'] },
        { id: 'ef_orbit_lines', type: 'effects', name: 'Orbit Lines', desc: 'Lines orbiting the player', price: 200, purchased: false, effectSpec: { type: 'orbit', color: '#ffd54f', rings: 2, perRing: 6, radii: [12, 26], speed: 0.03, lineLength: 12, thickness: 2 }, appliesTo: ['run','jump'] },
        { id: 'ef_shock_runner', type: 'effects', name: 'Shock Ripples', desc: 'Subtle ground ripples', price: 120, purchased: false, effectSpec: { type: 'shock', color: 'rgba(160,200,255,0.6)', count: 2, radius: 12, life: 30 }, appliesTo: ['run','jump'] },
        { id: 'ef_smoke_trail', type: 'effects', name: 'Smoke Trail', desc: 'Small smoke puffs', price: 90, purchased: false, effectSpec: { type: 'smoke', color: 'rgba(120,120,120,0.6)', count: 2, life: 50, size: 8, freq: 8 }, appliesTo: ['run','jump'] },
        { id: 'ef_burst_jump', type: 'effects', name: 'Jump Burst', desc: 'Burst of particles', price: 150, purchased: false, effectSpec: { type: 'burst', color: '#ff8a65', count: 20, spread: 220, speed: 2.0, life: 45, freq: 40 }, appliesTo: ['run','jump'] },
        { id: 'ef_confetti_jump', type: 'effects', name: 'Confetti', desc: 'Colorful confetti', price: 180, purchased: false, effectSpec: { type: 'confetti', colors: ['#ffd54f','#ff8a65','#4dd0e1','#ff6bcb'], count: 20, size: 6, life: 60, speed: 2.4, freq: 50 }, appliesTo: ['run','jump'] },
        { id: 'ef_halo', type: 'effects', name: 'Glow Halo', desc: 'Pulsing ring', price: 160, purchased: false, effectSpec: { type: 'halo', color: '#7f00ff', radius: 18, life: 40, freq: 40 }, appliesTo: ['run','jump'] },
        { id: 'ef_gold_sparkle', type: 'effects', name: 'Gold Sparkle', desc: 'Gold sparkles', price: 220, purchased: false, effectSpec: { type: 'sparkle', color: '#ffd166', count: 6, size: 4, life: 50, freq: 20 }, appliesTo: ['run','jump'] }
        );
    })();

// Track selected skin id per category
const selectedSkins = {
    player: 'player_classic',
    background: 'bg_classic',
    platform: 'plat_classic'
};

// add default selection for point colors
selectedSkins.points = 'pt_classic';

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
            if (data.colors.foodColor) foodColor = data.colors.foodColor;
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
    if (category === 'points') foodColor = color;
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
            for (let i = 0; i < (spec.count || 4); i++) {
                const rx = px - player.vx * (0.5 + Math.random());
                const ry = py + (Math.random() - 0.5) * 6;
                const vx = -player.vx * 0.2 + (Math.random() - 0.5) * 0.6;
                const vy = -0.2 + (Math.random() - 0.5) * 0.4;
                spawnParticle(rx, ry, vx, vy, spec.life || 40, spec.size || 4, spec.color || '#fff');
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
    // continuous airborne effects: sparkle, smoke-like drift
    switch (spec.type) {
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
    const categories = ['player', 'background', 'platform', 'points', 'effects'];
    // pagination: show one category per page
    const category = categories[currentShopPage] || categories[0];

    const labelMap = {
        player: 'Player',
        background: 'Background',
        platform: 'Platform',
        points: 'Point Color',
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
    header.style.fontWeight = '700';
    header.style.margin = '8px 0 4px';
    const baseLabel = labelMap[category] || (category.charAt(0).toUpperCase() + category.slice(1));
    header.textContent = (category === 'points' || category === 'effects') ? baseLabel : (baseLabel + ' Skins');
    shopItemsDiv.appendChild(header);

    // Show items sorted by price (cheapest → most expensive)
    const itemsForCat = shopItems
        .filter(i => i.type === category)
        .slice() // copy to avoid mutating original
        .sort((a, b) => (a.price || 0) - (b.price || 0));
    for (let item of itemsForCat) {
        const row = document.createElement('div');
        row.className = 'shop-item';

        const swatch = document.createElement('div');
        swatch.className = 'swatch';
        swatch.style.background = item.color || (item.effectSpec && item.effectSpec.color) || '#ccc';

        const meta = document.createElement('div');
        meta.className = 'meta';
        const title = document.createElement('div');
        title.textContent = item.name;
        const desc = document.createElement('div');
        desc.style.fontSize = '12px';
        desc.style.opacity = '0.8';
        desc.textContent = item.desc + ` ${item.price > 0 ? '— ' + item.price + ' pt' : ''}`;
        meta.appendChild(title);
        meta.appendChild(desc);

        const leftArea = document.createElement('div');
        leftArea.className = 'left-area';
        leftArea.appendChild(swatch);
        leftArea.appendChild(meta);

        const btn = document.createElement('button');
        btn.className = 'buy-btn';
            // Determine selected state
        let isSelected = false;
        if (category === 'points') isSelected = selectedSkins.points === item.id;
        else if (category === 'effects') {
            // selected if applied to either idle or jump
                isSelected = selectedEffects.run === item.id || selectedEffects.jump === item.id;
        } else {
            isSelected = selectedSkins[category] === item.id;
        }
        btn.textContent = item.purchased ? (isSelected ? 'Selected' : 'Select') : (item.price > 0 ? 'Buy' : 'Select');
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
    renderShop();
    shopOverlay.classList.add('open');
    shopOverlay.setAttribute('aria-hidden', 'false');
}

function closeShop() {
    shopOverlay.classList.remove('open');
    shopOverlay.setAttribute('aria-hidden', 'true');
}

// (renderShop is defined above for category-based skins)

closeShopBtn.addEventListener('click', closeShop);

// Toggle shop with Q (keyCode 81)
document.addEventListener('keydown', (e) => {
    if (e.keyCode === 81) { // Q
        if (shopOverlay.classList.contains('open')) closeShop(); else openShop();
    }
});

function gameLoop() {
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

function resetGame() {
    player.x = 100;
    player.y = 50;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.rotation = 0;
    camera.x = 0;
    foods = [];
    platforms = [
        {x: 0, y: canvas.height - 300, width: 400, height: 20},
    ];
    lastPlatformEnd = 400;
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

resetGame();
setInterval(gameLoop, 1000 / 60); // 60 FPS