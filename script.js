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
const jumpStrength = -12;
const moveSpeed = 5;
const friction = 0.8;

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

function generateFood(allowInView = false) {
    if (platforms.length > 1) {
        const platform = platforms[Math.floor(Math.random() * (platforms.length - 1)) + 1]; // skip initial ground
        const foodX = platform.x + Math.random() * (platform.width - 20);
        if (allowInView || foodX > camera.x + canvas.width) {
            foods.push({
                x: foodX,
                y: platform.y - 25,
                width: 15,
                height: 15
            });
        }
    }
}

function drawGame() {
    ctx.fillStyle = '#D3D3D3'; // light gray background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw platforms
    ctx.fillStyle = '#696969'; // dark gray platforms
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
    ctx.fillStyle = '#808080'; // medium gray player
    ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);
    ctx.restore();

    // Draw foods
    ctx.fillStyle = '#A9A9A9'; // dark gray foods
    for (let food of foods) {
        const screenX = food.x - camera.x;
        if (screenX + food.width > 0 && screenX < canvas.width) {
            ctx.fillRect(screenX, food.y, food.width, food.height);
        }
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
        if (Math.random() < 0.7) generateFood();
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
            scoreElement.textContent = `Score: ${score}`;
            generateFood();
        }
    }
}

function gameLoop() {
    updatePlayer();
    checkFoodCollision();
    drawGame();
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
    score = 0;
    scoreElement.textContent = `Score: ${score}`;
    for (let i = 0; i < 5; i++) {
        generatePlatform();
        generateFood(true);
    }
}

document.addEventListener('keydown', (e) => {
    keys[e.keyCode] = true;
});

document.addEventListener('keyup', (e) => {
    keys[e.keyCode] = false;
});

resetGame();
setInterval(gameLoop, 1000 / 60); // 60 FPS